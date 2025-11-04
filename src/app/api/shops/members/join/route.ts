
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
            return NextResponse.json({ error: 'You must be logged in to join a shop.' }, { status: 401 });
        }

        if (!sessionId) {
            return NextResponse.json({ error: 'Session ID is required.' }, { status: 400 });
        }

        const sessionRef = db.collection('join-a-shop').doc(sessionId);

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

            const { shopId, role, permissions } = sessionData;

            if (!shopId || !role) {
                throw new Error('Invitation is missing required information.');
            }
            
            // Add user to the account's members subcollection
            const memberRef = db.collection('accounts').doc(shopId).collection('members').doc(userId);
            const userProfile = await adminAuth.getUser(userId);

            transaction.set(memberRef, {
                role: role,
                permissions: permissions,
                uid: userId,
                email: userProfile.email,
                displayName: userProfile.displayName || userProfile.email,
                photoURL: userProfile.photoURL || null,
                joinedAt: FieldValue.serverTimestamp(),
                status: 'active', // can be used to suspend members later
            });
            
            // **NEW**: Update the user's document to add the new shop
            const userRef = db.collection('users').doc(userId);
            transaction.update(userRef, {
                accounts: FieldValue.arrayUnion(shopId),
                activeAccountId: shopId,
            });

            // Mark the invitation as used
            transaction.update(sessionRef, { used: true });

            return { success: true, message: `Successfully joined as ${role}.` };
        });

        return NextResponse.json(joinResult);

    } catch (error) {
        console.error('Error joining shop:', error);
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
        return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
}
