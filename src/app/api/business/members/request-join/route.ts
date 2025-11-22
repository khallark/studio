import { NextRequest, NextResponse } from 'next/server';
import { db, auth as adminAuth } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { getUserIdFromToken, SHARED_STORE_ID, SUPER_ADMIN_ID } from '@/lib/authoriseUser';

interface JoinRequest {
    userId: string;
    email: string;
    requestedVendorName: string | null;
    displayName: string;
    photoURL: string | null;
    requestedAt: any;
    status: 'pending' | 'accepted' | 'declined';
    message?: string;
}

export async function POST(req: NextRequest) {
    try {
        const { vendorName, message } = await req.json();

        // 1. Authentication
        const userId = await getUserIdFromToken(req);
        if (!userId) {
            return NextResponse.json({ error: 'You must be logged in to request to join Majime.' }, { status: 401 });
        }

        if (!vendorName) {
            return NextResponse.json({ error: 'VendorName is required.' }, { status: 400 });
        }

        // 2. Check if user is already a member
        const memberRef = db.collection('users').doc(SHARED_STORE_ID).collection('members').doc(userId);
        const memberDoc = await memberRef.get();

        if (memberDoc.exists) {
            return NextResponse.json({ error: 'You are already a vendor of Majime.' }, { status: 400 });
        }

        // 5. Check if there's already a pending request
        const existingRequestsQuery = await db.collection('users')
            .doc(SUPER_ADMIN_ID)
            .collection('join-requests')
            .where('userId', '==', userId)
            .where('status', '==', 'pending')
            .get();

        if (!existingRequestsQuery.empty) {
            return NextResponse.json({ error: 'You already have a pending request to become a vendor at MAJIME.' }, { status: 400 });
        }

        // 6. Get user profile
        const userProfile = await adminAuth.getUser(userId);

        // 7. Create join request
        const requestRef = db.collection('users').doc(SUPER_ADMIN_ID).collection('join-requests').doc();

        await requestRef.set({
            userId: userId,
            email: userProfile.email,
            requestedVendorName: vendorName,
            displayName: userProfile.displayName || userProfile.email || 'Unknown User',
            photoURL: userProfile.photoURL || null,
            requestedAt: FieldValue.serverTimestamp(),
            status: 'pending',
            message: message || '',
        } as JoinRequest);

        return NextResponse.json({
            success: true,
            message: 'Join request sent successfully. You will be notified once the business owner reviews your request.'
        });

    } catch (error) {
        console.error('Error creating join request:', error);
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
        return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
}