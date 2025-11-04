
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
    const { shop, location } = await req.json();

    if (!shop || !location) {
      return NextResponse.json({ error: 'Shop and location data are required' }, { status: 400 });
    }

    const { name, address, city, postcode, country } = location;
    if (!name || !address || !city || !postcode || !country) {
        return NextResponse.json({ error: 'All location fields are required' }, { status: 400 });
    }

    const userId = await getUserIdFromToken(req);
    if (!userId) {
        return NextResponse.json({ error: 'Unauthorized: Could not identify user.' }, { status: 401 });
    }

    const memberRef = db.collection('accounts').doc(shop).collection('members').doc(userId);
    const memberDoc = await memberRef.get();

    if (!memberDoc.exists) {
        return NextResponse.json({ error: 'Forbidden: You are not a member of this shop.' }, { status: 403 });
    }
    const memberData = memberDoc.data();
    const userRole = memberData?.role;

    let locationsCollection;
    if (userRole === 'Vendor') {
        locationsCollection = memberRef.collection('pickupLocations');
    } else if (userRole === 'SuperAdmin' || userRole === 'Admin') {
        const accountRef = db.collection('accounts').doc(shop);
        locationsCollection = accountRef.collection('pickupLocations');
    } else {
        return NextResponse.json({ error: 'Forbidden: You do not have permission to add locations.' }, { status: 403 });
    }

    await locationsCollection.add({
      ...location,
      createdAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ message: 'Pickup location successfully added.' });
  } catch (error) {
    console.error('Error adding pickup location:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ error: 'Failed to add location', details: errorMessage }, { status: 500 });
  }
}
