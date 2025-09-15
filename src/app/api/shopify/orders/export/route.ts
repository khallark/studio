
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
    ];
    return parts.filter(Boolean).join(', ');
};


export async function POST(req: NextRequest) {
  try {
    const { shop, orderIds, exportType } = await req.json();

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
    let srNo = 1;
    
    ordersSnapshot.forEach(doc => {
      const order = doc.data();
      const customerName = `${order.raw.customer?.first_name || ''} ${order.raw.customer?.last_name || ''}`.trim() || order.email;

      if (order.raw.line_items && order.raw.line_items.length > 0) {
        order.raw.line_items.forEach((item: any) => {
          if (exportType === 'confirmed') {
            flattenedData.push({
              'Sr. No': srNo++,
              'Order name': order.name,
              'Item name': item.title,
              'Item SKU': item.sku || 'N/A',
              'Item quantity': item.quantity,
              'Availability': '',
            });
          } else {
             const paymentStatus = order.financialStatus === 'paid' ? 'Prepaid' : order.financialStatus === 'pending' ? 'COD' : order.financialStatus;
             flattenedData.push({
                'Order name': order.name,
                'Order date': new Date(order.createdAt).toLocaleDateString(),
                'Customer': customerName,
                'Email': order.raw.customer?.email || 'N/A',
                'Phone': order.raw.customer?.phone || 'N/A',
                'Item title': item.title,
                'Item SKU': item.sku || 'N/A',
                'Item Quantity': item.quantity,
                'Item Price': item.price,
                'Discount': order.raw.total_discounts || 0,
                'Total Order Price': order.totalPrice,
                'Currency': order.currency,
                'Payment Status': paymentStatus,
                'Status': order.customStatus,
                'Billing Address': formatAddress(order.raw.billing_address),
                'Billing City': order.raw.billing_address?.city || 'N/A',
                'Billing State': order.raw.billing_address?.province || 'N/A',
                'Billing Pincode': order.raw.billing_address?.zip || 'N/A',
                'Billing Country': order.raw.billing_address?.country || 'N/A',
                'Shipping Adress': formatAddress(order.raw.shipping_address),
                'Shipping City': order.raw.shipping_address?.city || 'N/A',
                'Shipping State': order.raw.shipping_address?.province || 'N/A',
                'Shipping Pincode': order.raw.shipping_address?.zip || 'N/A',
                'Shipping Country': order.raw.shipping_address?.country || 'N/A',
              });
          }
        });
      } else {
        // Handle orders with no line items
         if (exportType === 'confirmed') {
            flattenedData.push({
              'Sr. No': srNo++,
              'Order name': order.name,
              'Item name': 'N/A',
              'Item SKU': 'N/A',
              'Item quantity': 0,
              'Availability': '',
            });
          } else {
            const paymentStatus = order.financialStatus === 'paid' ? 'Prepaid' : order.financialStatus === 'pending' ? 'COD' : order.financialStatus;
            flattenedData.push({
                'Order name': order.name,
                'Order date': new Date(order.createdAt).toLocaleDateString(),
                'Customer': customerName,
                'Email': order.raw.customer?.email || 'N/A',
                'Phone': order.raw.customer?.phone || 'N/A',
                'Item title': 'N/A',
                'Item SKU': 'N/A',
                'Item Quantity': 0,
                'Item Price': 0,
                'Discount': order.raw.total_discounts || 0,
                'Total Order Price': order.totalPrice,
                'Currency': order.currency,
                'Payment Status': paymentStatus,
                'Status': order.customStatus,
                'Billing Address': formatAddress(order.raw.billing_address),
                'Billing City': order.raw.billing_address?.city || 'N/A',
                'Billing State': order.raw.billing_address?.province || 'N/A',
                'Billing Pincode': order.raw.billing_address?.zip || 'N/A',
                'Billing Country': order.raw.billing_address?.country || 'N/A',
                'Shipping Adress': formatAddress(order.raw.shipping_address),
                'Shipping City': order.raw.shipping_address?.city || 'N/A',
                'Shipping State': order.raw.shipping_address?.province || 'N/A',
                'Shipping Pincode': order.raw.shipping_address?.zip || 'N/A',
                'Shipping Country': order.raw.shipping_address?.country || 'N/A',
            });
        }
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
