// /api/business/warehouse/list-shelves/route.ts

import { authUserForBusiness } from '@/lib/authoriseUser';
import { db } from '@/lib/firebase-admin';
import { Shelf } from '@/types/warehouse';
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

        const rackId = searchParams.get('rackId');

        if (!rackId) {
            return NextResponse.json(
                { error: 'Rack ID is required' },
                { status: 400 }
            );
        }

        // Fetch shelves for the rack
        const shelvesSnapshot = await db
            .collection(`${businessId}/shelves`)
            .where('rackId', '==', rackId)
            .where('isDeleted', '==', false)
            .orderBy('position', 'asc')
            .get();

        const shelves = shelvesSnapshot.docs.map((doc) => {
            const data = doc.data() as Shelf;
            return {
                id: doc.id,
                name: data.name,
                code: data.code || '',
                capacity: data.capacity || null,
                rackId: data.rackId,
                rackName: data.rackName || '',
                zoneId: data.zoneId,
                zoneName: data.zoneName || '',
                warehouseId: data.warehouseId,
                warehouseName: data.warehouseName || '',
                position: data.position || 0,
                path: data.path || '',
                coordinates: data.coordinates || null,
                stats: {
                    totalProducts: data.stats?.totalProducts || 0,
                    currentOccupancy: data.stats?.currentOccupancy || 0,
                },
                isDeleted: data.isDeleted || false,
                createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
                updatedAt: data.updatedAt?.toDate?.()?.toISOString() || null,
            };
        });

        return NextResponse.json({ shelves });
    } catch (error) {
        console.error('Error fetching shelves:', error);
        return NextResponse.json(
            { error: 'Failed to fetch shelves' },
            { status: 500 }
        );
    }
}