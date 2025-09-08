import { NextRequest, NextResponse } from "next/server";
import { verifyAppProxySignature } from "@/lib/verifyAppProxy";
import { db } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const APP_SECRET  = process.env.SHOPIFY_API_SECRET || "";
const API_VERSION = process.env.SHOPIFY_API_VERSION || "2025-07";

const ok  = (data: unknown, status = 200) =>
  NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
const err = (m: string, status = 400) => ok({ error: m }, status);

type DraftLineItem = { variant_id?: string | number; quantity?: number; properties?: any };

export async function POST(req: NextRequest) {
  try {
    // 0) Proxy verification (same pattern as your other routes)
    if (!APP_SECRET || APP_SECRET.length < 16) return err("server config error", 500);
    if (!verifyAppProxySignature(req.url, APP_SECRET)) return err("bad signature", 401);

    // 1) Body
    const body = await req.json().catch(() => ({} as any));
    const sessionId = String(body?.sessionId || "");
    // Optional overrides (win over stored values if present)
    const override = {
      first_name:    body?.first_name    as string | undefined,
      last_name:    body?.last_name    as string | undefined,
      email:   body?.email   as string | undefined,
      phone:   body?.phone   as string | undefined,
      address: body?.address as string | undefined,
    };
    if (!sessionId) return err("missing sessionId", 400);

    // 2) Load & validate session
    const sessRef  = db.collection("checkout_sessions").doc(sessionId);
    const sessSnap = await sessRef.get();
    if (!sessSnap.exists) return err("session not found", 404);

    const s = (sessSnap.data() || {}) as {
      shopDomain?: string;
      draftOrderId?: string;
      expiresAt?: { toMillis?: () => number };
      status?: string;
      customerPhone?: string | null;
      // order fields for idempotency
      orderId?: number | string | null;
      orderName?: string | null;
      orderNumber?: number | null;
      orderStatusUrl?: string | null;
    };

    const shopDomain   = s.shopDomain   || "";
    const draftOrderId = s.draftOrderId || "";
    if (!shopDomain || !draftOrderId) return err("session missing shopDomain or draftOrderId", 422);

    const expMs = s.expiresAt?.toMillis?.();
    if (expMs && expMs <= Date.now()) return err("session expired", 410);
    if (s.status && s.status !== "phone_verified") return err("session not verified", 403);

    // Idempotent return if already created
    if (s.orderId) {
      return ok({
        ok: true,
        order: {
          id: s.orderId,
          name: s.orderName ?? null,
          number: s.orderNumber ?? null,
          statusUrl: s.orderStatusUrl ?? null,
        },
      });
    }

    // 3) Admin token
    const accountSnap = await db.collection("accounts").doc(shopDomain).get();
    if (!accountSnap.exists) return err("account not found", 404);
    const account = accountSnap.data() || {};
    const accessToken: string =
      account.accessToken || account.access_token || account.adminAccessToken || "";
    if (!accessToken) return err("shop access token missing", 500);

    // 4) Draft order doc (yours)
    const draftSnap = await db
      .collection("accounts").doc(shopDomain)
      .collection("draft_orders").doc(draftOrderId)
      .get();
    if (!draftSnap.exists) return err("draft order not found", 404);
    const draft = draftSnap.data() as any;

    const lineItems: DraftLineItem[] =
      (draft?.line_items as DraftLineItem[] | undefined) ??
      ((draft?.draft_order?.line_items as DraftLineItem[]) ?? []);

    const note: string | undefined =
      (draft?.draft_order?.note as string | undefined) ??
      (draft?.note as string | undefined) ??
      undefined;

    if (!Array.isArray(lineItems) || lineItems.length === 0) {
      return err("no line items to order", 422);
    }

    // 5) Customer profile from checkout_customers/{phone}
    // phone precedence: body override -> session.customerPhone
    const phoneFromSession = s.customerPhone ?? undefined;
    const phone = override.phone ?? phoneFromSession;
    if (!phone) return err("customer phone missing", 422);

    const custRef  = db.collection("checkout_customers").doc(phone);
    const custSnap = await custRef.get();
    const cust = (custSnap.exists ? custSnap.data() : {}) as {
      first_name?: string | null;
      last_name?: string | null;
      email?: string | null;
      address?: string | null;
      phone?: string | null;
    };

    // Final customer values (override > profile > session fallback)
    const first_name = override.first_name ?? (cust?.first_name ?? undefined);
    const last_name = override.last_name ?? (cust?.last_name ?? undefined);
    const email   = override.email   ?? (cust?.email  ?? undefined);
    const address = override.address ?? (cust?.address ?? undefined);
    const finalPhone = phone; // already chosen above

    const firstName = (first_name ?? "").trim() || undefined;
    const lastName  = (last_name  ?? "").trim()  || undefined;

    const fullName = [firstName, lastName].filter(Boolean).join(" ") || undefined;

    const shipping_address = (address && String(address).trim())
      ? {
          address1: String(address).trim(),
          name: fullName,
          first_name: firstName,
          last_name:  lastName,
          phone: finalPhone || undefined,
        }
      : undefined;
      
      console.log(address, String(address).trim(), shipping_address, fullName, firstName, lastName, finalPhone);

    // 6) Build order payload (COD via pending financial_status)
    const orderPayload = {
      order: {
        line_items: lineItems
          .filter(li => li?.variant_id && (li?.quantity ?? 0) > 0)
          .map(li => ({
            variant_id: Number(li.variant_id),
            quantity: Number(li.quantity ?? 1),
            properties: li.properties ?? undefined,
          })),

        // EITHER use customer.id, OR omit this entire block to avoid phone duplication
        // customer: { id: existingCustomerId },

        financial_status: "pending",
        payment_gateway_names: ["Cash on Delivery"], // optional but nice

        // Prefer top-level email/phone to avoid new-customer creation attempts
        email: email || undefined,
        phone: finalPhone || undefined,

        // Provide a proper shipping address if you have it
        shipping_address: shipping_address /* include city, country, zip if available */,

        note: note || undefined,
        tags: "storefront-checkout,cod,sample-order,do-not-process",
      },
    };


    // 7) Create order (Admin REST)
    // const resp = await fetch(`https://${shopDomain}/admin/api/${API_VERSION}/orders.json`, {
    //   method: "POST",
    //   headers: {
    //     "Content-Type": "application/json",
    //     "X-Shopify-Access-Token": accessToken,
    //     "X-Request-Id": `cod-${sessionId}`, // idempotency against retries
    //   },
    //   body: JSON.stringify(orderPayload),
    // });

    // if (!resp.ok) {
    //   // const peek = await resp.text().catch(() => "");
    //   // return err(`shopify orders ${resp.status}: ${peek.slice(0, 400)}`, 502);
    //   const text = await resp.text().catch(() => "");
    //   console.error("Shopify order creation error:", resp.status, text);
    //   return err(`shopify orders ${resp.status}: ${text.slice(0, 400)}`, 502);
    // }

    // const json = await resp.json().catch(() => ({} as any));
    const json = { order: {id: null, name: null, order_number: null, order_status_url: null} };
    const order = json?.order;
    if (!order?.id) return err("shopify order create returned no order id", 502);

    // 8) Persist order info back to the session
    await sessRef.set(
      {
        orderId: order.id,
        orderName: order.name ?? null,
        orderNumber: order.order_number ?? null,
        orderStatusUrl: order.order_status_url ?? null,
        status: "order_created",
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    // 9) Respond
    return ok({
      ok: true,
      order: {
        id: order.id,
        name: order.name ?? null,
        number: order.order_number ?? null,
        statusUrl: order.order_status_url ?? null,
      },
    });
  } catch (e) {
    console.error("[order-create-cod] error", e);
    return err("internal server error", 500);
  }
}
