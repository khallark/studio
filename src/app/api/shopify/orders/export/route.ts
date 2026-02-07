import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { DocumentSnapshot } from 'firebase-admin/firestore';
import admin from 'firebase-admin';
import { authBusinessForOrderOfTheExceptionStore, authUserForBusinessAndStore } from '@/lib/authoriseUser';
import { SHARED_STORE_IDS } from '@/lib/shared-constants';

const formatAddress = (address: any): string => {
  if (!address) return 'N/A';
  const parts = [
    address.address1,
    address.address2,
  ];
  return parts.filter(Boolean).join(', ');
};

const formatDate = (timestamp: any): string => {
  // If it's an ISO string with timezone, extract the date part directly
  if (typeof timestamp === 'string' && timestamp.includes('T')) {
    // Extract YYYY-MM-DD part before the 'T'
    const datePart = timestamp.split('T')[0];
    const [year, month, day] = datePart.split('-');
    return `${day}/${month}/${year}`;
  }

  // Fallback for other formats
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${day}/${month}/${year}`;
};

export async function POST(req: NextRequest) {
  try {
    const { businessId, shop, orderIds } = await req.json();

    if (!businessId) {
      return NextResponse.json({ error: 'No business id provided.' }, { status: 400 });
    }

    if (!shop || !Array.isArray(orderIds) || orderIds.length === 0) {
      return NextResponse.json({ error: 'Shop and a non-empty array of orderIds are required' }, { status: 400 });
    }

    // ----- Auth -----
    const result = await authUserForBusinessAndStore({ businessId, shop, req });

    const businessData = result.businessDoc?.data();

    if (!result.authorised) {
      const { error, status } = result;
      return NextResponse.json({ error }, { status });
    }

    const { shopDoc } = result;
    const ordersColRef = shopDoc?.ref.collection('orders');

    // Firestore 'in' query has a limit of 30 values. We need to chunk them.
    const chunks: string[][] = [];
    for (let i = 0; i < orderIds.length; i += 30) {
      chunks.push(orderIds.slice(i, i + 30));
    }

    let allDocs: DocumentSnapshot[] = [];
    for (const chunk of chunks) {
      // Use where clause with documentId() to query by ID
      const snapshot = await ordersColRef?.where(admin.firestore.FieldPath.documentId(), 'in', chunk).get();
      snapshot?.forEach(doc => allDocs.push(doc));
    }

    // Re-sort the documents to match the original orderIds array from the frontend
    allDocs.sort((a, b) => orderIds.indexOf(a.id) - orderIds.indexOf(b.id));

    const flattenedData: any[] = [];

    allDocs.forEach(doc => {
      const order = doc.data();
      if (!order) return;

      if (SHARED_STORE_IDS.includes(shop)) {
        const vendorName = businessData?.vendorName;
        const vendors = order?.vendors;
        const canProcess = authBusinessForOrderOfTheExceptionStore({ businessId, vendorName, vendors });
        if (!canProcess.authorised) {
          return;
        }
      }

      const customerName = `${order.raw.customer?.first_name || ''} ${order.raw.customer?.last_name || ''}`.trim() || order.email;

      if (order.raw.line_items && order.raw.line_items.length > 0) {
        order.raw.line_items.forEach((item: any) => {
          const paymentStatus = order.financialStatus === 'paid' ? 'Prepaid' : order.financialStatus === 'pending' ? 'COD' : order.financialStatus;
          flattenedData.push({
            orderName: order.name,
            awb: order.awb ?? 'N/A',
            returnAwb: order.awb_reverse ?? 'N/A',
            courier: order.courier ?? 'N/A',
            orderDate: formatDate(order.createdAt),
            lastStatusUpdate: formatDate(order.lastStatusUpdate?.toDate()?.toISOString() || ''),
            customer: customerName,
            email: order.raw.customer?.email || order.raw?.contact_email || 'N/A',
            phone: order.raw.customer?.phone || order.raw.billing_address?.phone || order.raw.shipping_address?.phone || 'N/A',
            itemTitle: item.title,
            itemSku: item.sku || 'N/A',
            itemQuantity: item.quantity,
            itemPrice: item.price,
            totalOrderPrice: order.totalPrice,
            discount: order.raw.total_discounts || 0,
            vendor: item.vendor || 'N/A',
            currency: order.currency,
            paymentStatus: paymentStatus,
            status: order.customStatus,
            billingAddress: formatAddress(order.raw.billing_address),
            billingCity: order.raw.billing_address?.city || 'N/A',
            billingState: order.raw.billing_address?.province || 'N/A',
            billingPincode: order.raw.billing_address?.zip || 'N/A',
            billingCountry: order.raw.billing_address?.country || 'N/A',
            shippingAddress: formatAddress(order.raw.shipping_address),
            shippingCity: order.raw.shipping_address?.city || 'N/A',
            shippingState: order.raw.shipping_address?.province || 'N/A',
            shippingPincode: order.raw.shipping_address?.zip || 'N/A',
            shippingCountry: order.raw.shipping_address?.country || 'N/A',
          });
        });
      } else {
        // Handle orders with no line items
        const paymentStatus = order.financialStatus === 'paid' ? 'Prepaid' : order.financialStatus === 'pending' ? 'COD' : order.financialStatus;
        flattenedData.push({
          orderName: order.name,
          awb: order.awb ?? 'N/A',
          returnAwb: order.awb_reverse ?? 'N/A',
          courier: order.courier ?? 'N/A',
          orderDate: formatDate(order.createdAt),
          lastStatusUpdate: formatDate(order.lastStatusUpdate?.toDate()?.toISOString() || ''),
          customer: customerName,
          email: order.raw.customer?.email || order.raw?.contact_email || 'N/A',
          phone: order.raw.customer?.phone || order.raw.billing_address?.phone || order.raw.shipping_address?.phone || 'N/A',
          itemTitle: 'N/A',
          itemSku: 'N/A',
          itemQuantity: 0,
          itemPrice: 0,
          totalOrderPrice: order.totalPrice,
          discount: order.raw.total_discounts || 0,
          vendor: 'N/A',
          currency: order.currency,
          paymentStatus: paymentStatus,
          status: order.customStatus,
          billingAddress: formatAddress(order.raw.billing_address),
          billingCity: order.raw.billing_address?.city || 'N/A',
          billingState: order.raw.billing_address?.province || 'N/A',
          billingPincode: order.raw.billing_address?.zip || 'N/A',
          billingCountry: order.raw.billing_address?.country || 'N/A',
          shippingAddress: formatAddress(order.raw.shipping_address),
          shippingCity: order.raw.shipping_address?.city || 'N/A',
          shippingState: order.raw.shipping_address?.province || 'N/A',
          shippingPincode: order.raw.shipping_address?.zip || 'N/A',
          shippingCountry: order.raw.shipping_address?.country || 'N/A',
        });
      }
    });

    // Create workbook and worksheet
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Orders');

    // Define columns
    worksheet.columns = [
      { header: 'Order name', key: 'orderName', width: 15 },
      { header: 'AWB', key: 'awb', width: 18 },
      { header: 'Return AWB', key: 'returnAwb', width: 18 },
      { header: 'Courier', key: 'courier', width: 15 },
      { header: 'Order date', key: 'orderDate', width: 12 },
      { header: 'Last Update on', key: 'lastStatusUpdate', width: 12 },
      { header: 'Customer', key: 'customer', width: 20 },
      { header: 'Email', key: 'email', width: 25 },
      { header: 'Phone', key: 'phone', width: 15 },
      { header: 'Item title', key: 'itemTitle', width: 30 },
      { header: 'Item SKU', key: 'itemSku', width: 15 },
      { header: 'Item Quantity', key: 'itemQuantity', width: 12 },
      { header: 'Item Price', key: 'itemPrice', width: 12 },
      { header: 'Total Order Price', key: 'totalOrderPrice', width: 15 },
      { header: 'Discount', key: 'discount', width: 10 },
      { header: 'Vendor', key: 'vendor', width: 15 },
      { header: 'Currency', key: 'currency', width: 10 },
      { header: 'Payment Status', key: 'paymentStatus', width: 15 },
      { header: 'Status', key: 'status', width: 15 },
      { header: 'Billing Address', key: 'billingAddress', width: 30 },
      { header: 'Billing City', key: 'billingCity', width: 15 },
      { header: 'Billing State', key: 'billingState', width: 15 },
      { header: 'Billing Pincode', key: 'billingPincode', width: 12 },
      { header: 'Billing Country', key: 'billingCountry', width: 15 },
      { header: 'Shipping Adress', key: 'shippingAddress', width: 30 }, // Kept typo to match original
      { header: 'Shipping City', key: 'shippingCity', width: 15 },
      { header: 'Shipping State', key: 'shippingState', width: 15 },
      { header: 'Shipping Pincode', key: 'shippingPincode', width: 12 },
      { header: 'Shipping Country', key: 'shippingCountry', width: 15 },
    ];

    // Add rows
    worksheet.addRows(flattenedData);

    // Make header row bold
    worksheet.getRow(1).font = { bold: true };

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer();

    return new NextResponse(buffer, {
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