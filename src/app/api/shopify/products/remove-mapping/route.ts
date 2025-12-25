// /api/shopify/products/remove-mapping/route.ts
//
// Removes a mapping between a business product and a store product VARIANT
// Payload: { businessId, storeId, productId, variantId }
// Auth: Bearer token

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { authUserForBusinessAndStore } from '@/lib/authoriseUser';

// ============================================================
// MAIN HANDLER
// ============================================================

export async function POST(req: NextRequest) {
    try {
        // ============================================================
        // PARSE REQUEST
        // ============================================================

        const body = await req.json();
        const { businessId, storeId, productId, variantId }: {
            businessId: string;
            storeId: string;
            productId: string;
            variantId: string;
        } = body;

        if (!businessId || !storeId || !productId || !variantId) {
            return NextResponse.json(
                {
                    error: 'Bad Request',
                    message: 'businessId, storeId, productId, and variantId are required'
                },
                { status: 400 }
            );
        }

        // ============================================================
        // AUTHORIZATION
        // ============================================================

        const result = await authUserForBusinessAndStore({ businessId, shop: storeId, req });

        if (!result.authorised) {
            return NextResponse.json(
                { error: 'Unauthorized', message: result.error },
                { status: result.status }
            );
        }

        // ============================================================
        // VERIFY BUSINESS ACCESS
        // ============================================================

        const { businessDoc } = result;

        if (!businessDoc?.exists) {
            return NextResponse.json(
                { error: 'Not Found', message: 'Business not found' },
                { status: 404 }
            );
        }

        const businessData = businessDoc.data();
        const linkedStores: string[] = businessData?.stores || [];

        if (!linkedStores.includes(storeId)) {
            return NextResponse.json(
                { error: 'Forbidden', message: 'Store not linked to this business' },
                { status: 403 }
            );
        }

        // ============================================================
        // GET STORE PRODUCT
        // ============================================================

        const storeProductRef = result.shopDoc?.ref
            .collection('products')
            .doc(productId);

        if (!storeProductRef) {
            return NextResponse.json(
                { error: 'Not Found', message: 'Store product not found' },
                { status: 404 }
            );
        }

        const storeProductDoc = await storeProductRef.get();

        if (!storeProductDoc.exists) {
            return NextResponse.json(
                { error: 'Not Found', message: 'Store product not found' },
                { status: 404 }
            );
        }

        const storeProductData = storeProductDoc.data();
        const variantMappings = storeProductData?.variantMappings || {};
        const mappedBusinessSku = variantMappings[String(variantId)];

        if (!mappedBusinessSku) {
            return NextResponse.json(
                { error: 'Bad Request', message: 'Variant is not mapped' },
                { status: 400 }
            );
        }

        // Get variant details for logging
        const variants = storeProductData?.variants || [];
        const variant = variants.find((v: any) => v.id === variantId || String(v.id) === String(variantId));

        // ============================================================
        // REMOVE MAPPING
        // ============================================================

        const businessProductRef = businessDoc.ref
            .collection('products')
            .doc(mappedBusinessSku);

        const businessProductDoc = await businessProductRef.get();

        const batch = db.batch();

        // 1. Remove mapping from store product
        batch.update(storeProductRef, {
            [`variantMappings.${variantId}`]: FieldValue.delete(),
            [`variantMappingDetails.${variantId}`]: FieldValue.delete(),
            updatedAt: FieldValue.serverTimestamp(),
        });

        // 2. Remove from business product's mapped variants
        if (businessProductDoc.exists) {
            const currentMappings = businessProductDoc.data()?.mappedVariants || [];
            const updatedMappings = currentMappings.filter(
                (m: any) => !(
                    m.storeId === storeId &&
                    m.productId === productId &&
                    (m.variantId === variantId || String(m.variantId) === String(variantId))
                )
            );

            batch.update(businessProductRef, {
                mappedVariants: updatedMappings,
                updatedAt: FieldValue.serverTimestamp(),
            });

            // 3. Create log entry in business product's logs subcollection
            const mappingDescription = variant?.sku
                ? `${variant.sku} (${variant?.title || 'Default Title'})`
                : variant?.title || 'Default Title';

            const logEntry = {
                action: 'mapping_removed',
                changes: [
                    {
                        field: 'variantMapping',
                        fieldLabel: 'Variant Mapping',
                        oldValue: `${storeId.replace('.myshopify.com', '')} → ${storeProductData?.title} → ${mappingDescription}`,
                        newValue: null,
                    },
                ],
                performedBy: result.userId,
                performedAt: Timestamp.now(),
                metadata: {
                    userAgent: req.headers.get('user-agent') || undefined,
                    storeId,
                    productId,
                    variantId,
                    variantTitle: variant?.title || 'Default Title',
                    variantSku: variant?.sku || null,
                    storeProductTitle: storeProductData?.title || 'Unknown',
                },
            };

            const logRef = businessProductRef.collection('logs').doc();
            batch.set(logRef, logEntry);
        }

        await batch.commit();

        // ============================================================
        // RETURN RESPONSE
        // ============================================================

        return NextResponse.json({
            success: true,
            message: 'Variant mapping removed successfully',
            removedMapping: {
                businessProductSku: mappedBusinessSku,
                storeId,
                productId,
                variantId,
            },
        });

    } catch (error: any) {
        console.error('Error removing variant mapping:', error);
        return NextResponse.json(
            {
                error: 'Internal Server Error',
                message: error.message || 'An unexpected error occurred',
            },
            { status: 500 }
        );
    }
}