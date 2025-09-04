
import { NextRequest, NextResponse } from "next/server";

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

  let draftOrder: any;
  try {
    draftOrder = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400, headers: corsHeaders(origin) });
  }

  // TODO: SECURITY — do not trust client prices. Recompute/validate here:
  // 1) For each line variant_id, fetch Admin or Storefront price
  // 2) Recalculate totals and compare to draftOrder.totals
  // 3) If OK, create Draft Order via Admin API

  return NextResponse.json(
    { ok: true, received: draftOrder },
    { status: 200, headers: corsHeaders(origin) }
  );
}
