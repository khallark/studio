import { db } from "@/lib/firebase-admin";
import { validateCustomerSession } from "@/lib/validateCustomerSession";
import { NextRequest, NextResponse } from "next/server";

// /api/public/book-return/order/route.ts
export async function POST(req: NextRequest) {
  try {
    // Get data from request body (aligned with session creation pattern)
    const { orderNumber, phoneNo } = await req.json();
    
    if (!orderNumber || !phoneNo) {
      return NextResponse.json({ error: 'Order Number and Phone Number are required' }, { status: 400 });
    }

    // Validate session (this is the key security check)
    const session = await validateCustomerSession(req);
    const storeId = session.storeId;
        
    // Rate limiting per session
    if (session.requestCount > 100) { // 100 requests per session
      throw new Error('SESSION_RATE_LIMIT_EXCEEDED');
    }
    
    const ordersQuery = await db
      .collection('accounts')
      .doc(storeId)
      .collection('orders')
      .where('name', '==', orderNumber)
      .limit(1)
      .get();

    if (ordersQuery.empty) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }
    
    const orderDoc = ordersQuery.docs[0];
    
    // Return customer-safe data
    const orderData = orderDoc.data()!;
    return NextResponse.json({
      name: orderData.raw.name,
      status: orderData.customStatus,
      logs: orderData.customeStatusesLogs,
      items: orderData.raw.line_items?.map((item: any) => ({
        name: item.name,
        sku: item.sku,
        quantity: item.quantity,
        price: item.price
      })),
      payment_gateway_names: orderData.raw.payment_gateway_names,
      total_price: orderData.raw.total_price,
      total_outstanding: orderData.raw.total_outstanding,
      shipping_address: orderData.raw.shipping_address,
    });
    
  } catch (error: any) {
    console.error('Customer service API error:', error);
    
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid JSON in request body' }, { status: 400 });
    }
    
    if (error.message.includes('SESSION') || error.message.includes('CSRF')) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    
    if (error.message === 'SESSION_RATE_LIMIT_EXCEEDED') {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }
    
    return NextResponse.json({ error: 'Service unavailable' }, { status: 500 });
  }
}