// /api/business/warehouse/list-upcs/route.ts

import { authUserForBusiness } from '@/lib/authoriseUser';
import { db } from '@/lib/firebase-admin';
import { UPC } from '@/types/warehouse';
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

        const placementId = searchParams.get('placementId');

        if (!placementId) {
            return NextResponse.json(
                { error: 'Placement ID is required' },
                { status: 400 }
            );
        }

        // Fetch upcs for the placement
        const upcsSnapshot = await db
            .collection(`users/${businessId}/upcs`)
            .where('placementId', '==', placementId)
            .where('putAway', '==', 'none')
            .get();

        const upcs = upcsSnapshot.docs.map((doc) => {
            const data = doc.data() as UPC;
            return {
                id: doc.id,
                productId: data.productId,
                placementId: data.placementId,
                shelfId: data.shelfId,
                rackId: data.rackId,
                zoneId: data.zoneId,
                warehouseId: data.warehouseId,
                createdAt: data.createdAt?.toDate?.()?.toISOString(),
                updatedAt: data.updatedAt?.toDate?.()?.toISOString(),
            };
        });

        return NextResponse.json({ upcs });
    } catch (error) {
        console.error('Error fetching upcs:', error);
        return NextResponse.json(
            { error: 'Failed to fetch upcs' },
            { status: 500 }
        );
    }
}