
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';
import crypto from 'crypto';
import { FieldValue } from 'firebase-admin/firestore';

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

async function logWebhook(db: FirebaseFirestore.Firestore, shopDomain: string, topic: string, orderId: string, payload: any, hmac: string) {
    const logEntry = {
        type: 'WEBHOOK',
        topic: topic,
        orderId: orderId,
        timestamp: FieldValue.serverTimestamp(),
        payload: payload,
        hmacVerified: true,
        source: 'Shopify',
        headers: {
            shopDomain,
            topic,
            hmac,
        },
    };
    try {
        await db.collection('accounts').doc(shopDomain).collection('logs').add(logEntry);
    } catch (error) {
        console.error("Failed to write webhook log:", error);
    }
}

async function captureShopifyCreditPayment(shopDomain: string, orderId: string) {
  try {
    const accountRef = db.collection('accounts').doc(shopDomain);
    const accountDoc = await accountRef.get();

    if (!accountDoc.exists) {
      console.error(`Account document not found for shop: ${shopDomain}`);
      return;
    }

    const accessToken = accountDoc.data()?.accessToken;
    if (!accessToken) {
      console.error(`Access token not found for shop: ${shopDomain}`);
      return;
    }

    const captureUrl = `https://${shopDomain}/admin/api/2025-01/orders/${orderId}/transactions.json`;
    const response = await fetch(captureUrl, {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        transaction: {
          kind: 'capture',
        },
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`Failed to capture Shopify Credit for order ${orderId}. Status: ${response.status}. Body: ${errorBody}`);
    } else {
      console.log(`Successfully captured Shopify Credit payment for order ${orderId}.`);
    }
  } catch (error) {
    console.error(`Error during Shopify Credit capture for order ${orderId}:`, error);
  }
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

    const raw = await req.text();
    const ok = verifyWebhookHmac(raw, hmacHeader, process.env.SHOPIFY_API_SECRET);
    if (!ok) {
      console.warn('Webhook HMAC verification failed', { topic, shopDomain });
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const orderData = JSON.parse(raw);
    const orderId = String(orderData.id || (topic === 'orders/delete' ? orderData.id : 'N/A'));

    if (!shopDomain) {
      console.error('Missing x-shopify-shop-domain header');
      return NextResponse.json({ error: 'Shop domain is required' }, { status: 400 });
    }

    // Log the incoming webhook regardless of outcome
    await logWebhook(db, shopDomain, topic, orderId, orderData, hmacHeader);

    const accountRef = db.collection('accounts').doc(shopDomain);
    const orderRef   = accountRef.collection('orders').doc(orderId);

    // --- Topic-Specific Logic ---
    const existingOrderSnap = await orderRef.get();

    // 1. Order Deletion (Tombstone)
    if (topic === 'orders/delete') {
      if (existingOrderSnap.exists) {
        await orderRef.update({
          isDeleted: true,
          deletedAt: FieldValue.serverTimestamp(),
          lastWebhookTopic: topic
        });
        console.log(`Tombstoned order ${orderId} for shop ${shopDomain}`);
      }
      return new NextResponse(null, { status: 200 });
    }

    // 2. Ignore any updates for an already deleted order
    if (existingOrderSnap.exists && existingOrderSnap.data()?.isDeleted) {
        console.log(`Ignoring webhook topic ${topic} for already deleted order ${orderId}`);
        return new NextResponse(null, { status: 200 });
    }

    const dataToSave: { [key: string]: any } = {
      orderId: orderData.id,
      name: orderData.name,
      email: orderData.customer?.email ?? 'N/A',
      createdAt: orderData.created_at,
      updatedAt: orderData.updated_at,
      financialStatus: orderData.financial_status,
      fulfillmentStatus: orderData.fulfillment_status || 'unfulfilled',
      totalPrice: parseFloat(orderData.total_price),
      currency: orderData.currency,
      raw: orderData,
      lastWebhookTopic: topic,
      receivedAt: FieldValue.serverTimestamp(),
    };

    // 3. Order Creation
    if (topic === 'orders/create') {
        dataToSave.customStatus = 'New';
        dataToSave.isDeleted = false;

        await orderRef.set(dataToSave);
        console.log(`Created order ${orderId} for ${shopDomain}`);

        // Auto-capture Shopify Credit payment
        if (Array.isArray(orderData.payment_gateway_names) && orderData.payment_gateway_names.includes('shopify_credit')) {
            console.log(`Order ${orderId} used Shopify Credit. Attempting to capture payment.`);
            await captureShopifyCreditPayment(shopDomain, orderId);
        }
    
    // 4. Order Update
    } else if (topic === 'orders/updated') {
        if (!existingOrderSnap.exists) {
            console.warn(`Received 'orders/updated' for non-existent order ${orderId}. Skipping.`);
            // Acknowledge the webhook but do nothing to prevent creating an orphan document.
            return new NextResponse(null, { status: 200 });
        }
        await orderRef.update(dataToSave);
        console.log(`Updated order ${orderId} for ${shopDomain}`);
    
    // 5. Fallback for other order-related topics (e.g., fulfilled, paid)
    } else {
        await orderRef.set(dataToSave, { merge: true });
        console.log(`Upserted order ${orderId} for ${shopDomain} via ${topic}`);
    }

    return new NextResponse(null, { status: 200 });
  } catch (err) {
    console.error('Error processing Shopify webhook:', err);
    const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred';
    return NextResponse.json({ error: 'Webhook processing failed', details: errorMessage }, { status: 500 });
  }
}
