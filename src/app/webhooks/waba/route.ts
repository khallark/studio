// app/api/webhook/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { Timestamp, FieldValue, DocumentSnapshot } from 'firebase-admin/firestore';
import { sendCancelOrderWhatsAppMessage, sendConfirmOrderWhatsAppMessage, sendDTORequestedCancelledWhatsAppMessage, sendRTOInTransitIWantThisOrderWhatsAppMessage, sendRTOInTransitIDontWantThisOrderWhatsAppMessage } from '@/lib/communication/whatsappMessagesSendingFuncs';
import { db } from '@/lib/firebase-admin';

const quickReplyActions = new Map<string, any>([
    ["Confirm my order now", [updateToConfirmed, sendConfirmOrderWhatsAppMessage]],
    ["Request for Cancellation", [updateToCancallationRequested, sendCancelOrderWhatsAppMessage]],
    ["I don't want to return it", [handleDontWantToReturn, sendDTORequestedCancelledWhatsAppMessage]],
    ["I want this order", [handleRTOInTransitPositive, sendRTOInTransitIWantThisOrderWhatsAppMessage]],
    ["I don't want this order", [handleRTOInTransitNegative, sendRTOInTransitIDontWantThisOrderWhatsAppMessage]],
])

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
        console.log('📥 Webhook received');

        // Handle incoming messages (button clicks, text messages, etc.)
        if (body.entry?.[0]?.changes?.[0]?.value?.messages) {
            console.log('📨 Processing button clicks...');
            await handleButtonClicks(body.entry[0].changes[0].value.messages);
        }

        // Handle status updates with batching
        if (body.entry?.[0]?.changes?.[0]?.value?.statuses) {
            console.log('📊 Processing status updates...');
            // Fire and forget for status updates
            handleStatusUpdates(body.entry[0].changes[0].value.statuses).catch(error => {
                console.error('❌ Status update error:', error);
            });
        }

        console.log('✅ Webhook processed');
        return NextResponse.json({ status: 'ok' }, { status: 200 });
    } catch (error) {
        console.error('❌ Error processing webhook:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// Handle button clicks
async function handleButtonClicks(messages: any[]) {
    for (const message of messages) {
        if (message.type !== 'button' || !message.context?.id) {
            continue;
        }

        try {
            const buttonText = message.button.text;
            const originalMessageId = message.context.id;

            console.log(`🔘 Button: "${buttonText}" | MsgID: ${originalMessageId}`);

            // Get the original message
            const messageDoc = await db.collection('whatsapp_messages').doc(originalMessageId).get();
            if (!messageDoc.exists) {
                console.warn('⚠️ Message not found');
                continue;
            }

            const { shopName, orderId } = messageDoc.data() || {};
            if (!shopName || !orderId) {
                console.warn('⚠️ Missing shop/order info');
                continue;
            }

            console.log(`📦 Shop: ${shopName} | Order: ${orderId}`);

            // PARALLEL FETCH - Get shop and order at the same time
            const [shopDoc, orderDoc] = await Promise.all([
                db.collection('accounts').doc(shopName).get(),
                db.collection('accounts').doc(shopName).collection('orders').doc(String(orderId)).get()
            ]);

            if (!shopDoc.exists || !orderDoc.exists) {
                console.warn('⚠️ Shop or order not found');
                continue;
            }

            const orderData = orderDoc.data();
            console.log(`📋 Status: ${orderData?.customStatus} | Name: ${orderData?.name}`);

            // Get action handlers
            const handlers = quickReplyActions.get(buttonText);
            if (!handlers) {
                console.warn(`⚠️ No handler for: ${buttonText}`);
                continue;
            }

            const [updateFunc, sendMessageFunc] = handlers;

            // Update order
            console.log('🔄 Updating order...');
            const shouldSendMessage = await updateFunc(orderDoc);

            // Send WhatsApp message if needed
            if (shouldSendMessage) {
                console.log('📲 Sending WhatsApp message...');
                try {
                    await sendMessageFunc(shopDoc.data(), orderData);
                    console.log('✅ Message sent!');
                } catch (error) {
                    console.error('❌ Failed to send message:', error);
                }
            } else {
                console.log('⏭️ Skipping message (update returned false)');
            }

        } catch (error) {
            console.error('❌ Error handling button:', error);
        }
    }
}

// Handle status updates with batching
async function handleStatusUpdates(statuses: any[]) {
    try {
        console.log(`📊 Processing ${statuses.length} status updates`);

        // Get unique message IDs
        const messageIds = [...new Set(statuses.map((s: any) => s.id))];
        console.log(`📊 Unique messages: ${messageIds.length}`);

        // Fetch all message docs in PARALLEL (in chunks)
        const CHUNK_SIZE = 100;
        const allMessageDocs = [];

        for (let i = 0; i < messageIds.length; i += CHUNK_SIZE) {
            const chunk = messageIds.slice(i, i + CHUNK_SIZE);
            const docs = await Promise.all(
                chunk.map(id => db.collection('whatsapp_messages').doc(id).get())
            );
            allMessageDocs.push(...docs);
        }

        const docMap = new Map(allMessageDocs.map(doc => [doc.id, doc]));

        const statusLevel: Record<'sent' | 'delivered' | 'read', number> = {
            sent: 1,
            delivered: 2,
            read: 3
        };

        // Prepare all updates
        const updates: Array<{ ref: any, data: any }> = [];

        for (const status of statuses) {
            const messageId = status.id;
            const newStatus = status.status;

            if (!['sent', 'delivered', 'read'].includes(newStatus)) {
                continue;
            }

            const messageDoc = docMap.get(messageId);
            if (!messageDoc?.exists) {
                continue;
            }

            const currentStatus = messageDoc.data()?.messageStatus;
            const typedNewStatus = newStatus as 'sent' | 'delivered' | 'read';
            const typedCurrentStatus = currentStatus as 'sent' | 'delivered' | 'read' | undefined;

            // Only update if status is higher
            if (!currentStatus || statusLevel[typedNewStatus] > statusLevel[typedCurrentStatus!]) {
                updates.push({
                    ref: messageDoc.ref,
                    data: {
                        messageStatus: newStatus,
                        [`${newStatus}At`]: FieldValue.serverTimestamp(),
                    }
                });
            }
        }

        console.log(`📊 Will commit ${updates.length} updates`);

        // Batch write in chunks of 50 (safer than 500)
        const BATCH_SIZE = 50;
        let committed = 0;

        for (let i = 0; i < updates.length; i += BATCH_SIZE) {
            const batch = db.batch();
            const chunk = updates.slice(i, i + BATCH_SIZE);

            chunk.forEach(update => {
                batch.update(update.ref, update.data);
            });

            await batch.commit();
            committed += chunk.length;
            console.log(`✅ Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${chunk.length} updates (${committed}/${updates.length})`);
        }

        console.log(`✅ Status updates complete: ${committed} total`);

    } catch (error) {
        console.error('❌ Error in status updates:', error);
    }
}

// Handle confirm order action
async function updateToConfirmed(orderDoc: DocumentSnapshot): Promise<Boolean> {
    try {
        const orderData = orderDoc.data();
        if (orderData?.customStatus !== 'New') {
            console.warn(`⚠️ Order ${orderData?.name ?? '{Unknown}'} status is "${orderData?.customStatus}", not "New"`);
            return false;
        }

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

        console.log(`✅ Order ${orderData?.name ?? '{Unknown}'} confirmed`);
        return true;
    } catch (error) {
        console.error('❌ Error confirming order:', error);
        return false;
    }
}

// Handle cancel order action
async function updateToCancallationRequested(orderDoc: DocumentSnapshot): Promise<Boolean> {
    try {
        const orderData = orderDoc.data();
        if (orderData?.customStatus !== 'New') {
            console.warn(`⚠️ Order ${orderData?.name ?? '{Unknown}'} status is "${orderData?.customStatus}", not "New"`);
            return false;
        }

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

        console.log(`⚠️ Cancellation requested for order ${orderData?.name ?? '{Unknown}'}`);
        return true;
    } catch (error) {
        console.error('❌ Error requesting cancellation:', error);
        return false;
    }
}

// handle don't want to return action
async function handleDontWantToReturn(orderDoc: DocumentSnapshot): Promise<Boolean> {
    try {
        const orderData = orderDoc.data();
        if (orderData?.customStatus !== 'DTO Requested') {
            console.warn(`⚠️ Order ${orderData?.name ?? '{Unknown}'} status is "${orderData?.customStatus}", not "DTO Requested"`);
            return false;
        }

        const log = {
            status: 'Delivered',
            createdAt: Timestamp.now(),
            remarks: 'Customer indicated they do not want to return the order via Whatsapp',
        };

        await orderDoc.ref.update({
            customStatus: 'Delivered',
            returnCancelledByCustomerAt: FieldValue.serverTimestamp(),
            customStatusesLogs: FieldValue.arrayUnion(log),
        });

        console.log(`✅ Return cancelled by customer for order ${orderData?.name ?? '{Unknown}'}`);
        return true;
    } catch (error) {
        console.error('❌ Error handling return cancellation:', error);
        return false;
    }
}

// handle I want this order action
async function handleRTOInTransitPositive(orderDoc: DocumentSnapshot): Promise<Boolean> {
    try {
        const orderData = orderDoc.data();
        if (orderData?.customStatus !== 'RTO In Transit') {
            console.warn(`⚠️ Order ${orderData?.name ?? '{Unknown}'} status is "${orderData?.customStatus}", not "RTO In Transit"`);
            return false;
        }

        const log = {
            status: 'RTO In Transit Positive Confirmation',
            createdAt: Timestamp.now(),
            remarks: 'Customer indicated they want this order via Whatsapp',
        };

        await orderDoc.ref.update({
            customStatusesLogs: FieldValue.arrayUnion(log),
            tags_rtoInTransit: ['Re-attempt'],
        });

        console.log(`✅ Customer wants this order: ${orderData?.name ?? '{Unknown}'}`);
        return true;
    } catch (error) {
        console.error('❌ Error handling RTO positive:', error);
        return false;
    }
}

// handle I don't want this order action
async function handleRTOInTransitNegative(orderDoc: DocumentSnapshot): Promise<Boolean> {
    try {
        const orderData = orderDoc.data();
        if (orderData?.customStatus !== 'RTO In Transit') {
            console.warn(`⚠️ Order ${orderData?.name ?? '{Unknown}'} status is "${orderData?.customStatus}", not "RTO In Transit"`);
            return false;
        }

        const log = {
            status: 'RTO In Transit Negative Confirmation',
            createdAt: Timestamp.now(),
            remarks: 'Customer indicated they do not want this order via Whatsapp',
        };

        await orderDoc.ref.update({
            customStatusesLogs: FieldValue.arrayUnion(log),
            tags_rtoInTransit: ['Refused'],
        });

        console.log(`✅ Customer does not want this order: ${orderData?.name ?? '{Unknown}'}`);
        return true;
    } catch (error) {
        console.error('❌ Error handling RTO negative:', error);
        return false;
    }
}