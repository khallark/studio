
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
