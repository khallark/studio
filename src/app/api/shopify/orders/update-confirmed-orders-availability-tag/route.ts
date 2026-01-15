
import { NextRequest, NextResponse } from 'next/server';
import { db, auth as adminAuth } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { authBusinessForOrderOfTheExceptionStore, authUserForBusinessAndStore } from '@/lib/authoriseUser';
import { SHARED_STORE_IDS } from '@/lib/shared-constants';

export async function POST(req: NextRequest) {
  try {
    const { businessId, shop, orderId, tag } = await req.json();

    if (!businessId) {
      console.log('No business id provided.');
      return NextResponse.json({ error: 'No business id provided.' }, { status: 400 });
    }

    if (!shop || !orderId || !tag) {
      console.log('Shop, orderId, tag, and action are required');
      return NextResponse.json({ error: 'Shop, orderId, tag, and action are required' }, { status: 400 });
    }

    // ----- Auth -----
    const result = await authUserForBusinessAndStore({ businessId, shop, req });

    const businessData = result.businessDoc?.data();

    if (!result.authorised) {
      const { error, status } = result;
      return NextResponse.json({ error }, { status });
    }


    const orderRef = db.collection('accounts').doc(shop).collection('orders').doc(String(orderId));

    const orderData = (await orderRef.get()).data();

    if (SHARED_STORE_IDS.includes(shop)) {
      const vendorName = businessData?.vendorName;
      const vendors = orderData?.vendors;
      const canProcess = authBusinessForOrderOfTheExceptionStore({ businessId, vendorName, vendors });
      if (!canProcess.authorised) {
        const { error, status } = canProcess;
        return NextResponse.json({ error }, { status });
      }
    }

    await db.runTransaction(async (transaction) => {
      const orderDoc = await transaction.get(orderRef);
      const tags_confirmed = orderDoc.data()?.tags_confirmed;
      const arr = tags_confirmed && Array.isArray(tags_confirmed) ? tags_confirmed.slice(1) : [];

      transaction.update(orderRef, {
        tags_confirmed: [tag, ...arr],
        lastUpdatedAt: FieldValue.serverTimestamp(),
      });
    });

    return NextResponse.json({ message: `Tag '${tag}' successfully added to order.` });
  } catch (error) {
    console.error('Error updating order tags:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ error: 'Failed to update order tags', details: errorMessage }, { status: 500 });
  }
}
