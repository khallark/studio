// src/app/api/proxy/checkout/route.ts
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { verifyAppProxySignature } from "@/lib/verifyAppProxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const APP_SECRET = process.env.SHOPIFY_API_SECRET || "";
// Your app’s public origin where /checkout is served:
const APP_ORIGIN = process.env.APP_ORIGIN || "https://studio-rose-three.vercel.app";
const SOURCE_PATH = "/checkout";

/** Make sure all absolute-root asset URLs go through the proxy on the store domain */
function rewriteAssetUrls(html: string) {
  // Next build assets: /_next/* → /apps/checkout/_next/*
  html = html.replace(/(\b(?:href|src)=["'])\/_next\//g, `$1/apps/checkout/_next/`);

  // Common public assets (favicon/images/css/js/fonts) → /apps/checkout/public/*
  html = html.replace(
    /(\b(?:href|src)=["'])\/(favicon\.ico|apple-touch-icon\.png|site\.webmanifest|robots\.txt|humans\.txt|[^"']+\.(?:png|jpg|jpeg|gif|svg|webp|css|js|woff2?|ttf|eot))(["'])/g,
    `$1/apps/checkout/public/$2$3`
  );

  // Ensure relative links resolve under /apps/checkout
  if (/<head[^>]*>/i.test(html)) {
    // remove an existing <base> to avoid conflicts
    html = html.replace(/<base\b[^>]*>/i, "");
    html = html.replace(
      /<head([^>]*)>/i,
      `<head$1><base href="/apps/checkout/">`
    );
  }
  return html;
}

export async function GET(req: NextRequest) {
  if (!APP_SECRET) {
    console.error("SHOPIFY_API_SECRET missing");
    return new NextResponse("server config error", { status: 500 });
  }
  if (!verifyAppProxySignature(req.url, APP_SECRET)) {
    return new NextResponse("bad signature", { status: 401 });
  }

  const upstreamUrl = `${APP_ORIGIN}${SOURCE_PATH}`;

  let upstream: Response;
  try {
    // fetch your SSR/HTML; let fetch follow redirects and give us the final HTML
    upstream = await fetch(upstreamUrl, {
      headers: { Accept: "text/html" },
      redirect: "follow",
      // Do NOT forward store cookies; this is server→server to your own app
    });
  } catch (e) {
    console.error("fetch upstream failed:", e);
    return new NextResponse("upstream error", { status: 502 });
  }

  if (!upstream.ok) {
    const peek = await upstream.text().catch(() => "");
    console.error("upstream non-200:", upstream.status, peek.slice(0, 500));
    return new NextResponse("upstream error", { status: 502 });
  }

  let html = await upstream.text();
  html = rewriteAssetUrls(html);

  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
