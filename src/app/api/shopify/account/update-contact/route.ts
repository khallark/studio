
import { NextRequest, NextResponse } from 'next/server';
import { db, auth as adminAuth } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { authUserForBusiness, authUserForBusinessAndStore } from '@/lib/authoriseUser';

export async function POST(req: NextRequest) {
  try {
    const { businessId, contact } = await req.json();

    if (!businessId) {
      return NextResponse.json({ error: 'No business id provided.' }, { status: 400 });
    }

    // ----- Auth -----
    const result = await authUserForBusiness({ businessId, req });

    if (!result.authorised) {
      const { error, status } = result;
      return NextResponse.json({ error }, { status });
    }

    if (!contact) {
      return NextResponse.json({ error: 'Contact data is required' }, { status: 400 });
    }

    const { businessDoc } = result;
    // const memberData = memberDoc?.data();
    // const memberRole = memberData?.role;
    // if (!memberRole) {
    //   return NextResponse.json({ error: 'No member role assigned, assign the member a role.' }, { status: 403 });
    // }

    // // Vendors have their own isolated settings
    // if (memberRole === 'Vendor') {
    //   await memberDoc?.ref.update({
    //     primaryContact: contact,
    //     lastUpdatedAt: FieldValue.serverTimestamp(),
    //   });
    // } else if (memberRole === 'SuperAdmin' || memberRole === 'Admin') {
    //   // SuperAdmins and Admins edit the main account document
    //   const accountRef = db.collection('accounts').doc(shop);
    //   await accountRef.update({
    //     primaryContact: contact,
    //     lastUpdatedAt: FieldValue.serverTimestamp(),
    //   });
    // } else {
    //   // Staff members are read-only
    //   return NextResponse.json({ error: 'Forbidden: You do not have permission to edit settings.' }, { status: 403 });
    // }
    await businessDoc?.ref.update({
      primaryContact: contact,
      lastUpdatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ message: 'Primary contact successfully updated.' });
  } catch (error) {
    console.error('Error updating primary contact:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ error: 'Failed to update contact', details: errorMessage }, { status: 500 });
  }
}
