// /api/business/warehouse/delete-shelf/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { authUserForBusiness } from '@/lib/authoriseUser';
import { db } from '@/lib/firebase-admin';
import { Shelf } from '@/types/warehouse';

export async function DELETE(request: NextRequest) {
    try {
        const body = await request.json();
        const { businessId, shelfId } = body;

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

        // Check for placements
        const placementsSnapshot = await db
            .collection(`users/${businessId}/placements`)
            .where('shelfId', '==', shelfId)
            .limit(1)
            .get();

        if (!placementsSnapshot.empty) {
            return NextResponse.json(
                { error: 'Cannot delete shelf with products. Remove all products first.' },
                { status: 400 }
            );
        }

        const shelfRef = db.doc(`users/${businessId}/shelves/${shelfId}`);
        const data: Partial<Shelf> = {
            isDeleted: true,
            deletedAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
            updatedBy: userId,
        };
        await shelfRef.update(data);

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting shelf:', error);
        return NextResponse.json({ error: 'Failed to delete shelf' }, { status: 500 });
    }
}