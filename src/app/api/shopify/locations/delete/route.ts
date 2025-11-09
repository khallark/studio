
import { NextRequest, NextResponse } from 'next/server';
import { db, auth as adminAuth } from '@/lib/firebase-admin';
import { authUserForStore } from '@/lib/authoriseUserForStore';

export async function POST(req: NextRequest) {
  try {
    const { shop, locationId } = await req.json();

    if (!shop || !locationId) {
      return NextResponse.json({ error: 'Shop and locationId are required' }, { status: 400 });
    }

    // ----- Auth -----
    const result = await authUserForStore({ shop, req });
        
    if(!result.authorised) {
      const { error, status } = result;
      return NextResponse.json({ error }, { status });
    }

    const { memberDoc } = result;
    const memberData = memberDoc?.data();
    const memberRole = memberData?.role;
    if(!memberRole) {
      return NextResponse.json({error: 'No member role assigned, assign the member a role.'}, { status: 403});
    }

    let locationRef;
    if (memberRole === 'Vendor') {
        locationRef = memberDoc?.ref.collection('pickupLocations').doc(locationId);
    } else if (memberRole === 'SuperAdmin' || memberRole === 'Admin') {
        const accountRef = db.collection('accounts').doc(shop);
        locationRef = accountRef.collection('pickupLocations').doc(locationId);
    } else {
        return NextResponse.json({ error: 'Forbidden: You do not have permission to delete locations.' }, { status: 403 });
    }
    
    await locationRef?.delete();

    return NextResponse.json({ message: 'Pickup location successfully deleted.' });
  } catch (error) {
    console.error('Error deleting pickup location:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ error: 'Failed to delete location', details: errorMessage }, { status: 500 });
  }
}
