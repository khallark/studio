// /api/business/warehouse/move-rack/route.ts
// Note: This API handles position rebalancing and updates the rack itself.
// Cloud functions (onRackWritten) handle:
// - Stats updates on old/new zones and warehouses
// - Propagating location changes to children (shelves, placements)
// - Creating audit logs

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';
import { authUserForBusiness } from '@/lib/authoriseUser';
import { Timestamp } from 'firebase-admin/firestore';
import { Rack } from '@/types/warehouse';

export async function PUT(request: NextRequest) {
    try {
        const body = await request.json();
        const {
            businessId,
            rackId,
            targetZoneId,
            targetWarehouseId,
            targetPosition // Optional: if not provided, append at end
        } = body;

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

        if (!rackId || !targetZoneId) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const rackRef = db.doc(`users/${businessId}/racks/${rackId}`);
        const rackDoc = await rackRef.get();
        const rackData = rackDoc.data()! as Rack;

        if (!rackDoc.exists || rackData.isDeleted) {
            return NextResponse.json({ error: 'Rack not found' }, { status: 404 });
        }

        const oldZoneId = rackData.zoneId;
        const oldPosition = rackData.position || 0;

        // Don't move if same zone
        if (oldZoneId === targetZoneId) {
            return NextResponse.json({ error: 'Rack is already in this zone' }, { status: 400 });
        }

        const batch = db.batch();

        // ========================================
        // 1. Close gap in source zone (shift positions down)
        // ========================================
        const sourceRacksSnapshot = await db
            .collection(`users/${businessId}/racks`)
            .where('zoneId', '==', oldZoneId)
            .where('isDeleted', '==', false)
            .get();

        for (const doc of sourceRacksSnapshot.docs) {
            if (doc.id === rackId) continue;

            const pos = doc.data().position || 0;
            if (pos > oldPosition) {
                batch.update(doc.ref, {
                    position: pos - 1,
                    updatedAt: Timestamp.now(),
                    updatedBy: userId,
                });
            }
        }

        // ========================================
        // 2. Make room in target zone (shift positions up)
        // ========================================
        const targetRacksSnapshot = await db
            .collection(`users/${businessId}/racks`)
            .where('zoneId', '==', targetZoneId)
            .where('isDeleted', '==', false)
            .get();

        // Determine new position
        let newPosition: number;
        if (targetPosition !== undefined && targetPosition !== null) {
            newPosition = targetPosition;
        } else {
            // Append at end: find max position + 1
            let maxPos = 0;
            for (const doc of targetRacksSnapshot.docs) {
                const pos = doc.data().position || 0;
                if (pos > maxPos) maxPos = pos;
            }
            newPosition = maxPos + 1;
        }

        // Shift existing racks at/after new position
        for (const doc of targetRacksSnapshot.docs) {
            const pos = doc.data().position || 0;
            if (pos >= newPosition) {
                batch.update(doc.ref, {
                    position: pos + 1,
                    updatedAt: Timestamp.now(),
                    updatedBy: userId,
                });
            }
        }

        // ========================================
        // 3. Update the rack itself
        // Cloud functions will handle stats and child propagation
        // ========================================
        const data: Partial<Rack> = {
            zoneId: targetZoneId,
            warehouseId: targetWarehouseId,
            position: newPosition,
            updatedAt: Timestamp.now(),
            updatedBy: userId,
        };
        batch.update(rackRef, data);

        await batch.commit();

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error moving rack:', error);
        return NextResponse.json({ error: 'Failed to move rack' }, { status: 500 });
    }
}