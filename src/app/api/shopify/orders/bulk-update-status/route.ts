import { NextRequest, NextResponse } from 'next/server';
import { db, auth as adminAuth } from '@/lib/firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { authBusinessForOrderOfTheExceptionStore, authUserForBusinessAndStore } from '@/lib/authoriseUser';
import { SHARED_STORE_IDS } from '@/lib/shared-constants';
import { UPC } from '@/types/warehouse';

export async function POST(req: NextRequest) {
    try {
        const { businessId, shop, orderIds, status, createUPCsForNonPickupReady } = await req.json();

        if (!businessId || !shop || !Array.isArray(orderIds) || orderIds.length === 0 || !status || typeof createUPCsForNonPickupReady !== 'boolean') {
            return NextResponse.json({ error: 'Business ID, Shop, a non-empty array of orderIds, status and createUPCsForNonPickupReady are required' }, { status: 400 });
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
            'RTO Processed',
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

        // Check if this is an RTO status that needs UPC handling
        const isRTOStatus = status === 'RTO Closed' || status === 'RTO Processed';

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
                        }

                        orderIdsBeingSplit.add(orderId); // Mark as being split
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
        const successfullyUpdatedOrderIds: Array<string | number> = [];

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
                            case "RTO Processed":
                                return "This order was returned and processed by the user, but not yet updated to 'RTO Delivered' by the courier."
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
                successfullyUpdatedOrderIds.push(orderId);
            }
        });

        // ============================================
        // STEP 3: Handle UPCs for RTO orders
        // ============================================
        let upcUpdateCount = 0;
        let upcCreateCount = 0;
        const ordersWithoutUPCs: Array<string | number> = [];

        if (isRTOStatus && successfullyUpdatedOrderIds.length > 0) {
            console.log(`🔄 Processing UPCs for ${successfullyUpdatedOrderIds.length} RTO orders...`);

            for (const orderId of successfullyUpdatedOrderIds) {
                try {
                    // Get order details to find the correct businessId
                    const orderDoc = await ordersColRef.doc(String(orderId)).get();
                    if (!orderDoc.exists) {
                        console.warn(`⚠️ Order ${orderId} not found, skipping UPC processing`);
                        continue;
                    }

                    const orderData = orderDoc.data();
                    const lineItems = orderData?.raw?.line_items || [];

                    if (lineItems.length === 0) {
                        console.warn(`⚠️ Order ${orderId} has no line items, skipping UPC processing`);
                        ordersWithoutUPCs.push(orderId);
                        continue;
                    }

                    // Get the first line item to determine businessId
                    const firstItem = lineItems[0];
                    const productId = String(firstItem.product_id);
                    const variantId = String(firstItem.variant_id);

                    // Get product mapping to find actual businessId
                    const storeProductDoc = await db
                        .doc(`accounts/${shop}/products/${productId}`)
                        .get();

                    if (!storeProductDoc.exists) {
                        console.warn(`⚠️ Store product ${productId} not found for order ${orderId}`);
                        ordersWithoutUPCs.push(orderId);
                        continue;
                    }

                    const storeProductData = storeProductDoc.data();
                    const variantMapping = storeProductData?.variantMappingDetails?.[variantId]
                        || storeProductData?.variantMappings?.[variantId];

                    if (!variantMapping) {
                        console.warn(`⚠️ No mapping for variant ${variantId} in order ${orderId}`);
                        ordersWithoutUPCs.push(orderId);
                        continue;
                    }

                    const actualBusinessId = typeof variantMapping === 'object'
                        ? variantMapping.businessId
                        : null;

                    if (!actualBusinessId) {
                        console.warn(`⚠️ No businessId found in variant mapping for order ${orderId}`);
                        ordersWithoutUPCs.push(orderId);
                        continue;
                    }

                    // Query UPCs for this order using the actual businessId
                    const upcsSnapshot = await db
                        .collection(`users/${actualBusinessId}/upcs`)
                        .where('orderId', '==', String(orderId))
                        .get();

                    if (upcsSnapshot.empty) {
                        console.warn(`⚠️ Order ${orderId} has no UPCs - needs manual creation`);
                        ordersWithoutUPCs.push(orderId);
                        continue;
                    }

                    // Update all UPCs for this order to putAway: 'inbound'
                    const batch = db.batch();
                    let batchCount = 0;

                    upcsSnapshot.docs.forEach(upcDoc => {
                        const upcData = upcDoc.data() as UPC;
                        const currentPutAway = upcData.putAway;

                        // Only update if putAway is not already 'inbound'
                        if (currentPutAway !== 'inbound') {
                            const updatedData: Partial<UPC> = {
                                putAway: 'inbound',
                                updatedAt: Timestamp.now(),
                                updatedBy: result.userId,
                            }
                            batch.update(upcDoc.ref, updatedData);
                            batchCount++;
                        }
                    });

                    if (batchCount > 0) {
                        await batch.commit();
                        upcUpdateCount += batchCount;
                        console.log(`✅ Updated ${batchCount} UPCs to 'inbound' for order ${orderId}`);
                    } else {
                        console.log(`⏭️ All UPCs already 'inbound' for order ${orderId}`);
                    }

                } catch (upcError) {
                    console.error(`❌ Error processing UPCs for order ${orderId}:`, upcError);
                    // Continue with other orders - don't fail the whole batch
                }
            }
        }

        // ============================================
        // STEP 4: Create UPCs for orders without any
        // ============================================
        if (isRTOStatus && ordersWithoutUPCs.length > 0) {
            if (!createUPCsForNonPickupReady) {
                // User chose to skip UPC creation for orders without existing UPCs
                console.log(`⏭️ Skipping UPC creation for ${ordersWithoutUPCs.length} orders (user opted out)`);
            } else {
                console.log(`📦 Creating UPCs for ${ordersWithoutUPCs.length} orders without UPCs...`);

                for (const orderId of ordersWithoutUPCs) {
                    try {
                        // Get order details
                        const orderDoc = await ordersColRef.doc(String(orderId)).get();
                        if (!orderDoc.exists) continue;

                        const orderData = orderDoc.data();
                        const lineItems = orderData?.raw?.line_items || [];

                        if (lineItems.length === 0) {
                            console.warn(`⚠️ Order ${orderId} has no line items, skipping UPC creation`);
                            continue;
                        }

                        const batch = db.batch();
                        let createdCount = 0;

                        for (const item of lineItems) {
                            const productId = String(item.product_id);
                            const variantId = String(item.variant_id);
                            const quantity = Number(item.quantity) || 1;

                            // Get product mapping to find business product
                            const storeProductDoc = await db
                                .doc(`accounts/${shop}/products/${productId}`)
                                .get();

                            if (!storeProductDoc.exists) {
                                console.warn(`⚠️ Store product ${productId} not found for order ${orderId}`);
                                continue;
                            }

                            const storeProductData = storeProductDoc.data();
                            const variantMapping = storeProductData?.variantMappingDetails?.[variantId]
                                || storeProductData?.variantMappings?.[variantId];

                            if (!variantMapping) {
                                console.warn(`⚠️ No mapping for variant ${variantId} in order ${orderId}`);
                                continue;
                            }

                            const actualBusinessId = typeof variantMapping === 'object'
                                ? variantMapping.businessId
                                : null;

                            const businessProductSku = typeof variantMapping === 'object'
                                ? variantMapping.businessProductSku
                                : variantMapping;

                            if (!actualBusinessId) {
                                console.warn(`⚠️ No businessId found in variant mapping for order ${orderId}`);
                                continue;
                            }

                            // Create UPCs for this line item (one per quantity)
                            for (let i = 0; i < quantity; i++) {
                                const upcRef = db.collection(`users/${actualBusinessId}/upcs`).doc();

                                const upcData: UPC = {
                                    id: upcRef.id,
                                    createdAt: Timestamp.now(),
                                    updatedAt: Timestamp.now(),
                                    createdBy: result.userId!,
                                    updatedBy: result.userId!,
                                    storeId: shop,
                                    orderId: String(orderId),
                                    grnRef: null,
                                    putAway: 'inbound', // ✅ Set to inbound for RTO
                                    productId: businessProductSku,
                                    warehouseId: null,
                                    zoneId: null,
                                    rackId: null,
                                    shelfId: null,
                                    placementId: null,
                                }

                                batch.set(upcRef, upcData);

                                createdCount++;
                            }
                        }

                        if (createdCount > 0) {
                            await batch.commit();
                            upcCreateCount += createdCount;
                            console.log(`✅ Created ${createdCount} UPCs for order ${orderId}`);
                        }

                    } catch (createError) {
                        console.error(`❌ Error creating UPCs for order ${orderId}:`, createError);
                        // Continue with other orders
                    }
                }
            }
        }

        // ============================================
        // STEP 5: Build response message
        // ============================================
        const splitCount = orderIdsBeingSplit.size;
        let message = splitCount > 0
            ? `${updatedCount} order(s) successfully updated to ${status}. ${splitCount} order(s) queued for splitting (not ${status === 'Confirmed' ? 'confirmed' : 'updated'}).`
            : `${updatedCount} order(s) successfully updated to ${status}`;

        if (isRTOStatus) {
            if (upcUpdateCount > 0) {
                message += ` ${upcUpdateCount} UPC(s) updated to 'inbound'.`;
            }
            if (upcCreateCount > 0) {
                message += ` ${upcCreateCount} UPC(s) created with 'inbound' status.`;
            }
        }

        return NextResponse.json({
            message,
            details: {
                ordersUpdated: updatedCount,
                ordersSplit: splitCount,
                upcsUpdated: upcUpdateCount,
                upcsCreated: upcCreateCount,
                ordersWithoutUPCs: ordersWithoutUPCs.length,
            }
        });

    } catch (error) {
        console.error('Error during bulk order status update:', error);
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
        return NextResponse.json({
            error: 'Failed to bulk update order status',
            details: errorMessage
        }, { status: 500 });
    }
}