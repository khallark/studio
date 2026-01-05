// /api/business/warehouse/create-zone/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { authUserForBusiness } from '@/lib/authoriseUser';
import { db } from '@/lib/firebase-admin';
import { Zone } from '@/types/warehouse';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { businessId, warehouseId, warehouseName, name, code, description } = body;

        if (!businessId) {
            return NextResponse.json({ error: 'Business ID is required' }, { status: 400 });
        }
        
        const result = await authUserForBusiness({ businessId, req: request });

        if (!result.authorised) {
            return NextResponse.json({ error: result.error }, { status: result.status });
        }

        const { userId } = result;
        
        if(!userId) {
            return NextResponse.json({ error: 'User not logged in' }, { status: 401 });
        }

        if (!warehouseId) {
            return NextResponse.json({ error: 'Warehouse ID is required' }, { status: 400 });
        }

        if (!name || !name.trim()) {
            return NextResponse.json({ error: 'Zone name is required' }, { status: 400 });
        }

        const zoneRef = db.collection(`users/${businessId}/zones`).doc();
        const now = Timestamp.now();

        const zoneData: Zone = {
            id: zoneRef.id,
            name: name.trim(),
            code: code?.trim() || '',
            description: description?.trim() || '',
            warehouseId,
            warehouseName: warehouseName || '',
            deletedAt: null,
            isDeleted: false,
            createdBy: userId,
            createdAt: now,
            updatedAt: now,
            updatedBy: userId,
            stats: {
                totalRacks: 0,
                totalShelves: 0,
                totalProducts: 0,
            },
        };

        await zoneRef.set(zoneData);

        return NextResponse.json({ success: true, zone: { id: zoneRef.id, name: name.trim() } });
    } catch (error) {
        console.error('Error creating zone:', error);
        return NextResponse.json({ error: 'Failed to create zone' }, { status: 500 });
    }
}