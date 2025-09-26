

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

    const validStatuses = [
        'New', 
        'Confirmed', 
        'Ready To Dispatch', 
        'Dispatched', 
        'In Transit',
        'Out For Delivery',
        'Delivered',
        'RTO In Transit',
        'RTO Delivered',
        'DTO Booked',
        'DTO In Transit',
        'DTO Delivered',
        'Lost',
        'Closed',
        'RTO Closed',
        'Cancelled'
    ];
    if (!validStatuses.includes(status)) {
        return NextResponse.json({ error: 'Invalid status provided' }, { status: 400 });
    }

    const userId = await getUserIdFromToken(req);
     if (!userId) {
      return NextResponse.json({ error: 'Unauthorized: Could not identify user.' }, { status: 401 });
    }
    const userRecord = await adminAuth.getUser(userId);
    const userRefData = {
        uid: userId,
        email: userRecord.email || 'N/A',
        displayName: userRecord.displayName || 'N/A'
    };


    const orderRef = db.collection('accounts').doc(shop).collection('orders').doc(String(orderId));
    const logsColRef = db.collection('accounts').doc(shop).collection('logs');
    const now = new Date(); // Use a standard JS Date for arrayUnion
    
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) {
        return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
    }
    const orderData = orderSnap.data();
    const oldStatus = orderData?.customStatus || 'N/A';
    const orderName = orderData?.name || orderId; // Fallback to ID if name is not there

    const logEntry = {
        type: 'USER_ACTION',
        action: 'UPDATE_ORDER_STATUS',
        timestamp: now, // Use JS Date object here
        details: {
            orderId: orderId,
            orderName: orderName,
            newStatus: status,
            oldStatus: oldStatus,
        },
        user: userRefData,
    };
    
    // Create a separate log entry for the central collection that CAN use serverTimestamp
    const centralLogEntry = {
        ...logEntry,
        timestamp: FieldValue.serverTimestamp(), // This is fine, not in an array
    };

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
                remarks = "This order was received by the customer";
                break;
            case "RTO Closed":
                remarks = "This order was returned and received by the owner";
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
            lastUpdatedBy: userRefData,
            customStatusesLogs: FieldValue.arrayUnion(log), // Append log to order's log array
        });
        
        // Create a log in the central logs collection
        transaction.set(logsColRef.doc(), centralLogEntry);
    });

    return NextResponse.json({ message: 'Order status successfully updated' });
  } catch (error) {
    console.error('Error updating order status:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ error: 'Failed to update order status', details: errorMessage }, { status: 500 });
  }
}
