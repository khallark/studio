import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { authUserForBusinessAndStore } from '@/lib/authoriseUser';
import { UPC } from '@/types/warehouse';

function normalizeVariantId(value: unknown): string | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return String(value);
    }

    if (typeof value === 'string' && value.trim() !== '') {
        return value.trim();
    }

    return null;
}

function buildBulkRtoReceivedUpdate(orderData: any) {
    const lineItems = Array.isArray(orderData?.raw?.line_items)
        ? orderData.raw.line_items
        : [];

    const updatedLineItems = lineItems.map((item: any) => ({
        ...item,
        rtoReceived: true,
    }));

    const rtoReceived = lineItems
        .map((item: any) => item?.variant_id)
        .filter((variantId: unknown) => variantId !== undefined && variantId !== null);

    return {
        updatedLineItems,
        rtoReceived,
    };
}

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
            'Lost',
        ];
        if (!validStatuses.includes(status)) {
            return NextResponse.json({ error: 'Invalid status provided' }, { status: 400 });
        }

        const shopRef = db.collection('accounts').doc(shop);
        const ordersColRef = shopRef.collection('orders');

        // Check if this is an RTO status that needs UPC handling
        const isRTOStatus = status === 'RTO Closed';

        // ============================================
        // STEP 1: Update order statuses in transaction
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
                            case "Lost":
                                return "This order was marked as lost";
                            default:
                                return "";
                        }
                    })()
                };

                const updatePayload: Record<string, any> = {
                    customStatus: status,
                    customStatusesLogs: FieldValue.arrayUnion(log),
                };

                if (status === 'RTO Closed') {
                    const orderData = orderDoc.data();
                    const { updatedLineItems, rtoReceived } = buildBulkRtoReceivedUpdate(orderData);

                    updatePayload['raw.line_items'] = updatedLineItems;
                    updatePayload.rtoReceived = rtoReceived;
                }

                transaction.update(orderRef, updatePayload);

                updatedCount++;
                successfullyUpdatedOrderIds.push(orderId);
            }
        });

        // ============================================
        // STEP 2: Handle UPCs for RTO orders
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
        // STEP 3: Create UPCs for orders without any
        // ============================================
        if (isRTOStatus && ordersWithoutUPCs.length > 0) {
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
                                creditNoteRef: null,
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

        // ============================================
        // STEP 4: Build response message
        // ============================================
        let message = `${updatedCount} order(s) successfully updated to ${status}`;

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