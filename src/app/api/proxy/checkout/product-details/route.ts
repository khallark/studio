// app/api/proxy/checkout/product-details/route.ts
import { NextRequest, NextResponse } from "next/server";
import { verifyAppProxySignature } from "@/lib/verifyAppProxy";
import { db } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const APP_SECRET  = process.env.SHOPIFY_API_SECRET || "";
const API_VERSION = process.env.SHOPIFY_API_VERSION || "2025-07";

// helpers
const ok  = (data: unknown, status = 200) =>
  NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
const err = (m: string, status = 400) => ok({ error: m }, status);
const toGID = (vid: string | number) => `gid://shopify/ProductVariant/${String(vid)}`;
const uniq = <T,>(a: T[]) => Array.from(new Set(a));
const chunk = <T,>(a: T[], n: number) =>
  Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, (i + 1) * n));

type SessionDoc = {
  shopDomain?: string;
  draftOrderId?: string;
  expiresAt?: { toMillis?: () => number };
  status?: string;
  customerPhone?: string | null;
  products?: any[];
  productVariantIds?: string[];
};

type CustomerDoc = {
  phone?: string | null;
  customer_details?: any[] | null;
};

// because doc id == phone
async function loadCustomerByPhone(phone: string | null | undefined) {
  if (!phone) {
    return { phone: null, details: [] };
  }
  const snap = await db.collection("checkout_customers").doc(phone).get();
  if (!snap.exists) {
    return { phone, details: [] };
  }
  const c = (snap.data() || {}) as CustomerDoc;
  return {
    phone: c.phone ?? phone ?? null,
    details: c.customer_details || [],
  };
}

export async function POST(req: NextRequest) {
  try {
    if (!APP_SECRET) return err("server config error", 500);
    if (!verifyAppProxySignature(req.url, APP_SECRET)) return err("bad signature", 401);

    const body = await req.json().catch(() => ({} as any));
    const sessionId = String(body?.sessionId || "");
    if (!sessionId) return err("missing sessionId", 400);

    // --- 1) Load session ---
    const sessRef = db.collection("checkout_sessions").doc(sessionId);
    const sessSnap = await sessRef.get();
    if (!sessSnap.exists) return err("session not found", 404);

    const s = (sessSnap.data() || {}) as SessionDoc;

    const shopDomain   = s?.shopDomain || "";
    const draftOrderId = s?.draftOrderId || "";
    if (!shopDomain || !draftOrderId) return err("session missing shopDomain or draftOrderId", 422);
    const expMs = s?.expiresAt?.toMillis?.();
    if (expMs && expMs <= Date.now()) return err("session expired", 410);
    if (s?.status && s.status !== "phone_verified") return err("session not verified", 403);

    // Load customer via phone-based doc id
    const customer = await loadCustomerByPhone(s.customerPhone ?? null);

    // If products cached, return immediately
    if (Array.isArray(s.products) && s.products.length > 0) {
      return ok({ ok: true, customer, products: s.products });
    }

    // --- 2) Fetch from Shopify (no cached products) ---
    const accountSnap = await db.collection("accounts").doc(shopDomain).get();
    if (!accountSnap.exists) return err("account not found", 404);
    const account = accountSnap.data() || {};
    const accessToken: string =
      account.accessToken || account.access_token || account.adminAccessToken || "";
    if (!accessToken) return err("shop access token missing", 500);

    const draftSnap = await db
      .collection("accounts").doc(shopDomain)
      .collection("draft_orders").doc(draftOrderId)
      .get();
    if (!draftSnap.exists) return err("draft order not found", 404);
    const draft = draftSnap.data() as any;

    type DraftLineItem = { variant_id?: string | number; quantity?: number };
    const lineItems: DraftLineItem[] =
      (draft?.line_items as DraftLineItem[] | undefined) ??
      ((draft?.draft_order?.line_items as DraftLineItem[]) ?? []);

    const variantIds: string[] = uniq(
      lineItems
        .map(li => li?.variant_id)
        .filter((v): v is string | number => v != null && String(v).trim() !== "")
        .map(v => String(v))
    );

    if (variantIds.length === 0) {
      await sessRef.set(
        {
          products: [],
          productVariantIds: [],
          productsFetchedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      return ok({ ok: true, customer, products: [] });
    }

    const variantGids = variantIds.map(toGID);

    const query = /* GraphQL */ `
      query VariantNodes($ids: [ID!]!) {
        nodes(ids: $ids) {
          ... on ProductVariant {
            __typename
            id
            legacyResourceId
            title
            sku
            barcode
            price
            compareAtPrice
            unitPrice { amount currencyCode }
            unitPriceMeasurement {
              measuredType
              quantityUnit
              quantityValue
              referenceUnit
              referenceValue
            }
            selectedOptions { name value }
            image { url altText }
            inventoryItem {
              measurement {
                weight { value unit }
              }
            }
            product {
              id
              legacyResourceId
              handle
              title
              vendor
              productType
              status
              tags
              featuredImage { url altText }
              onlineStoreUrl
            }
          }
          ... on Node { id }
        }
      }
    `;

    const chunks = chunk(variantGids, 60);
    const nodes: any[] = [];

    for (const ids of chunks) {
      const resp = await fetch(`https://${shopDomain}/admin/api/${API_VERSION}/graphql.json`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": accessToken,
        },
        body: JSON.stringify({ query, variables: { ids } }),
      });
      if (!resp.ok) {
        const peek = await resp.text().catch(() => "");
        return err(`shopify graphql ${resp.status}: ${peek.slice(0, 400)}`, 502);
      }
      const json = await resp.json();
      if (json?.errors) return err(`[product-details] shopify graphql errors ${JSON.stringify(json.errors)}`, 502);
      nodes.push(...(json?.data?.nodes || []));
    }

    const variants = nodes
      .filter((n) => n && n.__typename === "ProductVariant")
      .map((v: any) => ({
        id: v.id,
        legacyId: v.legacyResourceId,
        title: v.title,
        sku: v.sku ?? null,
        barcode: v.barcode ?? null,
        price: v.price ?? null,
        compareAtPrice: v.compareAtPrice ?? null,
        unitPrice: v.unitPrice ?? null,
        unitPriceMeasurement: v.unitPriceMeasurement ?? null,
        options: v.selectedOptions || [],
        image: v.image ? { url: v.image.url, alt: v.image.altText || null } : null,
        weight: v?.inventoryItem?.measurement?.weight
          ? { value: v.inventoryItem.measurement.weight.value, unit: v.inventoryItem.measurement.weight.unit }
          : null,
        product: v.product
          ? {
              id: v.product.id,
              legacyId: v.product.legacyResourceId,
              handle: v.product.handle,
              title: v.product.title,
              vendor: v.product.vendor,
              productType: v.product.productType,
              status: v.product.status,
              tags: v.product.tags,
              featuredImage: v.product.featuredImage
                ? { url: v.product.featuredImage.url, alt: v.product.featuredImage.altText || null }
                : null,
              onlineStoreUrl: v.product.onlineStoreUrl || null,
            }
          : null,
      }));

    await sessRef.set(
      {
        products: variants,
        productVariantIds: variantIds,
        productsFetchedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return ok({ ok: true, customer, products: variants });
  } catch (e) {
    console.error("product-details error:", e);
    return err("internal server error", 500);
  }
}
