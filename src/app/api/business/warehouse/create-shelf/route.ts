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
            businessId, rackId, zoneId, warehouseId,
            name, code, position, capacity,
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

        if (!code || !code.trim()) {
            return NextResponse.json({ error: 'Shelf code is required' }, { status: 400 });
        }

        // Normalize code (uppercase, trimmed)
        const normalizedCode = code.trim().toUpperCase();

        // Use code as document ID
        const shelfRef = db.collection(`users/${businessId}/shelves`).doc(normalizedCode);

        // Check if shelf with this code already exists
        const existingShelf = await shelfRef.get();
        if (existingShelf.exists) {
            return NextResponse.json(
                { error: `Shelf with code "${normalizedCode}" already exists` },
                { status: 409 }
            );
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
            finalPosition = position;

            const shelvesToShift = existingShelves.filter(s => s.position >= finalPosition);

            if (shelvesToShift.length > 0) {
                const batch = db.batch();
                for (const shelf of shelvesToShift) {
                    const shelfRefToShift = db.doc(`users/${businessId}/shelves/${shelf.id}`);
                    batch.update(shelfRefToShift, {
                        position: shelf.position + 1,
                        updatedAt: Timestamp.now(),
                        updatedBy: userId,
                    });
                }
                await batch.commit();
            }
        } else {
            const maxPosition = existingShelves.reduce((max, s) => Math.max(max, s.position), 0);
            finalPosition = maxPosition + 1;
        }

        const now = Timestamp.now();

        const shelfData: Shelf = {
            id: normalizedCode,
            name: name.trim(),
            code: normalizedCode,
            position: finalPosition,
            capacity: capacity || null,
            rackId,
            zoneId,
            warehouseId,
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
            nameVersion: 1,
            locationVersion: 1,
        };

        await shelfRef.set(shelfData);

        return NextResponse.json({
            success: true,
            shelf: { id: normalizedCode, code: normalizedCode, name: name.trim(), position: finalPosition },
        });
    } catch (error) {
        console.error('Error creating shelf:', error);
        return NextResponse.json({ error: 'Failed to create shelf' }, { status: 500 });
    }
}