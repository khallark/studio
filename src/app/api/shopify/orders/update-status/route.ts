

import { NextRequest, NextResponse } from 'next/server';
import { db, auth as adminAuth } from '@/lib/firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
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

    // ----- Auth -----
    const shopDoc = await db.collection('accounts').doc(shop).get();
    if(!shopDoc.exists) {
        return NextResponse.json({ error: 'Shop Not Found' }, { status: 401 });
    }
    const userId = await getUserIdFromToken(req);
    if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const member = await db.collection('accounts').doc(shop).collection('members').doc(userId).get();
    const isAuthorized = member.exists && member.data()?.status === 'active';
    if (!isAuthorized) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    
    const validStatuses = [
        'Confirmed',
        'Closed',
        'RTO Closed',
    ];
    if (!validStatuses.includes(status)) {
        return NextResponse.json({ error: 'Invalid status provided' }, { status: 400 });
    }

    const userRecord = await adminAuth.getUser(userId);
    const userRefData = {
        uid: userId,
        email: userRecord.email || 'N/A',
        displayName: userRecord.displayName || 'N/A'
    };

    const orderRef = db.collection('accounts').doc(shop).collection('orders').doc(String(orderId));
    
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) {
        return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
    }

    const log = {
        status: status,
        createdAt: Timestamp.now(),
        remarks: (() => {
            let remarks = "";
            switch (status) {
            case "Confirmed":
                remarks = "This order was confirmed by the user";
                break;
            case "Closed":
                remarks = "This order was received by the customer and manually closed";
                break;
            case "RTO Closed":
                remarks = "This order was returned and received by the owner and manually closed";
                break;
            }
            return remarks; 
        })()
    }
    await db.runTransaction(async (transaction) => {
        // Update the order document
        transaction.update(orderRef, {
            customStatus: status,
            lastUpdatedAt: FieldValue.serverTimestamp(),
            lastStatusUpdate: FieldValue.serverTimestamp(),
            lastUpdatedBy: userRefData,
            customStatusesLogs: FieldValue.arrayUnion(log), // Append log to order's log array
        });
    });

    return NextResponse.json({ message: 'Order status successfully updated' });
  } catch (error) {
    console.error('Error updating order status:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ error: 'Failed to update order status', details: errorMessage }, { status: 500 });
  }
}
