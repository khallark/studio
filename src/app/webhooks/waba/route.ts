// app/api/webhook/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { Timestamp, FieldValue, DocumentSnapshot } from 'firebase-admin/firestore';
import { sendCancelOrderWhatsAppMessage, sendConfirmOrderWhatsAppMessage } from '@/lib/communication/whatsappMessagesSendingFuncs';
import { db } from '@/lib/firebase-admin';

const quickReplyActions = new Map<string, any>([
    ["Confirm my order now", [updateToConfirmed, sendConfirmOrderWhatsAppMessage]],
    ["Request for Cancellation", [updateToCancallationRequested, sendCancelOrderWhatsAppMessage]]
]);

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
            try {
                const message = body.entry[0].changes[0].value.messages[0];
                const originalMessageId = message.context?.id;
                if (message.type === 'button') {
                    console.log('🔘 Quick reply received');
                    const buttonText = message.button.text;
                    if (originalMessageId) {
                        const messageDoc = await db.collection('whatsapp_messages').doc(originalMessageId).get();
                        if (messageDoc.exists) {
                            const messageData = messageDoc.data();
                            const shopName = messageData?.shopName;
                            const orderName = messageData?.orderName;
                            const orderId = messageData?.orderId;
                            if (shopName && orderName) {
                                const shopDoc = await db.collection('accounts').doc(shopName).get();
                                if (shopDoc.exists) {
                                    const orderDoc = await shopDoc.ref.collection('orders').doc(String(orderId)).get();
                                    if (orderDoc.exists) {
                                        const [updation, messageSending] = quickReplyActions.get(buttonText)
                                        const shouldSendMessage = await updation(orderDoc);
                                        if (shouldSendMessage) {
                                            const orderData = orderDoc.data() as any;
                                            const shopData = shopDoc.data() as any;
                                            await messageSending(shopData, orderData);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            } catch (error) {
                console.error('Error updating customStatus:', error);
            }
        }

        // Handle status updates
        if (body.entry?.[0]?.changes?.[0]?.value?.statuses) {
            const statuses = body.entry[0].changes[0].value.statuses;
            for (const status of statuses) {
                try {
                    const originalMessageId = status.id
                    const newStatus = status.status;
                    if (['sent', 'delivered', 'read'].includes(newStatus)) {
                        const messageDoc = await db.collection('whatsapp_messages').doc(originalMessageId).get();
                        if (messageDoc.exists) {
                            const currentStatus = messageDoc.data()?.messageStatus;
                            
                            // Define status hierarchy to prevent downgrades
                            const statusLevel: Record<'sent' | 'delivered' | 'read', number> = { 
                                sent: 1, 
                                delivered: 2, 
                                read: 3 
                            };
                            
                            // Type guard - at this point we know newStatus is one of the valid keys
                            const typedNewStatus = newStatus as 'sent' | 'delivered' | 'read';
                            
                            // Only update if new status is higher than current status
                            if (!currentStatus || statusLevel[typedNewStatus] > statusLevel[typedNewStatus]) {
                                await messageDoc.ref.update({
                                    messageStatus: newStatus,
                                    [`${newStatus}At`]: FieldValue.serverTimestamp(),
                                })
                                console.log(`✅ Message ${originalMessageId} status updated to ${newStatus}`);
                            } else {
                                console.log(`⏭️ Skipping status update for ${originalMessageId}: ${newStatus} -> current status ${currentStatus} is already higher`);
                            }
                        }
                    }
                } catch (error) {
                    console.error('Error updating message status:', error);
                }
            }
        }

        return NextResponse.json({ status: 'ok' }, { status: 200 });
    } catch (error) {
        console.error('❌ Error processing webhook:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
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