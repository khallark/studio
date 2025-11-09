
import { NextRequest, NextResponse } from 'next/server';
import { db, auth as adminAuth } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { randomBytes } from 'crypto';
import { authUserForStore } from '@/lib/authoriseUserForStore';

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
        const { shop, role, permissions, vendorName } = await req.json();
        if(!shop) {
            return NextResponse.json({ error: 'shop field is required' }, { status: 404 });
        }

        const shopDoc = await db.collection('accounts').doc(shop).get();
        if(!shopDoc.exists) {
            return NextResponse.json({ error: 'Shop Not Found' }, { status: 401 });
        }

        // ----- Auth -----
        const result = await authUserForStore({ shop, req });
                
        if(!result.authorised) {
            const { error, status } = result;
            return NextResponse.json({ error }, { status });
        }

        // 2. Validate input
        const validRoles = ['Admin', 'Staff', 'Vendor'];
        if (!role || !validRoles.includes(role)) {
            return NextResponse.json({ error: 'Invalid role specified' }, { status: 400 });
        }
        if (role === 'Vendor' && (!vendorName || typeof vendorName !== 'string' || vendorName.trim().length === 0)) {
            return NextResponse.json({ error: 'Vendor name is required for the Vendor role' }, { status: 400 });
        }
        if (!permissions || typeof permissions !== 'object') {
             return NextResponse.json({ error: 'Invalid permissions object' }, { status: 400 });
        }

        // 3. Create session document
        const sessionId = randomBytes(20).toString('hex');
        const sessionRef = db.collection('join-a-shop').doc(sessionId);

        const oneHourFromNow = new Date();
        oneHourFromNow.setHours(oneHourFromNow.getHours() + 1);

        const sessionData: any = {
            shopId: shop,
            shopName: shopDoc.data()?.shopName || shop,
            role: role,
            permissions: permissions,
            createdAt: FieldValue.serverTimestamp(),
            expiresAt: oneHourFromNow,
            createdBy: result.userId,
            used: false,
        };
        
        if (role === 'Vendor') {
            sessionData.vendorName = vendorName.trim();
        }

        await sessionRef.set(sessionData);

        return NextResponse.json({ success: true, sessionId: sessionId });

    } catch (error) {
        console.error('Error creating invite link:', error);
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
        return NextResponse.json({ error: 'Failed to create invite link', details: errorMessage }, { status: 500 });
    }
}
