import { NextRequest, NextResponse } from 'next/server';
import { db, auth as adminAuth } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { authUserForBusiness } from '@/lib/authoriseUser';
import { SHARED_STORE_ID, SHARED_STORE_ID_2, SUPER_ADMIN_ID } from '@/lib/shared-constants';

interface JoinRequest {
    id: string;
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
        const { businessId, requestId, requestUserId } = await req.json();

        if (!businessId || !requestId || !requestUserId) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // Check if this is the super admin business
        if (businessId !== SUPER_ADMIN_ID) {
            return NextResponse.json({
                error: 'Only super administrators can accept join requests'
            }, { status: 403 });
        }

        // Authorize the current user
        const result = await authUserForBusiness({ businessId, req });

        if (!result.authorised) {
            return NextResponse.json({ error: result.error }, { status: result.status });
        }

        // Transaction to ensure atomicity
        await db.runTransaction(async (transaction) => {
            const requestRef = db.collection('users').doc(businessId).collection('join-requests').doc(requestId);
            const requestDoc = await transaction.get(requestRef);

            if (!requestDoc.exists) {
                throw new Error('Request not found');
            }

            const requestData = requestDoc.data()! as JoinRequest;

            if (requestData.status !== 'pending') {
                throw new Error('Request has already been processed');
            }

            // Check if user is already a member
            const memberRef1 = db.collection('accounts').doc(SHARED_STORE_ID).collection('members').doc(requestUserId);
            const memberDoc1 = await transaction.get(memberRef1);
            const memberRef2 = db.collection('accounts').doc(SHARED_STORE_ID_2).collection('members').doc(requestUserId);
            const memberDoc2 = await transaction.get(memberRef2);

            if (memberDoc1.exists && memberDoc2.exists) {
                throw new Error('User is already a vendor of MAJIME');
            }

            // Get requested business doc
            const requestedBusinessRef = db.collection('users').doc(requestUserId);
            const requestedBusinessDoc = await transaction.get(requestedBusinessRef);
            const requestedBusinessData = requestedBusinessDoc.data();
            const userProfile = await adminAuth.getUser(requestUserId);

            // Update user's stores array and vendorName
            transaction.update(requestedBusinessRef, {
                stores: FieldValue.arrayUnion(SHARED_STORE_ID, SHARED_STORE_ID_2),
                vendorName: requestData.requestedVendorName,
            });

            // Add user as a member with "Vendor" role
            const memberData = {
                role: 'Vendor',
                vendorName: requestData?.requestedVendorName,
                permissions: {
                    canViewOrders: true,
                    canManageOrders: false
                },
                displayName: requestedBusinessData?.primaryContact?.name || requestedBusinessData?.profile?.name || requestedBusinessDoc.id,
                photoURL: userProfile.photoURL || null,
                joinedAt: FieldValue.serverTimestamp(),
                status: 'active',
            };
            transaction.set(memberRef1, memberData);
            transaction.set(memberRef2, memberData);

            // Mark request as accepted
            transaction.update(requestRef, {
                status: 'accepted',
                processedAt: FieldValue.serverTimestamp(),
                processedBy: result.userId,
            });
        });

        // Update custom claims for the new member
        try {
            const userDoc = await db.collection('users').doc(requestUserId).get();
            const userData = userDoc.data();

            const directStores: string[] = userData?.stores || [];
            const userBusinesses: string[] = userData?.businesses || [];
            const memberStores: string[] = [];

            for (const bizId of userBusinesses) {
                const memberDoc = await db.collection('users').doc(bizId)
                    .collection('members').doc(requestUserId).get();

                if (memberDoc.exists && memberDoc.data()?.status === 'active') {
                    const businessDoc = await db.collection('users').doc(bizId).get();
                    const businessStores = businessDoc.data()?.stores || [];
                    memberStores.push(...businessStores);
                }
            }

            const accessibleStores = [...new Set([...directStores, ...memberStores])];

            await adminAuth.setCustomUserClaims(requestUserId, {
                businessId,
                accessibleStores,
            });

            console.log(`✅ Updated custom claims for user ${requestUserId}`);
        } catch (claimsError) {
            console.error('Failed to update custom claims:', claimsError);
        }

        return NextResponse.json({ success: true });

    } catch (error) {
        console.error('Error accepting request:', error);
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
        return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
}