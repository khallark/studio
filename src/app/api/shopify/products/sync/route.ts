// src/app/api/shopify/products/sync/route.ts
//
// Syncs all products from a Shopify store to Firestore
// Payload: { businessId, store }
// Auth: Bearer token + authUserForBusinessAndStore

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { authUserForBusinessAndStore } from '@/lib/authoriseUser';

// ============================================================
// TYPES
// ============================================================

interface ShopifyProduct {
    id: number;
    title: string;
    handle: string;
    body_html: string | null;
    vendor: string | null;
    product_type: string | null;
    tags: string;
    status: 'active' | 'draft' | 'archived';
    published_at: string | null;
    published_scope: string | null;
    template_suffix: string | null;
    created_at: string;
    updated_at: string;
    variants: ShopifyVariant[];
    options: ShopifyOption[];
    images: ShopifyImage[];
    image: ShopifyImage | null;
}

interface ShopifyVariant {
    id: number;
    product_id: number;
    title: string;
    sku: string | null;
    barcode: string | null;
    price: string;
    compare_at_price: string | null;
    position: number;
    option1: string | null;
    option2: string | null;
    option3: string | null;
    weight: number;
    weight_unit: string;
    inventory_item_id: number;
    inventory_quantity: number;
    inventory_policy: string;
    inventory_management: string | null;
    fulfillment_service: string;
    requires_shipping: boolean;
    taxable: boolean;
    tax_code: string | null;
    grams: number;
    image_id: number | null;
    created_at: string;
    updated_at: string;
}

interface ShopifyOption {
    id: number;
    product_id: number;
    name: string;
    position: number;
    values: string[];
}

interface ShopifyImage {
    id: number;
    product_id: number;
    position: number;
    src: string;
    width: number;
    height: number;
    alt: string | null;
    variant_ids: number[];
    created_at: string;
    updated_at: string;
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Recursively removes undefined values from an object
 * Firestore doesn't accept undefined values
 */
function stripUndefined<T extends Record<string, any>>(obj: T): T {
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
        if (value === undefined) {
            result[key] = null; // Convert undefined to null
        } else if (Array.isArray(value)) {
            result[key] = value.map(item =>
                typeof item === 'object' && item !== null ? stripUndefined(item) : item
            );
        } else if (typeof value === 'object' && value !== null) {
            result[key] = stripUndefined(value);
        } else {
            result[key] = value;
        }
    }
    return result as T;
}

function extractProductSkus(variants: ShopifyVariant[]): string[] {
    if (!Array.isArray(variants) || variants.length === 0) {
        return [];
    }

    return variants
        .map((v) => v.sku)
        .filter((sku): sku is string => sku !== null && sku !== undefined && sku.trim().length > 0)
        .map((sku) => sku.trim());
}

function extractVariants(variants: ShopifyVariant[]): any[] {
    if (!Array.isArray(variants) || variants.length === 0) {
        return [];
    }

    return variants.map((v) => stripUndefined({
        id: v.id,
        productId: v.product_id,
        title: v.title || null,
        sku: v.sku || null,
        barcode: v.barcode || null,
        price: v.price ? parseFloat(v.price) : null,
        compareAtPrice: v.compare_at_price ? parseFloat(v.compare_at_price) : null,
        position: v.position || null,
        option1: v.option1 || null,
        option2: v.option2 || null,
        option3: v.option3 || null,
        weight: v.weight || null,
        weightUnit: v.weight_unit || null,
        inventoryItemId: v.inventory_item_id || null,
        inventoryQuantity: v.inventory_quantity ?? null,
        inventoryPolicy: v.inventory_policy || null,
        inventoryManagement: v.inventory_management || null,
        fulfillmentService: v.fulfillment_service || null,
        requiresShipping: v.requires_shipping ?? null,
        taxable: v.taxable ?? null,
        grams: v.grams || null,
        imageId: v.image_id || null,
        createdAt: v.created_at || null,
        updatedAt: v.updated_at || null,
    }));
}

function extractImages(images: ShopifyImage[]): any[] {
    if (!Array.isArray(images) || images.length === 0) {
        return [];
    }

    return images.map((img) => stripUndefined({
        id: img.id,
        productId: img.product_id,
        position: img.position,
        src: img.src,
        width: img.width,
        height: img.height,
        alt: img.alt || null,
        variantIds: img.variant_ids || [],
        createdAt: img.created_at || null,
        updatedAt: img.updated_at || null,
    }));
}

function extractOptions(options: ShopifyOption[]): any[] {
    if (!Array.isArray(options) || options.length === 0) {
        return [];
    }

    return options.map((opt) => stripUndefined({
        id: opt.id,
        productId: opt.product_id,
        name: opt.name,
        position: opt.position,
        values: opt.values || [],
    }));
}

function buildProductData(product: ShopifyProduct, storeId: string): { [key: string]: any } {
    const variants = extractVariants(product.variants || []);
    const skus = extractProductSkus(product.variants || []);
    const images = extractImages(product.images || []);
    const options = extractOptions(product.options || []);

    return stripUndefined({
        // Core identifiers
        productId: product.id,
        title: product.title || '',
        handle: product.handle || '',

        // Description & content
        bodyHtml: product.body_html || null,

        // Vendor & type
        vendor: product.vendor || null,
        productType: product.product_type || null,

        // Tags (as array)
        tags: product.tags
            ? typeof product.tags === 'string'
                ? product.tags.split(',').map((t: string) => t.trim()).filter(Boolean)
                : product.tags
            : [],

        // Status & visibility
        status: product.status || 'active',
        publishedAt: product.published_at || null,
        publishedScope: product.published_scope || null,

        // Template
        templateSuffix: product.template_suffix || null,

        // Variants data
        variants,
        variantCount: variants.length,
        skus,

        // Images
        images,
        featuredImage: product.image
            ? stripUndefined({
                id: product.image.id,
                src: product.image.src,
                width: product.image.width || null,
                height: product.image.height || null,
                alt: product.image.alt || null,
            })
            : null,

        // Options (Size, Color, etc.)
        options,

        // Timestamps from Shopify
        shopifyCreatedAt: product.created_at || null,
        shopifyUpdatedAt: product.updated_at || null,

        // Store reference
        storeId,

        // Sync metadata
        isDeleted: false,
        lastSyncedAt: FieldValue.serverTimestamp(),
        syncSource: 'manual',
    });
}

// ============================================================
// FETCH ALL PRODUCTS FROM SHOPIFY (with pagination)
// ============================================================

async function fetchAllProducts(
    shopDomain: string,
    accessToken: string
): Promise<{ products: ShopifyProduct[]; error?: string }> {
    const allProducts: ShopifyProduct[] = [];
    let nextPageUrl: string | null = `https://${shopDomain}/admin/api/2025-01/products.json?limit=250`;

    try {
        while (nextPageUrl) {
            const response: Response = await fetch(nextPageUrl, {
                method: 'GET',
                headers: {
                    'X-Shopify-Access-Token': accessToken,
                    'Content-Type': 'application/json',
                },
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`Shopify API error: ${response.status}`, errorText);
                return {
                    products: allProducts,
                    error: `Shopify API error: ${response.status}`,
                };
            }

            const data = await response.json();
            const products = data.products || [];
            allProducts.push(...products);

            console.log(`Fetched ${products.length} products (total: ${allProducts.length})`);

            // Check for next page via Link header
            const linkHeader = response.headers.get('Link');
            nextPageUrl = null;

            if (linkHeader) {
                const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
                if (nextMatch) {
                    nextPageUrl = nextMatch[1];
                }
            }
        }

        return { products: allProducts };
    } catch (error) {
        console.error('Error fetching products from Shopify:', error);
        return {
            products: allProducts,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
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
        const { businessId, store } = body;

        if (!businessId || !store) {
            return NextResponse.json(
                { error: 'Missing required fields', message: 'businessId and store are required' },
                { status: 400 }
            );
        }

        // ============================================================
        // AUTHORIZATION
        // ============================================================

        const authResult = await authUserForBusinessAndStore({
            businessId,
            shop: store,
            req,
        });

        if (!authResult.authorised) {
            return NextResponse.json(
                { error: 'Unauthorized', message: authResult.error },
                { status: authResult.status || 403 }
            );
        }

        // ============================================================
        // GET ACCESS TOKEN
        // ============================================================

        const shopData = authResult.shopDoc?.data();
        const accessToken = shopData?.accessToken;

        if (!accessToken) {
            return NextResponse.json(
                { error: 'Configuration Error', message: 'Store access token not found' },
                { status: 500 }
            );
        }

        // ============================================================
        // FETCH PRODUCTS FROM SHOPIFY
        // ============================================================

        console.log(`🔄 Starting product sync for ${store}...`);

        const { products, error: fetchError } = await fetchAllProducts(store, accessToken);

        if (fetchError && products.length === 0) {
            return NextResponse.json(
                { error: 'Shopify API Error', message: fetchError },
                { status: 502 }
            );
        }

        console.log(`📦 Fetched ${products.length} products from Shopify`);

        // ============================================================
        // SYNC TO FIRESTORE
        // ============================================================

        const productsRef = db.collection('accounts').doc(store).collection('products');

        // Get existing product IDs to detect deletions
        const existingSnapshot = await productsRef.where('isDeleted', '==', false).get();
        const existingProductIds = new Set(existingSnapshot.docs.map((doc) => doc.id));
        const shopifyProductIds = new Set(products.map((p) => String(p.id)));

        let created = 0;
        let updated = 0;
        let deleted = 0;
        let errors = 0;

        // Process products in batches of 500 (Firestore limit)
        const BATCH_SIZE = 500;

        for (let i = 0; i < products.length; i += BATCH_SIZE) {
            const batch = db.batch();
            const batchProducts = products.slice(i, i + BATCH_SIZE);

            for (const product of batchProducts) {
                try {
                    const productId = String(product.id);
                    const productRef = productsRef.doc(productId);
                    const productData = buildProductData(product, store);

                    if (existingProductIds.has(productId)) {
                        // Update existing
                        batch.update(productRef, {
                            ...productData,
                            updatedBySync: true,
                        });
                        updated++;
                    } else {
                        // Create new
                        batch.set(productRef, {
                            ...productData,
                            createdBySync: true,
                            firestoreCreatedAt: FieldValue.serverTimestamp(),
                        });
                        created++;
                    }
                } catch (err) {
                    console.error(`Error processing product ${product.id}:`, err);
                    errors++;
                }
            }

            await batch.commit();
            console.log(`Committed batch ${Math.floor(i / BATCH_SIZE) + 1}`);
        }

        // Soft-delete products that no longer exist in Shopify
        const productsToDelete = [...existingProductIds].filter((id) => !shopifyProductIds.has(id));

        if (productsToDelete.length > 0) {
            for (let i = 0; i < productsToDelete.length; i += BATCH_SIZE) {
                const batch = db.batch();
                const batchIds = productsToDelete.slice(i, i + BATCH_SIZE);

                for (const productId of batchIds) {
                    const productRef = productsRef.doc(productId);
                    batch.update(productRef, {
                        isDeleted: true,
                        deletedAt: FieldValue.serverTimestamp(),
                        deletedBySync: true,
                    });
                    deleted++;
                }

                await batch.commit();
            }
        }

        // ============================================================
        // LOG SYNC OPERATION
        // ============================================================

        await db.collection('accounts').doc(store).collection('logs').add({
            type: 'SYNC',
            action: 'PRODUCTS_SYNC',
            timestamp: FieldValue.serverTimestamp(),
            performedBy: authResult.userId,
            stats: {
                total: products.length,
                created,
                updated,
                deleted,
                errors,
            },
            source: 'manual',
        });

        // ============================================================
        // RETURN RESPONSE
        // ============================================================

        console.log(`✅ Sync complete: ${created} created, ${updated} updated, ${deleted} deleted, ${errors} errors`);

        return NextResponse.json({
            success: true,
            message: 'Products synced successfully',
            store,
            stats: {
                total: products.length,
                created,
                updated,
                deleted,
                errors,
            },
            warning: fetchError || undefined,
        });
    } catch (error: any) {
        console.error('Product sync error:', error);
        return NextResponse.json(
            {
                error: 'Internal Server Error',
                message: error.message || 'An unexpected error occurred',
            },
            { status: 500 }
        );
    }
}