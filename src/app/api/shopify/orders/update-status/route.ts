
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

export async function POST(req: NextRequest) {
  try {
    const { shop, orderId, status } = await req.json();

    if (!shop || !orderId || !status) {
      return NextResponse.json({ error: 'Shop, orderId, and status are required' }, { status: 400 });
    }

    const validStatuses = ['New', 'Confirmed', 'Ready To Dispatch', 'Cancelled'];
    if (!validStatuses.includes(status)) {
        return NextResponse.json({ error: 'Invalid status provided' }, { status: 400 });
    }

    const orderRef = db.collection('accounts').doc(shop).collection('orders').doc(String(orderId));
    
    await orderRef.update({
      customStatus: status,
      updatedAt: FieldValue.serverTimestamp(), // Also update the updatedAt timestamp
    });

    return NextResponse.json({ message: 'Order status successfully updated' });
  } catch (error) {
    console.error('Error updating order status:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ error: 'Failed to update order status', details: errorMessage }, { status: 500 });
  }
}
