
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';
import crypto from 'crypto';

export const runtime = 'nodejs';         // ensure Node (crypto) runtime
export const dynamic = 'force-dynamic';  // webhooks should not be cached

function verifyWebhookHmac(rawBody: string, hmacHeader: string, secret: string): boolean {
  // Shopify webhook HMAC header is base64
  const received = Buffer.from(hmacHeader || '', 'base64');
  const computed = crypto
    .createHmac('sha256', secret)
    .update(Buffer.from(rawBody, 'utf8'))
    .digest(); // bytes, not 'hex' or 'base64'

  return received.length === computed.length && crypto.timingSafeEqual(received, computed);
}

export async function POST(req: NextRequest) {
  try {
    const shopDomain = req.headers.get('x-shopify-shop-domain') || '';
    const topic      = req.headers.get('x-shopify-topic') || '';
    const hmacHeader = req.headers.get('x-shopify-hmac-sha256') || '';

    if (!process.env.SHOPIFY_API_SECRET) {
      console.error('SHOPIFY_API_SECRET is missing');
      return new NextResponse('Server misconfigured', { status: 500 });
    }

    // 1) Read RAW body once (do NOT parse yet)
    const raw = await req.text();

    // 2) Verify HMAC on the raw body (base64 header vs raw bytes)
    const ok = verifyWebhookHmac(raw, hmacHeader, process.env.SHOPIFY_API_SECRET);
    if (!ok) {
      console.warn('Webhook HMAC verification failed', { topic, shopDomain });
      return new NextResponse('Unauthorized', { status: 401 });
    }

    // 3) Safe to parse AFTER verifying
    const orderData = JSON.parse(raw);

    if (!shopDomain) {
      console.error('Missing x-shopify-shop-domain header');
      return NextResponse.json({ error: 'Shop domain is required' }, { status: 400 });
    }

    // Firestore refs
    const accountRef = db.collection('accounts').doc(shopDomain);
    const orderRef   = accountRef.collection('orders').doc(String(orderData.id));

    // 4) Topic handling
    if (topic === 'orders/delete') {
      await orderRef.delete();
      console.log(`Deleted order ${orderData.id} for shop ${shopDomain}`);
      return new NextResponse(null, { status: 200 });
    }

    // Treat create/updated/cancelled as upserts
    // (If you also subscribe to orders/cancelled, it will land here.)
    const dataToSave = {
      orderId: String(orderData.id),
      name: orderData.name,
      email: orderData.customer?.email ?? null,
      createdAt: orderData.created_at ?? null,
      updatedAt: orderData.updated_at ?? null,
      financialStatus: orderData.financial_status ?? null,
      fulfillmentStatus: orderData.fulfillment_status ?? 'unfulfilled',
      totalPrice: orderData.total_price ? Number(orderData.total_price) : null,
      currency: orderData.currency ?? null,
      raw: orderData,
      _lastTopic: topic,
      _receivedAt: new Date().toISOString(),
    };

    await orderRef.set(dataToSave, { merge: true });
    console.log(`Upserted order ${orderData.id} for ${shopDomain} via ${topic}`);
    return new NextResponse(null, { status: 200 });
  } catch (err) {
    console.error('Error processing Shopify webhook:', err);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}