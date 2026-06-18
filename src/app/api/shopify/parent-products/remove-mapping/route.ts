// /api/shopify/parent-products/remove-mapping/route.ts
//
// Removes a parent product <-> store PRODUCT mapping.
// Payload: { businessId, storeId, productId }
// Auth: Bearer token

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { authUserForBusinessAndStore } from '@/lib/authoriseUser';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { businessId, storeId, productId }: {
            businessId: string;
            storeId: string;
            productId: string;
        } = body;

        if (!businessId || !storeId || !productId) {
            return NextResponse.json(
                { error: 'Bad Request', message: 'businessId, storeId, and productId are required' },
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

        const storeProductRef = result.shopDoc?.ref.collection('products').doc(productId);
        if (!storeProductRef) {
            return NextResponse.json({ error: 'Not Found', message: 'Store product not found' }, { status: 404 });
        }
        const storeProductDoc = await storeProductRef.get();
        if (!storeProductDoc.exists) {
            return NextResponse.json({ error: 'Not Found', message: 'Store product not found' }, { status: 404 });
        }

        const storeProductData = storeProductDoc.data();
        const mappedParentId = storeProductData?.parentMapping;

        if (!mappedParentId) {
            return NextResponse.json({ error: 'Bad Request', message: 'This product is not mapped' }, { status: 400 });
        }

        // Ownership gate: only the business that created the mapping can remove it.
        if (storeProductData?.parentMappingDetails?.businessId !== businessId) {
            return NextResponse.json({ error: 'Bad Request', message: 'Mapping is not owned by you' }, { status: 400 });
        }

        const parentRef = businessDoc.ref.collection('parentProducts').doc(mappedParentId);
        const parentDoc = await parentRef.get();

        const batch = db.batch();

        // 1. Clear store product mapping fields
        batch.update(storeProductRef, {
            parentMapping: FieldValue.delete(),
            parentMappingDetails: FieldValue.delete(),
            updatedAt: FieldValue.serverTimestamp(),
        });

        // 2. Filter the reverse array on the parent (arrayRemove needs an exact-match object,
        //    which we don't have because mappedAt varies — so read, filter, write).
        if (parentDoc.exists) {
            const current = parentDoc.data()?.mappedStoreProducts || [];
            const updated = current.filter(
                (m: any) => !(m.storeId === storeId && m.productId === productId)
            );

            batch.update(parentRef, {
                mappedStoreProducts: updated,
                updatedAt: FieldValue.serverTimestamp(),
            });

            const userEmail = result?.userDoc?.data()?.userData?.email ||
                result?.userDoc?.data()?.primaryContact?.email || null;

            const logRef = parentRef.collection('logs').doc();
            batch.set(logRef, {
                action: 'parent_mapping_removed',
                changes: [{
                    field: 'parentMapping',
                    fieldLabel: 'Store Product Mapping',
                    oldValue: `${storeId.replace('.myshopify.com', '')} → ${storeProductData?.title}`,
                    newValue: null,
                }],
                performedBy: result.userId,
                performedByEmail: userEmail,
                performedAt: Timestamp.now(),
                metadata: {
                    userAgent: req.headers.get('user-agent') || undefined,
                    storeId,
                    productId,
                    storeProductTitle: storeProductData?.title || 'Unknown',
                },
            });
        }

        await batch.commit();

        return NextResponse.json({
            success: true,
            message: 'Parent mapping removed successfully',
            removedMapping: { parentProductId: mappedParentId, storeId, productId },
        });
    } catch (error: any) {
        console.error('Error removing parent mapping:', error);
        return NextResponse.json(
            { error: 'Internal Server Error', message: error.message || 'An unexpected error occurred' },
            { status: 500 }
        );
    }
}