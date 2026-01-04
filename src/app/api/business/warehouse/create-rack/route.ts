// /api/business/warehouse/create-rack/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { db } from '@/lib/firebase-admin';
import { authUserForBusiness } from '@/lib/authoriseUser';
import { Rack } from '@/types/warehouse';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { businessId, zoneId, zoneName, warehouseId, warehouseName, name, code, position } = body;

        if (!businessId) {
            return NextResponse.json({ error: 'Business ID is required' }, { status: 400 });
        }

        const result = await authUserForBusiness({ businessId, req: request });

        if (!result.authorised) {
            return NextResponse.json({ error: result.error }, { status: result.status });
        }

        const { userId } = result;

        if (!userId) {
            return NextResponse.json({ error: 'User not logged in' }, { status: 401 });
        }

        if (!zoneId) {
            return NextResponse.json({ error: 'Zone ID is required' }, { status: 400 });
        }

        if (!name || !name.trim()) {
            return NextResponse.json({ error: 'Rack name is required' }, { status: 400 });
        }

        const rackRef = db.collection(`users/${businessId}/racks`).doc();
        const now = Timestamp.now();

        const rackData: Rack = {
            id: rackRef.id,
            name: name.trim(),
            code: code?.trim() || '',
            position: position || 0,
            zoneId,
            zoneName: zoneName || '',
            warehouseId,
            warehouseName: warehouseName || '',
            isDeleted: false,
            createdBy: userId,
            createdAt: now,
            updatedAt: now,
            updatedBy: userId,
            stats: {
                totalShelves: 0,
                totalProducts: 0,
            },
        };

        await rackRef.set(rackData);

        return NextResponse.json({ success: true, rack: { id: rackRef.id, name: name.trim() } });
    } catch (error) {
        console.error('Error creating rack:', error);
        return NextResponse.json({ error: 'Failed to create rack' }, { status: 500 });
    }
}