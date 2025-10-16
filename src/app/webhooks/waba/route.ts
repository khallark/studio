// app/api/webhook/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { Timestamp, FieldValue, DocumentSnapshot } from 'firebase-admin/firestore';
import { sendCancelOrderWhatsAppMessage, sendConfirmOrderWhatsAppMessage } from '@/lib/communication/whatsappMessagesSendingFuncs';
import { db } from '@/lib/firebase-admin';

const quickReplyActions = new Map<string, any>([
    ["Confirm my order", [updateToConfirmed, sendConfirmOrderWhatsAppMessage]],
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
                const buttonText = message.button.text;
                const originalMessageId = message.context?.id;
                if (message.type === 'button') {
                    console.log('🔘 Quick reply received');
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
                                        await updation(orderDoc);
                                        const orderData = orderDoc.data() as any;
                                        const shopData = shopDoc.data() as any;
                                        await messageSending(shopData, orderData);
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
                            await messageDoc.ref.update({
                                messageStatus: newStatus,
                                [`${newStatus}At`]: FieldValue.serverTimestamp(),
                            })
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
async function updateToConfirmed(orderDoc: DocumentSnapshot) {
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

        console.log(`✅ Order ${orderDoc.data()?.name ?? '{Unknown}'} confirmed`);
    } catch (error) {
        console.error('Error handling confirm order:', error);
    }
}

// Handle cancel order action
async function updateToCancallationRequested(orderDoc: DocumentSnapshot) {
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

        console.log(`⚠️ Cancellation requested for order ${orderDoc.data()?.name ?? '{Unknown}'}`);
    } catch (error) {
        console.error('Error handling cancel order:', error);
    }
}