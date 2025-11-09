import { NextRequest, NextResponse } from 'next/server';
import { db, auth as adminAuth } from '@/lib/firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { authUserForStore } from '@/lib/authoriseUserForStore';

export async function POST(req: NextRequest) {
  try {
    const { shop, orderId } = await req.json();

    if (!shop || !orderId) {
      return NextResponse.json({ error: 'Shop and orderId are required' }, { status: 400 });
    }

    // ----- Auth -----
    const result = await authUserForStore({ shop, req });
        
    if(!result.authorised) {
      const { error, status } = result;
      return NextResponse.json({ error }, { status });
    }

    const orderRef = db.collection('accounts').doc(shop).collection('orders').doc(String(orderId));

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
