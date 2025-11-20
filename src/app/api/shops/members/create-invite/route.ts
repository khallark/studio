import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { randomBytes } from 'crypto';
import { authUserForBusiness } from '@/lib/authoriseUser';

export async function POST(req: NextRequest) {
    try {
        const { businessId, role, permissions } = await req.json();

        if (!businessId) {
            return NextResponse.json({ error: 'No business id provided.' }, { status: 400 });
        }

        // Check if business exists
        const businessDoc = await db.collection('users').doc(businessId).get();
        if (!businessDoc.exists) {
            return NextResponse.json({ error: 'Business Not Found' }, { status: 404 });
        }

        // ----- Auth -----
        const result = await authUserForBusiness({ businessId, req });

        if (!result.authorised) {
            const { error, status } = result;
            return NextResponse.json({ error }, { status });
        }

        // Validate input
        const validRoles = ['Admin', 'Member'];
        if (!role || !validRoles.includes(role)) {
            return NextResponse.json({ error: 'Invalid role specified' }, { status: 400 });
        }

        if (!permissions || typeof permissions !== 'object') {
            return NextResponse.json({ error: 'Invalid permissions object' }, { status: 400 });
        }

        // Create session document
        const sessionId = randomBytes(20).toString('hex');
        const sessionRef = db.collection('join-a-business').doc(sessionId);

        const oneHourFromNow = new Date();
        oneHourFromNow.setHours(oneHourFromNow.getHours() + 1);

        const businessData = businessDoc.data();
        const sessionData = {
            businessId: businessId,
            businessName: businessData?.primaryContact?.name || businessData?.profile?.displayName || 'Unnamed Business',
            role: role,
            permissions: permissions,
            createdAt: FieldValue.serverTimestamp(),
            expiresAt: oneHourFromNow,
            createdBy: result.userId,
            used: false,
        };

        await sessionRef.set(sessionData);

        return NextResponse.json({ success: true, sessionId: sessionId });

    } catch (error) {
        console.error('Error creating invite link:', error);
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
        return NextResponse.json({ 
            error: 'Failed to create invite link', 
            details: errorMessage 
        }, { status: 500 });
    }
}