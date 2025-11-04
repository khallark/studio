
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
    const { shop, locationId, location } = await req.json();

    if (!shop || !locationId || !location) {
      return NextResponse.json({ error: 'Shop, locationId, and location data are required' }, { status: 400 });
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

    let locationRef;
    if (userRole === 'Vendor') {
        locationRef = memberRef.collection('pickupLocations').doc(locationId);
    } else if (userRole === 'SuperAdmin' || userRole === 'Admin') {
        const accountRef = db.collection('accounts').doc(shop);
        locationRef = accountRef.collection('pickupLocations').doc(locationId);
    } else {
        return NextResponse.json({ error: 'Forbidden: You do not have permission to update locations.' }, { status: 403 });
    }
    
    const docSnap = await locationRef.get();
    if (!docSnap.exists) {
        return NextResponse.json({ error: 'Location not found' }, { status: 404 });
    }

    await locationRef.update({
      ...location,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ message: 'Pickup location successfully updated.' });
  } catch (error) {
    console.error('Error updating pickup location:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ error: 'Failed to update location', details: errorMessage }, { status: 500 });
  }
}
