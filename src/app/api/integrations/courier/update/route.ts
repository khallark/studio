
import { NextRequest, NextResponse } from 'next/server';
import { db, auth as adminAuth } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { authUserForBusinessAndStore } from '@/lib/authoriseUser';

export async function POST(req: NextRequest) {
  try {
    const { businessId, shop, courierName, apiKey } = await req.json();

    if (!businessId) {
      return NextResponse.json({ error: 'No business id provided.' }, { status: 400 });
    }

    if (!shop) {
      return NextResponse.json({ error: 'No active shop provided.' }, { status: 400 });
    }

    // ----- Auth -----
    const result = await authUserForBusinessAndStore({ businessId, shop, req });

    if (!result.authorised) {
      const { error, status } = result;
      return NextResponse.json({ error }, { status });
    }

    if (!courierName || !apiKey) {
      return NextResponse.json({ error: 'courierName, and apiKey are required' }, { status: 400 });
    }

    const { memberDoc } = result;
    const memberRole = memberDoc?.data()?.role;
    if (!memberRole) {
      return NextResponse.json({ error: 'No member role assigned, assign the member a role.' }, { status: 403 });
    }

    let targetRef;
    if (memberRole === 'Vendor') {
      targetRef = memberDoc?.ref;
    } else {
      targetRef = db.collection('accounts').doc(shop);
    }

    await targetRef.set({
      integrations: {
        couriers: {
          [courierName]: {
            apiKey: apiKey
          }
        }
      },
      lastUpdatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    return NextResponse.json({ message: `${courierName} integration successfully updated.` });
  } catch (error) {
    console.error('Error updating courier integration:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ error: 'Failed to update integration', details: errorMessage }, { status: 500 });
  }
}
