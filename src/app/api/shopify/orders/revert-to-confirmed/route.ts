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
    const currentStatus = orderData?.customStatus ?? '';

    // Sort ascending by createdAt
    const sortedLogs = [...rawLogs].sort(
      (a, b) => (a.createdAt?.toMillis?.() ?? 0) - (b.createdAt?.toMillis?.() ?? 0)
    );

    let confirmedIndex = sortedLogs.findIndex((log) => log.status === 'Confirmed');

    // // If cancellation was requested from "New" status, there's no Confirmed log yet.
    // // Synthesize one after the "New" log so the revert lands on "Confirmed".
    // if (confirmedIndex === -1 && currentStatus === 'Cancellation Requested') {
    //   const newLogIndex = sortedLogs.findIndex((log) => log.status === 'New');
    //   const confirmedLog = {
    //     status: 'Confirmed',
    //     remarks: 'Auto-confirmed during "Cancellation Requested" revert',
    //     createdAt: Timestamp.now(),
    //   };

    //   // Insert right after the "New" log (or at the end if no "New" log found)
    //   const insertAt = newLogIndex !== -1 ? newLogIndex + 1 : sortedLogs.length;
    //   sortedLogs.splice(insertAt, 0, confirmedLog);

    //   // Re-find since we just inserted it
    //   confirmedIndex = sortedLogs.findIndex((log) => log.status === 'Confirmed');
    // }

    if (confirmedIndex === -1) {
      return NextResponse.json(
        { error: 'No "Confirmed" log entry found for this order. Cannot revert status.' },
        { status: 422 }
      );
    }

    // Keep only logs up to and including the first Confirmed entry
    const trimmedLogs = sortedLogs.slice(0, confirmedIndex + 1);

    await orderRef.update({
      customStatus: 'Confirmed',
      awb: FieldValue.delete(),
      courier: FieldValue.delete(),
      courierProvider: FieldValue.delete(),
      customStatusesLogs: trimmedLogs,
    });

    return NextResponse.json({ message: 'Order status successfully reverted to Confirmed.' });
  } catch (error) {
    console.error('Error reverting order status:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ error: 'Failed to revert order status', details: errorMessage }, { status: 500 });
  }
}