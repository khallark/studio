// app/api/business/products/delete/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { authUserForBusiness } from '@/lib/authoriseUser';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { db } from '@/lib/firebase-admin';

// ============================================================
// TYPES
// ============================================================

interface MappedVariant {
    storeId: string;
    productId: string;
    productTitle?: string;
    variantId: number;
    variantTitle?: string;
    variantSku?: string | null;
    mappedAt?: string;
}

// ============================================================
// MAIN HANDLER
// ============================================================

export async function POST(req: NextRequest) {
    try {
        const { businessId, sku } = await req.json();

        // ============================================================
        // VALIDATION
        // ============================================================

        if (!businessId || typeof businessId !== 'string') {
            return NextResponse.json(
                { error: 'Validation Error', message: 'businessId is required and must be a string' },
                { status: 400 }
            );
        }

        if (!sku || typeof sku !== 'string') {
            return NextResponse.json(
                { error: 'Validation Error', message: 'sku is required and must be a string' },
                { status: 400 }
            );
        }

        // ============================================================
        // AUTHORIZATION
        // ============================================================

        const result = await authUserForBusiness({ businessId, req });
        const { businessDoc, userId, userDoc } = result;

        if (!result.authorised) {
            const { error, status } = result;
            return NextResponse.json({ error }, { status });
        }

        // ============================================================
        // GET PRODUCT
        // ============================================================

        const productRef = businessDoc?.ref.collection('products').doc(sku);
        const productDoc = await productRef?.get();

        if (!productDoc?.exists) {
            return NextResponse.json(
                { error: 'Not Found', message: 'Product with this SKU does not exist' },
                { status: 404 }
            );
        }

        const productData = productDoc.data();
        const mappedVariants: MappedVariant[] = productData?.mappedVariants || [];

        // ============================================================
        // CREATE DELETION LOG
        // ============================================================

        const userData = userDoc?.data();
        const userEmail = userData?.email || userData?.primaryContact?.email || null;

        const deletionLog = {
            action: 'deleted',
            entityType: 'product',
            entityId: sku,
            entityName: productData?.name || sku,
            deletedData: {
                name: productData?.name,
                sku: productData?.sku,
                weight: productData?.weight,
                category: productData?.category,
                description: productData?.description || null,
                price: productData?.price || null,
                stock: productData?.stock || null,
                createdAt: productData?.createdAt,
                createdBy: productData?.createdBy,
                // Include mapping info for audit trail
                mappedVariantsCount: mappedVariants.length,
                mappedVariants: mappedVariants,
            },
            performedBy: userId || 'unknown',
            performedByEmail: userEmail,
            performedAt: Timestamp.now(),
            metadata: {
                userAgent: req.headers.get('user-agent') || undefined,
            },
        };

        // ============================================================
        // BATCH OPERATIONS
        // ============================================================

        const batch = db.batch();
        let mappingsRemoved = 0;

        // 1. Remove all variant mappings from store products
        for (const mapping of mappedVariants) {
            try {
                const storeProductRef = db
                    .collection('accounts')
                    .doc(mapping.storeId)
                    .collection('products')
                    .doc(mapping.productId);

                // Remove the specific variant mapping
                batch.update(storeProductRef, {
                    [`variantMappings.${mapping.variantId}`]: FieldValue.delete(),
                    variantMappingsArray: FieldValue.arrayRemove(mapping.variantId),
                    [`variantMappingDetails.${mapping.variantId}`]: FieldValue.delete(),
                    updatedAt: FieldValue.serverTimestamp(),
                });

                mappingsRemoved++;
            } catch (error) {
                // Log but don't fail if a store product doesn't exist
                console.warn(`Could not remove mapping for store ${mapping.storeId}, product ${mapping.productId}:`, error);
            }
        }

        // 2. Delete all logs in the product's logs subcollection
        const logsSnapshot = await productRef!.collection('logs').get();
        logsSnapshot.docs.forEach(doc => {
            batch.delete(doc.ref);
        });

        // 3. Delete the product
        batch.delete(productRef!);

        // 4. Store deletion log at business level for audit trail
        const deletionLogRef = businessDoc?.ref.collection('deletedProductsLog').doc();
        batch.set(deletionLogRef!, deletionLog);

        await batch.commit();

        // ============================================================
        // RETURN SUCCESS RESPONSE
        // ============================================================

        return NextResponse.json(
            {
                success: true,
                message: mappingsRemoved > 0
                    ? `Product deleted successfully. ${mappingsRemoved} variant mapping(s) were also removed.`
                    : 'Product deleted successfully.',
                sku,
                productName: productData?.name,
                mappingsRemoved,
            },
            { status: 200 }
        );

    } catch (error: any) {
        console.error('❌ API error:', error);
        return NextResponse.json(
            {
                error: 'Internal Server Error',
                message: error.message || 'An unexpected error occurred',
            },
            { status: 500 }
        );
    }
}