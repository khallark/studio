
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

// function getOrderValueForVariable(variableIndex: number, orderData: any): string {
//   // Map variable indices to order data
//   // This mapping should match what you used when creating the template
//   switch (variableIndex) {
//     case 1:
//       return orderData?.customer?.first_name ||
//         orderData?.shipping_address?.first_name ||
//         orderData?.billing_address?.first_name ||
//         'Customer';
//     case 2:
//       return String(orderData?.name).substring(1) || String(orderData?.id);
//     case 3:
//       return `${orderData?.currency || ''} ${orderData?.total_price || '0'}`;
//     case 4:
//       return orderData?.customer?.email || '';
//     case 5:
//       return orderData?.shipping_address?.address1 || '';
//     case 6:
//       return orderData?.customer?.phone || '';
//     case 7:
//       return orderData?.created_at ? new Date(orderData.created_at).toLocaleDateString() : '';
//     default:
//       return `Variable ${variableIndex}`;
//   }
// }

// function extractVariablesFromText(text: string): number[] {
//   if (!text) return [];
//   const variableRegex = /\{\{(\d+)\}\}/g;
//   const matches = [...text.matchAll(variableRegex)];
//   return matches.map(match => parseInt(match[1])).sort((a, b) => a - b);
// }

// function buildDynamicMessagePayload(templateData: any, orderData: any, customerPhone: string) {
//   const template = templateData.data;

//   // Base payload
//   const messagePayload: any = {
//     countryCode: '+91',
//     phoneNumber: normalizePhoneNumber(customerPhone),
//     callbackData: `order_${orderData.id}`,
//     type: 'Template',
//     template: {
//       name: template.name,
//       languageCode: template.language || 'en',
//     }
//   };

//   // Extract variables from template body
//   const bodyVariables = extractVariablesFromText(template.body);
//   if (bodyVariables.length > 0) {
//     messagePayload.template.bodyValues = bodyVariables.map(varIndex => {
//       return getOrderValueForVariable(varIndex, orderData);
//     });
//   }

//   // Handle header dynamically
//   // if (template.header_format && template.header_format !== 'NONE') {
//   //   if (template.header_format === 'TEXT' && template.header) {
//   //     const headerVariables = extractVariablesFromText(template.header);
//   //     if (headerVariables.length > 0) {
//   //       messagePayload.template.headerValues = headerVariables.map(varIndex => {
//   //         return getOrderValueForVariable(varIndex, orderData);
//   //       });
//   //     }
//   //   } else if (['IMAGE', 'VIDEO', 'DOCUMENT'].includes(template.header_format)) {
//   //     // For media headers, use the file URL from template
//   //     if (template.header_handle_file_url) {
//   //       messagePayload.template.headerValues = [template.header_handle_file_url];
//   //     }
//   //   }
//   // }
//   // Handle header dynamically
//   if (template.header_format && template.header_format !== 'NONE') {
//     if (template.header_format === 'TEXT' && template.header) {
//       const headerVariables = extractVariablesFromText(template.header);
//       if (headerVariables.length > 0) {
//         messagePayload.template.headerValues = headerVariables.map(varIndex => {
//           return getOrderValueForVariable(varIndex, orderData);
//         });
//       } else {
//         // Include static header text
//         messagePayload.template.headerValues = [template.header];
//       }
//     } else if (['IMAGE', 'VIDEO', 'DOCUMENT'].includes(template.header_format)) {
//       if (template.header_handle_file_url) {
//         messagePayload.template.headerValues = [template.header_handle_file_url];
//       }
//     }
//   }

//   // Handle buttons dynamically
//   if (template.buttons) {
//     console.log('Raw buttons data:', template.buttons);
    
//     let buttons;
//     try {
//       // First parse to get the JSON string
//       let buttonsString = template.buttons;
//       if (typeof buttonsString === 'string') {
//         buttonsString = JSON.parse(buttonsString); // First parse: removes outer quotes
//       }
      
//       // Second parse to get the actual array
//       if (typeof buttonsString === 'string') {
//         buttons = JSON.parse(buttonsString); // Second parse: gets the array
//       } else {
//         buttons = buttonsString; // Already parsed
//       }
      
//       console.log('Final parsed buttons:', buttons);
      
//       // Only proceed if buttons is actually an array
//       if (Array.isArray(buttons)) {
//         const buttonValues: any = {};
        
//         buttons.forEach((button: any, index: number) => {
//           if (button.type === 'URL' && button.url) {
//             const urlVariables = extractVariablesFromText(button.url);
//             if (urlVariables.length > 0) {
//               buttonValues[`${index}_url`] = urlVariables.map(varIndex => {
//                 return getOrderValueForVariable(varIndex, orderData);
//               });
//             }
//           }
//         });
        
//         if (Object.keys(buttonValues).length > 0) {
//           messagePayload.template.buttonValues = buttonValues;
//         }
//       } else {
//         console.log('Buttons is not an array after parsing, skipping button processing');
//       }
//     } catch (parseError) {
//       console.log('Failed to parse buttons:', parseError);
//     }
//   }

//   return messagePayload;
// }

// async function sendNewOrderWhatsAppMessage(shopDomain: string, orderData: any) {
//   try {
//     console.log(`Attempting to send WhatsApp message for new order ${orderData.id} in shop ${shopDomain}`);

//     // Get account data
//     const accountRef = db.collection('accounts').doc(shopDomain);
//     const accountDoc = await accountRef.get();

//     if (!accountDoc.exists) {
//       console.log(`Account not found for shop: ${shopDomain}`);
//       return;
//     }

//     const accountData = accountDoc.data();

//     // Check if Interakt is configured
//     const interaktKeys = accountData?.integrations?.communication?.interakt;
//     if (!interaktKeys?.apiKey) {
//       console.log(`Interakt not configured for shop: ${shopDomain}`);
//       return;
//     }

//     // Get the active template for "New" category
//     const categorySettingsRef = accountRef
//       .collection('communications')
//       .doc('interakt')
//       .collection('settings')
//       .doc('category_settings');

//     const categoryDoc = await categorySettingsRef.get();
//     const activeTemplateId = categoryDoc.exists ? categoryDoc.data()?.activeTemplateForNew : null;

//     if (!activeTemplateId) {
//       console.log(`No active template assigned to "New" category for shop: ${shopDomain}`);
//       return;
//     }

//     // Get the template details
//     const templateRef = accountRef
//       .collection('communications')
//       .doc('interakt')
//       .collection('templates')
//       .doc(activeTemplateId);

//     const templateDoc = await templateRef.get();
//     if (!templateDoc.exists) {
//       console.log(`Template ${activeTemplateId} not found for shop: ${shopDomain}`);
//       return;
//     }

//     const templateData = templateDoc.data();

//     // Check if template is approved
//     if (templateData?.data?.approval_status !== 'APPROVED') {
//       console.log(`Template ${activeTemplateId} is not approved (status: ${templateData?.data?.approval_status})`);
//       return;
//     }

//     // Check if customer has phone number
//     const customerPhone = orderData?.shipping_address?.phone ||
//                           orderData?.billing_address?.phone ||
//                           orderData?.customer.phone || '';
    
//     if (!customerPhone) {
//       console.log(`No phone number found for customer in order ${orderData.id}`);
//       return;
//     }

//     // Build message payload for Interakt
//     const messagePayload = buildDynamicMessagePayload(templateData, orderData, customerPhone)

//     // Send message via Interakt API
//     const messageResponse = await fetch('https://api.interakt.ai/v1/public/message/', {
//       method: 'POST',
//       headers: {
//         'Authorization': `Basic ${interaktKeys.apiKey}`,
//         'Content-Type': 'application/json',
//       },
//       body: JSON.stringify(messagePayload)
//     });

//     if (!messageResponse.ok) {
//       const errorData = await messageResponse.text();
//       console.error(`Failed to send WhatsApp message for order ${orderData.id}: ${messageResponse.status} - ${errorData}`);
//       return;
//     }

//     const messageResult = await messageResponse.json();
//     console.log(`Successfully sent WhatsApp message for order ${orderData.id}. Message ID: ${messageResult.messageId || 'Unknown'}`);

//     // Log the message sending in the order document
//     const orderRef = accountRef.collection('orders').doc(String(orderData.id));
//     await orderRef.update({
//       whatsappMessage: {
//         sentAt: FieldValue.serverTimestamp(),
//         templateId: activeTemplateId,
//         templateName: templateData.data.name,
//         messageId: messageResult.messageId,
//         status: 'sent',
//         phoneNumber: customerPhone
//       }
//     });

//   } catch (error) {
//     console.error(`Error sending WhatsApp message for order ${orderData.id}:`, error);
//   }
// }

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

export async function POST(req: NextRequest) {
  try {
    const shopDomain = req.headers.get('x-shopify-shop-domain') || '';
    const rawTopic   = req.headers.get('x-shopify-topic') || '';
    const topic      = rawTopic.trim().toLowerCase(); // normalize once
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
    const orderRef   = accountRef.collection('orders').doc(orderId);
    const orderLogEntry = createOrderLogEntry(topic, orderData);

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
        const log = {
          status: "Updated By Shopify",
          createdAt: Timestamp.now(),
          remarks: `This order was updated on shopify`
        };
        tx.update(orderRef, { 
            ...dataToSave, 
            updatedByTopic: topic,
            customStatusesLogs: FieldValue.arrayUnion(log),
        });
        console.log(`Updated order ${orderId} for ${shopDomain}`);
        await logWebhookToCentralCollection(db, shopDomain, topic, orderId, orderData, hmacHeader);
      }
    });

    if(created) {
      const customerPhone = orderData?.shipping_address.phone || orderData?.shipping_address.phone || orderData?.customer.phone;
      const cleanPhone = normalizePhoneNumber(customerPhone);
      if(customerPhone && cleanPhone === '9779752241') {
        const shopDoc = (await accountRef.get()).data() as any;
        console.log('Trying to send message');
        await sendNewOrderWhatsAppMessage(shopDoc, {
          orderId: dataToSave.orderId,
          createdAt: dataToSave.createdAt,
          name: dataToSave.name,
          raw: orderData
        })
        
      } else {
        console.log('Skipping sending the message.');
      }
    }

    // if(created) {
    //   console.log('Trying to send whatspass message');
    //   const customerPhone = orderData?.shipping_address.phone || orderData?.shipping_address.phone || orderData?.customer.phone;
    //   const testPhoneNumber = '9779752241';
    //   console.log(customerPhone);

    //   if (customerPhone) {
    //     const cleanPhone = normalizePhoneNumber(customerPhone); // Remove + and non-digits
    //     console.log(cleanPhone);
    //     if (cleanPhone === testPhoneNumber) {
    //       console.log(`Customer phone matches test number, sending WhatsApp message for order ${orderId}`);
    //       // Fire and forget - don't await, don't handle errors
    //       sendNewOrderWhatsAppMessage(shopDomain, orderData).catch(error => {
    //         console.log(`WhatsApp message failed for order ${orderId}, but continuing:`, error.message);
    //       });
    //     } else {
    //       console.log(`Customer phone ${customerPhone} doesn't match test number ${testPhoneNumber}, skipping WhatsApp message`);
    //     }
    //   } else {
    //     console.log(`No customer phone found in order ${orderId}, skipping WhatsApp message`);
    //   }
    // }

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
