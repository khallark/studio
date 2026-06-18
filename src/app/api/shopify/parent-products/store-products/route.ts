// /api/shopify/parent-products/store-products/route.ts
//
// Fetches all store PRODUCTS for a business with optional filters, each tagged
// with its parent-product mapping status.
// Payload: { businessId, storeFilter?, mappingFilter?, searchQuery? }
// Auth: Bearer token

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';
import { authUserForBusiness, authUserForBusinessAndStore } from '@/lib/authoriseUser';

interface StoreProduct {
    productId: string;
    title: string;
    vendor: string | null;
    status: string | null;
    storeId: string;
    featuredImage: string | null;
    variantCount: number;
    mappedParentId: string | null;
}

interface StoreInfo {
    id: string;
    shopName: string;
}

export async function POST(req: NextRequest) {
    const body = await req.json();
    const { businessId, storeFilter, mappingFilter, searchQuery }: {
        businessId: string;
        storeFilter: string | null;
        mappingFilter: string | null;
        searchQuery: string | null;
    } = body;

    if (!businessId) {
        return NextResponse.json(
            { error: 'Bad Request', message: 'businessId is required' },
            { status: 400 }
        );
    }

    try {
        const result = (storeFilter && storeFilter.length && storeFilter !== 'all')
            ? await authUserForBusinessAndStore({ businessId, shop: storeFilter, req })
            : await authUserForBusiness({ businessId, req });

        if (!result.authorised) {
            return NextResponse.json(
                { error: 'Not authorised', message: result.error },
                { status: result.status }
            );
        }

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
            return NextResponse.json({ products: [], stores: [], total: 0, message: 'No stores linked' });
        }

        // Stores info (for the filter dropdown)
        const storesInfo: StoreInfo[] = [];
        for (const storeId of linkedStores) {
            const storeDoc = await db.collection('accounts').doc(storeId).get();
            if (storeDoc.exists) {
                storesInfo.push({ id: storeId, shopName: storeDoc.data()?.shopName || storeId });
            }
        }

        const storesToQuery = storeFilter && storeFilter !== 'all' ? [storeFilter] : linkedStores;
        const allProducts: StoreProduct[] = [];

        for (const storeId of storesToQuery) {
            const productsSnap = await db
                .collection('accounts')
                .doc(storeId)
                .collection('products')
                .where('isDeleted', '==', false)
                .get();

            for (const doc of productsSnap.docs) {
                const data = doc.data();
                const productId = doc.id;
                const title = data.title || 'Untitled Product';
                const vendor = data.vendor || null;
                const mappedParentId = data.parentMapping || null;

                // Mapping filter
                if (mappingFilter === 'mapped' && !mappedParentId) continue;
                if (mappingFilter === 'unmapped' && mappedParentId) continue;

                // Search filter (title / vendor / any variant sku)
                if (searchQuery) {
                    const search = searchQuery.toLowerCase();
                    const titleMatch = title.toLowerCase().includes(search);
                    const vendorMatch = vendor?.toLowerCase().includes(search);
                    const skuMatch = Array.isArray(data.skus)
                        ? data.skus.some((s: string) => s?.toLowerCase().includes(search))
                        : false;
                    if (!titleMatch && !vendorMatch && !skuMatch) continue;
                }

                allProducts.push({
                    productId,
                    title,
                    vendor,
                    status: data.status || null,
                    storeId,
                    featuredImage: data.featuredImage?.src || null,
                    variantCount: data.variantCount ?? (Array.isArray(data.variants) ? data.variants.length : 0),
                    mappedParentId,
                });
            }
        }

        allProducts.sort((a, b) => a.title.localeCompare(b.title));

        return NextResponse.json({ products: allProducts, stores: storesInfo, total: allProducts.length });
    } catch (error: any) {
        console.error('Error fetching store products:', error);
        return NextResponse.json(
            { error: 'Internal Server Error', message: error.message || 'An unexpected error occurred' },
            { status: 500 }
        );
    }
}