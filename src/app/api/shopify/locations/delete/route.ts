
import { NextRequest, NextResponse } from 'next/server';
import { db, auth as adminAuth } from '@/lib/firebase-admin';

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
    const { shop, locationId } = await req.json();

    if (!shop || !locationId) {
      return NextResponse.json({ error: 'Shop and locationId are required' }, { status: 400 });
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
        return NextResponse.json({ error: 'Forbidden: You do not have permission to delete locations.' }, { status: 403 });
    }
    
    await locationRef.delete();

    return NextResponse.json({ message: 'Pickup location successfully deleted.' });
  } catch (error) {
    console.error('Error deleting pickup location:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ error: 'Failed to delete location', details: errorMessage }, { status: 500 });
  }
}
