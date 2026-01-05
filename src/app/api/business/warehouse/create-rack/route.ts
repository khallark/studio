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

        // Get existing racks in the zone to determine position
        const existingRacksSnap = await db
            .collection(`users/${businessId}/racks`)
            .where('zoneId', '==', zoneId)
            .where('isDeleted', '==', false)
            .get();

        const existingRacks = existingRacksSnap.docs.map(doc => ({
            id: doc.id,
            position: doc.data().position as number,
        }));

        // Determine final position
        let finalPosition: number;

        if (position && position > 0) {
            // User specified a position - use it and shift others if needed
            finalPosition = position;

            // Find racks that need to be shifted (position >= new position)
            const racksToShift = existingRacks.filter(r => r.position >= finalPosition);

            if (racksToShift.length > 0) {
                // Shift existing racks up by 1
                const batch = db.batch();
                for (const rack of racksToShift) {
                    const rackRef = db.doc(`users/${businessId}/racks/${rack.id}`);
                    batch.update(rackRef, {
                        position: rack.position + 1,
                        updatedAt: Timestamp.now(),
                        updatedBy: userId,
                    });
                }
                await batch.commit();
            }
        } else {
            // No position specified - append at the end
            const maxPosition = existingRacks.reduce((max, r) => Math.max(max, r.position), 0);
            finalPosition = maxPosition + 1;
        }

        const rackRef = db.collection(`users/${businessId}/racks`).doc();
        const now = Timestamp.now();

        const rackData: Rack = {
            id: rackRef.id,
            name: name.trim(),
            code: code?.trim() || '',
            position: finalPosition,
            zoneId,
            zoneName: zoneName || '',
            warehouseId,
            warehouseName: warehouseName || '',
            isDeleted: false,
            createdBy: userId,
            createdAt: now,
            updatedAt: now,
            updatedBy: userId,
            deletedAt: null,
            stats: {
                totalShelves: 0,
                totalProducts: 0,
            },
        };

        await rackRef.set(rackData);

        return NextResponse.json({ success: true, rack: { id: rackRef.id, name: name.trim(), position: finalPosition } });
    } catch (error) {
        console.error('Error creating rack:', error);
        return NextResponse.json({ error: 'Failed to create rack' }, { status: 500 });
    }
}