// /api/shopify/orders/mark-packed/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { authUserForBusinessAndStore } from '@/lib/authoriseUser';
import { db } from '@/lib/firebase-admin';

export async function POST(req: NextRequest) {
    try {
        const { businessId, shop, orderId, packingVidUrl } = await req.json();

        if (!businessId || !shop || !orderId || !packingVidUrl) {
            return NextResponse.json(
                { error: 'Missing required fields: businessId, shop, orderId, packingVidUrl' },
                { status: 400 }
            );
        }

        // Verify authentication
        const result = await authUserForBusinessAndStore({ businessId, shop, req });

        if (!result.authorised) {
            return NextResponse.json(
                { error: result.error },
                { status: result.status }
            );
        }

        // Get and validate the order
        const orderRef = db
            .collection('accounts')
            .doc(shop)
            .collection('orders')
            .doc(orderId);

        const orderDoc = await orderRef.get();

        if (!orderDoc.exists) {
            return NextResponse.json(
                { error: 'Order not found' },
                { status: 404 }
            );
        }

        const orderData = orderDoc.data();

        if (!orderData) {
            return NextResponse.json(
                { error: 'Order data is invalid' },
                { status: 500 }
            );
        }

        // Guard: only mark orders that are in Ready To Dispatch
        if (orderData.customStatus !== 'Ready To Dispatch') {
            return NextResponse.json(
                { error: `Order is not in "Ready To Dispatch" status (current: ${orderData.customStatus})` },
                { status: 400 }
            );
        }

        const timestamp = Timestamp.now();
        
        // Update the order doc
        await orderRef.update({
            packingVidUrls: FieldValue.arrayUnion({
                packingVidUrl,
                packedAt: timestamp
            }),
            packedAt: timestamp
        });

        return NextResponse.json({
            success: true,
            message: `Order ${orderId} marked as packed`,
            orderId,
        });
    } catch (error: any) {
        console.error('Error in mark-packed:', error);
        return NextResponse.json(
            {
                error: 'Failed to mark order as packed',
                details: error.message,
            },
            { status: 500 }
        );
    }
}