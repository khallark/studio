// src/app/api/proxy/checkout/_next/[[...path]]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { verifyAppProxySignature } from "@/lib/verifyAppProxy";

const APP_SECRET = process.env.SHOPIFY_API_SECRET!;

export async function GET(req: NextRequest, { params }: { params: { path?: string[] } }) {
  if (!verifyAppProxySignature(req.url, APP_SECRET)) {
    return new NextResponse("bad signature", { status: 401 });
  }

  const targetPath = (params.path || []).join("/");
  const upstreamUrl = `https://studio-rose-three.vercel.app/_next/${targetPath}`;

  const upstream = await fetch(upstreamUrl);
  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: upstream.headers,
  });
}
