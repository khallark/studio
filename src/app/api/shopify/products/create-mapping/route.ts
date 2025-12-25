// /api/shopify/products/create-mapping/route.ts
//
// Creates a mapping between a business product and a store product VARIANT
// Payload: { businessId, storeId, productId, variantId, variantSku, variantTitle, productTitle, businessProductSku }
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
        const {
            businessId,
            storeId,
            productId,
            variantId,
            variantSku,
            variantTitle,
            productTitle,
            businessProductSku
        }: {
            businessId: string;
            storeId: string;
            productId: string;
            variantId: number;
            variantSku: string | null;
            variantTitle: string;
            productTitle: string;
            businessProductSku: string;
        } = body;

        if (!businessId || !storeId || !productId || !variantId || !businessProductSku) {
            return NextResponse.json(
                {
                    error: 'Bad Request',
                    message: 'businessId, storeId, productId, variantId, and businessProductSku are required'
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
        // VERIFY BUSINESS PRODUCT EXISTS
        // ============================================================

        const businessProductRef = businessDoc.ref
            .collection('products')
            .doc(businessProductSku);

        const businessProductDoc = await businessProductRef.get();

        if (!businessProductDoc.exists) {
            return NextResponse.json(
                { error: 'Not Found', message: `Business product ${businessProductSku} not found` },
                { status: 404 }
            );
        }

        // ============================================================
        // VERIFY STORE PRODUCT EXISTS
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

        // Check if variant exists in the product
        const variants = storeProductData?.variants || [];
        const variantExists = variants.some((v: any) => v.id === variantId || String(v.id) === String(variantId));

        if (!variantExists) {
            return NextResponse.json(
                { error: 'Not Found', message: 'Variant not found in product' },
                { status: 404 }
            );
        }

        // Check if variant is already mapped
        const existingMappings = storeProductData?.variantMappings || {};
        if (existingMappings[String(variantId)]) {
            return NextResponse.json(
                {
                    error: 'Conflict',
                    message: `Variant is already mapped to ${existingMappings[String(variantId)]}`
                },
                { status: 409 }
            );
        }

        // ============================================================
        // CREATE MAPPING
        // ============================================================

        const batch = db.batch();

        // 1. Update store product with variant mapping
        // Store as: variantMappings: { [variantId]: businessSku }
        batch.update(storeProductRef, {
            [`variantMappings.${variantId}`]: businessProductSku,
            [`variantMappingDetails.${variantId}`]: {
                businessProductSku,
                mappedAt: new Date().toISOString(),
                mappedBy: result?.userId,
            },
            updatedAt: FieldValue.serverTimestamp(),
        });

        // 2. Add to business product's mapped variants (for reverse lookup)
        batch.update(businessProductRef, {
            mappedVariants: FieldValue.arrayUnion({
                storeId,
                productId,
                productTitle: productTitle || 'Unknown',
                variantId,
                variantTitle: variantTitle || 'Default Title',
                variantSku: variantSku || null,
                mappedAt: new Date().toISOString(),
            }),
            updatedAt: FieldValue.serverTimestamp(),
        });

        // 3. Log the mapping action
        const mappingDescription = variantSku 
            ? `${variantSku} (${variantTitle || 'Default Title'})`
            : variantTitle || 'Default Title';

        const logEntry = {
            action: 'mapping_created',
            changes: [
                {
                    field: 'variantMapping',
                    fieldLabel: 'Variant Mapping',
                    oldValue: null,
                    newValue: `${storeId.replace('.myshopify.com', '')} → ${productTitle} → ${mappingDescription}`,
                },
            ],
            performedBy: result?.userId,
            performedAt: Timestamp.now(),
            metadata: {
                userAgent: req.headers.get('user-agent') || undefined,
                storeId,
                productId,
                variantId,
                variantTitle: variantTitle || 'Default Title',
                variantSku: variantSku || null,
                storeProductTitle: productTitle || 'Unknown',
            },
        };

        const logRef = businessProductRef.collection('logs').doc();
        batch.set(logRef, logEntry);

        await batch.commit();

        // ============================================================
        // RETURN RESPONSE
        // ============================================================

        return NextResponse.json({
            success: true,
            message: 'Variant mapping created successfully',
            mapping: {
                businessProductSku,
                storeId,
                productId,
                productTitle,
                variantId,
                variantTitle,
                variantSku,
            },
        });

    } catch (error: any) {
        console.error('Error creating variant mapping:', error);
        return NextResponse.json(
            {
                error: 'Internal Server Error',
                message: error.message || 'An unexpected error occurred',
            },
            { status: 500 }
        );
    }
}