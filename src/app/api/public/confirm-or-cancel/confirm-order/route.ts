// app/api/public/confirm-or-cancel/confirm-order/route.ts
import { db } from "@/lib/firebase-admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import { validateConfirmCancelSession } from "@/lib/validateConfirmCancelSession";
import { sendConfirmOrderWhatsAppMessage } from "@/lib/communication/whatsappMessagesSendingFuncs";

export async function POST(req: NextRequest) {
    try {
        // Validate session
        let sessionData;
        try {
            sessionData = await validateConfirmCancelSession(req);
        } catch (error: any) {
            const errorMessages: Record<string, string> = {
                'NO_SESSION_COOKIE': 'Session not found. Please refresh the page.',
                'NO_CSRF_TOKEN': 'Security token missing. Please refresh the page.',
                'INVALID_SESSION': 'Invalid session. Please refresh the page.',
                'SESSION_EXPIRED': 'Your session has expired. Please refresh the page.',
                'CSRF_MISMATCH': 'Security validation failed. Please refresh the page.',
            };
            
            const message = errorMessages[error.message] || 'Session validation failed';
            return NextResponse.json({ error: message, sessionError: true }, { status: 401 });
        }

        const { orderId } = await req.json();

        if (!orderId) {
            return NextResponse.json({ error: 'Order ID is required' }, { status: 400 });
        }

        const storeId = sessionData.storeId;

        // Get order
        const orderDoc = await db
            .collection('accounts')
            .doc(storeId)
            .collection('orders')
            .doc(orderId)
            .get();

        if (!orderDoc.exists) {
            return NextResponse.json({ error: 'Order not found' }, { status: 404 });
        }

        const orderData = orderDoc.data()!;

        // Check if order can be confirmed
        if (orderData.customStatus !== 'New') {
            return NextResponse.json({ 
                success: false,
                message: `This order cannot be confirmed as it is currently in "${orderData.customStatus}" status.` 
            });
        }

        // Create log entry
        const log = {
            status: 'Confirmed',
            createdAt: Timestamp.now(),
            remarks: 'Order was confirmed by the customer via confirm/cancel link',
        };

        // Update order
        await orderDoc.ref.update({
            customStatus: 'Confirmed',
            confirmedAt: FieldValue.serverTimestamp(),
            customStatusesLogs: FieldValue.arrayUnion(log),
        });

        // Send WhatsApp confirmation message
        try {
            const shopDoc = await db.collection('accounts').doc(storeId).get();
            if (shopDoc.exists) {
                const shop = shopDoc.data() as any;
                const order = orderDoc.data() as any;
                await sendConfirmOrderWhatsAppMessage(shop, order);
            }
        } catch (whatsappError) {
            console.error('Failed to send WhatsApp confirmation:', whatsappError);
            // Don't fail the request if WhatsApp fails
        }

        return NextResponse.json({
            success: true,
            message: 'Your order has been confirmed successfully! You will receive a WhatsApp confirmation shortly.'
        });

    } catch (error) {
        console.error('Order confirmation error:', error);
        return NextResponse.json({ error: 'Failed to confirm order' }, { status: 500 });
    }
}