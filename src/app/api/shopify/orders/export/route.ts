
import { NextRequest, NextResponse } from 'next/server';
import { db, auth as adminAuth } from '@/lib/firebase-admin';
import * as xlsx from 'xlsx';

async function getUserIdFromToken(req: NextRequest): Promise<string | null> {
    const authHeader = req.headers.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
        const idToken = authHeader.split('Bearer ')[1];
        try {
            const decodedToken = await adminAuth.verifyIdToken(idToken);
            return decodedToken.uid;
        } catch (error) {
            console.error('Error verifying auth token:', error);
            return null;
        }
    }
    return null;
}

const formatAddress = (address: any): string => {
    if (!address) return 'N/A';
    const parts = [
        address.address1,
        address.address2,
        address.city,
        address.province,
        address.zip,
        address.country,
    ];
    return parts.filter(Boolean).join(', ');
};


export async function POST(req: NextRequest) {
  try {
    const { shop, orderIds } = await req.json();

    if (!shop || !Array.isArray(orderIds) || orderIds.length === 0) {
      return NextResponse.json({ error: 'Shop and a non-empty array of orderIds are required' }, { status: 400 });
    }

    const userId = await getUserIdFromToken(req);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized: Could not identify user.' }, { status: 401 });
    }

    const accountRef = db.collection('accounts').doc(shop);
    const ordersColRef = accountRef.collection('orders');
    
    const ordersSnapshot = await ordersColRef.where('orderId', 'in', orderIds.map(id => Number(id))).get();
    
    const flattenedData: any[] = [];
    
    ordersSnapshot.forEach(doc => {
      const order = doc.data();
      const customerName = `${order.raw.customer?.first_name || ''} ${order.raw.customer?.last_name || ''}`.trim() || order.email;

      if (order.raw.line_items && order.raw.line_items.length > 0) {
        order.raw.line_items.forEach((item: any) => {
          flattenedData.push({
            'Order name': order.name,
            'Order date': new Date(order.createdAt).toLocaleDateString(),
            'Customer': customerName,
            'Item title': item.title,
            'Item SKU': item.sku || 'N/A',
            'Item Quantity': item.quantity,
            'Item Price': item.price,
            'Total Order Price': order.totalPrice,
            'Currency': order.currency,
            'Payment Status': order.financialStatus,
            'Status': order.customStatus,
            'Billing Address': formatAddress(order.raw.billing_address),
            'Shipping Adress': formatAddress(order.raw.shipping_address),
          });
        });
      } else {
        // Handle orders with no line items
        flattenedData.push({
            'Order name': order.name,
            'Order date': new Date(order.createdAt).toLocaleDateString(),
            'Customer': customerName,
            'Item title': 'N/A',
            'Item SKU': 'N/A',
            'Item Quantity': 0,
            'Item Price': 0,
            'Total Order Price': order.totalPrice,
            'Currency': order.currency,
            'Payment Status': order.financialStatus,
            'Status': order.customStatus,
            'Billing Address': formatAddress(order.raw.billing_address),
            'Shipping Adress': formatAddress(order.raw.shipping_address),
        });
      }
    });

    const worksheet = xlsx.utils.json_to_sheet(flattenedData);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, 'Orders');
    
    const buf = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="orders-export-${Date.now()}.xlsx"`,
      },
    });

  } catch (error) {
    console.error('Error exporting orders:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ error: 'Failed to export orders', details: errorMessage }, { status: 500 });
  }
}
