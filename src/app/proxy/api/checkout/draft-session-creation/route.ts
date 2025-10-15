import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase-admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { verifyAppProxySignature } from "@/lib/verifyAppProxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const APP_SECRET = process.env.SHOPIFY_API_SECRET || "";

// Helper function to get CORS headers
function getCorsHeaders(origin: string | null): HeadersInit {
  const allowedOrigins = [
    'https://owr.life',
    'https://nfkjgp-sv.myshopify.com',
  ];

  if (origin && allowedOrigins.includes(origin)) {
    return {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Credentials': 'true',
    };
  }

  return {};
}

export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get('origin');
  
  return new NextResponse(null, {
    status: 204,
    headers: {
      ...getCorsHeaders(origin),
      'Access-Control-Max-Age': '86400',
    },
  });
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  if (!APP_SECRET || APP_SECRET.length < 16) {
    return NextResponse.json(
      { error: "server config error" },
      { status: 500, headers: corsHeaders }
    );
  }

  // Verify App Proxy signature
  if (!verifyAppProxySignature(req.url, APP_SECRET)) {
    return NextResponse.json(
      { error: "bad signature" },
      { status: 401, headers: corsHeaders }
    );
  }

  // Parse JSON body
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "invalid json" },
      { status: 400, headers: corsHeaders }
    );
  }

  const { shop_domain, draft_order, cart_token, clientNonce } = body || {};

  // Basic validation
  if (!shop_domain || !draft_order) {
    return NextResponse.json(
      { error: "shop_domain and draft_order are required" },
      { status: 400, headers: corsHeaders }
    );
  }

  try {
    // Persist draft order
    const accountRef = db.collection("accounts").doc(shop_domain);
    const draftOrdersCollection = accountRef.collection("draft_orders");

    const draftOrderRef = await draftOrdersCollection.add({
      ...draft_order,
      cartToken: cart_token || null,
      clientNonce: clientNonce || null,
      receivedAt: FieldValue.serverTimestamp(),
    });

    // Create checkout session
    const sessionExpiry = new Date(Date.now() + 60 * 60 * 1000);
    const sessionRef = await db.collection("checkout_sessions").add({
      customerPhone: null,
      shopDomain: shop_domain,
      draftOrderId: draftOrderRef.id,
      status: "pending",
      cartToken: cart_token || null,
      clientNonce: clientNonce || null,
      expiresAt: Timestamp.fromDate(sessionExpiry),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

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
      { status: 500, headers: corsHeaders }
    );
  }
}