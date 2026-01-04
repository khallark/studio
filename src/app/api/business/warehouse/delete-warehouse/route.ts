// /api/business/warehouse/delete-warehouse/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { authUserForBusiness } from '@/lib/authoriseUser';
import { Timestamp } from 'firebase-admin/firestore';
import { db } from '@/lib/firebase-admin';

export async function DELETE(request: NextRequest) {
    try {
        const body = await request.json();
        const { businessId, warehouseId } = body;

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

        if (!warehouseId) {
            return NextResponse.json({ error: 'Warehouse ID is required' }, { status: 400 });
        }

        // Check for active zones
        const zonesSnapshot = await db
            .collection(`users/${businessId}/zones`)
            .where('warehouseId', '==', warehouseId)
            .where('isDeleted', '==', false)
            .limit(1)
            .get();

        if (!zonesSnapshot.empty) {
            return NextResponse.json(
                { error: 'Cannot delete warehouse with active zones. Remove all zones first.' },
                { status: 400 }
            );
        }

        // Soft delete
        const warehouseRef = db.doc(`users/${businessId}/warehouses/${warehouseId}`);
        await warehouseRef.update({
            isDeleted: true,
            deletedAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
            updatedBy: userId,
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting warehouse:', error);
        return NextResponse.json({ error: 'Failed to delete warehouse' }, { status: 500 });
    }
}