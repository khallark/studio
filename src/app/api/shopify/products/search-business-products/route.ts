// /api/shopify/products/search-business-products/route.ts
//
// Searches business products by name or SKU
// Payload: { businessId, query }
// Auth: Bearer token

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';
import { authUserForBusiness } from '@/lib/authoriseUser';

// ============================================================
// TYPES
// ============================================================

interface BusinessProduct {
    sku: string;
    name: string;
}

// ============================================================
// MAIN HANDLER
// ============================================================

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { businessId, query } : {
            businessId: string;
            query: string;
        } = body;

        if (!businessId) {
            return NextResponse.json(
                { error: 'Bad Request', message: 'businessId is required' },
                { status: 400 }
            );
        }

        if (!query || query.trim().length < 2) {
            return NextResponse.json(
                { error: 'Bad Request', message: 'Query must be at least 2 characters' },
                { status: 400 }
            );
        }

        // ============================================================
        // AUTHORIZATION
        // ============================================================

        const result = await authUserForBusiness({ businessId, req });

        if (!result.authorised) {
            return NextResponse.json(
                { error: 'Not authorised', message: result.error },
                { status: result.status }
            );
        }

        // ============================================================
        // PARSE REQUEST
        // ============================================================

        const searchTerm = query.trim().toLowerCase();

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

        // ============================================================
        // SEARCH PRODUCTS
        // ============================================================

        // Fetch all products (we'll filter in memory for flexible search)
        // For large catalogs, consider using Algolia or Elasticsearch
        const productsSnap = await db
            .collection('users')
            .doc(businessId)
            .collection('products')
            .limit(500) // Limit to prevent memory issues
            .get();

        const matchingProducts: BusinessProduct[] = [];

        for (const doc of productsSnap.docs) {
            const data = doc.data();
            const sku = (data.sku || doc.id).toLowerCase();
            const name = (data.name || '').toLowerCase();

            // Check if query matches SKU or name
            if (sku.includes(searchTerm) || name.includes(searchTerm)) {
                matchingProducts.push({
                    sku: data.sku || doc.id,
                    name: data.name || 'Unnamed Product',
                });
            }

            // Limit results to 20 for performance
            if (matchingProducts.length >= 20) break;
        }

        // Sort by relevance (exact SKU match first, then by name)
        matchingProducts.sort((a, b) => {
            const aSkuExact = a.sku.toLowerCase() === searchTerm;
            const bSkuExact = b.sku.toLowerCase() === searchTerm;

            if (aSkuExact && !bSkuExact) return -1;
            if (!aSkuExact && bSkuExact) return 1;

            const aSkuStarts = a.sku.toLowerCase().startsWith(searchTerm);
            const bSkuStarts = b.sku.toLowerCase().startsWith(searchTerm);

            if (aSkuStarts && !bSkuStarts) return -1;
            if (!aSkuStarts && bSkuStarts) return 1;

            return a.sku.localeCompare(b.sku);
        });

        // ============================================================
        // RETURN RESPONSE
        // ============================================================

        return NextResponse.json({
            products: matchingProducts,
            total: matchingProducts.length,
        });

    } catch (error: any) {
        console.error('Error searching business products:', error);
        return NextResponse.json(
            {
                error: 'Internal Server Error',
                message: error.message || 'An unexpected error occurred',
            },
            { status: 500 }
        );
    }
}