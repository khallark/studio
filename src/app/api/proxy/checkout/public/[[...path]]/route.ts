// (optional) src/app/api/proxy/checkout/public/[[...path]]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { verifyAppProxySignature } from "@/lib/verifyAppProxy";
const APP_SECRET = process.env.SHOPIFY_API_SECRET!;
const APP_ORIGIN = process.env.APP_ORIGIN || "https://studio-rose-three.vercel.app";

export async function GET(req: NextRequest, { params }: { params: { path?: string[] } }) {
  if (!verifyAppProxySignature(req.url, APP_SECRET)) return new NextResponse("bad signature", { status: 401 });
  const rel = (params.path || []).join("/");
  const upstream = await fetch(`${APP_ORIGIN}/${rel}`);
  return new NextResponse(upstream.body, { status: upstream.status, headers: upstream.headers });
}
