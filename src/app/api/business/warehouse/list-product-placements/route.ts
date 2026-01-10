// /api/business/warehouse/list-product-placements/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { authUserForBusiness } from '@/lib/authoriseUser';
import { db } from '@/lib/firebase-admin';
import { Placement } from '@/types/warehouse';

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const businessId = searchParams.get('businessId');
        const productId = searchParams.get('productId');

        if (!businessId) {
            return NextResponse.json({ error: 'Business ID is required' }, { status: 400 });
        }

        if (!productId) {
            return NextResponse.json({ error: 'Product ID is required' }, { status: 400 });
        }

        const result = await authUserForBusiness({ businessId, req: request });

        if (!result.authorised) {
            return NextResponse.json({ error: result.error }, { status: result.status });
        }

        // Get all placements for this product
        const placementsSnap = await db
            .collection(`users/${businessId}/placements`)
            .where('productId', '==', productId)
            .where('quantity', '>', 0)
            .get();

        const placements = placementsSnap.docs.map(doc => {
            const data = doc.data() as Placement;
            return {
                id: doc.id,
                productId: data.productId,
                quantity: data.quantity,
                shelfId: data.shelfId,
                rackId: data.rackId,
                zoneId: data.zoneId,
                warehouseId: data.warehouseId,
                locationPath: `${data.zoneId} >> ${data.rackId} >> ${data.shelfId}`,
            };
        });

        return NextResponse.json({ placements });
    } catch (error) {
        console.error('Error listing product placements:', error);
        return NextResponse.json({ error: 'Failed to list placements' }, { status: 500 });
    }
}