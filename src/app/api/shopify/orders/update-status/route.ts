

import { NextRequest, NextResponse } from 'next/server';
import { db, auth as adminAuth } from '@/lib/firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { authBusinessForOrderOfTheExceptionStore, authUserForBusinessAndStore, SHARED_STORE_ID } from '@/lib/authoriseUser';

export async function POST(req: NextRequest) {
    try {
        const { businessId, shop, orderId, status } = await req.json();

        if (!businessId) {
            return NextResponse.json({ error: 'No business id provided.' }, { status: 400 });
        }

        if (!shop || !orderId || !status) {
            return NextResponse.json({ error: 'Shop, orderId, and status are required' }, { status: 400 });
        }

        // ----- Auth -----
        const result = await authUserForBusinessAndStore({ businessId, shop, req });

        const businessData = result.businessDoc?.data();

        if (!result.authorised) {
            const { error, status } = result;
            return NextResponse.json({ error }, { status });
        }

        const validStatuses = [
            'Confirmed',
            'Closed',
            'RTO Closed',
        ];
        if (!validStatuses.includes(status)) {
            return NextResponse.json({ error: 'Invalid status provided' }, { status: 400 });
        }

        const userRecord = await adminAuth.getUser(result.userId!);
        const userRefData = {
            uid: result.userId,
            email: userRecord.email || 'N/A',
            displayName: userRecord.displayName || 'N/A'
        };

        const orderRef = db.collection('accounts').doc(shop).collection('orders').doc(String(orderId));

        const orderData = (await orderRef.get()).data();

        if (shop === SHARED_STORE_ID) {
            const vendorName = businessData?.vendorName;
            const vendors = orderData?.vendors;
            const canProcess = authBusinessForOrderOfTheExceptionStore({ businessId, vendorName, vendors });
            if (!canProcess.authorised) {
                const { error, status } = canProcess;
                return NextResponse.json({ error }, { status });
            }
        }

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
