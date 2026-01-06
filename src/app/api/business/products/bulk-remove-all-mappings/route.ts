// /api/business/products/bulk-remove-all-mappings/route.ts
//
// Removes all variant mappings from selected business products or all products
// Payload: { businessId, skus?: string[], removeAll?: boolean }
// Auth: Bearer token

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { authUserForBusiness } from '@/lib/authoriseUser';

// ============================================================
// TYPES
// ============================================================

interface MappedVariant {
    storeId: string;
    productId: string;
    productTitle: string;
    variantId: number;
    variantTitle: string;
    variantSku: string;
    mappedAt: string;
}

interface RemovalResult {
    sku: string;
    productName: string;
    removedCount: number;
    status: 'success' | 'error' | 'skipped';
    message?: string;
}

// ============================================================
// MAIN HANDLER
// ============================================================

export async function POST(req: NextRequest) {
    try {
        // ============================================================
        // PARSE REQUEST
        // ============================================================

        const body = await req.json();
        const { businessId, skus, removeAll }: {
            businessId: string;
            skus?: string[];
            removeAll?: boolean;
        } = body;

        if (!businessId) {
            return NextResponse.json(
                { error: 'Bad Request', message: 'businessId is required' },
                { status: 400 }
            );
        }

        if (!removeAll && (!skus || skus.length === 0)) {
            return NextResponse.json(
                { error: 'Bad Request', message: 'Either skus array or removeAll flag is required' },
                { status: 400 }
            );
        }

        // ============================================================
        // AUTHORIZATION
        // ============================================================

        const result = await authUserForBusiness({ businessId, req });

        if (!result.authorised) {
            return NextResponse.json(
                { error: 'Unauthorized', message: result.error },
                { status: result.status }
            );
        }

        const { businessDoc, userId, userDoc } = result;

        if (!businessDoc?.exists) {
            return NextResponse.json(
                { error: 'Not Found', message: 'Business not found' },
                { status: 404 }
            );
        }

        // ============================================================
        // GET BUSINESS PRODUCTS TO PROCESS
        // ============================================================

        const productsRef = businessDoc.ref.collection('products');
        let productsToProcess: FirebaseFirestore.QueryDocumentSnapshot[] = [];

        if (removeAll) {
            // Get all products that have mappings
            const allProductsSnap = await productsRef.get();
            productsToProcess = allProductsSnap.docs.filter(doc => {
                const data = doc.data();
                return data.mappedVariants && data.mappedVariants.length > 0;
            });
        } else {
            // Get only specified products
            for (const sku of skus!) {
                const productDoc = await productsRef.doc(sku).get();
                if (productDoc.exists) {
                    const data = productDoc.data();
                    if (data?.mappedVariants && data.mappedVariants.length > 0) {
                        productsToProcess.push(productDoc as FirebaseFirestore.QueryDocumentSnapshot);
                    }
                }
            }
        }

        if (productsToProcess.length === 0) {
            return NextResponse.json({
                success: true,
                message: 'No products with mappings found',
                summary: {
                    processed: 0,
                    mappingsRemoved: 0,
                    errors: 0,
                },
                results: [],
            });
        }

        // ============================================================
        // PROCESS REMOVALS
        // ============================================================

        const results: RemovalResult[] = [];
        let totalMappingsRemoved = 0;
        let errorCount = 0;

        const userData = userDoc?.data();
        const userEmail = userData?.email || userData?.primaryContact?.email || null;

        // Process in batches to avoid hitting Firestore limits
        const MAX_BATCH_SIZE = 450;
        let batch = db.batch();
        let batchCount = 0;

        for (const productDoc of productsToProcess) {
            try {
                const productData = productDoc.data();
                const mappedVariants: MappedVariant[] = productData.mappedVariants || [];
                const productSku = productDoc.id;
                const productName = productData.name || productSku;

                if (mappedVariants.length === 0) {
                    results.push({
                        sku: productSku,
                        productName,
                        removedCount: 0,
                        status: 'skipped',
                        message: 'No mappings to remove',
                    });
                    continue;
                }

                // Group mappings by store and product for efficient updates
                const storeProductMappings: Map<string, { storeId: string; productId: string; variantIds: number[] }> = new Map();

                for (const mapping of mappedVariants) {
                    const key = `${mapping.storeId}:${mapping.productId}`;
                    if (!storeProductMappings.has(key)) {
                        storeProductMappings.set(key, {
                            storeId: mapping.storeId,
                            productId: mapping.productId,
                            variantIds: [],
                        });
                    }
                    storeProductMappings.get(key)!.variantIds.push(mapping.variantId);
                }

                // Remove mappings from each store product
                for (const [, { storeId, productId, variantIds }] of storeProductMappings) {
                    const storeProductRef = db
                        .collection('accounts')
                        .doc(storeId)
                        .collection('products')
                        .doc(productId);

                    // Build update object to remove all variant mappings
                    const updateData: Record<string, any> = {
                        updatedAt: FieldValue.serverTimestamp(),
                    };

                    for (const variantId of variantIds) {
                        updateData[`variantMappings.${variantId}`] = FieldValue.delete();
                        updateData[`variantMappingDetails.${variantId}`] = FieldValue.delete();
                    }

                    batch.update(storeProductRef, updateData);
                    batchCount++;

                    // Commit batch if approaching limit
                    if (batchCount >= MAX_BATCH_SIZE) {
                        await batch.commit();
                        batch = db.batch();
                        batchCount = 0;
                    }
                }

                // Clear mappedVariants from business product
                batch.update(productDoc.ref, {
                    mappedVariants: [],
                    updatedAt: FieldValue.serverTimestamp(),
                });
                batchCount++;

                // Create log entry
                const logRef = productDoc.ref.collection('logs').doc();
                const removedMappingsSummary = mappedVariants
                    .slice(0, 5)
                    .map(m => `${m.storeId.replace('.myshopify.com', '')}/${m.variantSku || m.variantTitle}`)
                    .join(', ');

                batch.set(logRef, {
                    action: 'all_mappings_removed',
                    changes: [
                        {
                            field: 'mappedVariants',
                            fieldLabel: 'All Variant Mappings',
                            oldValue: `${mappedVariants.length} mapping(s): ${removedMappingsSummary}${mappedVariants.length > 5 ? '...' : ''}`,
                            newValue: null,
                        },
                    ],
                    performedBy: userId,
                    performedByEmail: userEmail,
                    performedAt: Timestamp.now(),
                    metadata: {
                        source: 'bulk_remove_all_mappings',
                        removedCount: mappedVariants.length,
                        removedMappings: mappedVariants.map(m => ({
                            storeId: m.storeId,
                            productId: m.productId,
                            variantId: m.variantId,
                            variantSku: m.variantSku,
                        })),
                    },
                });
                batchCount++;

                // Commit batch if approaching limit
                if (batchCount >= MAX_BATCH_SIZE) {
                    await batch.commit();
                    batch = db.batch();
                    batchCount = 0;
                }

                totalMappingsRemoved += mappedVariants.length;
                results.push({
                    sku: productSku,
                    productName,
                    removedCount: mappedVariants.length,
                    status: 'success',
                });

            } catch (error: any) {
                console.error(`Error processing product ${productDoc.id}:`, error);
                errorCount++;
                results.push({
                    sku: productDoc.id,
                    productName: productDoc.data()?.name || productDoc.id,
                    removedCount: 0,
                    status: 'error',
                    message: error.message || 'Failed to remove mappings',
                });
            }
        }

        // Commit remaining batch operations
        if (batchCount > 0) {
            await batch.commit();
        }

        // ============================================================
        // RETURN RESPONSE
        // ============================================================

        const successCount = results.filter(r => r.status === 'success').length;

        return NextResponse.json({
            success: true,
            message: `Removed ${totalMappingsRemoved} mapping(s) from ${successCount} product(s)`,
            summary: {
                processed: productsToProcess.length,
                successful: successCount,
                mappingsRemoved: totalMappingsRemoved,
                errors: errorCount,
                skipped: results.filter(r => r.status === 'skipped').length,
            },
            results,
        });

    } catch (error: any) {
        console.error('Error in bulk remove all mappings:', error);
        return NextResponse.json(
            {
                error: 'Internal Server Error',
                message: error.message || 'An unexpected error occurred',
            },
            { status: 500 }
        );
    }
}