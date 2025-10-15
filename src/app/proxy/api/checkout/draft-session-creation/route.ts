import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase-admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { verifyAppProxySignature } from "@/lib/verifyAppProxy";
import crypto from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** ---------- App Proxy HMAC verification ---------- */
const APP_SECRET = process.env.SHOPIFY_API_SECRET || "";

export async function POST(req: NextRequest) {
  const allowedOrigins = [
    'https://owr.life',
    'https://nfkjgp-sv.myshopify.com', // Your Shopify admin domain if needed
  ];

  const origin = req.headers.get('origin') || '';
  const corsHeaders = (allowedOrigins.includes(origin)
    ? {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Credentials': 'true',
      }
    : {}) as HeadersInit;

  if (!APP_SECRET || APP_SECRET.length < 16) {
    return NextResponse.json({ error: "server config error" }, { status: 500 });
  }
  // 0) Verify App Proxy signature (required for ALL proxy routes)
  if (!verifyAppProxySignature(req.url, APP_SECRET)) {
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }

  // 1) Parse JSON body
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const { shop_domain, draft_order, cart_token, clientNonce } = body || {};

  // 2) Basic validation
  if (!shop_domain || !draft_order) {
    return NextResponse.json(
      { error: "shop_domain and draft_order are required" },
      { status: 400 }
    );
  }

  // (Optional) cross-check with Shopify-provided 'shop' in query
  // const shopFromQuery = new URL(req.url).searchParams.get("shop");
  // if (shopFromQuery && shopFromQuery !== shop_domain) {
  //   return NextResponse.json({ error: "shop mismatch" }, { status: 400 });
  // }

  try {
    // 3) Persist draft order under the account
    const accountRef = db.collection("accounts").doc(shop_domain);
    const draftOrdersCollection = accountRef.collection("draft_orders");

    const draftOrderRef = await draftOrdersCollection.add({
      ...draft_order,
      // Optionally store storefront context for traceability
      cartToken: cart_token || null,
      clientNonce: clientNonce || null,
      receivedAt: FieldValue.serverTimestamp(),
    });

    // 4) Create checkout session (60 minutes)
    const sessionExpiry = new Date(Date.now() + 60 * 60 * 1000);
    const sessionRef = await db.collection("checkout_sessions").add({
      customerPhone: null,
      shopDomain: shop_domain,
      draftOrderId: draftOrderRef.id,
      status: "pending",
      // binders (if provided now, handy for later verification in send-otp/verify-otp)
      cartToken: cart_token || null,
      clientNonce: clientNonce || null,
      expiresAt: Timestamp.fromDate(sessionExpiry),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    // 5) Return IDs (no cookies here; you’ll hand off via POST form or use localStorage)
    return NextResponse.json(
      {
        ok: true,
        message: "Draft order and checkout session created successfully.",
        sessionId: sessionRef.id,
        draftOrderId: draftOrderRef.id,
      },
      { status: 200, headers: corsHeaders }
    );
  } catch (error) {
    console.error("Error creating draft session:", error);
    const msg = error instanceof Error ? error.message : "unknown";
    return NextResponse.json(
      { error: "Failed to create draft session", details: msg },
      { status: 500 }
    );
  }
}

// (Optional) If Shopify sends an OPTIONS preflight (rare for proxy), answer minimally.
export async function OPTIONS(req: NextRequest) {
  if (!verifyAppProxySignature(req.url, APP_SECRET)) {
    return new NextResponse(null, { status: 401 });
  }
  return new NextResponse(null, { status: 204 });
}
