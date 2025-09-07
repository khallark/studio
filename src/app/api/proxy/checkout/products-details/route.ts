import { NextRequest, NextResponse } from "next/server";
import { verifyAppProxySignature } from "@/lib/verifyAppProxy";
import { db } from "@/lib/firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const APP_SECRET  = process.env.SHOPIFY_API_SECRET || "";
const API_VERSION = process.env.SHOPIFY_API_VERSION || "2025-07";

/* -------- utils -------- */
const ok  = (data: unknown, status = 200) =>
  NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });

const fail = (reason: string, status = 400, extra?: any) => {
  // Surface a compact reason to the client and log server-side context
  console.error("[product-details]", reason, extra ?? "");
  return ok({ error: reason }, status);
};

const toGID = (variantId: string | number) =>
  `gid://shopify/ProductVariant/${String(variantId)}`;

const uniq = <T,>(arr: T[]) => Array.from(new Set(arr));
const chunk = <T,>(arr: T[], size: number) => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

/* -------- handler -------- */
export async function POST(req: NextRequest) {
  try {
    // 0) App Proxy HMAC
    if (!APP_SECRET) return fail("server config error: APP_SECRET missing", 500);
    if (!verifyAppProxySignature(req.url, APP_SECRET)) return fail("bad signature", 401);

    // 1) Body
    const body = await req.json().catch(() => ({} as any));
    const sessionId = String(body?.sessionId || "");
    if (!sessionId) return fail("missing sessionId");

    // 2) Session
    const sessSnap = await db.collection("checkout_sessions").doc(sessionId).get();
    if (!sessSnap.exists) return fail("session not found", 404, { sessionId });

    const s = sessSnap.data() as {
      shopDomain: string;
      draftOrderId: string;
      expiresAt?: { toMillis?: () => number };
      status?: string;
    };

    const shopDomain = s?.shopDomain || "";
    const draftOrderId = s?.draftOrderId || "";
    if (!shopDomain || !draftOrderId) {
      return fail("session missing shopDomain or draftOrderId", 422, { shopDomain, draftOrderId });
    }

    const expMs = s?.expiresAt?.toMillis?.();
    if (expMs && expMs <= Date.now()) return fail("session expired", 410, { expMs });

    // Optional gate: only after phone verification
    if (s?.status && s.status !== "phone_verified") {
      return fail("session not verified", 403, { status: s.status });
    }

    // 3) Account / Admin token
    const accountSnap = await db.collection("accounts").doc(shopDomain).get();
    if (!accountSnap.exists) return fail("account not found", 404, { shopDomain });

    const account = accountSnap.data() || {};
    const accessToken: string =
      account.accessToken || account.access_token || account.adminAccessToken || "";
    if (!accessToken) return fail("shop access token missing", 500);

    // 4) Draft order doc (flattened: line_items at root)
    const draftSnap = await db
      .collection("accounts").doc(shopDomain)
      .collection("draft_orders").doc(draftOrderId)
      .get();

    if (!draftSnap.exists) return fail("draft order not found", 404, { shopDomain, draftOrderId });

    const draft = draftSnap.data() as {
      line_items?: Array<{ variant_id?: string | number; quantity?: number }>;
    };

    // strongly type the line items we expect
    type DraftLineItem = { variant_id?: string | number; quantity?: number };

    // prefer root line_items (your new shape)
    const lineItems: DraftLineItem[] =
    (draft?.line_items as DraftLineItem[] | undefined) ??
    ((draft as any)?.draft_order?.line_items as DraftLineItem[] | undefined) ??
    [];

    // narrow + normalize to strings
    const variantIds: string[] = uniq<string>(
    lineItems
        .map(li => li.variant_id)                                   // (string|number|undefined)[]
        .filter((v): v is string | number => v != null && String(v).trim() !== "")
        .map(v => String(v))                                        // string[]
    );

    // now this is happily typed
    const variantGids = variantIds.map(toGID);

    // 5) Shopify Admin GraphQL (batched)
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

    // Keep sequential to play nicely with GraphQL throttle; chunk size 60 is safe.
    const idsChunks = chunk(variantGids, 60);
    const nodes: any[] = [];

    for (const ids of idsChunks) {
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
        return fail(`shopify graphql ${resp.status}`, 502, { peek: peek.slice(0, 400) });
      }

      const json = await resp.json();
      if (json?.errors) {
        return fail("shopify graphql errors", 502, json.errors);
      }
      nodes.push(...(json?.data?.nodes || []));
    }

    // 6) Normalize
    const variants = nodes
      .filter(n => n && n.__typename === "ProductVariant")
      .map((v: any) => ({
        id: v.id,
        legacyId: v.legacyResourceId,
        title: v.title,
        sku: v.sku || null,
        barcode: v.barcode || null,
        price: v.price || null,               // { amount, currencyCode }
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
    console.error("[product-details] unhandled", e);
    return fail("internal server error", 500);
  }
}
