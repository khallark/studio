// /api/shopify/orders/make-pickup-ready/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { authUserForBusinessAndStore } from '@/lib/authoriseUser';
import { db } from '@/lib/firebase-admin';
import { UPC } from '@/types/warehouse';

export async function POST(req: NextRequest) {
    try {
        // Parse request body
        const { businessId, shop, orderId, assignedUpcIds } = await req.json();

        // Validate required fields
        if (!businessId || !shop || !orderId || !assignedUpcIds || !Array.isArray(assignedUpcIds)) {
            return NextResponse.json(
                { error: 'Missing required fields: businessId, shop, orderId, assignedUpcIds' },
                { status: 400 }
            );
        }

        // Verify authentication
        const result = await authUserForBusinessAndStore({ businessId, shop, req });

        if (!result.authorised) {
            return NextResponse.json(
                { error: result.error },
                { status: result.status }
            )
        }

        // Start a batch write
        const batch = db.batch();

        // Update each UPC document
        for (const upcId of assignedUpcIds) {
            const upcRef = db.collection('users').doc(businessId).collection('upcs').doc(upcId);

            const updateData: Partial<UPC> = {
                storeId: shop,
                orderId: orderId,
                putAway: 'outbound',
                updatedAt: Timestamp.now(),
            };

            batch.update(upcRef, updateData);
        }

        // Update the order to mark it as pickup ready
        const orderRef = db.collection('accounts').doc(shop).collection('orders').doc(orderId);

        batch.update(orderRef, {
            pickupReady: true,
            pickupReadyAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
        });

        // Commit the batch
        await batch.commit();

        return NextResponse.json({
            success: true,
            message: `Successfully prepared ${assignedUpcIds.length} items for pickup`,
            orderId,
            upcCount: assignedUpcIds.length,
        });
    } catch (error: any) {
        console.error('Error in make-pickup-ready:', error);
        return NextResponse.json(
            {
                error: 'Failed to process pickup',
                details: error.message,
            },
            { status: 500 }
        );
    }
}