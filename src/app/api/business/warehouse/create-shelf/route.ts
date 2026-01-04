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
            businessId, rackId, rackName, zoneId, zoneName, warehouseId, warehouseName,
            name, code, position, capacity, coordinates
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

        const shelfRef = db.collection(`users/${businessId}/shelves`).doc();
        const now = Timestamp.now();

        // Path will be computed by cloud function, but we can set initial value
        const path = `${zoneName || ''} > ${rackName || ''} > ${name.trim()}`;

        const shelfData: Shelf = {
            id: shelfRef.id,
            name: name.trim(),
            code: code?.trim() || '',
            position: position || 0,
            capacity: capacity || null,
            rackId,
            rackName: rackName || '',
            zoneId,
            zoneName: zoneName || '',
            warehouseId,
            warehouseName: warehouseName || '',
            path,
            coordinates: coordinates || null,
            isDeleted: false,
            createdBy: userId,
            createdAt: now,
            updatedAt: now,
            updatedBy: userId,
            stats: {
                totalProducts: 0,
                currentOccupancy: 0,
            },
        };

        await shelfRef.set(shelfData);

        return NextResponse.json({ success: true, shelf: { id: shelfRef.id, name: name.trim() } });
    } catch (error) {
        console.error('Error creating shelf:', error);
        return NextResponse.json({ error: 'Failed to create shelf' }, { status: 500 });
    }
}