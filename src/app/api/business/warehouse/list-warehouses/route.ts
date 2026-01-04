// /api/business/warehouse/list-warehouses/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';
import { authUserForBusiness } from '@/lib/authoriseUser';
import { Warehouse } from '@/types/warehouse';

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
            console.error(error);
            return NextResponse.json(
                { error },
                { status }
            );
        }

        // Fetch warehouses
        const warehousesSnapshot = await db
            .collection(`${businessId}/warehouses`)
            .where('isDeleted', '==', false)
            .orderBy('name', 'asc')
            .get();

        const warehouses = warehousesSnapshot.docs.map((doc) => {
            const data = doc.data() as Warehouse;
            return {
                id: doc.id,
                name: data.name,
                address: data.address || '',
                storageCapacity: data.storageCapacity || 0,
                operationalHours: data.operationalHours || 0,
                defaultGSTstate: data.defaultGSTstate || '',
                stats: {
                    totalZones: data.stats?.totalZones || 0,
                    totalRacks: data.stats?.totalRacks || 0,
                    totalShelves: data.stats?.totalShelves || 0,
                    totalProducts: data.stats?.totalProducts || 0,
                },
                isDeleted: data.isDeleted || false,
                createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
                updatedAt: data.updatedAt?.toDate?.()?.toISOString() || null,
            };
        });

        return NextResponse.json({ warehouses });
    } catch (error) {
        console.error('Error fetching warehouses:', error);
        return NextResponse.json(
            { error: 'Failed to fetch warehouses' },
            { status: 500 }
        );
    }
}