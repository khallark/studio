// app/api/public/confirm-or-cancel/order/route.ts
import { db } from "@/lib/firebase-admin";
import { NextRequest, NextResponse } from "next/server";
import { validateConfirmCancelSession } from "@/lib/validateConfirmCancelSession";

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

        const { orderNumber } = await req.json();

        if (!orderNumber) {
            return NextResponse.json({ error: 'Order number is required' }, { status: 400 });
        }

        const storeId = sessionData.storeId;

        // Find order
        const ordersSnapshot = await db
            .collection('accounts')
            .doc(storeId)
            .collection('orders')
            .where('name', '==', `${orderNumber}`)
            .limit(1)
            .get();

        if (ordersSnapshot.empty) {
            return NextResponse.json({ error: 'Order not found' }, { status: 404 });
        }

        const orderDoc = ordersSnapshot.docs[0];
        const orderData = orderDoc.data();

        // Return order details
        return NextResponse.json({
            id: orderDoc.id,
            name: orderData.name,
            customStatus: orderData.customStatus || 'New',
            items: orderData.raw?.line_items?.map((item: any) => ({
                name: item.name,
                quantity: item.quantity,
                price: item.price,
                variant_id: item.variant_id,
            })) || [],
            shipping_address: orderData.raw?.shipping_address || {},
            raw: {
                total_price: orderData.raw?.total_price,
            },
        });

    } catch (error) {
        console.error('Order fetch error:', error);
        return NextResponse.json({ error: 'Failed to fetch order' }, { status: 500 });
    }
}