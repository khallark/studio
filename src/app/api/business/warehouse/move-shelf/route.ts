// /api/business/warehouse/move-shelf/route.ts
// Note: This API handles position rebalancing and updates the shelf itself.
// Cloud functions (onShelfWritten) handle:
// - Stats updates on old/new racks, zones, and warehouses
// - Propagating location changes to placements
// - Creating audit logs

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';
import { authUserForBusiness } from '@/lib/authoriseUser';
import { Timestamp } from 'firebase-admin/firestore';
import { Shelf } from '@/types/warehouse';

export async function PUT(request: NextRequest) {
    try {
        const body = await request.json();
        const {
            businessId,
            shelfId,
            targetRackId,
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

        if (!shelfId || !targetRackId) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const shelfRef = db.doc(`users/${businessId}/shelves/${shelfId}`);
        const shelfDoc = await shelfRef.get();

        if (!shelfDoc.exists) {
            return NextResponse.json({ error: 'Shelf not found' }, { status: 404 });
        }

        const shelfData = shelfDoc.data()! as Shelf;
        const oldRackId = shelfData.rackId;
        const oldPosition = shelfData.position || 0;

        // Don't move if same rack
        if (oldRackId === targetRackId) {
            return NextResponse.json({ error: 'Shelf is already in this rack' }, { status: 400 });
        }

        const batch = db.batch();

        // ========================================
        // 1. Close gap in source rack (shift positions down)
        // ========================================
        const sourceShelvesSnapshot = await db
            .collection(`users/${businessId}/shelves`)
            .where('rackId', '==', oldRackId)
            .where('isDeleted', '==', false)
            .get();

        for (const doc of sourceShelvesSnapshot.docs) {
            if (doc.id === shelfId) continue;

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
        // 2. Make room in target rack (shift positions up)
        // ========================================
        const targetShelvesSnapshot = await db
            .collection(`users/${businessId}/shelves`)
            .where('rackId', '==', targetRackId)
            .where('isDeleted', '==', false)
            .get();

        // Determine new position
        let newPosition: number;
        if (targetPosition !== undefined && targetPosition !== null) {
            newPosition = targetPosition;
        } else {
            // Append at end: find max position + 1
            let maxPos = 0;
            for (const doc of targetShelvesSnapshot.docs) {
                const pos = doc.data().position || 0;
                if (pos > maxPos) maxPos = pos;
            }
            newPosition = maxPos + 1;
        }

        // Shift existing shelves at/after new position
        for (const doc of targetShelvesSnapshot.docs) {
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
        // 3. Update the shelf itself
        // Cloud functions will handle stats and placement propagation
        // ========================================

        batch.update(shelfRef, {
            rackId: targetRackId,
            zoneId: targetZoneId,
            warehouseId: targetWarehouseId,
            position: newPosition,
            updatedAt: Timestamp.now(),
            updatedBy: userId,
        } as Partial<Shelf>);

        await batch.commit();

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error moving shelf:', error);
        return NextResponse.json({ error: 'Failed to move shelf' }, { status: 500 });
    }
}