// /api/business/warehouse/update-rack/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { db } from '@/lib/firebase-admin';
import { authUserForBusiness } from '@/lib/authoriseUser';

export async function PUT(request: NextRequest) {
    try {
        const body = await request.json();
        const { businessId, rackId, name, code, position } = body;

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
            return NextResponse.json({ error: 'Rack name is required' }, { status: 400 });
        }

        const rackRef = db.doc(`users/${businessId}/racks/${rackId}`);
        const rackDoc = await rackRef.get();

        if (!rackDoc.exists) {
            return NextResponse.json({ error: 'Rack not found' }, { status: 404 });
        }

        const currentRack = rackDoc.data()!;
        const oldPosition = currentRack.position || 0;
        const newPosition = position || 0;
        const zoneId = currentRack.zoneId;

        const batch = db.batch();

        // Handle position rebalancing if position changed
        if (oldPosition !== newPosition) {
            // Get all racks in the same zone (excluding current rack)
            const racksSnapshot = await db
                .collection(`users/${businessId}/racks`)
                .where('zoneId', '==', zoneId)
                .where('isDeleted', '==', false)
                .get();

            const otherRacks = racksSnapshot.docs.filter(doc => doc.id !== rackId);

            if (newPosition > oldPosition) {
                // Moving down (e.g., pos 1 → 3)
                // Shift racks in range (oldPosition, newPosition] up by -1
                for (const doc of otherRacks) {
                    const rackData = doc.data();
                    const rackPos = rackData.position || 0;

                    if (rackPos > oldPosition && rackPos <= newPosition) {
                        batch.update(doc.ref, {
                            position: rackPos - 1,
                            updatedAt: Timestamp.now(),
                            updatedBy: userId,
                        });
                    }
                }
            } else {
                // Moving up (e.g., pos 3 → 1)
                // Shift racks in range [newPosition, oldPosition) down by +1
                for (const doc of otherRacks) {
                    const rackData = doc.data();
                    const rackPos = rackData.position || 0;

                    if (rackPos >= newPosition && rackPos < oldPosition) {
                        batch.update(doc.ref, {
                            position: rackPos + 1,
                            updatedAt: Timestamp.now(),
                            updatedBy: userId,
                        });
                    }
                }
            }
        }

        // Update the rack itself
        batch.update(rackRef, {
            name: name.trim(),
            code: code?.trim() || '',
            position: newPosition,
            updatedAt: Timestamp.now(),
            updatedBy: userId,
        });

        await batch.commit();

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error updating rack:', error);
        return NextResponse.json({ error: 'Failed to update rack' }, { status: 500 });
    }
}