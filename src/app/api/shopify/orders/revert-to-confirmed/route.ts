import { NextRequest, NextResponse } from 'next/server';
import { db, auth as adminAuth } from '@/lib/firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { authBusinessForOrderOfTheExceptionStore, authUserForBusinessAndStore } from '@/lib/authoriseUser';
import { SHARED_STORE_IDS } from '@/lib/shared-constants';

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

    if (SHARED_STORE_IDS.includes(shop)) {
      const vendorName = businessData?.vendorName;
      const vendors = orderData?.vendors;
      const canProcess = authBusinessForOrderOfTheExceptionStore({ businessId, vendorName, vendors });
      if (!canProcess.authorised) {
        const { error, status } = canProcess;
        return NextResponse.json({ error }, { status });
      }
    }

    const rawLogs: any[] = orderData?.customStatusesLogs ?? [];

    // Sort ascending by createdAt
    const sortedLogs = [...rawLogs].sort(
      (a, b) => (a.createdAt?.toMillis?.() ?? 0) - (b.createdAt?.toMillis?.() ?? 0)
    );

    const confirmedIndex = sortedLogs.findIndex((log) => log.status === 'Confirmed');

    if (confirmedIndex === -1) {
      return NextResponse.json(
        { error: 'No "Confirmed" log entry found for this order. Cannot revert status.' },
        { status: 422 }
      );
    }

    const confirmedLog = sortedLogs[confirmedIndex];
    // Keep only logs up to and including the first Confirmed entry
    const trimmedLogs = sortedLogs.slice(0, confirmedIndex + 1);

    await orderRef.update({
      customStatus: 'Confirmed',
      awb: FieldValue.delete(),
      courier: FieldValue.delete(),
      courierProvider: FieldValue.delete(),
      lastUpdatedAt: FieldValue.serverTimestamp(),
      lastStatusUpdate: confirmedLog.createdAt,
      customStatusesLogs: trimmedLogs,
    });

    return NextResponse.json({ message: 'Order status successfully reverted to Confirmed.' });
  } catch (error) {
    console.error('Error reverting order status:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ error: 'Failed to revert order status', details: errorMessage }, { status: 500 });
  }
}