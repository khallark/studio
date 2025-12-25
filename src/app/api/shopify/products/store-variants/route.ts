// /api/shopify/products/store-variants/route.ts
//
// Fetches all store product VARIANTS for a business with optional filters
// Payload: { businessId, storeFilter?, mappingFilter?, searchQuery? }
// Auth: Bearer token

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';
import { authUserForBusiness, authUserForBusinessAndStore } from '@/lib/authoriseUser';

// ============================================================
// TYPES
// ============================================================

interface StoreVariant {
    variantId: number;
    variantTitle: string;
    variantSku: string | null;
    productId: string;
    productTitle: string;
    vendor: string | null;
    storeId: string;
    mappedBusinessSku: string | null;
    price: string | null;
    inventoryQuantity: number | null;
}

interface StoreInfo {
    id: string;
    shopName: string;
}

// ============================================================
// MAIN HANDLER
// ============================================================

export async function POST(req: NextRequest) {
    const body = await req.json();
    const { businessId, storeFilter, mappingFilter, searchQuery }: {
        businessId: string;
        storeFilter: string | null;
        mappingFilter: string | null;
        searchQuery: string | null;
    } = body;

    // ============================================================
    // PARSE REQUEST
    // ============================================================

    if (!businessId) {
        return NextResponse.json(
            { error: 'Bad Request', message: 'businessId is required' },
            { status: 400 }
        );
    }

    try {
        // ============================================================
        // AUTHORIZATION
        // ============================================================

        const result = (storeFilter && storeFilter.length)
            ? await authUserForBusinessAndStore({ businessId, shop: storeFilter, req })
            : await authUserForBusiness({ businessId, req });

        if (!result.authorised) {
            return NextResponse.json(
                { error: 'Not authorised', message: result.error },
                { status: result.status }
            );
        }

        // ============================================================
        // GET BUSINESS STORES
        // ============================================================

        // Get all stores linked to this business
        const { businessDoc } = result;

        if (!businessDoc?.exists) {
            return NextResponse.json(
                { error: 'Not Found', message: 'Business not found' },
                { status: 404 }
            );
        }

        const businessData = businessDoc.data();
        const linkedStores: string[] = businessData?.stores || [];

        if (linkedStores.length === 0) {
            return NextResponse.json({
                variants: [],
                stores: [],
                message: 'No stores linked to this business',
            });
        }

        // ============================================================
        // FETCH STORES INFO
        // ============================================================

        const storesInfo: StoreInfo[] = [];
        const storesToQuery = storeFilter && storeFilter !== 'all'
            ? [storeFilter]
            : linkedStores;

        for (const storeId of linkedStores) {
            const storeDoc = await db.collection('accounts').doc(storeId).get();
            if (storeDoc.exists) {
                storesInfo.push({
                    id: storeId,
                    shopName: storeDoc.data()?.shopName || storeId,
                });
            }
        }

        // ============================================================
        // FETCH STORE PRODUCTS AND EXTRACT VARIANTS
        // ============================================================

        const allVariants: StoreVariant[] = [];

        for (const storeId of storesToQuery) {
            // Fetch products
            const productsQuery = db
                .collection('accounts')
                .doc(storeId)
                .collection('products')
                .where('isDeleted', '==', false);

            const productsSnap = await productsQuery.get();

            for (const doc of productsSnap.docs) {
                const productData = doc.data();
                const productId = doc.id;
                const productTitle = productData.title || 'Untitled Product';
                const vendor = productData.vendor || null;
                const variants = productData.variants || [];

                // variantMappings is stored at product level: { [variantId]: businessSku }
                const variantMappings: Record<string, string> = productData.variantMappings || {};

                // Extract each variant
                for (const variant of variants) {
                    const variantId = variant.id;
                    const mappedBusinessSku = variantMappings[String(variantId)] || null;

                    // Apply mapping filter
                    if (mappingFilter === 'mapped' && !mappedBusinessSku) continue;
                    if (mappingFilter === 'unmapped' && mappedBusinessSku) continue;

                    // Apply search filter
                    if (searchQuery) {
                        const search = searchQuery.toLowerCase();
                        const titleMatch = productTitle.toLowerCase().includes(search);
                        const variantTitleMatch = variant.title?.toLowerCase().includes(search);
                        const skuMatch = variant.sku?.toLowerCase().includes(search);
                        const vendorMatch = vendor?.toLowerCase().includes(search);

                        if (!titleMatch && !variantTitleMatch && !skuMatch && !vendorMatch) continue;
                    }

                    allVariants.push({
                        variantId: variantId,
                        variantTitle: variant.title || 'Default Title',
                        variantSku: variant.sku || null,
                        productId: productId,
                        productTitle: productTitle,
                        vendor: vendor,
                        storeId: storeId,
                        mappedBusinessSku: mappedBusinessSku,
                        price: variant.price || null,
                        inventoryQuantity: variant.inventoryQuantity ?? null,
                    });
                }
            }
        }

        // Sort by product title, then variant title
        allVariants.sort((a, b) => {
            const productCompare = a.productTitle.localeCompare(b.productTitle);
            if (productCompare !== 0) return productCompare;
            return a.variantTitle.localeCompare(b.variantTitle);
        });

        // ============================================================
        // RETURN RESPONSE
        // ============================================================

        return NextResponse.json({
            variants: allVariants,
            stores: storesInfo,
            total: allVariants.length,
        });

    } catch (error: any) {
        console.error('Error fetching store variants:', error);
        return NextResponse.json(
            {
                error: 'Internal Server Error',
                message: error.message || 'An unexpected error occurred',
            },
            { status: 500 }
        );
    }
}