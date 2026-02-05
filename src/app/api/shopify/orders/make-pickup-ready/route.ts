// /api/shopify/orders/make-pickup-ready/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { authUserForBusinessAndStore } from '@/lib/authoriseUser';
import { db } from '@/lib/firebase-admin';
import { UPC } from '@/types/warehouse';

export async function POST(req: NextRequest) {
    try {
        // Parse request body
        const { businessId, shop, orderId, assignedUpcIds } = await req.json();

        // Validate required fields
        if (!businessId || !shop || !orderId || !assignedUpcIds || !Array.isArray(assignedUpcIds)) {
            return NextResponse.json(
                { error: 'Missing required fields: businessId, shop, orderId, assignedUpcIds' },
                { status: 400 }
            );
        }

        // Verify authentication
        const result = await authUserForBusinessAndStore({ businessId, shop, req });

        if (!result.authorised) {
            return NextResponse.json(
                { error: result.error },
                { status: result.status }
            )
        }

        // Get and validate order (check exists BEFORE calling data())
        const orderRef = db.collection('accounts').doc(shop).collection('orders').doc(orderId);
        const orderDoc = await orderRef.get();
        
        if (!orderDoc.exists) {
            return NextResponse.json(
                { error: 'Order not found' },
                { status: 404 }
            );
        }

        const orderData = orderDoc.data();
        
        if (!orderData) {
            return NextResponse.json(
                { error: 'Order data is invalid' },
                { status: 500 }
            );
        }

        if (orderData.pickupReady) {
            return NextResponse.json(
                { error: 'Order is already picked up' },
                { status: 400 }
            );
        }

        // Get line items to determine correct businessId for each UPC
        const lineItems = orderData?.raw?.line_items || [];

        if (lineItems.length === 0) {
            return NextResponse.json(
                { error: 'Order has no line items' },
                { status: 400 }
            );
        }

        // Build a map of UPC IDs to their correct businessId
        // We need to query each UPC to find which business it belongs to
        const upcToBusinessId = new Map<string, string>();

        // First, get all unique product mappings from the order
        const productMappings = new Map<string, { businessId: string; businessProductSku: string }>();

        for (const item of lineItems) {
            const productId = String(item.product_id);
            const variantId = String(item.variant_id);

            // Get product mapping to find actual businessId
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

            if (actualBusinessId && businessProductSku) {
                productMappings.set(businessProductSku, { businessId: actualBusinessId, businessProductSku });
            }
        }

        // Now query each UPC to find its businessId
        for (const upcId of assignedUpcIds) {
            // We need to search across all potential businessIds
            // Try each businessId from our mappings
            let found = false;
            for (const [sku, { businessId: actualBusinessId }] of productMappings.entries()) {
                const upcRef = db.collection(`users/${actualBusinessId}/upcs`).doc(upcId);
                const upcDoc = await upcRef.get();
                
                if (upcDoc.exists) {
                    upcToBusinessId.set(upcId, actualBusinessId);
                    found = true;
                    break;
                }
            }

            if (!found) {
                console.warn(`⚠️ UPC ${upcId} not found in any business collection`);
            }
        }

        // Start a batch write
        const batch = db.batch();

        // Update each UPC document using the correct businessId
        for (const upcId of assignedUpcIds) {
            const actualBusinessId = upcToBusinessId.get(upcId);
            
            if (!actualBusinessId) {
                console.warn(`⚠️ Skipping UPC ${upcId} - businessId not found`);
                continue;
            }

            const upcRef = db.collection('users').doc(actualBusinessId).collection('upcs').doc(upcId);

            const updateData: Partial<UPC> = {
                storeId: shop,
                orderId: orderId,
                putAway: 'outbound',
                updatedAt: Timestamp.now(),
            };

            batch.update(upcRef, updateData);
        }

        // Update the order to mark it as pickup ready
        batch.update(orderRef, {
            pickupReady: true,
            pickupReadyAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
        });

        // Commit the batch
        await batch.commit();

        return NextResponse.json({
            success: true,
            message: `Successfully prepared ${assignedUpcIds.length} items for pickup`,
            orderId,
            upcCount: assignedUpcIds.length,
        });
    } catch (error: any) {
        console.error('Error in make-pickup-ready:', error);
        return NextResponse.json(
            {
                error: 'Failed to process pickup',
                details: error.message,
            },
            { status: 500 }
        );
    }
}