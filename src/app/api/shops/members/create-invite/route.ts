
import { NextRequest, NextResponse } from 'next/server';
import { db, auth as adminAuth } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { randomBytes } from 'crypto';

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

// TODO: In the future, check if the user is a SuperAdmin of the shop
async function verifyUserPermissions(userId: string, shopId: string): Promise<boolean> {
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists || userDoc.data()?.activeAccountId !== shopId) {
        return false;
    }
    // For now, we assume if it's their active account, they are the owner/SuperAdmin.
    // This will need to be replaced with role-based checks.
    return true;
}


export async function POST(req: NextRequest) {
    try {
        const { role, permissions } = await req.json();

        // 1. Authentication & Authorization
        const userId = await getUserIdFromToken(req);
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const userRef = db.collection('users').doc(userId);
        const userDoc = await userRef.get();
        const shopId = userDoc.data()?.activeAccountId;

        if (!shopId) {
            return NextResponse.json({ error: 'User does not have an active shop' }, { status: 400 });
        }
        
        // This is a placeholder for the real permission check
        const isAuthorized = await verifyUserPermissions(userId, shopId);
        if (!isAuthorized) {
             return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const shopDoc = await db.collection('accounts').doc(shopId).get();
        if (!shopDoc.exists) {
            return NextResponse.json({ error: 'Shop not found' }, { status: 404 });
        }

        // 2. Validate input
        const validRoles = ['Admin', 'Staff', 'Vendor'];
        if (!role || !validRoles.includes(role)) {
            return NextResponse.json({ error: 'Invalid role specified' }, { status: 400 });
        }
        if (!permissions || typeof permissions !== 'object') {
             return NextResponse.json({ error: 'Invalid permissions object' }, { status: 400 });
        }

        // 3. Create session document
        const sessionId = randomBytes(20).toString('hex');
        const sessionRef = db.collection('join-a-shop').doc(sessionId);

        const oneHourFromNow = new Date();
        oneHourFromNow.setHours(oneHourFromNow.getHours() + 1);

        const sessionData = {
            shopId: shopId,
            shopName: shopDoc.data()?.shopName || shopId,
            role: role,
            permissions: permissions,
            createdAt: FieldValue.serverTimestamp(),
            expiresAt: oneHourFromNow,
            createdBy: userId,
            used: false,
        };

        await sessionRef.set(sessionData);

        return NextResponse.json({ success: true, sessionId: sessionId });

    } catch (error) {
        console.error('Error creating invite link:', error);
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
        return NextResponse.json({ error: 'Failed to create invite link', details: errorMessage }, { status: 500 });
    }
}
