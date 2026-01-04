// /api/business/warehouse/update-shelf/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { db } from '@/lib/firebase-admin';
import { authUserForBusiness } from '@/lib/authoriseUser';

export async function PUT(request: NextRequest) {
    try {
        const body = await request.json();
        const { businessId, shelfId, name, code, position, capacity, coordinates } = body;

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

        const updateData: Record<string, any> = {
            name: name.trim(),
            code: code?.trim() || '',
            position: position || 0,
            capacity: capacity || null,
            updatedAt: Timestamp.now(),
            updatedBy: userId,
        };

        if (coordinates !== undefined) {
            updateData.coordinates = coordinates;
        }

        await shelfRef.update(updateData);

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error updating shelf:', error);
        return NextResponse.json({ error: 'Failed to update shelf' }, { status: 500 });
    }
}