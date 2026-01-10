// /api/business/warehouse/update-zone/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { authUserForBusiness } from '@/lib/authoriseUser';
import { db } from '@/lib/firebase-admin';
import { Zone } from '@/types/warehouse';

export async function PUT(request: NextRequest) {
    try {
        const body = await request.json();
        const { businessId, zoneId, name, description } = body;

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

        if (!name || !name.trim()) {
            return NextResponse.json({ error: 'Zone name is required' }, { status: 400 });
        }

        const zoneRef = db.doc(`users/${businessId}/zones/${zoneId}`);
        const zoneDoc = await zoneRef.get();

        if (!zoneDoc.exists) {
            return NextResponse.json({ error: 'Zone not found' }, { status: 404 });
        }

        // Note: code is not updated as it serves as the document ID
        const data: Partial<Zone> = {
            name: name.trim(),
            description: description?.trim() || '',
            updatedAt: Timestamp.now(),
            updatedBy: userId,
        };
        await zoneRef.update(data);

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error updating zone:', error);
        return NextResponse.json({ error: 'Failed to update zone' }, { status: 500 });
    }
}