// /api/business/warehouse/list-zones/route.ts

import { authUserForBusiness } from '@/lib/authoriseUser';
import { db } from '@/lib/firebase-admin';
import { Zone } from '@/types/warehouse';
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

        const warehouseId = searchParams.get('warehouseId');

        if (!warehouseId) {
            return NextResponse.json(
                { error: 'Warehouse ID is required' },
                { status: 400 }
            );
        }

        // Fetch zones for the warehouse
        const zonesSnapshot = await db
            .collection(`${businessId}/zones`)
            .where('warehouseId', '==', warehouseId)
            .where('isDeleted', '==', false)
            .orderBy('name', 'asc')
            .get();

        const zones = zonesSnapshot.docs.map((doc) => {
            const data = doc.data() as Zone;
            return {
                id: doc.id,
                name: data.name,
                code: data.code || '',
                description: data.description || '',
                warehouseId: data.warehouseId,
                warehouseName: data.warehouseName || '',
                stats: {
                    totalRacks: data.stats?.totalRacks || 0,
                    totalShelves: data.stats?.totalShelves || 0,
                    totalProducts: data.stats?.totalProducts || 0,
                },
                isDeleted: data.isDeleted || false,
                createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
                updatedAt: data.updatedAt?.toDate?.()?.toISOString() || null,
            };
        });

        return NextResponse.json({ zones });
    } catch (error) {
        console.error('Error fetching zones:', error);
        return NextResponse.json(
            { error: 'Failed to fetch zones' },
            { status: 500 }
        );
    }
}