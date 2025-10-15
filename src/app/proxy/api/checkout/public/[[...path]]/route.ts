// src/app/api/proxy/checkout/public/[[...path]]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { verifyAppProxySignature } from "@/lib/verifyAppProxy";

const APP_SECRET = process.env.SHOPIFY_API_SECRET!;
const APP_ORIGIN = process.env.APP_ORIGIN || "https://majime.in";

async function fetchPublic(url: string) {
  let resp = await fetch(url, { redirect: "manual" });
  if (resp.status >= 300 && resp.status < 400) {
    const loc = resp.headers.get("location");
    if (!loc) return new NextResponse("redirect w/o location", { status: 502 });
    const absolute = loc.startsWith("http") ? loc : `${APP_ORIGIN}${loc.startsWith("/") ? "" : "/"}${loc}`;
    resp = await fetch(absolute, { redirect: "manual" });
  }
  if (!resp.ok) return new NextResponse("asset upstream error", { status: 502 });

  const outHeaders = new Headers();
  const ct = resp.headers.get("content-type") ?? "";
  if (ct) outHeaders.set("Content-Type", ct);
  // public assets may not be fingerprinted; be conservative
  outHeaders.set("Cache-Control", "public, max-age=3600");

  return new NextResponse(resp.body, { status: 200, headers: outHeaders });
}

export async function GET(req: NextRequest, { params }: { params: { path?: string[] } }) {
  if (!verifyAppProxySignature(req.url, APP_SECRET)) {
    return new NextResponse("bad signature", { status: 401 });
  }
  const rel = (params.path || []).join("/");
  return fetchPublic(`${APP_ORIGIN}/${rel}`);
}

export async function HEAD(req: NextRequest, ctx: any) {
  const res = await GET(req, ctx);
  return new NextResponse(null, { status: res.status, headers: res.headers });
}
