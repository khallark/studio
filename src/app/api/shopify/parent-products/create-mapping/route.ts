// /api/shopify/parent-products/create-mapping/route.ts
//
// Maps a parent product -> store PRODUCT (product-level, not variant-level).
// Payload: { businessId, storeId, productId, productTitle, parentProductId }
// Auth: Bearer token

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { authUserForBusinessAndStore } from '@/lib/authoriseUser';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const {
            businessId,
            storeId,
            productId,
            productTitle,
            parentProductId,
        }: {
            businessId: string;
            storeId: string;
            productId: string;
            productTitle: string;
            parentProductId: string;
        } = body;

        if (!businessId || !storeId || !productId || !parentProductId) {
            return NextResponse.json(
                { error: 'Bad Request', message: 'businessId, storeId, productId, and parentProductId are required' },
                { status: 400 }
            );
        }

        const result = await authUserForBusinessAndStore({ businessId, shop: storeId, req });
        if (!result.authorised) {
            return NextResponse.json({ error: 'Unauthorized', message: result.error }, { status: result.status });
        }

        const { businessDoc } = result;
        if (!businessDoc?.exists) {
            return NextResponse.json({ error: 'Not Found', message: 'Business not found' }, { status: 404 });
        }

        const linkedStores: string[] = businessDoc.data()?.stores || [];
        if (!linkedStores.includes(storeId)) {
            return NextResponse.json({ error: 'Forbidden', message: 'Store not linked to this business' }, { status: 403 });
        }

        // Verify parent exists
        const parentRef = businessDoc.ref.collection('parentProducts').doc(parentProductId);
        const parentDoc = await parentRef.get();
        if (!parentDoc.exists) {
            return NextResponse.json({ error: 'Not Found', message: `Parent product ${parentProductId} not found` }, { status: 404 });
        }

        // Verify store product exists
        const storeProductRef = result.shopDoc?.ref.collection('products').doc(productId);
        if (!storeProductRef) {
            return NextResponse.json({ error: 'Not Found', message: 'Store product not found' }, { status: 404 });
        }
        const storeProductDoc = await storeProductRef.get();
        if (!storeProductDoc.exists) {
            return NextResponse.json({ error: 'Not Found', message: 'Store product not found' }, { status: 404 });
        }

        const storeProductData = storeProductDoc.data();

        // Already mapped? Force explicit unmap first (one store product -> one parent).
        if (storeProductData?.parentMapping) {
            return NextResponse.json(
                { error: 'Conflict', message: `This product is already mapped to ${storeProductData.parentMapping}. Remove the existing mapping first.` },
                { status: 409 }
            );
        }

        const parentName = parentDoc.data()?.name ?? parentProductId;
        const batch = db.batch();

        // 1. Store product -> scalar parent mapping + details
        batch.update(storeProductRef, {
            parentMapping: parentProductId,
            parentMappingDetails: {
                businessParentId: parentProductId,
                businessId,
                mappTimestamp: new Date().toISOString(),
                mappedBy: result?.userId ?? null,
            },
            updatedAt: FieldValue.serverTimestamp(),
        });

        // 2. Parent -> reverse array (the "many" side)
        batch.update(parentRef, {
            mappedStoreProducts: FieldValue.arrayUnion({
                storeId,
                productId,
                productTitle: productTitle || storeProductData?.title || 'Unknown',
                mappedAt: new Date().toISOString(),
            }),
            updatedAt: FieldValue.serverTimestamp(),
        });

        // 3. Log on the parent
        const userEmail = result?.userDoc?.data()?.userData?.email ||
            result?.userDoc?.data()?.primaryContact?.email || null;

        const logRef = parentRef.collection('logs').doc();
        batch.set(logRef, {
            action: 'parent_mapping_created',
            changes: [{
                field: 'parentMapping',
                fieldLabel: 'Store Product Mapping',
                oldValue: null,
                newValue: `${storeId.replace('.myshopify.com', '')} → ${productTitle || storeProductData?.title}`,
            }],
            performedBy: result?.userId,
            performedByEmail: userEmail,
            performedAt: Timestamp.now(),
            metadata: {
                userAgent: req.headers.get('user-agent') || undefined,
                storeId,
                productId,
                storeProductTitle: productTitle || storeProductData?.title || 'Unknown',
            },
        });

        await batch.commit();

        return NextResponse.json({
            success: true,
            message: 'Parent mapping created successfully',
            mapping: { parentProductId, parentName, storeId, productId, productTitle },
        });
    } catch (error: any) {
        console.error('Error creating parent mapping:', error);
        return NextResponse.json(
            { error: 'Internal Server Error', message: error.message || 'An unexpected error occurred' },
            { status: 500 }
        );
    }
}