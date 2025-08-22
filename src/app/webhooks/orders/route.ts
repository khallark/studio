
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';
import crypto from 'crypto';

// Function to verify the HMAC signature from Shopify
async function verifyHmac(req: NextRequest): Promise<boolean> {
  const hmacHeader = req.headers.get('x-shopify-hmac-sha256');
  if (!hmacHeader) {
    console.warn('HMAC header missing from webhook request');
    return false;
  }
  
  const body = await req.text();
  const secret = process.env.SHOPIFY_API_SECRET;
  if (!secret) {
    console.error('SHOPIFY_API_SECRET is not set. Cannot verify HMAC.');
    return false;
  }

  const hash = crypto
    .createHmac('sha256', secret)
    .update(body, 'utf8')
    .digest('base64');

  return hash === hmacHeader;
}


export async function POST(req: NextRequest) {
  try {
    // 1. Verify the request is from Shopify
    const isVerified = await verifyHmac(req.clone()); // Clone request to read body twice
    if (!isVerified) {
      console.warn('Could not verify HMAC from Shopify webhook.');
      return NextResponse.json({ error: 'Not authorized' }, { status: 401 });
    }

    // 2. Get shop domain from header and order data from body
    const shopDomain = req.headers.get('x-shopify-shop-domain');
    const topic = req.headers.get('x-shopify-topic');
    const orderData = await req.json();

    if (!shopDomain) {
      console.error('Shopify domain missing from webhook headers.');
      return NextResponse.json({ error: 'Shop domain is required' }, { status: 400 });
    }
    
    const accountRef = db.collection('accounts').doc(shopDomain);
    const orderRef = accountRef.collection('orders').doc(String(orderData.id));

    // 3. Handle different webhook topics
    if (topic === 'orders/delete') {
        await orderRef.delete();
        console.log(`Deleted order ${orderData.id} for shop ${shopDomain}`);
        return NextResponse.json({ message: 'Order deleted successfully' });
    }

    // For orders/create and orders/update
    const dataToSave = {
        orderId: orderData.id,
        name: orderData.name,
        email: orderData.customer?.email || 'N/A',
        createdAt: orderData.created_at,
        updatedAt: orderData.updated_at,
        financialStatus: orderData.financial_status,
        fulfillmentStatus: orderData.fulfillment_status || 'unfulfilled',
        totalPrice: parseFloat(orderData.total_price),
        currency: orderData.currency,
        raw: orderData,
    };

    // 4. Upsert the order data in Firestore
    await orderRef.set(dataToSave, { merge: true });
    console.log(`Upserted order ${orderData.id} for shop ${shopDomain} due to ${topic} webhook.`);

    return NextResponse.json({ message: 'Webhook received and processed' });
  } catch (error) {
    console.error('Error processing Shopify webhook:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ error: 'Webhook processing failed', details: errorMessage }, { status: 500 });
  }
}
