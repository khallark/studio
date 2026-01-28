// webhook -> orders and products fetching and storing.

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';
import crypto from 'crypto';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { sendNewOrderWhatsAppMessage } from '@/lib/communication/whatsappMessagesSendingFuncs';
import { buildProductData } from '@/lib/shopify/product-utils';

export const runtime = 'nodejs';         // ensure Node (crypto) runtime
export const dynamic = 'force-dynamic';  // webhooks should not be cached

// ============================================================
// HMAC VERIFICATION
// ============================================================

function verifyWebhookHmac(rawBody: string, hmacHeader: string, secret: string): boolean {
  // Shopify webhook HMAC header is base64
  const received = Buffer.from(hmacHeader || '', 'base64');
  const computed = crypto
    .createHmac('sha256', secret)
    .update(Buffer.from(rawBody, 'utf8'))
    .digest(); // bytes, not 'hex' or 'base64'
  return received.length === computed.length && crypto.timingSafeEqual(received, computed);
}

// ============================================================
// LOGGING HELPERS
// ============================================================

async function logWebhookToCentralCollection(
  db: FirebaseFirestore.Firestore,
  shopDomain: string,
  topic: string,
  entityId: string,
  payload: any,
  hmac: string
) {
  const logEntry = {
    type: 'WEBHOOK',
    topic,
    entityId,
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

// ============================================================
// ORDER HELPERS
// ============================================================

function normalizePhoneNumber(phoneNumber: string): string {
  // Remove all whitespace characters from the phone number
  const cleanedNumber = String(phoneNumber)?.replace(/\s/g, "");
  // Check if the cleaned number length is >= 10
  if (String(cleanedNumber)?.length >= 10) {
    // Extract the last 10 digits
    return String(cleanedNumber)?.slice(-10);
  } else {
    // Return the whole string if length is less than 10
    return cleanedNumber;
  }
}

async function captureShopifyCreditPayment(
  shopDomain: string,
  orderId: string,
  accessToken: string,
  financialStatus: string
): Promise<{ success: boolean; error?: string }> {
  // Skip if already captured/paid
  if (financialStatus === 'paid') {
    console.log(`Order ${orderId} already paid, skipping capture.`);
    return { success: true };
  }

  if (financialStatus !== 'authorized') {
    console.log(`Order ${orderId} has status '${financialStatus}', not 'authorized'. Skipping capture.`);
    return { success: false, error: `Unexpected financial status: ${financialStatus}` };
  }

  try {
    // First, fetch existing transactions to find the authorization
    const txnListUrl = `https://${shopDomain}/admin/api/2025-01/orders/${orderId}/transactions.json`;
    const listResponse = await fetch(txnListUrl, {
      method: 'GET',
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json',
      },
    });

    if (!listResponse.ok) {
      const errorBody = await listResponse.text();
      console.error(`Failed to fetch transactions for order ${orderId}. Status: ${listResponse.status}. Body: ${errorBody}`);
      return { success: false, error: `Failed to fetch transactions: ${listResponse.status}` };
    }

    const { transactions } = await listResponse.json();

    // Find the authorization transaction for store credit
    const authTxn = transactions?.find(
      (t: any) => t.kind === 'authorization' && t.status === 'success'
    );

    if (!authTxn) {
      console.log(`No authorization transaction found for order ${orderId}. May already be captured.`);
      return { success: true }; // Not an error - might be auto-captured
    }

    // Check if already captured
    const existingCapture = transactions?.find(
      (t: any) => t.kind === 'capture' && t.status === 'success' && t.parent_id === authTxn.id
    );

    if (existingCapture) {
      console.log(`Order ${orderId} already has a successful capture. Skipping.`);
      return { success: true };
    }

    // Now capture with the parent_id
    const captureUrl = `https://${shopDomain}/admin/api/2025-01/orders/${orderId}/transactions.json`;
    const captureResponse = await fetch(captureUrl, {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        transaction: {
          kind: 'capture',
          parent_id: authTxn.id,
          amount: authTxn.amount, // Capture full authorized amount
        },
      }),
    });

    if (!captureResponse.ok) {
      const errorBody = await captureResponse.text();
      console.error(`Failed to capture for order ${orderId}. Status: ${captureResponse.status}. Body: ${errorBody}`);
      return { success: false, error: errorBody };
    }

    console.log(`Successfully captured Shopify Credit payment for order ${orderId}.`);
    return { success: true };

  } catch (error) {
    console.error(`Error during Shopify Credit capture for order ${orderId}:`, error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
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

/**
 * HELPER: Checks if an order is a split order by looking at note_attributes
 */
function isSplitOrder(orderData: any): boolean {
  if (!Array.isArray(orderData.note_attributes) || orderData.note_attributes.length === 0) {
    return false;
  }

  // Check for the presence of split order attributes
  return orderData.note_attributes.some(
    (attr: any) => attr.name === "_original_order_id" || attr.name === "_split_vendor"
  );
}

/**
 * HELPER: Extracts split order metadata from note_attributes
 */
function extractSplitMetadata(orderData: any): {
  originalOrderId?: string;
  originalOrderName?: string;
  splitVendor?: string;
  splitIndex?: string;
  totalSplits?: string;
} {
  if (!Array.isArray(orderData.note_attributes)) {
    return {};
  }

  const metadata: any = {};

  for (const attr of orderData.note_attributes) {
    switch (attr.name) {
      case "_original_order_id":
        metadata.originalOrderId = attr.value;
        break;
      case "_original_order_name":
        metadata.originalOrderName = attr.value;
        break;
      case "_split_vendor":
        metadata.splitVendor = attr.value;
        break;
      case "_split_index":
        metadata.splitIndex = attr.value;
        break;
      case "_total_splits":
        metadata.totalSplits = attr.value;
        break;
    }
  }

  return metadata;
}

// ============================================================
// ORDER WEBHOOK HANDLER
// ============================================================

async function handleOrderWebhook(
  shopDomain: string,
  topic: string,
  orderData: any,
  hmacHeader: string
): Promise<void> {
  const orderId = String(orderData?.id ?? '');
  if (!orderId) {
    console.warn('Missing order id in webhook payload', { topic, shopDomain });
    return;
  }

  const accountRef = db.collection('accounts').doc(shopDomain);
  const orderRef = accountRef.collection('orders').doc(orderId);

  // Extract vendors from line items
  const vendors = extractVendors(orderData.line_items || []);

  // Check if this is a split order
  const isSplit = isSplitOrder(orderData);
  const splitMetadata = isSplit ? extractSplitMetadata(orderData) : null;

  if (isSplit) {
    console.log(`Detected split order ${orderId} for vendor: ${splitMetadata?.splitVendor}`);
    console.log(`  Original order: ${splitMetadata?.originalOrderName} (${splitMetadata?.originalOrderId})`);
    console.log(`  Split: ${splitMetadata?.splitIndex}/${splitMetadata?.totalSplits}`);
  }

  const dataToSave: { [key: string]: any } = {
    storeId: shopDomain,
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
    lastStatusUpdate: FieldValue.serverTimestamp(),
    raw: orderData,
    lastWebhookTopic: topic,
    receivedAt: FieldValue.serverTimestamp(),
  };

  // Add split metadata if applicable
  if (isSplit && splitMetadata) {
    dataToSave.isSplitOrder = true;
    dataToSave.splitMetadata = splitMetadata;
  }

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

      // Different handling for split orders
      let log;
      let customStatus;

      if (isSplit) {
        // Split order: Mark as Confirmed
        customStatus = 'Confirmed';
        log = [{
          status: "Confirmed",
          createdAt: Timestamp.now(),
          remarks: `This order was confirmed and splitted successfully`
        }];
        console.log(`Created SPLIT order ${orderId} with status: Confirmed`);
      } else {
        // Normal order: Mark as New
        customStatus = 'New';
        log = [{
          status: "New",
          createdAt: Timestamp.now(),
          remarks: `This order was newly created on Shopify`
        }];
        console.log(`Created order ${orderId} for ${shopDomain}`);
      }

      tx.set(orderRef, {
        ...dataToSave,
        customStatus,
        isDeleted: false,
        createdByTopic: topic,
        customStatusesLogs: log, // Initialize logs array
      });

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

  // Post-transaction side effects: Skip for split orders
  if (created && !isSplit) {
    // WhatsApp message: Only for non-split orders
    const customerPhone = orderData?.shipping_address?.phone || orderData?.billing_address?.phone || orderData?.customer?.phone;
    const cleanPhone = normalizePhoneNumber(customerPhone);

    if (!String(orderData.tags).toLowerCase().includes('split-order') && customerPhone && cleanPhone.length === 10) {
      const shopDoc = (await accountRef.get()).data() as any;
      console.log('Trying to send message');
      await sendNewOrderWhatsAppMessage(shopDoc, {
        orderId: dataToSave.orderId,
        createdAt: dataToSave.createdAt,
        name: dataToSave.name,
        raw: orderData
      });
    } else {
      console.log('No valid phone number found for order, skipping WhatsApp message sending. Phone:', customerPhone, 'Normalized:', cleanPhone);
    }

    // Shopify Credit capture
    if (
      Array.isArray(orderData.payment_gateway_names) &&
      (orderData.payment_gateway_names.includes('shopify_credit') ||
        orderData.payment_gateway_names.includes('shopify_store_credit'))
    ) {
      console.log(`Order ${orderId} used Shopify Credit. Attempting to capture payment.`);

      const accountDoc = await accountRef.get();
      const accessToken = accountDoc.data()?.accessToken;

      if (accessToken) {
        const result = await captureShopifyCreditPayment(
          shopDomain,
          orderId,
          accessToken,
          orderData.financial_status
        );

        if (!result.success) {
          // Optionally: Queue for retry or log to a failures collection
          console.error(`Capture failed for ${orderId}:`, result.error);
        }
      }
    }
  } else if (created && isSplit) {
    console.log(`Split order ${orderId}: Skipping WhatsApp message and Shopify Credit capture`);
  }
}

// ============================================================
// PRODUCT WEBHOOK HANDLER
// ============================================================

async function handleProductWebhook(
  shopDomain: string,
  topic: string,
  productData: any,
  hmacHeader: string
): Promise<void> {
  const productId = String(productData?.id ?? '');
  if (!productId) {
    console.warn('Missing product id in webhook payload', { topic, shopDomain });
    return;
  }

  const accountRef = db.collection('accounts').doc(shopDomain);
  const productRef = accountRef.collection('products').doc(productId);

  // Use a transaction for consistency
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(productRef);

    // 1) Delete → tombstone or hard delete
    if (topic === 'products/delete') {
      if (snap.exists) {
        // Option A: Soft delete (tombstone)
        tx.update(productRef, {
          isDeleted: true,
          deletedAt: FieldValue.serverTimestamp(),
          lastWebhookTopic: topic,
        });
        console.log(`🗑️ Tombstoned product ${productId} (${productData.title || 'Unknown'}) for shop ${shopDomain}`);

        // Option B: Hard delete (uncomment if you prefer)
        // tx.delete(productRef);
        // console.log(`🗑️ Deleted product ${productId} for shop ${shopDomain}`);
      } else {
        console.log(`Product ${productId} not found for deletion, skipping.`);
      }
      await logWebhookToCentralCollection(db, shopDomain, topic, productId, productData, hmacHeader);
      return;
    }

    // Build the product data to save
    const dataToSave = buildProductData(productData, shopDomain, 'webhook', topic);

    // 2) Create → create new product doc
    if (topic === 'products/create') {
      // Check if already exists (race condition handling)
      if (snap.exists && !snap.data()?.isDeleted) {
        console.log(`Product ${productId} already exists, updating instead of creating.`);
        tx.update(productRef, {
          ...dataToSave,
          updatedByTopic: topic,
        });
      } else {
        tx.set(productRef, {
          ...dataToSave,
          storeId: shopDomain,
          isDeleted: false,
          createdByTopic: topic,
          firestoreCreatedAt: FieldValue.serverTimestamp(),
        });
        console.log(`✅ Created product ${productId} (${productData.title}) for ${shopDomain}`);
        console.log(`   Variants: ${dataToSave.variantCount}, SKUs: ${dataToSave.skus.join(', ') || 'none'}`);
      }
      await logWebhookToCentralCollection(db, shopDomain, topic, productId, productData, hmacHeader);
      return;
    }

    // 3) Update → update existing product
    if (topic === 'products/update') {
      if (!snap.exists) {
        // Product doesn't exist - create it (might have missed the create webhook)
        console.warn(`Received 'products/update' for non-existent product ${productId}. Creating it.`);
        tx.set(productRef, {
          ...dataToSave,
          storeId: shopDomain,
          isDeleted: false,
          createdByTopic: topic, // Mark that it was created via update
          firestoreCreatedAt: FieldValue.serverTimestamp(),
        });
      } else if (snap.data()?.isDeleted) {
        // Product was deleted but now being updated - restore it
        console.log(`Restoring previously deleted product ${productId}`);
        tx.update(productRef, {
          ...dataToSave,
          isDeleted: false,
          restoredAt: FieldValue.serverTimestamp(),
          updatedByTopic: topic,
        });
      } else {
        // Normal update
        tx.update(productRef, {
          ...dataToSave,
          updatedByTopic: topic,
        });
      }
      console.log(`📝 Updated product ${productId} (${productData.title}) for ${shopDomain}`);
      console.log(`   Variants: ${dataToSave.variantCount}, SKUs: ${dataToSave.skus.join(', ') || 'none'}`);
      await logWebhookToCentralCollection(db, shopDomain, topic, productId, productData, hmacHeader);
    }
  });
}

// ============================================================
// MAIN WEBHOOK HANDLER
// ============================================================

export async function POST(req: NextRequest) {
  try {
    console.log('🔥 WEBHOOK HIT', {
      topic: req.headers.get('x-shopify-topic'),
      shop: req.headers.get('x-shopify-shop-domain'),
    });
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

    // Define allowed topics
    const orderTopics = new Set(['orders/create', 'orders/updated', 'orders/delete']);
    const productTopics = new Set(['products/create', 'products/update', 'products/delete']);
    const allAllowedTopics = new Set([...orderTopics, ...productTopics]);

    if (!allAllowedTopics.has(topic)) {
      console.warn('Ignoring unexpected topic', { topic, shopDomain });
      return new NextResponse(null, { status: 200 });
    }

    const payload = JSON.parse(raw);

    // Route to appropriate handler
    if (orderTopics.has(topic)) {
      await handleOrderWebhook(shopDomain, topic, payload, hmacHeader);
    } else if (productTopics.has(topic)) {
      await handleProductWebhook(shopDomain, topic, payload, hmacHeader);
    }

    return new NextResponse(null, { status: 200 });
  } catch (err) {
    console.error('Error processing Shopify webhook:', err);
    const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred';
    return NextResponse.json({ error: 'Webhook processing failed', details: errorMessage }, { status: 500 });
  }
}