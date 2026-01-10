// /api/business/warehouse/list-placements/route.ts

import { authUserForBusiness } from '@/lib/authoriseUser';
import { db } from '@/lib/firebase-admin';
import { Placement } from '@/types/warehouse';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
    try {
        // Get businessId from query params
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

        const shelfId = searchParams.get('shelfId');

        if (!shelfId) {
            return NextResponse.json(
                { error: 'Shelf ID is required' },
                { status: 400 }
            );
        }

        // Fetch placements for the shelf
        const placementsSnapshot = await db
            .collection(`users/${businessId}/placements`)
            .where('shelfId', '==', shelfId)
            .orderBy('productId', 'asc')
            .get();

        const placements = placementsSnapshot.docs.map((doc) => {
            const data = doc.data() as Placement;
            return {
                id: doc.id,
                productId: data.productId,
                quantity: data.quantity || 0,
                shelfId: data.shelfId,
                rackId: data.rackId,
                zoneId: data.zoneId,
                warehouseId: data.warehouseId,
                createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
                updatedAt: data.updatedAt?.toDate?.()?.toISOString() || null,
            };
        });

        return NextResponse.json({ placements });
    } catch (error) {
        console.error('Error fetching placements:', error);
        return NextResponse.json(
            { error: 'Failed to fetch placements' },
            { status: 500 }
        );
    }
}