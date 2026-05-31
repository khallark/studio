import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { authUserForBusinessAndStore } from '@/lib/authoriseUser';

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

    const rawLogs: any[] = orderData?.customStatusesLogs ?? [];

    // Sort ascending by createdAt
    const sortedLogs = [...rawLogs].sort(
      (a, b) => (a.createdAt?.toMillis?.() ?? 0) - (b.createdAt?.toMillis?.() ?? 0)
    );

    const deliveredIndex = sortedLogs.findIndex((log) => log.status === 'Delivered');

    if (deliveredIndex === -1) {
      return NextResponse.json(
        { error: 'No "Delivered" log entry found for this order. Cannot revert status.' },
        { status: 422 }
      );
    }

    // Keep only logs up to and including the first Delivered entry
    const trimmedLogs = sortedLogs.slice(0, deliveredIndex + 1);

    await orderRef.update({
      customStatus: 'Delivered',
      awb_reverse: FieldValue.delete(),
      courier_reverse: FieldValue.delete(),
      courierReverseProvider: FieldValue.delete(),
      customStatusesLogs: trimmedLogs,
    });

    return NextResponse.json({ message: 'Order status successfully reverted to Delivered.' });
  } catch (error) {
    console.error('Error reverting order status:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ error: 'Failed to revert order status', details: errorMessage }, { status: 500 });
  }
}