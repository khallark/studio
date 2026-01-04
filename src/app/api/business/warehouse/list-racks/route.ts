// /api/business/warehouse/list-racks/route.ts

import { authUserForBusiness } from '@/lib/authoriseUser';
import { db } from '@/lib/firebase-admin';
import { Rack } from '@/types/warehouse';
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

        const zoneId = searchParams.get('zoneId');

        if (!zoneId) {
            return NextResponse.json(
                { error: 'Zone ID is required' },
                { status: 400 }
            );
        }

        // Fetch racks for the zone
        const racksSnapshot = await db
            .collection(`users/${businessId}/racks`)
            .where('zoneId', '==', zoneId)
            .where('isDeleted', '==', false)
            .orderBy('position', 'asc')
            .get();

        const racks = racksSnapshot.docs.map((doc) => {
            const data = doc.data() as Rack;
            return {
                id: doc.id,
                name: data.name,
                code: data.code || '',
                zoneId: data.zoneId,
                zoneName: data.zoneName || '',
                warehouseId: data.warehouseId,
                warehouseName: data.warehouseName || '',
                position: data.position || 0,
                stats: {
                    totalShelves: data.stats?.totalShelves || 0,
                    totalProducts: data.stats?.totalProducts || 0,
                },
                isDeleted: data.isDeleted || false,
                createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
                updatedAt: data.updatedAt?.toDate?.()?.toISOString() || null,
            };
        });

        return NextResponse.json({ racks });
    } catch (error) {
        console.error('Error fetching racks:', error);
        return NextResponse.json(
            { error: 'Failed to fetch racks' },
            { status: 500 }
        );
    }
}