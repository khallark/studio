// /api/business/warehouse/update-shelf/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { db } from '@/lib/firebase-admin';
import { authUserForBusiness } from '@/lib/authoriseUser';
import { Shelf } from '@/types/warehouse';

export async function PUT(request: NextRequest) {
    try {
        const body = await request.json();
        const { businessId, shelfId, name, position, capacity } = body;

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

        if (!shelfId) {
            return NextResponse.json({ error: 'Shelf ID is required' }, { status: 400 });
        }

        if (!name || !name.trim()) {
            return NextResponse.json({ error: 'Shelf name is required' }, { status: 400 });
        }

        const shelfRef = db.doc(`users/${businessId}/shelves/${shelfId}`);
        const shelfDoc = await shelfRef.get();

        if (!shelfDoc.exists) {
            return NextResponse.json({ error: 'Shelf not found' }, { status: 404 });
        }

        const currentShelf = shelfDoc.data()!;
        const oldPosition = currentShelf.position || 0;
        const newPosition = position || 0;
        const rackId = currentShelf.rackId;

        const batch = db.batch();

        // Handle position rebalancing if position changed
        if (oldPosition !== newPosition) {
            // Get all shelves in the same rack (excluding current shelf)
            const shelvesSnapshot = await db
                .collection(`users/${businessId}/shelves`)
                .where('rackId', '==', rackId)
                .where('isDeleted', '==', false)
                .get();

            const otherShelves = shelvesSnapshot.docs.filter(doc => doc.id !== shelfId);

            if (newPosition > oldPosition) {
                // Moving down (e.g., pos 1 → 3)
                // Shift shelves in range (oldPosition, newPosition] up by -1
                for (const doc of otherShelves) {
                    const shelfData = doc.data();
                    const shelfPos = shelfData.position || 0;

                    if (shelfPos > oldPosition && shelfPos <= newPosition) {
                        batch.update(doc.ref, {
                            position: shelfPos - 1,
                            updatedAt: Timestamp.now(),
                            updatedBy: userId,
                        });
                    }
                }
            } else {
                // Moving up (e.g., pos 3 → 1)
                // Shift shelves in range [newPosition, oldPosition) down by +1
                for (const doc of otherShelves) {
                    const shelfData = doc.data();
                    const shelfPos = shelfData.position || 0;

                    if (shelfPos >= newPosition && shelfPos < oldPosition) {
                        batch.update(doc.ref, {
                            position: shelfPos + 1,
                            updatedAt: Timestamp.now(),
                            updatedBy: userId,
                        });
                    }
                }
            }
        }

        // Update the shelf itself
        // Note: code is not updated as it serves as the document ID
        const updateData: Partial<Shelf> = {
            name: name.trim(),
            position: newPosition,
            capacity: capacity || null,
            updatedAt: Timestamp.now(),
            updatedBy: userId,
        };
        batch.update(shelfRef, updateData);

        await batch.commit();

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error updating shelf:', error);
        return NextResponse.json({ error: 'Failed to update shelf' }, { status: 500 });
    }
}