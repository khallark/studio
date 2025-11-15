import { NextRequest, NextResponse } from 'next/server';
import { db, auth as adminAuth } from '@/lib/firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { authBusinessForOrderOfTheExceptionStore, authUserForBusinessAndStore, SHARED_STORE_ID } from '@/lib/authoriseUser';

export async function POST(req: NextRequest) {
  try {
    const { businessId, shop, orderId } = await req.json();

    if (!businessId) {
      return NextResponse.json({ error: 'No business id provided.' }, { status: 400 });
    }

    if (!shop || !orderId) {
      return NextResponse.json({ error: 'Shop and orderId are required' }, { status: 400 });
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

    if (shop === SHARED_STORE_ID) {
      const vendorName = businessData?.vendorName;
      const vendors = orderData?.vendors;
      const canProcess = authBusinessForOrderOfTheExceptionStore({ businessId, vendorName, vendors });
      if (!canProcess.authorised) {
        const { error, status } = canProcess;
        return NextResponse.json({ error }, { status });
      }
    }

    const logEntry = {
      status: 'Confirmed',
      createdAt: Timestamp.now(),
      remarks: 'Order status reverted to Confirmed by user.',
    };

    await orderRef.update({
      customStatus: 'Confirmed',
      awb: FieldValue.delete(),
      courier: FieldValue.delete(),
      lastUpdatedAt: FieldValue.serverTimestamp(),
      lastStatusUpdate: FieldValue.serverTimestamp(),
      customStatusesLogs: FieldValue.arrayUnion(logEntry),
    });

    return NextResponse.json({ message: 'Order status successfully reverted to Confirmed.' });
  } catch (error) {
    console.error('Error reverting order status:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ error: 'Failed to revert order status', details: errorMessage }, { status: 500 });
  }
}
