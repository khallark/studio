
import { NextRequest, NextResponse } from 'next/server';
import { db, auth as adminAuth } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { authUserForBusinessAndStore } from '@/lib/authoriseUser';

export async function POST(req: NextRequest) {
  try {
    const { businessId, shop, address } = await req.json();

    if (!businessId) {
      return NextResponse.json({ error: 'No business id provided.' }, { status: 400 });
    }

    if (!shop) {
      return NextResponse.json({ error: 'No active shop selected.' }, { status: 400 });
    }

    // ----- Auth -----
    const result = await authUserForBusinessAndStore({ businessId, shop, req });

    if (!result.authorised) {
      const { error, status } = result;
      return NextResponse.json({ error }, { status });
    }

    if (!address) {
      return NextResponse.json({ error: 'Address data is required' }, { status: 400 });
    }

    const { memberDoc } = result;
    const memberData = memberDoc?.data();
    const memberRole = memberData?.role;
    if (!memberRole) {
      return NextResponse.json({ error: 'No member role assigned, assign the member a role.' }, { status: 403 });
    }

    // Vendors have their own isolated settings
    if (memberRole === 'Vendor') {
      await memberDoc?.ref.update({
        companyAddress: address,
        lastUpdatedAt: FieldValue.serverTimestamp(),
      });
    } else if (memberRole === 'SuperAdmin' || memberRole === 'Admin') {
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
