// /api/business/warehouse/create-rack/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { db } from '@/lib/firebase-admin';
import { authUserForBusiness } from '@/lib/authoriseUser';
import { Rack } from '@/types/warehouse';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { businessId, zoneId, warehouseId, name, code, position } = body;

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

        if (!code || !code.trim()) {
            return NextResponse.json({ error: 'Rack code is required' }, { status: 400 });
        }

        // Normalize code (uppercase, trimmed)
        const normalizedCode = code.trim().toUpperCase();

        // Use code as document ID
        const rackRef = db.collection(`users/${businessId}/racks`).doc(normalizedCode);

        // Check if rack with this code already exists
        const existingRack = await rackRef.get();
        if (existingRack.exists) {
            const { isDeleted } = existingRack.data() as Rack;
            if (!isDeleted) {
                return NextResponse.json(
                    { error: `Rack with code "${normalizedCode}" already exists` },
                    { status: 409 }
                );
            }
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
            finalPosition = position;

            const racksToShift = existingRacks.filter(r => r.position >= finalPosition);

            if (racksToShift.length > 0) {
                const batch = db.batch();
                for (const rack of racksToShift) {
                    const rackRefToShift = db.doc(`users/${businessId}/racks/${rack.id}`);
                    batch.update(rackRefToShift, {
                        position: rack.position + 1,
                        updatedAt: Timestamp.now(),
                        updatedBy: userId,
                    });
                }
                await batch.commit();
            }
        } else {
            const maxPosition = existingRacks.reduce((max, r) => Math.max(max, r.position), 0);
            finalPosition = maxPosition + 1;
        }

        const now = Timestamp.now();

        if (!existingRack.exists) {
            const rackData: Rack = {
                id: normalizedCode,
                name: name.trim(),
                code: normalizedCode,
                position: finalPosition,
                zoneId,
                warehouseId,
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
                nameVersion: 1,
                locationVersion: 1,
            };
    
            await rackRef.set(rackData);
        } else {
            const rackUpdatedData: Partial<Rack> = {
                name: name.trim(),
                position: finalPosition,
                zoneId,
                warehouseId,
                isDeleted: false,
                updatedAt: now,
                updatedBy: userId,
                deletedAt: null,
                stats: {
                    totalShelves: 0,
                    totalProducts: 0,
                },
            };
    
            await rackRef.update(rackUpdatedData);
        }

        return NextResponse.json({
            success: true,
            rack: { id: normalizedCode, code: normalizedCode, name: name.trim(), position: finalPosition },
        });
    } catch (error) {
        console.error('Error creating rack:', error);
        return NextResponse.json({ error: 'Failed to create rack' }, { status: 500 });
    }
}