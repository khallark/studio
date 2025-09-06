// app/api/proxy/checkout/session/route.ts
import { NextRequest, NextResponse } from "next/server";
import { verifyAppProxySignature as verify } from "@/lib/verifyAppProxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const APP_SECRET  = process.env.SHOPIFY_API_SECRET || "";
const APP_ORIGIN  = process.env.APP_ORIGIN || "https://studio-rose-three.vercel.app";
const SOURCE_PATH = "/checkout";
const PROXY_PREFIX = "/apps/checkout";

function escapeRe(s: string) {
  return s.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
}

function rewriteAssetUrls(html: string) {
  const ORIGIN = escapeRe(APP_ORIGIN);
  const PREFIX_NO_SLASH = escapeRe(PROXY_PREFIX.slice(1));

  // A) Absolute _next → proxied _next
  html = html.replace(
    new RegExp(`(\\b(?:href|src)=["'])${ORIGIN}?\\/_next\\/`, "g"),
    `$1${PROXY_PREFIX}/_next/`
  );

  // B) Root-relative _next → proxied _next
  html = html.replace(/(\b(?:href|src)=["'])\/_next\//g, `$1${PROXY_PREFIX}/_next/`);

  // C) Absolute "public-ish" assets at APP_ORIGIN but NOT _next
  html = html.replace(
    new RegExp(
      `(\\b(?:href|src)=["'])${ORIGIN}\\/((?!_next\\/)[^"']+\\.(?:png|jpe?g|gif|svg|webp|ico|css|js|woff2?|ttf|eot|webmanifest|txt))(["'])`,
      "g"
    ),
    `$1${PROXY_PREFIX}/public/$2$3`
  );

  // D) Root-relative "public-ish" assets but NOT _next and NOT already proxied
  html = html.replace(
    new RegExp(
      `(\\b(?:href|src)=["'])\\/(?!${PREFIX_NO_SLASH}\\/(?:_next|public)\\/)(?!_next\\/)([^"']+\\.(?:png|jpe?g|gif|svg|webp|ico|css|js|woff2?|ttf|eot|webmanifest|txt))(["'])`,
      "g"
    ),
    `$1${PROXY_PREFIX}/public/$2$3`
  );

  // E) Ensure links resolve under /apps/checkout/
  html = html.replace(/<base\b[^>]*>/i, "");
  html = html.replace(/<head([^>]*)>/i, `<head$1><base href="${PROXY_PREFIX}/">`);

  return html;
}

export async function POST(req: NextRequest) {
  if (!APP_SECRET) return new NextResponse("server config error", { status: 500 });
  if (!verify(req.url, APP_SECRET)) return new NextResponse("bad signature", { status: 401 });

  // read the form (sessionId + shopDomain)
  const form = await req.formData();
  const sessionId  = String(form.get("sessionId")  || "");
  const shopDomain = String(form.get("shopDomain") || "");

  // fetch upstream and absorb one redirect
  let resp = await fetch(`${APP_ORIGIN}${SOURCE_PATH}`, {
    headers: { Accept: "text/html" },
    redirect: "manual",
  });

  if (resp.status >= 300 && resp.status < 400) {
    const loc = resp.headers.get("location");
    if (!loc) return new NextResponse("upstream redirect w/o location", { status: 502 });
    const absolute = loc.startsWith("http") ? loc : `${APP_ORIGIN}${loc.startsWith("/") ? "" : "/"}${loc}`;
    resp = await fetch(absolute, { headers: { Accept: "text/html" }, redirect: "manual" });
  }

  if (!resp.ok) return new NextResponse("upstream error", { status: 502 });

  // rewrite HTML and inject boot data
  let html = await resp.text();
  html = rewriteAssetUrls(html);

  const boot = `<script>
    window.__CHECKOUT_SESSION__=${JSON.stringify({ id: sessionId, shop: shopDomain })};
    window.__APP_PROXY_PREFIX__=${JSON.stringify(PROXY_PREFIX)};
  </script>`;
  html = html.replace(/<\/head>/i, `${boot}</head>`);

  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
