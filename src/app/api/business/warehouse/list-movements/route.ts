// /api/business/warehouse/list-movements/route.ts

import { authUserForBusiness } from '@/lib/authoriseUser';
import { db } from '@/lib/firebase-admin';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const businessId = searchParams.get('businessId');

        if (!businessId) {
            return NextResponse.json(
                { error: 'Business ID is required' },
                { status: 400 }
            );
        }

        // Verify authentication
        const result = await authUserForBusiness({ businessId, req: request });

        if (!result.authorised) {
            const { error, status } = result;
            return NextResponse.json(
                { error },
                { status }
            );
        }

        const type = searchParams.get('type'); // inbound, outbound, transfer, adjustment
        const productSKU = searchParams.get('productSKU');
        const warehouseId = searchParams.get('warehouseId');
        const limit = parseInt(searchParams.get('limit') || '50');
        const startAfter = searchParams.get('startAfter');

        if (!businessId) {
            return NextResponse.json({ error: 'Business ID is required' }, { status: 400 });
        }

        let query: FirebaseFirestore.Query = db
            .collection(`/users/${businessId}/movements`)
            .orderBy('timestamp', 'desc');

        if (type) {
            query = query.where('type', '==', type);
        }

        if (productSKU) {
            query = query.where('productSKU', '==', productSKU);
        }

        if (warehouseId) {
            // Filter by warehouse (either source or destination)
            query = query.where('to.warehouseId', '==', warehouseId);
        }

        if (startAfter) {
            const startAfterDoc = await db.doc(`${businessId}/movements/${startAfter}`).get();
            if (startAfterDoc.exists) {
                query = query.startAfter(startAfterDoc);
            }
        }

        query = query.limit(limit);

        const snapshot = await query.get();

        const movements = snapshot.docs.map((doc) => {
            const data = doc.data();
            return {
                id: doc.id,
                productId: data.productId,
                productSKU: data.productSKU,
                type: data.type,
                from: data.from,
                to: data.to,
                quantity: data.quantity,
                reason: data.reason || '',
                reference: data.reference || '',
                timestamp: data.timestamp?.toDate?.()?.toISOString() || null,
                userId: data.userId,
                userName: data.userName || '',
            };
        });

        const hasMore = snapshot.docs.length === limit;
        const lastDoc = snapshot.docs[snapshot.docs.length - 1];

        return NextResponse.json({
            movements,
            hasMore,
            lastId: lastDoc?.id || null,
        });
    } catch (error) {
        console.error('Error fetching movements:', error);
        return NextResponse.json({ error: 'Failed to fetch movements' }, { status: 500 });
    }
}