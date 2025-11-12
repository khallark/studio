// webhook -> single order fetching and storing.

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';
import crypto from 'crypto';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { sendNewOrderWhatsAppMessage } from '@/lib/communication/whatsappMessagesSendingFuncs';

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

async function logWebhookToCentralCollection(
  db: FirebaseFirestore.Firestore,
  shopDomain: string,
  topic: string,
  orderId: string,
  payload: any,
  hmac: string
) {
  const logEntry = {
    type: 'WEBHOOK',
    topic,
    orderId,
    timestamp: FieldValue.serverTimestamp(),
    payload,
    hmacVerified: true,
    source: 'Shopify',
    headers: { shopDomain, topic, hmac },
  };
  try {
    await db.collection('accounts').doc(shopDomain).collection('logs').add(logEntry);
  } catch (error) {
    console.error('Failed to write webhook log to central collection:', error);
  }
}

function createOrderLogEntry(topic: string, orderData: any): any {
  const now = new Date();
  return {
    type: 'WEBHOOK',
    action: topic.toUpperCase().replace('/', '_'), // e.g., ORDERS_CREATE
    timestamp: now, // Use JS Date object for arrayUnion
    details: {
      topic: topic,
      orderId: String(orderData.id),
      orderName: orderData.name,
    },
    user: { displayName: 'Shopify' } // System-generated action
  };
}

function normalizePhoneNumber(phoneNumber: string): string {
  // Remove all whitespace characters from the phone number
  const cleanedNumber = phoneNumber.replace(/\s/g, "");
  // Check if the cleaned number length is >= 10
  if (cleanedNumber.length >= 10) {
    // Extract the last 10 digits
    return cleanedNumber.slice(-10);
  } else {
    // Return the whole string if length is less than 10
    return cleanedNumber;
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
      body: JSON.stringify({ transaction: { kind: 'capture' } }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(
        `Failed to capture Shopify Credit for order ${orderId}. Status: ${response.status}. Body: ${errorBody}`
      );
    } else {
      console.log(`Successfully captured Shopify Credit payment for order ${orderId}.`);
    }
  } catch (error) {
    console.error(`Error during Shopify Credit capture for order ${orderId}:`, error);
  }
}

/**
 * HELPER: Extracts unique vendor names from line items
 */
function extractVendors(lineItems: any[]): string[] {
  if (!Array.isArray(lineItems) || lineItems.length === 0) {
    return [];
  }

  const vendorSet = new Set<string>();

  for (const item of lineItems) {
    if (item.vendor && typeof item.vendor === "string") {
      const trimmedVendor = item.vendor.trim();
      if (trimmedVendor.length > 0) {
        vendorSet.add(trimmedVendor);
      }
    }
  }

  return Array.from(vendorSet).sort(); // Sort for consistency
}

export async function POST(req: NextRequest) {
  try {
    const shopDomain = req.headers.get('x-shopify-shop-domain') || '';
    const rawTopic = req.headers.get('x-shopify-topic') || '';
    const topic = rawTopic.trim().toLowerCase(); // normalize once
    const hmacHeader = req.headers.get('x-shopify-hmac-sha256') || '';

    if (!process.env.SHOPIFY_API_SECRET) {
      console.error('SHOPIFY_API_SECRET is missing');
      return new NextResponse('Server misconfigured', { status: 500 });
    }

    const raw = await req.text();
    const hmacOk = verifyWebhookHmac(raw, hmacHeader, process.env.SHOPIFY_API_SECRET);
    if (!hmacOk) {
      console.warn('Webhook HMAC verification failed', { topic, shopDomain });
      return new NextResponse('Unauthorized', { status: 401 });
    }

    if (!shopDomain) {
      console.error('Missing x-shopify-shop-domain header');
      return NextResponse.json({ error: 'Shop domain is required' }, { status: 400 });
    }

    // Only handle the three topics we expect
    const allowed = new Set(['orders/create', 'orders/updated', 'orders/delete']);
    if (!allowed.has(topic)) {
      console.warn('Ignoring unexpected topic', { topic, shopDomain });
      return new NextResponse(null, { status: 200 });
    }

    const orderData = JSON.parse(raw);
    const orderId = String(orderData?.id ?? '');
    if (!orderId) {
      console.warn('Missing order id in webhook payload', { topic, shopDomain });
      // Acknowledge to stop retries, but do nothing.
      return new NextResponse(null, { status: 200 });
    }

    const accountRef = db.collection('accounts').doc(shopDomain);
    const orderRef = accountRef.collection('orders').doc(orderId);
    const orderLogEntry = createOrderLogEntry(topic, orderData);

    // ✅ Extract vendors from line items
    const vendors = extractVendors(orderData.line_items || []);

    const dataToSave: { [key: string]: any } = {
      orderId: orderData.id,
      name: orderData.name,
      email: orderData.customer?.email ?? 'N/A',
      createdAt: orderData.created_at,
      updatedAt: orderData.updated_at,
      financialStatus: orderData.financial_status,
      fulfillmentStatus: orderData.fulfillment_status || 'unfulfilled',
      totalPrice: orderData.total_price ? parseFloat(orderData.total_price) : null,
      currency: orderData.currency,
      vendors,
      raw: orderData,
      lastWebhookTopic: topic,
      receivedAt: FieldValue.serverTimestamp(),
    };

    let created = false;

    // Use a transaction so we never "create on update" due to races.
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(orderRef);

      // 1) Delete → tombstone if exists
      if (topic === 'orders/delete') {
        if (snap.exists) {
          tx.update(orderRef, {
            isDeleted: true,
            deletedAt: FieldValue.serverTimestamp(),
            lastWebhookTopic: topic,
          });
          console.log(`Tombstoned order ${orderId} for shop ${shopDomain}`);
          await logWebhookToCentralCollection(db, shopDomain, topic, orderId, orderData, hmacHeader);
        }
        return;
      }

      // 2) Ignore all writes to already-deleted orders
      if (snap.exists && snap.data()?.isDeleted) {
        console.log(`Ignoring ${topic} for already deleted order ${orderId}`);
        return;
      }

      // 3) Create → only here do we create the doc
      if (topic === 'orders/create') {
        created = true;
        const log = [{
          status: "New",
          createdAt: Timestamp.now(),
          remarks: `This order was newly created on Shopify`
        }];
        tx.set(orderRef, {
          ...dataToSave,
          customStatus: 'New',
          isDeleted: false,
          createdByTopic: topic,
          customStatusesLogs: log, // Initialize logs array
        });
        console.log(`Created order ${orderId} for ${shopDomain}`);
        await logWebhookToCentralCollection(db, shopDomain, topic, orderId, orderData, hmacHeader);
        return;
      }

      // 4) Updated → never create if missing
      if (topic === 'orders/updated') {
        if (!snap.exists) {
          console.warn(`Received 'orders/updated' for non-existent order ${orderId}. Skipping.`);
          return;
        }
        
        // Check if the order was cancelled
        const isCancelled = orderData.cancelled_at !== null && orderData.cancelled_at !== undefined;
        
        let log;
        let updateData: { [key: string]: any } = {
          ...dataToSave,
          updatedByTopic: topic,
        };
        
        if (isCancelled) {
          log = {
            status: "Cancelled",
            createdAt: Timestamp.now(),
            remarks: `This order was cancelled on Shopify`
          };
          updateData.customStatus = 'Cancelled';
          console.log(`Order ${orderId} was cancelled for ${shopDomain}`);
        } else {
          log = {
            status: "Updated By Shopify",
            createdAt: Timestamp.now(),
            remarks: `This order was updated on shopify`
          };
          console.log(`Updated order ${orderId} for ${shopDomain}`);
        }
        
        updateData.customStatusesLogs = FieldValue.arrayUnion(log);
        
        tx.update(orderRef, updateData);
        await logWebhookToCentralCollection(db, shopDomain, topic, orderId, orderData, hmacHeader);
      }
    });

    if (created) {
      const customerPhone = orderData?.shipping_address.phone || orderData?.shipping_address.phone || orderData?.customer.phone;
      const cleanPhone = normalizePhoneNumber(customerPhone);
      if (!String(orderData.tags).toLowerCase().includes('split-order') && customerPhone && cleanPhone.length === 10) {
        const shopDoc = (await accountRef.get()).data() as any;
        console.log('Trying to send message');
        sendNewOrderWhatsAppMessage(shopDoc, {
          orderId: dataToSave.orderId,
          createdAt: dataToSave.createdAt,
          name: dataToSave.name,
          raw: orderData
        })

      } else {
        console.log('No valid phone number found for order, skipping WhatsApp message sending. Phone:', customerPhone, 'Normalized:', cleanPhone);
      }
    }

    // Post-commit side effect: capture Shopify Credit (only for creates)
    if (
      created &&
      Array.isArray(orderData.payment_gateway_names) &&
      orderData.payment_gateway_names.includes('shopify_credit')
    ) {
      console.log(`Order ${orderId} used Shopify Credit. Attempting to capture payment.`);
      await captureShopifyCreditPayment(shopDomain, orderId);
    }

    return new NextResponse(null, { status: 200 });
  } catch (err) {
    console.error('Error processing Shopify webhook:', err);
    const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred';
    return NextResponse.json({ error: 'Webhook processing failed', details: errorMessage }, { status: 500 });
  }
}