
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

    const { businessDoc } = result
    const locationRef = businessDoc?.ref.collection('pickupLocations').doc(locationId);
    // const memberData = memberDoc?.data();
    // const memberRole = memberData?.role;
    // if (!memberRole) {
    //   return NextResponse.json({ error: 'No member role assigned, assign the member a role.' }, { status: 403 });
    // }

    // let locationRef;
    // if (memberRole === 'Vendor') {
    //   locationRef = memberDoc?.ref.collection('pickupLocations').doc(locationId);
    // } else if (memberRole === 'SuperAdmin' || memberRole === 'Admin') {
    //   const accountRef = db.collection('accounts').doc(shop);
    //   locationRef = accountRef.collection('pickupLocations').doc(locationId);
    // } else {
    //   return NextResponse.json({ error: 'Forbidden: You do not have permission to delete locations.' }, { status: 403 });
    // }

    const docSnap = await locationRef?.get();
    if (!docSnap?.exists) {
      return NextResponse.json({ error: 'Location not found' }, { status: 404 });
    }

    await locationRef?.update({
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
