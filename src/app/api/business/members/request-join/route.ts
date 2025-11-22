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

        // 3. Check if vendorName already exists (case-insensitive)
        const existingVendorQuery = await db.collection('users')
            .doc(SHARED_STORE_ID)
            .collection('members')
            .get();

        const vendorNameLower = vendorName.trim().toLowerCase();
        const vendorNameExists = existingVendorQuery.docs.some(doc => {
            const data = doc.data();
            const existingVendorName = data.vendorName;
            return existingVendorName && existingVendorName.toLowerCase() === vendorNameLower;
        });

        if (vendorNameExists) {
            return NextResponse.json({
                error: 'This vendor name is already taken. Please choose a different name.'
            }, { status: 400 });
        }

        // 4. Check if there's already a pending request with same vendorName
        const existingPendingRequests = await db.collection('users')
            .doc(SUPER_ADMIN_ID)
            .collection('join-requests')
            .where('status', '==', 'pending')
            .get();

        const vendorNameInPendingRequests = existingPendingRequests.docs.some(doc => {
            const data = doc.data();
            const requestedVendorName = data.requestedVendorName;
            return requestedVendorName && requestedVendorName.toLowerCase() === vendorNameLower;
        });

        if (vendorNameInPendingRequests) {
            return NextResponse.json({
                error: 'A request with this vendor name is already pending. Please choose a different name or wait for that request to be processed.'
            }, { status: 400 });
        }

        // 5. Check if there's already a pending request from this user
        const userPendingRequest = existingPendingRequests.docs.find(doc =>
            doc.data().userId === userId
        );

        if (userPendingRequest) {
            return NextResponse.json({
                error: 'You already have a pending request to become a vendor at MAJIME.'
            }, { status: 400 });
        }

        // 6. Get user profile
        const userProfile = await adminAuth.getUser(userId);

        // 7. Create join request
        const requestRef = db.collection('users').doc(SUPER_ADMIN_ID).collection('join-requests').doc();

        await requestRef.set({
            userId: userId,
            email: userProfile.email,
            requestedVendorName: vendorName.trim(),
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