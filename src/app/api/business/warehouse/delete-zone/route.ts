// /api/business/warehouse/delete-zone/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { db } from '@/lib/firebase-admin';
import { authUserForBusiness } from '@/lib/authoriseUser';

export async function DELETE(request: NextRequest) {
    try {
        const body = await request.json();
        const { businessId, zoneId } = body;

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

        // Check for active racks
        const racksSnapshot = await db
            .collection(`users/${businessId}/racks`)
            .where('zoneId', '==', zoneId)
            .where('isDeleted', '==', false)
            .limit(1)
            .get();

        if (!racksSnapshot.empty) {
            return NextResponse.json(
                { error: 'Cannot delete zone with active racks. Remove all racks first.' },
                { status: 400 }
            );
        }

        const zoneRef = db.doc(`users/${businessId}/zones/${zoneId}`);
        await zoneRef.update({
            isDeleted: true,
            deletedAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
            updatedBy: userId,
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting zone:', error);
        return NextResponse.json({ error: 'Failed to delete zone' }, { status: 500 });
    }
}