// app/api/webhook/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { sendConfirmOrderWhatsAppMessage } from '@/lib/communication/whatsappMessagesSendingFuncs';
import { db } from '@/lib/firebase-admin';

// GET - Webhook verification
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === process.env.META_WEBHOOK_SECRET) {
    console.log('✅ Webhook verified successfully');
    return new NextResponse(challenge, { status: 200 });
  }

  console.log('❌ Webhook verification failed');
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

// POST - Receive webhook events
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Handle incoming messages (button clicks, text messages, etc.)
    if (body.entry?.[0]?.changes?.[0]?.value?.messages) {
      const messages = body.entry[0].changes[0].value.messages;

      for (const message of messages) {
        // Handle button clicks
        if (message.type === 'button') {
          console.log('🔘 Quick reply received');
          
          const buttonText = message.button.text;
          const originalMessageId = message.context?.id;

          if (!originalMessageId) continue;

          // Find the shop and order from the original message
          const shopsSnapshot = await db.collection('shops').get();
          
          for (const shopDoc of shopsSnapshot.docs) {
            const messageDoc = await shopDoc.ref
              .collection('whatsapp_messages')
              .doc(originalMessageId)
              .get();
            
            if (messageDoc.exists) {
              const messageData = messageDoc.data();
              const orderName = messageData?.orderName;

              if (!orderName) continue;

              // Find the order
              const ordersSnapshot = await db
                .collection('orders')
                .where('name', '==', orderName)
                .limit(1)
                .get();

              if (ordersSnapshot.empty) continue;

              const orderDoc = ordersSnapshot.docs[0];
              const orderData = orderDoc.data();

              // Handle different button actions
              if (buttonText.toLowerCase().includes('confirm')) {
                await handleConfirmOrder(shopDoc, orderDoc, db);
              } else if (buttonText.toLowerCase().includes('cancel')) {
                await handleCancelOrder(orderDoc);
              }

              break;
            }
          }
        }
      }
    }

    // Handle status updates
    if (body.entry?.[0]?.changes?.[0]?.value?.statuses) {
      const statuses = body.entry[0].changes[0].value.statuses;

      for (const status of statuses) {
        if (['sent', 'delivered', 'read'].includes(status.status)) {
          await updateMessageStatus(db, status.id, status.status);
        }
      }
    }

    return NextResponse.json({ status: 'ok' }, { status: 200 });
  } catch (error) {
    console.error('❌ Error processing webhook:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Helper function to update message status
async function updateMessageStatus(
  db: any,
  messageId: string,
  newStatus: 'sent' | 'delivered' | 'read'
) {
  try {
    const shopsSnapshot = await db.collection('shops').get();
    
    for (const shopDoc of shopsSnapshot.docs) {
      const messageDoc = await shopDoc.ref
        .collection('whatsapp_messages')
        .doc(messageId)
        .get();
      
      if (messageDoc.exists) {
        await messageDoc.ref.update({
          messageStatus: newStatus,
          [`${newStatus}At`]: FieldValue.serverTimestamp(),
        });
        break;
      }
    }
  } catch (error) {
    console.error('Error updating message status:', error);
  }
}

// Handle confirm order action
async function handleConfirmOrder(shopDoc: any, orderDoc: any, db: any) {
  try {
    const log = {
      status: 'Confirmed',
      createdAt: Timestamp.now(),
      remarks: 'This order was confirmed by the customer via Whatsapp',
    };

    await orderDoc.ref.update({
      customStatus: 'Confirmed',
      confirmedAt: FieldValue.serverTimestamp(),
      customStatusesLogs: FieldValue.arrayUnion(log),
    });

    console.log(`✅ Order ${orderDoc.data().name} confirmed`);

    // Send confirmation message
    const shop = { id: shopDoc.id, ...shopDoc.data() };
    const order = { id: orderDoc.id, ...orderDoc.data() };
    
    await sendConfirmOrderWhatsAppMessage(shop, order);
  } catch (error) {
    console.error('Error handling confirm order:', error);
  }
}

// Handle cancel order action
async function handleCancelOrder(orderDoc: any) {
  try {
    const log = {
      status: 'Cancellation Requested',
      createdAt: Timestamp.now(),
      remarks: 'Cancellation was requested by the customer via Whatsapp',
    };

    await orderDoc.ref.update({
      customStatus: 'Cancellation Requested',
      cancellationRequestedAt: FieldValue.serverTimestamp(),
      customStatusesLogs: FieldValue.arrayUnion(log),
    });

    console.log(`⚠️ Cancellation requested for order ${orderDoc.data().name}`);
  } catch (error) {
    console.error('Error handling cancel order:', error);
  }
}