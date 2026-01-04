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
        await rackRef.update({
            name: name.trim(),
            code: code?.trim() || '',
            position: position || 0,
            updatedAt: Timestamp.now(),
            updatedBy: userId,
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error updating rack:', error);
        return NextResponse.json({ error: 'Failed to update rack' }, { status: 500 });
    }
}