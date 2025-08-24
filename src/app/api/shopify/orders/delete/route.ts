
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';

export async function POST(req: NextRequest) {
  try {
    const { shop, orderId } = await req.json();

    if (!shop || !orderId) {
      return NextResponse.json({ error: 'Shop and orderId are required' }, { status: 400 });
    }

    const orderRef = db.collection('accounts').doc(shop).collection('orders').doc(String(orderId));
    
    await orderRef.delete();

    return NextResponse.json({ message: 'Order successfully deleted' });
  } catch (error) {
    console.error('Error deleting order:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ error: 'Failed to delete order', details: errorMessage }, { status: 500 });
  }
}
