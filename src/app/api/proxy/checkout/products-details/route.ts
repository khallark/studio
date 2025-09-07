// app/api/proxy/checkout/product-details/route.ts
import { NextRequest, NextResponse } from "next/server";
import { verifyAppProxySignature } from "@/lib/verifyAppProxy";
import { db } from "@/lib/firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const APP_SECRET  = process.env.SHOPIFY_API_SECRET || "";
const API_VERSION = process.env.SHOPIFY_API_VERSION || "2025-07";

// ---------- utils ----------
const ok  = (data: unknown, status = 200) =>
  NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
const err = (m: string, status = 400) => ok({ error: m }, status);

const toGID = (variantId: string | number) =>
  `gid://shopify/ProductVariant/${String(variantId)}`;

function uniq<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// ---------- main ----------
export async function POST(req: NextRequest) {
  try {
    // 0) Proxy HMAC
    if (!APP_SECRET) return err("server config error", 500);
    if (!verifyAppProxySignature(req.url, APP_SECRET)) return err("bad signature", 401);

    // 1) Read body
    const body = await req.json().catch(() => ({} as any));
    const sessionId = String(body?.sessionId || "");
    if (!sessionId) return err("missing sessionId", 400);

    // 2) Load & validate session
    const sessSnap = await db.collection("checkout_sessions").doc(sessionId).get();
    if (!sessSnap.exists) return err("session not found", 404);

    const s = sessSnap.data() as {
      shopDomain: string;
      draftOrderId: string;
      expiresAt?: { toMillis?: () => number };
      status?: string;
    };

    const shopDomain = s?.shopDomain || "";
    const draftOrderId = s?.draftOrderId || "";
    if (!shopDomain || !draftOrderId) {
      return err("session missing shopDomain or draftOrderId", 422);
    }
    const expMs = s?.expiresAt?.toMillis?.();
    if (expMs && expMs <= Date.now()) return err("session expired", 410);
    // Optional: only allow after phone verification
    if (s?.status && s.status !== "phone_verified") {
      return err("session not verified", 403);
    }

    // 3) Read account for access token
    const accountSnap = await db.collection("accounts").doc(shopDomain).get();
    if (!accountSnap.exists) return err("account not found", 404);

    const account = accountSnap.data() || {};
    const accessToken: string =
      account.accessToken || account.access_token || account.adminAccessToken || "";
    if (!accessToken) return err("shop access token missing", 500);

    // 4) Read draft order doc under the account
    const draftSnap = await db
      .collection("accounts")
      .doc(shopDomain)
      .collection("draft_orders")
      .doc(draftOrderId)
      .get();

    if (!draftSnap.exists) return err("draft order not found", 404);

    const draft = draftSnap.data() as {
      draft_order?: {
        line_items?: Array<{
          variant_id?: string | number;
          quantity?: number;
        }>;
      };
      // cart_token, clientNonce, etc are present but not needed here
    };

    const lineItems = draft?.draft_order?.line_items || [];
    const variantIds = uniq(
      lineItems
        .map((li) => li?.variant_id)
        .filter((v): v is string | number => v != null && String(v).trim() !== "")
        .map((v) => String(v))
    );

    if (variantIds.length === 0) {
      return ok({ ok: true, variants: [], products: [] });
    }

    const variantGids = variantIds.map(toGID);

    // 5) Build GQL (one round-trip per chunk)
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
            price { amount currencyCode }
            compareAtPrice { amount currencyCode }
            selectedOptions { name value }
            image { url altText }
            weight
            weightUnit
            inventoryPolicy
            taxable
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

    // Shopify GraphQL comfortably handles ~50-100 ids per call. Use 60 to be safe.
    const chunks = chunk(variantGids, 60);

    const results: any[] = [];
    for (const ids of chunks) {
      const resp = await fetch(
        `https://${shopDomain}/admin/api/${API_VERSION}/graphql.json`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Shopify-Access-Token": accessToken,
          },
          body: JSON.stringify({ query, variables: { ids } }),
        }
      );

      if (!resp.ok) {
        const peek = await resp.text().catch(() => "");
        return err(`shopify graphql ${resp.status}: ${peek.slice(0, 400)}`, 502);
      }
      const json = await resp.json();
      if (json?.errors) {
        return err(`shopify graphql errors: ${JSON.stringify(json.errors).slice(0, 400)}`, 502);
      }
      results.push(...(json?.data?.nodes || []));
    }

    // 6) Normalize
    const variants = results
      .filter((n) => n && n.__typename === "ProductVariant")
      .map((v: any) => ({
        id: v.id,
        legacyId: v.legacyResourceId,
        title: v.title,
        sku: v.sku || null,
        barcode: v.barcode || null,
        price: v.price || null,           // { amount, currencyCode }
        compareAtPrice: v.compareAtPrice || null,
        selectedOptions: v.selectedOptions || [],
        image: v.image ? { url: v.image.url, alt: v.image.altText || null } : null,
        weight: v.weight ?? null,
        weightUnit: v.weightUnit ?? null,
        inventoryPolicy: v.inventoryPolicy ?? null,
        taxable: v.taxable ?? null,
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

    return ok({ ok: true, variants });
  } catch (e) {
    console.error("product-details error:", e);
    return err("internal server error", 500);
  }
}
