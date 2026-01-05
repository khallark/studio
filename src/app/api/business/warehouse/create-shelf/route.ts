// /api/business/warehouse/create-shelf/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { authUserForBusiness } from '@/lib/authoriseUser';
import { db } from '@/lib/firebase-admin';
import { Shelf } from '@/types/warehouse';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const {
            businessId, rackId, rackName, zoneId, zoneName, warehouseId, warehouseName,
            name, code, position, capacity, coordinates
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

        if (!rackId) {
            return NextResponse.json({ error: 'Rack ID is required' }, { status: 400 });
        }

        if (!name || !name.trim()) {
            return NextResponse.json({ error: 'Shelf name is required' }, { status: 400 });
        }

        // Get existing shelves in the rack to determine position
        const existingShelvesSnap = await db
            .collection(`users/${businessId}/shelves`)
            .where('rackId', '==', rackId)
            .where('isDeleted', '==', false)
            .get();

        const existingShelves = existingShelvesSnap.docs.map(doc => ({
            id: doc.id,
            position: doc.data().position as number,
        }));

        // Determine final position
        let finalPosition: number;

        if (position && position > 0) {
            // User specified a position - use it and shift others if needed
            finalPosition = position;

            // Find shelves that need to be shifted (position >= new position)
            const shelvesToShift = existingShelves.filter(s => s.position >= finalPosition);

            if (shelvesToShift.length > 0) {
                // Shift existing shelves up by 1
                const batch = db.batch();
                for (const shelf of shelvesToShift) {
                    const shelfRef = db.doc(`users/${businessId}/shelves/${shelf.id}`);
                    batch.update(shelfRef, {
                        position: shelf.position + 1,
                        updatedAt: Timestamp.now(),
                        updatedBy: userId,
                    });
                }
                await batch.commit();
            }
        } else {
            // No position specified - append at the end
            const maxPosition = existingShelves.reduce((max, s) => Math.max(max, s.position), 0);
            finalPosition = maxPosition + 1;
        }

        const shelfRef = db.collection(`users/${businessId}/shelves`).doc();
        const now = Timestamp.now();

        // Path will be computed by cloud function, but we can set initial value
        const path = `${zoneName || ''} > ${rackName || ''} > ${name.trim()}`;

        const shelfData: Shelf = {
            id: shelfRef.id,
            name: name.trim(),
            code: code?.trim() || '',
            position: finalPosition,
            capacity: capacity || null,
            rackId,
            rackName: rackName || '',
            zoneId,
            zoneName: zoneName || '',
            warehouseId,
            warehouseName: warehouseName || '',
            coordinates: coordinates || null,
            deletedAt: null,
            isDeleted: false,
            createdBy: userId,
            createdAt: now,
            updatedAt: now,
            updatedBy: userId,
            stats: {
                totalProducts: 0,
                currentOccupancy: 0,
            },
        };

        await shelfRef.set(shelfData);

        return NextResponse.json({ success: true, shelf: { id: shelfRef.id, name: name.trim(), position: finalPosition } });
    } catch (error) {
        console.error('Error creating shelf:', error);
        return NextResponse.json({ error: 'Failed to create shelf' }, { status: 500 });
    }
}