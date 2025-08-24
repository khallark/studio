
import { NextRequest, NextResponse } from 'next/server';
import { db, auth as adminAuth } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

async function getUserIdFromToken(req: NextRequest): Promise<string | null> {
    const authHeader = req.headers.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
        const idToken = authHeader.split('Bearer ')[1];
        try {
            const decodedToken = await adminAuth.verifyIdToken(idToken);
            return decodedToken.uid;
        } catch (error) {
            console.error('Error verifying auth token:', error);
            return null;
        }
    }
    return null;
}

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

    const userId = await getUserIdFromToken(req);
     if (!userId) {
      return NextResponse.json({ error: 'Unauthorized: Could not identify user.' }, { status: 401 });
    }
    const userRecord = await adminAuth.getUser(userId);

    const orderRef = db.collection('accounts').doc(shop).collection('orders').doc(String(orderId));
    
    // Log the action
    const logRef = db.collection('accounts').doc(shop).collection('logs');
    const orderSnap = await orderRef.get();
    const oldStatus = orderSnap.data()?.customStatus || 'N/A';

    await db.runTransaction(async (transaction) => {
        transaction.update(orderRef, {
            customStatus: status,
            updatedAt: FieldValue.serverTimestamp(),
        });
        
        const logEntry = {
            type: 'USER_ACTION',
            action: 'UPDATE_ORDER_STATUS',
            timestamp: FieldValue.serverTimestamp(),
            details: {
                orderId: orderId,
                newStatus: status,
                oldStatus: oldStatus,
            },
            user: {
                uid: userId,
                email: userRecord.email || 'N/A',
                displayName: userRecord.displayName || 'N/A'
            },
        };
        transaction.set(logRef.doc(), logEntry);
    });

    return NextResponse.json({ message: 'Order status successfully updated' });
  } catch (error) {
    console.error('Error updating order status:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ error: 'Failed to update order status', details: errorMessage }, { status: 500 });
  }
}
