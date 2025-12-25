// lib/shopify/product-utils.ts

import { FieldValue } from 'firebase-admin/firestore';

/**
 * Recursively converts undefined to null for Firestore compatibility
 */
export function stripUndefined<T extends Record<string, any>>(obj: T): T {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) {
      result[key] = null;
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

export function extractVariants(variants: any[]): any[] {
  if (!Array.isArray(variants) || variants.length === 0) {
    return [];
  }

  return variants.map((v: any) => stripUndefined({
    id: v.id,
    productId: v.product_id,
    title: v.title || null,
    sku: v.sku || null,
    barcode: v.barcode || null,
    price: v.price ? parseFloat(v.price) : null,
    compareAtPrice: v.compare_at_price ? parseFloat(v.compare_at_price) : null,
    position: v.position ?? null,
    option1: v.option1 || null,
    option2: v.option2 || null,
    option3: v.option3 || null,
    weight: v.weight ?? null,
    weightUnit: v.weight_unit || null,
    inventoryItemId: v.inventory_item_id ?? null,
    inventoryQuantity: v.inventory_quantity ?? null,
    inventoryPolicy: v.inventory_policy || null,
    inventoryManagement: v.inventory_management || null,
    fulfillmentService: v.fulfillment_service || null,
    requiresShipping: v.requires_shipping ?? null,
    taxable: v.taxable ?? null,
    taxCode: v.tax_code || null,  // ← Was missing in sync!
    grams: v.grams ?? null,
    imageId: v.image_id ?? null,
    createdAt: v.created_at || null,
    updatedAt: v.updated_at || null,
  }));
}

export function extractImages(images: any[]): any[] {
  if (!Array.isArray(images) || images.length === 0) {
    return [];
  }

  return images.map((img: any) => stripUndefined({
    id: img.id,
    productId: img.product_id ?? null,
    position: img.position ?? null,
    src: img.src || null,
    width: img.width ?? null,
    height: img.height ?? null,
    alt: img.alt || null,
    variantIds: img.variant_ids || [],
    createdAt: img.created_at || null,
    updatedAt: img.updated_at || null,
  }));
}

export function extractOptions(options: any[]): any[] {
  if (!Array.isArray(options) || options.length === 0) {
    return [];
  }

  return options.map((opt: any) => stripUndefined({
    id: opt.id,
    productId: opt.product_id ?? null,
    name: opt.name || null,
    position: opt.position ?? null,
    values: opt.values || [],
  }));
}

export function extractProductSkus(variants: any[]): string[] {
  if (!Array.isArray(variants) || variants.length === 0) {
    return [];
  }

  return variants
    .map((v: any) => v.sku)
    .filter((sku: any) => sku && typeof sku === 'string' && sku.trim().length > 0)
    .map((sku: string) => sku.trim());
}

/**
 * Builds product data for Firestore
 * @param product - Raw Shopify product data
 * @param storeId - Shop domain
 * @param source - 'webhook' | 'sync'
 * @param topic - Webhook topic (only for webhook source)
 */
export function buildProductData(
  product: any,
  storeId: string,
  source: 'webhook' | 'sync',
  topic?: string
): Record<string, any> {
  const variants = extractVariants(product.variants || []);
  const skus = extractProductSkus(product.variants || []);
  const images = extractImages(product.images || []);
  const options = extractOptions(product.options || []);

  const baseData = stripUndefined({
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

    // SEO
    metafieldsGlobalTitleTag: product.metafields_global_title_tag || null,
    metafieldsGlobalDescriptionTag: product.metafields_global_description_tag || null,

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
          width: product.image.width ?? null,
          height: product.image.height ?? null,
          alt: product.image.alt || null,
        })
      : null,

    // Options
    options,

    // Timestamps from Shopify
    shopifyCreatedAt: product.created_at || null,
    shopifyUpdatedAt: product.updated_at || null,

    // Store reference
    storeId,
  });

  // Add source-specific fields
  if (source === 'webhook') {
    return {
      ...baseData,
      lastWebhookTopic: topic,
      receivedAt: FieldValue.serverTimestamp(),
    };
  } else {
    return {
      ...baseData,
      lastSyncedAt: FieldValue.serverTimestamp(),
      syncSource: 'manual',
    };
  }
}