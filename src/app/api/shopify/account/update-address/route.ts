
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
    const { address } = await req.json();
    
    const userId = await getUserIdFromToken(req);
    if (!userId) {
        return NextResponse.json({ error: 'Unauthorized: Could not identify user.' }, { status: 401 });
    }

    const userDoc = await db.collection('users').doc(userId).get();
    const shop = userDoc.data()?.activeAccountId;

    if (!shop) {
        return NextResponse.json({ error: 'No active shop selected.' }, { status: 400 });
    }
    if (!address) {
      return NextResponse.json({ error: 'Address data is required' }, { status: 400 });
    }

    // Determine user's role for this shop
    const memberRef = db.collection('accounts').doc(shop).collection('members').doc(userId);
    const memberDoc = await memberRef.get();

    if (!memberDoc.exists) {
        return NextResponse.json({ error: 'Forbidden: You are not a member of this shop.' }, { status: 403 });
    }

    const memberData = memberDoc.data();
    const userRole = memberData?.role;
    
    // Vendors have their own isolated settings
    if (userRole === 'Vendor') {
        await memberRef.update({
            companyAddress: address,
            lastUpdatedAt: FieldValue.serverTimestamp(),
        });
    } else if (userRole === 'SuperAdmin' || userRole === 'Admin') {
        // SuperAdmins and Admins edit the main account document
        const accountRef = db.collection('accounts').doc(shop);
        await accountRef.update({
            companyAddress: address,
            lastUpdatedAt: FieldValue.serverTimestamp(),
        });
    } else {
        // Staff members are read-only
        return NextResponse.json({ error: 'Forbidden: You do not have permission to edit settings.' }, { status: 403 });
    }

    return NextResponse.json({ message: 'Company address successfully updated.' });
  } catch (error) {
    console.error('Error updating company address:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ error: 'Failed to update address', details: errorMessage }, { status: 500 });
  }
}
