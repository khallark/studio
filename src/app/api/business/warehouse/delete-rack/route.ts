// /api/business/warehouse/delete-rack/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { db } from '@/lib/firebase-admin';
import { authUserForBusiness } from '@/lib/authoriseUser';

export async function DELETE(request: NextRequest) {
    try {
        const body = await request.json();
        const { businessId, rackId } = body;

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

        // Check for active shelves
        const shelvesSnapshot = await db
            .collection(`users/${businessId}/shelves`)
            .where('rackId', '==', rackId)
            .where('isDeleted', '==', false)
            .limit(1)
            .get();

        if (!shelvesSnapshot.empty) {
            return NextResponse.json(
                { error: 'Cannot delete rack with active shelves. Remove all shelves first.' },
                { status: 400 }
            );
        }

        const rackRef = db.doc(`users/${businessId}/racks/${rackId}`);
        await rackRef.update({
            isDeleted: true,
            deletedAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
            updatedBy: userId,
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting rack:', error);
        return NextResponse.json({ error: 'Failed to delete rack' }, { status: 500 });
    }
}