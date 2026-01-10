// /api/business/warehouse/update-warehouse/route.ts

import { authUserForBusiness } from '@/lib/authoriseUser';
import { db } from '@/lib/firebase-admin';
import { Warehouse } from '@/types/warehouse';
import { Timestamp } from 'firebase-admin/firestore';
import { NextRequest, NextResponse } from 'next/server';

export async function PUT(request: NextRequest) {
    try {
        const body = await request.json();
        const { businessId, warehouseId, name, address } = body;

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

        if (!name || !name.trim()) {
            return NextResponse.json({ error: 'Warehouse name is required' }, { status: 400 });
        }

        const warehouseRef = db.doc(`users/${businessId}/warehouses/${warehouseId}`);
        const warehouseDoc = await warehouseRef.get();

        if (!warehouseDoc.exists) {
            return NextResponse.json({ error: 'Warehouse not found' }, { status: 404 });
        }

        const data: Partial<Warehouse> = {
            name: name.trim(),
            address: address?.trim() || '',
            updatedAt: Timestamp.now(),
            updatedBy: userId,
        };
        // Note: code is not updated as it serves as the document ID
        await warehouseRef.update(data);

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error updating warehouse:', error);
        return NextResponse.json({ error: 'Failed to update warehouse' }, { status: 500 });
    }
}