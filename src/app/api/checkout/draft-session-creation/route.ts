
import { NextRequest, NextResponse } from "next/server";
import { db } from '@/lib/firebase-admin';
import { FieldValue } from "firebase-admin/firestore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_ORIGINS = new Set(["https://owr.life"]);

function corsHeaders(origin: string) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
    "Access-Control-Max-Age": "600",
  };
}
function resolveAllowedOrigin(req: NextRequest) {
  const origin = req.headers.get("origin") || "";
  return ALLOWED_ORIGINS.has(origin) ? origin : "";
}

export async function OPTIONS(req: NextRequest) {
  const origin = resolveAllowedOrigin(req);
  if (!origin) return new NextResponse(null, { status: 204 });
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
}

export async function POST(req: NextRequest) {
  const origin = resolveAllowedOrigin(req);
  if (!origin) {
    return NextResponse.json({ error: "origin not allowed" }, { status: 403 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400, headers: corsHeaders(origin) });
  }
  
  const { shop_domain, draft_order } = body;

  if (!shop_domain || !draft_order) {
      return NextResponse.json({ error: "shop_domain and draft_order are required" }, { status: 400, headers: corsHeaders(origin) });
  }

  try {
    const accountRef = db.collection('accounts').doc(shop_domain);
    const draftOrdersCollection = accountRef.collection('draft_orders');

    await draftOrdersCollection.add({
        ...draft_order,
        receivedAt: FieldValue.serverTimestamp()
    });

    return NextResponse.json(
      { ok: true, message: "Draft order saved successfully." },
      { status: 200, headers: corsHeaders(origin) }
    );

  } catch (error) {
    console.error("Error saving draft order:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
    return NextResponse.json(
        { error: "Failed to save draft order", details: errorMessage }, 
        { status: 500, headers: corsHeaders(origin) }
    );
  }
}
