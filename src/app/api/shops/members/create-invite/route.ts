
import { NextRequest, NextResponse } from 'next/server';
import { db, auth as adminAuth } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { randomBytes } from 'crypto';
import { authUserForBusinessAndStore } from '@/lib/authoriseUser';

export async function POST(req: NextRequest) {
    try {
        const { businessId, shop, role, permissions, vendorName } = await req.json();

        if (!businessId) {
            return NextResponse.json({ error: 'No business id provided.' }, { status: 400 });
        }

        if (!shop) {
            return NextResponse.json({ error: 'shop field is required' }, { status: 404 });
        }

        const shopDoc = await db.collection('accounts').doc(shop).get();
        if (!shopDoc.exists) {
            return NextResponse.json({ error: 'Shop Not Found' }, { status: 401 });
        }

        // ----- Auth -----
        const result = await authUserForBusinessAndStore({ businessId, shop, req });

        if (!result.authorised) {
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
