

import { NextRequest, NextResponse } from 'next/server';
import { db, auth as adminAuth } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

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

    const validStatuses = [
        'New', 
        'Confirmed', 
        'Ready To Dispatch', 
        'Dispatched', 
        'In Transit',
        'Out For Delivery',
        'Delivered',
        'RTO Intransit',
        'RTO Delivered',
        'DTO Booked',
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

    const accountRef = db.collection('accounts').doc(shop);
    const ordersColRef = accountRef.collection('orders');
    const logsColRef = accountRef.collection('logs');
    
    // Use a server-generated JS Date for array unions
    const now = new Date();

    await db.runTransaction(async (transaction) => {
        // We don't fetch the old status for bulk updates to keep it simple and performant.
        // A more advanced implementation could fetch all docs first if old status is crucial for logging.
        // For now, we'll log it as "N/A" for individual order logs.
        
        // Log entry for individual orders, using a standard Date object
        const individualLogEntry = {
            type: 'USER_ACTION',
            action: 'UPDATE_ORDER_STATUS',
            timestamp: now, // Use JS Date object here
            details: {
                newStatus: status,
                oldStatus: 'N/A (Bulk Action)', // Old status is not fetched in bulk updates
            },
            user: userRefData,
        };

        orderIds.forEach(orderId => {
            const orderRef = ordersColRef.doc(String(orderId));
            transaction.update(orderRef, {
                customStatus: status,
                lastUpdatedAt: FieldValue.serverTimestamp(), // This is fine, not in an array
                lastUpdatedBy: userRefData,
                logs: FieldValue.arrayUnion(individualLogEntry), // Append to order's log array
            });
        });

        // Add a single log entry for the bulk action to the main log collection
        const bulkLogEntry = {
            type: 'USER_ACTION',
            action: 'BULK_UPDATE_ORDER_STATUS',
            timestamp: FieldValue.serverTimestamp(), // This is fine, not in an array
            details: {
                orderIds: orderIds,
                count: orderIds.length,
                newStatus: status,
            },
            user: userRefData,
        };
        transaction.set(logsColRef.doc(), bulkLogEntry);
    });

    return NextResponse.json({ message: `${orderIds.length} order(s) successfully updated to ${status}` });
  } catch (error) {
    console.error('Error during bulk order status update:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ error: 'Failed to bulk update order status', details: errorMessage }, { status: 500 });
  }
}
