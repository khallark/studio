
import { NextRequest, NextResponse } from 'next/server';
import { db, auth as adminAuth } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { authUserForBusiness, authUserForBusinessAndStore } from '@/lib/authoriseUser';

export async function POST(req: NextRequest) {
  try {
    const { businessId, location } = await req.json();

    if (!businessId) {
      return NextResponse.json({ error: 'No business id provided.' }, { status: 400 });
    }

    // ----- Auth -----
    const result = await authUserForBusiness({ businessId, req });

    if (!result.authorised) {
      const { error, status } = result;
      return NextResponse.json({ error }, { status });
    }

    const { name, address, city, postcode, country } = location;
    if (!name || !address || !city || !postcode || !country) {
      return NextResponse.json({ error: 'All location fields are required' }, { status: 400 });
    }

    const { businessDoc } = result;
    const locationsRef = businessDoc?.ref.collection('pickupLocations')
    // const memberData = memberDoc?.data();
    // const memberRole = memberData?.role;
    // if (!memberRole) {
    //   return NextResponse.json({ error: 'No member role assigned, assign the member a role.' }, { status: 403 });
    // }

    // let locationsCollection;
    // if (memberRole === 'Vendor') {
    //   locationsCollection = memberDoc?.ref.collection('pickupLocations');
    // } else if (memberRole === 'SuperAdmin' || memberRole === 'Admin') {
    //   const accountRef = db.collection('accounts').doc(shop);
    //   locationsCollection = accountRef.collection('pickupLocations');
    // } else {
    //   return NextResponse.json({ error: 'Forbidden: You do not have permission to add locations.' }, { status: 403 });
    // }

    await locationsRef?.add({
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
