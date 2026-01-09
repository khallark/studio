// /api/business/warehouse/move-zone/route.ts
// Note: This API only updates the zone itself.
// Cloud functions (onZoneWritten) handle:
// - Stats updates on old/new warehouses
// - Propagating warehouseId to children (racks, shelves, placements)
// - Creating audit logs

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';
import { authUserForBusiness } from '@/lib/authoriseUser';
import { Timestamp } from 'firebase-admin/firestore';
import { Zone } from '@/types/warehouse';

export async function PUT(request: NextRequest) {
    try {
        const body = await request.json();
        const { businessId, zoneId, targetWarehouseId } = body;

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

        if (!zoneId || !targetWarehouseId) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const zoneRef = db.doc(`users/${businessId}/zones/${zoneId}`);
        const zoneDoc = await zoneRef.get();

        if (!zoneDoc.exists) {
            return NextResponse.json({ error: 'Zone not found' }, { status: 404 });
        }

        const zoneData = zoneDoc.data()!;
        const oldWarehouseId = zoneData.warehouseId;

        // Don't move if same warehouse
        if (oldWarehouseId === targetWarehouseId) {
            return NextResponse.json({ error: 'Zone is already in this warehouse' }, { status: 400 });
        }

        // Only update the zone - cloud functions handle everything else
        await zoneRef.update({
            warehouseId: targetWarehouseId,
            updatedAt: Timestamp.now(),
            updatedBy: userId,
        } as Partial<Zone>);

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error moving zone:', error);
        return NextResponse.json({ error: 'Failed to move zone' }, { status: 500 });
    }
}