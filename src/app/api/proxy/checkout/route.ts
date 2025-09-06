// src/app/api/proxy/checkout/route.ts
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { verifyAppProxySignature } from "@/lib/verifyAppProxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const APP_SECRET = process.env.SHOPIFY_API_SECRET || "";
const APP_ORIGIN = process.env.APP_ORIGIN || "https://studio-rose-three.vercel.app";
const SOURCE_PATH = "/checkout";

function rewriteAssetUrls(html: string) {
  html = html.replace(/(\b(?:href|src)=["'])\/_next\//g, `$1/apps/checkout/_next/`);
  html = html.replace(
    /(\b(?:href|src)=["'])\/(favicon\.ico|apple-touch-icon\.png|site\.webmanifest|robots\.txt|humans\.txt|[^"']+\.(?:png|jpg|jpeg|gif|svg|webp|css|js|woff2?|ttf|eot))(["'])/g,
    `$1/apps/checkout/public/$2$3`
  );
  // ensure relative links resolve under /apps/checkout
  html = html.replace(/<base\b[^>]*>/i, "");
  html = html.replace(/<head([^>]*)>/i, `<head$1><base href="/apps/checkout/">`);
  return html;
}

export async function GET(req: NextRequest) {
  if (!APP_SECRET) return new NextResponse("server config error", { status: 500 });
  if (!verifyAppProxySignature(req.url, APP_SECRET)) {
    return new NextResponse("bad signature", { status: 401 });
  }

  // 1) fetch upstream without passing redirects through
  let resp = await fetch(`${APP_ORIGIN}${SOURCE_PATH}`, {
    headers: { Accept: "text/html" },
    redirect: "manual",       // <-- do not auto-follow
  });

  // 2) follow a single redirect ourselves, if any
  if (resp.status >= 300 && resp.status < 400) {
    const loc = resp.headers.get("location");
    if (!loc) return new NextResponse("upstream redirect w/o location", { status: 502 });

    const absolute = loc.startsWith("http") ? loc : `${APP_ORIGIN}${loc.startsWith("/") ? "" : "/"}${loc}`;
    resp = await fetch(absolute, { headers: { Accept: "text/html" }, redirect: "manual" });
  }

  if (!resp.ok) {
    const peek = await resp.text().catch(() => "");
    console.error("upstream non-200:", resp.status, peek.slice(0, 400));
    return new NextResponse("upstream error", { status: 502 });
  }

  let html = await resp.text();
  html = rewriteAssetUrls(html);

  // 3) always return 200, never a redirect
  const out = new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
  // safety: strip any Location header that upstream might have left
  out.headers.delete("Location");
  return out;
}
