import { NextRequest, NextResponse } from 'next/server';
import { db, auth as adminAuth } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

async function getUserIdFromToken(req: NextRequest): Promise<string | null> {
    const authHeader = req.headers.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
        const idToken = authHeader.split('Bearer ')[1];
        try {
            const decodedToken = await adminAuth.verifyIdToken(idToken);
            return decodedToken.uid;
        } catch (error) {
            console.error('Error verifying auth token:', error);
            return null;
        }
    }
    return null;
}

export async function POST(req: NextRequest) {
    try {
        const { sessionId } = await req.json();

        // 1. Authentication
        const userId = await getUserIdFromToken(req);
        if (!userId) {
            return NextResponse.json({ error: 'You must be logged in to join a business.' }, { status: 401 });
        }

        if (!sessionId) {
            return NextResponse.json({ error: 'Session ID is required.' }, { status: 400 });
        }

        const sessionRef = db.collection('join-a-business').doc(sessionId);

        // 2. Transaction to ensure atomicity
        const joinResult = await db.runTransaction(async (transaction) => {
            const sessionDoc = await transaction.get(sessionRef);

            if (!sessionDoc.exists) {
                throw new Error('This invitation link is invalid.');
            }

            const sessionData = sessionDoc.data()!;

            if (sessionData.used) {
                throw new Error('This invitation link has already been used.');
            }

            if (sessionData.expiresAt.toDate() < new Date()) {
                throw new Error('This invitation link has expired.');
            }

            const { businessId, role, permissions } = sessionData;

            if (!businessId || !role) {
                throw new Error('Invitation is missing required information.');
            }

            // Check if user is already a member of this business
            const memberRef = db.collection('users').doc(businessId).collection('members').doc(userId);
            const memberDoc = await transaction.get(memberRef);
            if (memberDoc.exists) {
                throw new Error('You are already a member of this business.');
            }

            // Get user profile
            const userProfile = await adminAuth.getUser(userId);

            // Add user to the business's members subcollection
            const memberData = {
                role: role,
                permissions: permissions,
                uid: userId,
                email: userProfile.email,
                displayName: userProfile.displayName || userProfile.email,
                photoURL: userProfile.photoURL || null,
                joinedAt: FieldValue.serverTimestamp(),
                status: 'active',
            };

            transaction.set(memberRef, memberData);

            // Update the user's document to add the new business
            const userRef = db.collection('users').doc(userId);
            transaction.update(userRef, {
                businesses: FieldValue.arrayUnion(businessId),
            });

            // Mark the invitation as used
            transaction.update(sessionRef, { used: true });

            return { success: true, businessId, message: `Successfully joined as ${role}.` };
        });

        // ✅ Update custom claims to include new accessible stores
        try {
            const userDoc = await db.collection('users').doc(userId).get();
            const userData = userDoc.data();

            const directStores: string[] = userData?.stores || [];
            const userBusinesses: string[] = userData?.businesses || [];
            const memberStores: string[] = [];

            for (const businessId of userBusinesses) {
                const memberDoc = await db.collection('users').doc(businessId)
                    .collection('members').doc(userId).get();

                if (memberDoc.exists && memberDoc.data()?.status === 'active') {
                    const businessDoc = await db.collection('users').doc(businessId).get();
                    const businessStores = businessDoc.data()?.stores || [];
                    memberStores.push(...businessStores);
                }
            }

            const accessibleStores = [...new Set([...directStores, ...memberStores])];

            await adminAuth.setCustomUserClaims(userId, {
                businessId: joinResult.businessId,
                accessibleStores,
            });

            console.log(`✅ Updated custom claims for user ${userId}`);
        } catch (claimsError) {
            console.error('Failed to update custom claims:', claimsError);
            // Don't fail the join operation if claims update fails
        }

        return NextResponse.json(joinResult);

    } catch (error) {
        console.error('Error joining business:', error);
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
        return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
}