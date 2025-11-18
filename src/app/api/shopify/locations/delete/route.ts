
import { NextRequest, NextResponse } from 'next/server';
import { db, auth as adminAuth } from '@/lib/firebase-admin';
import { authUserForBusiness, authUserForBusinessAndStore } from '@/lib/authoriseUser';

export async function POST(req: NextRequest) {
  try {
    const { businessId, locationId } = await req.json();

    if (!businessId) {
      return NextResponse.json({ error: 'No business id provided.' }, { status: 400 });
    }

    if (!locationId) {
      return NextResponse.json({ error: 'Shop and locationId are required' }, { status: 400 });
    }

    // ----- Auth -----
    const result = await authUserForBusiness({ businessId, req });

    if (!result.authorised) {
      const { error, status } = result;
      return NextResponse.json({ error }, { status });
    }

    const { businessDoc } = result;
    const locationRef = await businessDoc?.ref.collection('pickupLocations').doc(locationId).get();
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

    if(locationRef?.exists)await locationRef?.ref.delete();

    return NextResponse.json({ message: 'Pickup location successfully deleted.' });
  } catch (error) {
    console.error('Error deleting pickup location:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ error: 'Failed to delete location', details: errorMessage }, { status: 500 });
  }
}
