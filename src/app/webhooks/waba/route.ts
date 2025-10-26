// app/api/webhook/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { Timestamp, FieldValue, DocumentSnapshot, WriteBatch } from 'firebase-admin/firestore';
import { sendCancelOrderWhatsAppMessage, sendConfirmOrderWhatsAppMessage, sendDTORequestedCancelledWhatsAppMessage, sendRTOInTransitIWantThisOrderWhatsAppMessage, sendRTOInTransitIDontWantThisOrderWhatsAppMessage } from '@/lib/communication/whatsappMessagesSendingFuncs';
import { db } from '@/lib/firebase-admin';

// Set max duration for Vercel/Next.js (adjust based on your platform)
export const maxDuration = 60; // 60 seconds

const quickReplyActions = new Map<string, any>([
    ["Confirm my order now", [updateToConfirmed, sendConfirmOrderWhatsAppMessage]],
    ["Request for Cancellation", [updateToCancallationRequested, sendCancelOrderWhatsAppMessage]],
    ["I don't want to return it", [handleDontWantToReturn, sendDTORequestedCancelledWhatsAppMessage]],
    ["I want this order", [handleRTOInTransitPositive, sendRTOInTransitIWantThisOrderWhatsAppMessage]],
    ["I don't want this order", [handleRTOInTransitNegative, sendRTOInTransitIDontWantThisOrderWhatsAppMessage]],
])

// Utility function to add timeout to promises
async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorMsg: string): Promise<T> {
    return Promise.race([
        promise,
        new Promise<T>((_, reject) => 
            setTimeout(() => reject(new Error(errorMsg)), timeoutMs)
        )
    ]);
}

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
            // Don't await - handle async to avoid blocking
            handleIncomingMessages(body.entry[0].changes[0].value.messages).catch(error => {
                console.error('Error handling incoming messages:', error);
            });
        }

        // Handle status updates with batching
        if (body.entry?.[0]?.changes?.[0]?.value?.statuses) {
            // Don't await - handle async to avoid blocking
            handleStatusUpdates(body.entry[0].changes[0].value.statuses).catch(error => {
                console.error('Error handling status updates:', error);
            });
        }

        // Return immediately - processing continues in background
        return NextResponse.json({ status: 'ok' }, { status: 200 });
    } catch (error) {
        console.error('❌ Error processing webhook:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// Handle incoming messages separately with optimizations
async function handleIncomingMessages(messages: any[]) {
    for (const message of messages) {
        try {
            const originalMessageId = message.context?.id;
            
            if (message.type === 'button' && originalMessageId) {
                const buttonText = message.button.text;
                console.log(`📘 Quick reply received: "${buttonText}"`);
                
                // Get message doc with timeout
                const messageDoc = await withTimeout(
                    db.collection('whatsapp_messages').doc(originalMessageId).get(),
                    10000,
                    'Message doc fetch timeout'
                );
                
                if (!messageDoc.exists) {
                    console.warn(`⚠️ Message doc ${originalMessageId} not found`);
                    continue;
                }
                
                const messageData = messageDoc.data();
                const shopName = messageData?.shopName;
                const orderId = messageData?.orderId;
                
                if (!shopName || !orderId) {
                    console.warn(`⚠️ Missing shopName or orderId in message ${originalMessageId}`);
                    continue;
                }
                
                // OPTIMIZATION: Fetch shop and order docs in parallel
                const [shopDoc, orderDoc] = await withTimeout(
                    Promise.all([
                        db.collection('accounts').doc(shopName).get(),
                        db.collection('accounts').doc(shopName)
                            .collection('orders').doc(String(orderId)).get()
                    ]),
                    15000,
                    'Shop/Order docs fetch timeout'
                );
                
                if (!shopDoc.exists) {
                    console.warn(`⚠️ Shop ${shopName} not found`);
                    continue;
                }
                
                if (!orderDoc.exists) {
                    console.warn(`⚠️ Order ${orderId} not found in shop ${shopName}`);
                    continue;
                }
                
                const actionHandlers = quickReplyActions.get(buttonText);
                if (!actionHandlers) {
                    console.warn(`⚠️ No action handler for button: ${buttonText}`);
                    continue;
                }
                
                const [updation, messageSending] = actionHandlers;
                
                // Update order status with timeout
                const shouldSendMessage = await withTimeout(
                    updation(orderDoc),
                    10000,
                    'Order update timeout'
                );
                
                // OPTIMIZATION: Fire and forget WhatsApp message to avoid blocking
                if (shouldSendMessage) {
                    const orderData = orderDoc.data();
                    const shopData = shopDoc.data();
                    
                    // Send message asynchronously without waiting
                    messageSending(shopData, orderData).catch((error: Error) => {
                        console.error('Error sending WhatsApp message:', error);
                    });
                }
            }
        } catch (error) {
            console.error('Error processing message:', error);
            // Continue processing other messages
        }
    }
}

// Handle status updates with batching
async function handleStatusUpdates(statuses: any[]) {
    try {
        // Get unique message IDs
        const messageIds = [...new Set(statuses.map((s: any) => s.id))];
        
        // OPTIMIZATION: Fetch all message docs in parallel
        const messageDocs = await withTimeout(
            Promise.all(
                messageIds.map(id => db.collection('whatsapp_messages').doc(id).get())
            ),
            20000,
            'Message docs fetch timeout'
        );
        
        // Create a map for quick lookup
        const docMap = new Map(messageDocs.map(doc => [doc.id, doc]));
        
        // OPTIMIZATION: Use batch writes for efficiency
        const batch = db.batch();
        let batchCount = 0;
        const MAX_BATCH_SIZE = 500; // Firestore limit
        
        const statusLevel: Record<'sent' | 'delivered' | 'read', number> = { 
            sent: 1, 
            delivered: 2, 
            read: 3 
        };
        
        for (const status of statuses) {
            try {
                const originalMessageId = status.id;
                const newStatus = status.status;
                
                if (!['sent', 'delivered', 'read'].includes(newStatus)) {
                    continue;
                }
                
                const messageDoc = docMap.get(originalMessageId);
                
                if (!messageDoc?.exists) {
                    console.warn(`⚠️ Message doc ${originalMessageId} not found for status update`);
                    continue;
                }
                
                const currentStatus = messageDoc.data()?.messageStatus;
                const typedNewStatus = newStatus as 'sent' | 'delivered' | 'read';
                const typedCurrentStatus = currentStatus as 'sent' | 'delivered' | 'read' | undefined;
                
                // Only update if new status is higher than current status
                if (!currentStatus || statusLevel[typedNewStatus] > statusLevel[typedCurrentStatus!]) {
                    batch.update(messageDoc.ref, {
                        messageStatus: newStatus,
                        [`${newStatus}At`]: FieldValue.serverTimestamp(),
                    });
                    batchCount++;
                    console.log(`✅ Queued status update for ${originalMessageId}: ${newStatus}`);
                } else {
                    console.log(`⏭️ Skipping status update for ${originalMessageId}: ${newStatus} (current: ${currentStatus})`);
                }
                
                // Commit batch if we hit the limit
                if (batchCount >= MAX_BATCH_SIZE) {
                    await withTimeout(
                        batch.commit(),
                        30000,
                        'Batch commit timeout'
                    );
                    console.log(`✅ Committed batch of ${batchCount} status updates`);
                    batchCount = 0;
                }
            } catch (error) {
                console.error('Error processing individual status:', error);
                // Continue with other statuses
            }
        }
        
        // Commit remaining updates
        if (batchCount > 0) {
            await withTimeout(
                batch.commit(),
                30000,
                'Final batch commit timeout'
            );
            console.log(`✅ Committed final batch of ${batchCount} status updates`);
        }
    } catch (error) {
        console.error('Error in handleStatusUpdates:', error);
        throw error;
    }
}

// Handle confirm order action
async function updateToConfirmed(orderDoc: DocumentSnapshot): Promise<Boolean> {
    try {
        const orderData = orderDoc.data();
        if(orderData?.customStatus !== 'New') {
            console.warn(`⚠️ Order ${orderDoc.data()?.name ?? '{Unknown}'} is not a "NEW ORDER" anymore. Cancellation can be requested only on the new orders.`)
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

        console.log(`✅ Order ${orderDoc.data()?.name ?? '{Unknown}'} confirmed`);
        return true;
    } catch (error) {
        console.error('Error handling confirm order:', error);
        return false;
    }
}

// Handle cancel order action
async function updateToCancallationRequested(orderDoc: DocumentSnapshot): Promise<Boolean> {
    try {
        const orderData = orderDoc.data();
        if(orderData?.customStatus !== 'New') {
            console.warn(`⚠️ Order ${orderDoc.data()?.name ?? '{Unknown}'} is not a "NEW ORDER" anymore. Cancellation can be requested only on the new orders.`)
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

        console.log(`⚠️ Cancellation requested for order ${orderDoc.data()?.name ?? '{Unknown}'}`);
        return true;
    } catch (error) {
        console.error('Error handling cancel order:', error);
        return false;
    }
}

// handle don't want to return action
async function handleDontWantToReturn(orderDoc: DocumentSnapshot): Promise<Boolean> {
    try {
        const orderData = orderDoc.data();
        if(orderData?.customStatus !== 'DTO Requested') {
            console.warn(`⚠️ Order ${orderDoc.data()?.name ?? '{Unknown}'} is not in "DTO Requested" status. This action can be performed only on such orders.`)
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
        console.log(`Return cancelled by customer for order ${orderDoc.data()?.name ?? '{Unknown}'}`);
        return true;
    } catch (error) {
        console.error('Error handling do not want to return action:', error);
        return false;
    }
}

// handle I want this order action
async function handleRTOInTransitPositive(orderDoc: DocumentSnapshot): Promise<Boolean> {
    try {
        const orderData = orderDoc.data();
        if(orderData?.customStatus !== 'RTO In Transit') {
            console.warn(`⚠️ Order ${orderDoc.data()?.name ?? '{Unknown}'} is not in "RTO In-Transit" status. This action can be performed only on such orders.`)
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
        console.log(`Customer wants this order for ${orderDoc.data()?.name ?? '{Unknown}'}`);
        return true;
    } catch (error) {
        console.error('Error handling want this order action:', error);
        return false;
    }
}

// handle I don't want this order action
async function handleRTOInTransitNegative(orderDoc: DocumentSnapshot): Promise<Boolean> {
    try {
        const orderData = orderDoc.data();
        if(orderData?.customStatus !== 'RTO In Transit') {
            console.warn(`⚠️ Order ${orderDoc.data()?.name ?? '{Unknown}'} is not in "RTO In-Transit" status. This action can be performed only on such orders.`)
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
        console.log(`Customer does not want this order for ${orderDoc.data()?.name ?? '{Unknown}'}`);
        return true;
    } catch (error) {
        console.error('Error handling do not want this order action:', error);
        return false;
    }
}