

import { NextRequest, NextResponse } from 'next/server';
import { db, auth as adminAuth } from '@/lib/firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

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
    const { shop, orderIds, status } = await req.json();

    if (!shop || !Array.isArray(orderIds) || orderIds.length === 0 || !status) {
      return NextResponse.json({ error: 'Shop, a non-empty array of orderIds, and status are required' }, { status: 400 });
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
    
    const isAuthorized = !member.exists || member.data()?.status !== 'active';
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

    const accountRef = db.collection('accounts').doc(shop);
    const ordersColRef = accountRef.collection('orders');

    await db.runTransaction(async (transaction) => {
        // We don't fetch the old status for bulk updates to keep it simple and performant.
        // A more advanced implementation could fetch all docs first if old status is crucial for logging.
        // For now, we'll log it as "N/A" for individual order logs.

        orderIds.forEach(orderId => {
            const orderRef = ordersColRef.doc(String(orderId));
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
            transaction.update(orderRef, {
                customStatus: status,
                lastUpdatedAt: FieldValue.serverTimestamp(), // This is fine, not in an array
                lastStatusUpdate: FieldValue.serverTimestamp(),
                lastUpdatedBy: userRefData,
                customStatusesLogs: FieldValue.arrayUnion(log), // Append to order's log array
            });
        });
    });

    return NextResponse.json({ message: `${orderIds.length} order(s) successfully updated to ${status}` });
  } catch (error) {
    console.error('Error during bulk order status update:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ error: 'Failed to bulk update order status', details: errorMessage }, { status: 500 });
  }
}
