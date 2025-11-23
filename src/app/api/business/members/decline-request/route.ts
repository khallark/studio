import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { authUserForBusiness, SUPER_ADMIN_ID } from '@/lib/authoriseUser';

export async function POST(req: NextRequest) {
    try {
        const { businessId, requestId } = await req.json();

        if (!businessId || !requestId) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // Check if this is the super admin business
        if (businessId !== SUPER_ADMIN_ID) {
            return NextResponse.json({
                error: 'Only super administrators can decline join requests'
            }, { status: 403 });
        }

        // Authorize the current user
        const result = await authUserForBusiness({ businessId, req });

        if (!result.authorised) {
            return NextResponse.json({ error: result.error }, { status: result.status });
        }

        const requestRef = db.collection('users').doc(businessId).collection('join-requests').doc(requestId);
        const requestDoc = await requestRef.get();

        if (!requestDoc.exists) {
            return NextResponse.json({ error: 'Request not found' }, { status: 404 });
        }

        const requestData = requestDoc.data()!;

        if (requestData.status !== 'pending') {
            return NextResponse.json({ error: 'Request has already been processed' }, { status: 400 });
        }

        // Update request status to declined
        await requestRef.update({
            status: 'declined',
            processedAt: FieldValue.serverTimestamp(),
            processedBy: result.userId,
        });

        return NextResponse.json({ success: true });

    } catch (error) {
        console.error('Error declining request:', error);
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
        return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
}