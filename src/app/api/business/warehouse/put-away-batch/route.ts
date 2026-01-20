// /api/business/warehouse/put-away-batch/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { db } from '@/lib/firebase-admin';
import { authUserForBusiness } from '@/lib/authoriseUser';
import { Placement, Rack, Shelf, UPC, Zone } from '@/types/warehouse';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const {
            businessId,
            upcIds,
            warehouseId,
            zoneId,
            rackId,
            shelfId,
        } = body;

        // Validation
        if (!businessId) {
            return NextResponse.json({ error: 'Business ID is required' }, { status: 400 });
        }
        if (!upcIds || !Array.isArray(upcIds) || upcIds.length === 0 || upcIds.length > 500) {
            return NextResponse.json({ error: 'upcIds must be a non-empty array of length at most 500' }, { status: 400 });
        }
        if (!warehouseId || !zoneId || !rackId || !shelfId) {
            return NextResponse.json({ error: 'missing warehouseId, zoneId, rackId or shelfId' }, { status: 400 });
        }

        const result = await authUserForBusiness({ businessId, req: request });

        if (!result.authorised) {
            return NextResponse.json({ error: result.error }, { status: result.status });
        }

        const { userId } = result;
        if (!userId) {
            return NextResponse.json({ error: 'User not logged in' }, { status: 401 });
        }

        const businessRef = db.collection('users').doc(businessId);

        // Validate hierarchy (parallel)
        const [warehouseDoc, zoneDoc, rackDoc, shelfDoc] = await Promise.all([
            businessRef.collection('warehouses').doc(warehouseId).get(),
            businessRef.collection('zones').doc(zoneId).get(),
            businessRef.collection('racks').doc(rackId).get(),
            businessRef.collection('shelves').doc(shelfId).get(),
        ]);

        if (!warehouseDoc.exists) {
            return NextResponse.json({ error: 'Given Warehouse does not exist' }, { status: 404 });
        }
        if (!zoneDoc.exists) {
            return NextResponse.json({ error: 'Given zone does not exist' }, { status: 404 });
        }
        if ((zoneDoc.data() as Zone).warehouseId !== warehouseId) {
            return NextResponse.json({ error: 'Given zone does not exist in the given warehouse' }, { status: 400 });
        }
        if (!rackDoc.exists) {
            return NextResponse.json({ error: 'Given rack does not exist' }, { status: 404 });
        }
        if ((rackDoc.data() as Rack).zoneId !== zoneId) {
            return NextResponse.json({ error: 'Given rack does not exist in the given zone' }, { status: 400 });
        }
        if (!shelfDoc.exists) {
            return NextResponse.json({ error: 'Given shelf does not exist' }, { status: 404 });
        }
        if ((shelfDoc.data() as Shelf).rackId !== rackId) {
            return NextResponse.json({ error: 'Given shelf does not exist in the given rack' }, { status: 400 });
        }

        // Remove duplicate UPC ids defensively
        const uniqueUpcIds: string[] = [...new Set(upcIds)];

        // Fetch UPC docs
        const upcDocs = await Promise.all(
            uniqueUpcIds.map(id => businessRef.collection('upcs').doc(id).get())
        );

        // Find missing UPCs
        const missingUpcs = upcDocs.filter(d => !d.exists).map(d => d.id);
        if (missingUpcs.length > 0) {
            return NextResponse.json({
                error: 'Some UPCs do not exist',
                missingUpcs,
            }, { status: 404 });
        }

        // update UPC docs with new location
        let batch = db.batch();
        for (const upcDoc of upcDocs) {
            const data = upcDoc.data() as UPC;
            const updateUpcData: Partial<UPC> = {
                warehouseId,
                zoneId,
                rackId,
                shelfId,
                placementId: `${data.productId}_${shelfId}`,
                putAway: 'none',
                updatedAt: Timestamp.now(),
                updatedBy: userId,
            };
            batch.update(upcDoc.ref, updateUpcData);
        }

        await batch.commit();

        return NextResponse.json({
            success: true,
            count: uniqueUpcIds.length,
            message: `Successfully put away ${uniqueUpcIds.length} UPC(s)`,
        });
    } catch (error) {
        console.error('Error processing put-away upcs:', error);
        return NextResponse.json({ error: 'Error processing put-away upcs' }, { status: 500 });
    }
}
