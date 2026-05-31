
import { NextRequest, NextResponse } from 'next/server';
import { db, auth as adminAuth } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { authUserForBusiness, authUserForBusinessAndStore } from '@/lib/authoriseUser';

export async function POST(req: NextRequest) {
  try {
    const { businessId, address } = await req.json();

    if (!businessId) {
      return NextResponse.json({ error: 'No business id provided.' }, { status: 400 });
    }

    // ----- Auth -----
    const result = await authUserForBusiness({ businessId, req });

    if (!result.authorised) {
      const { error, status } = result;
      return NextResponse.json({ error }, { status });
    }

    if (!address) {
      return NextResponse.json({ error: 'Address data is required' }, { status: 400 });
    }

    const { businessDoc } = result;
    
    await businessDoc?.ref.update({
      companyAddress: address,
      lastUpdatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ message: 'Company address successfully updated.' });
  } catch (error) {
    console.error('Error updating company address:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ error: 'Failed to update address', details: errorMessage }, { status: 500 });
  }
}
