import { NextRequest, NextResponse } from 'next/server';
import { db, auth as adminAuth } from '@/lib/firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { authBusinessForOrderOfTheExceptionStore, authUserForBusinessAndStore } from '@/lib/authoriseUser';
import { SHARED_STORE_IDS } from '@/lib/shared-constants';

export async function POST(req: NextRequest) {
    try {
        const { businessId, shop, orderIds, status } = await req.json();

        if (!businessId || !shop || !Array.isArray(orderIds) || orderIds.length === 0 || !status) {
            return NextResponse.json({ error: 'Business ID, Shop, a non-empty array of orderIds, and status are required' }, { status: 400 });
        }

        // ----- Auth -----
        const result = await authUserForBusinessAndStore({ businessId, shop, req });

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

        const shopRef = db.collection('accounts').doc(shop);
        const ordersColRef = shopRef.collection('orders');

        // ============================================
        // STEP 1: Enqueue order splits BEFORE transaction
        // (Don't block transaction with HTTP calls)
        // ============================================
        const url = process.env.ENQUEUE_ORDER_SPLIT_FUNCTION_URL;
        const secret = process.env.ENQUEUE_FUNCTION_SECRET;
        const orderIdsBeingSplit = new Set<string | number>(); // Track orders being split

        if (SHARED_STORE_IDS.includes(shop) && url && secret) {
            console.log(`Processing ${orderIds.length} orders for splitting...`);

            // Process splits sequentially to avoid overwhelming the system
            for (const orderId of orderIds) {
                try {
                    const orderRef = ordersColRef.doc(String(orderId));
                    const orderDoc = await orderRef.get();

                    if (!orderDoc.exists) {
                        console.warn(`Order ${orderId} not found, skipping split`);
                        continue;
                    }

                    if (orderDoc.data()?.customStatus !== 'New') {
                        console.warn(`Order ${orderId} is not New, only New orders can be split`);
                        continue;
                    }

                    const vendorName = result.businessDoc?.data()?.vendorName ?? "";
                    const vendors = orderDoc.data()?.vendors;

                    const canProcess = authBusinessForOrderOfTheExceptionStore({ businessId, vendorName, vendors });
                    if (!canProcess.authorised) {
                        console.error(`Order ${orderId} not authorized for this business, skipping split`);
                        continue;
                    }

                    // Check if order needs splitting (multiple vendors)
                    if (vendors && vendors.length > 1 && (vendors.includes('ENDORA') || vendors.includes('STYLE 05'))) {
                        console.log(`Enqueueing split for order ${orderId} (${vendors.length} vendors)`);

                        const resp = await fetch(url, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'X-Api-Key': secret,
                            },
                            body: JSON.stringify({
                                shop,
                                orderId,
                                requestedBy: result.userId
                            }),
                        });

                        if (!resp.ok) {
                            const json = await resp.json();
                            console.warn(`Order ${orderId} split enqueue failed: ${json.error}`);
                        } else {
                            console.log(`✓ Order ${orderId} split enqueued`);
                            orderIdsBeingSplit.add(orderId); // Mark as being split
                        }
                    } else {
                        console.warn(`Order ${orderId} not eligible for splitting, skipping split`);
                    }

                } catch (enqueueError) {
                    console.error(`Error enqueueing split for order ${orderId}:`, enqueueError);
                    // Continue with other orders - don't fail the whole batch
                }
            }
        }

        // ============================================
        // STEP 2: Update order statuses in transaction
        // ============================================
        let updatedCount = 0;
        await db.runTransaction(async (transaction) => {
            // Fetch all orders first (transaction requirement)
            const orderRefs = orderIds.map(id => ordersColRef.doc(String(id)));
            const orderDocs = await Promise.all(orderRefs.map(ref => transaction.get(ref)));

            // Apply updates
            for (let i = 0; i < orderRefs.length; i++) {
                const orderRef = orderRefs[i];
                const orderDoc = orderDocs[i];
                const orderId = orderIds[i];

                if (!orderDoc.exists) {
                    console.warn(`Order ${orderId} not found in transaction, skipping`);
                    continue;
                }

                // Skip orders that are being split
                if (orderIdsBeingSplit.has(orderId)) {
                    console.log(`Order ${orderId} is being split, skipping ${status} update`);
                    continue;
                }

                // For SHARED_STORE_ID, check authorization
                if (SHARED_STORE_IDS.includes(shop)) {
                    const vendorName = result.businessDoc?.data()?.vendorName ?? "";
                    const vendors = orderDoc.data()?.vendors;
                    const canProcess = authBusinessForOrderOfTheExceptionStore({ businessId, vendorName, vendors });

                    if (!canProcess.authorised) {
                        console.log(`Order ${orderId} not authorized, skipping update`);
                        continue;
                    }
                }

                const log = {
                    status: status,
                    createdAt: Timestamp.now(),
                    remarks: (() => {
                        switch (status) {
                            case "Confirmed":
                                return "This order was confirmed by the user";
                            case "Closed":
                                return "This order was received by the customer and manually closed";
                            case "RTO Closed":
                                return "This order was returned and received by the owner and manually closed";
                            default:
                                return "";
                        }
                    })()
                };

                transaction.update(orderRef, {
                    customStatus: status,
                    lastUpdatedAt: FieldValue.serverTimestamp(),
                    lastStatusUpdate: FieldValue.serverTimestamp(),
                    lastUpdatedBy: userRefData,
                    customStatusesLogs: FieldValue.arrayUnion(log),
                });

                updatedCount++;
            }
        });

        const splitCount = orderIdsBeingSplit.size;
        const message = splitCount > 0
            ? `${updatedCount} order(s) successfully updated to ${status}. ${splitCount} order(s) queued for splitting (not ${status === 'Confirmed' ? 'confirmed' : 'updated'}).`
            : `${updatedCount} order(s) successfully updated to ${status}`;

        return NextResponse.json({ message });

    } catch (error) {
        console.error('Error during bulk order status update:', error);
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
        return NextResponse.json({
            error: 'Failed to bulk update order status',
            details: errorMessage
        }, { status: 500 });
    }
}