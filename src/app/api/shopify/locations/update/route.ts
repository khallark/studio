
import { NextRequest, NextResponse } from 'next/server';
import { db, auth as adminAuth } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { authUserForBusiness } from '@/lib/authoriseUser';

export async function POST(req: NextRequest) {
  try {
    const { businessId, locationId, location } = await req.json();

    if (!businessId) {
      console.error('Not business id provided');
      return NextResponse.json({ error: 'No business id provided.' }, { status: 400 });
    }

    if (!locationId || !location) {
      console.error('locationId, and location data are required', locationId, location);
      return NextResponse.json({ error: 'locationId, and location data are required' }, { status: 400 });
    }

    // ----- Auth -----
    const result = await authUserForBusiness({ businessId, req });

    if (!result.authorised) {
      const { error, status } = result;
      return NextResponse.json({ error }, { status });
    }

    const { name, address, city, postcode, country } = location;
    if (!name || !address || !city || !postcode || !country) {
      console.error('All location fields are required', name, address, city, postcode, country);
      return NextResponse.json({ error: 'All location fields are required' }, { status: 400 });
    }

    const { businessDoc } = result;

    // Get the document reference
    const locationDocRef = businessDoc?.ref.collection('pickupLocations').doc(locationId);

    if (!locationDocRef) {
      return NextResponse.json({ error: 'Invalid business reference' }, { status: 500 });
    }

    // Get the document snapshot
    const docSnap = await locationDocRef.get();

    if (!docSnap.exists) {
      return NextResponse.json({ error: 'Location not found' }, { status: 404 });
    }

    // Update the document
    await locationDocRef.update({
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
