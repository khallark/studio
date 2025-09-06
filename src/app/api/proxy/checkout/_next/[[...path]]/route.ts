// src/app/api/proxy/checkout/_next/[[...path]]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { verifyAppProxySignature } from "@/lib/verifyAppProxy";

const APP_SECRET = process.env.SHOPIFY_API_SECRET!;
const APP_ORIGIN = process.env.APP_ORIGIN || "https://studio-rose-three.vercel.app";

async function fetchAsset(url: string) {
  // 1) fetch and absorb one redirect
  let resp = await fetch(url, { redirect: "manual" });
  if (resp.status >= 300 && resp.status < 400) {
    const loc = resp.headers.get("location");
    if (!loc) return new NextResponse("redirect w/o location", { status: 502 });
    const absolute = loc.startsWith("http") ? loc : `${APP_ORIGIN}${loc.startsWith("/") ? "" : "/"}${loc}`;
    resp = await fetch(absolute, { redirect: "manual" });
  }
  if (!resp.ok) {
    return new NextResponse("asset upstream error", { status: 502 });
  }

  // 2) build safe headers
  const outHeaders = new Headers();
  const ct = resp.headers.get("content-type") ?? "";
  if (ct) outHeaders.set("Content-Type", ct);
  // long cache for hashed Next assets
  outHeaders.set("Cache-Control", "public, max-age=31536000, immutable");

  // never forward hop-by-hop / redirecting headers
  // (Location, Set-Cookie, Transfer-Encoding, etc.)

  const body = resp.body; // stream through
  return new NextResponse(body, { status: 200, headers: outHeaders });
}

export async function GET(req: NextRequest, { params }: { params: { path?: string[] } }) {
  if (!verifyAppProxySignature(req.url, APP_SECRET)) {
    return new NextResponse("bad signature", { status: 401 });
  }
  const target = (params.path || []).join("/");
  return fetchAsset(`${APP_ORIGIN}/_next/${target}`);
}

export async function HEAD(req: NextRequest, ctx: any) {
  // Optional: mirror GET without body for HEAD requests
  const res = await GET(req, ctx);
  return new NextResponse(null, { status: res.status, headers: res.headers });
}
