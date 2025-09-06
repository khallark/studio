// // app/api/proxy/checkout/start/route.ts
// import type { NextRequest } from "next/server";
// import { NextResponse } from "next/server";
// import { verifyAppProxySignature } from "@/lib/verifyAppProxy";
// import crypto from "crypto";

// const APP_SECRET = process.env.SHOPIFY_API_SECRET || "";

// export async function POST(req: NextRequest) {
//   if (!APP_SECRET || APP_SECRET.length < 16) return new NextResponse("server config error", { status: 500 });

//   // App Proxy always appends ?signature=... — verify it
//   if (!verifyAppProxySignature(req.url, APP_SECRET)) {
//     return new NextResponse("bad signature", { status: 401 });
//   }

//   const form = await req.formData();
//   const sessionId = form.get("sessionId");
//   const shopDomain = form.get("shopDomain"); // optional

//   if (typeof sessionId !== "string" || !sessionId) {
//     return new NextResponse("Bad Request", { status: 400 });
//   }

//   // This HTML runs under the *store* domain (because of the proxy)
//   // It writes localStorage and navigates to the embedded checkout URL
//   const html = `<!doctype html>
// <html>
// <head>
// <meta charset="utf-8">
// <meta http-equiv="Referrer-Policy" content="no-referrer">
// <title>Starting Checkout…</title>
// </head>
// <body>
// <script>
// try {
//   localStorage.setItem('checkout_session', ${JSON.stringify(sessionId)});
//   ${typeof shopDomain === "string" ? `localStorage.setItem('checkout_shop', ${JSON.stringify(shopDomain)});` : ""}
// } catch (e) {}
// // Prevent form resubmission on refresh
// location.replace('/apps/checkout');
// </script>
// </body>
// </html>`;

//   return new NextResponse(html, {
//     status: 200,
//     headers: { "Content-Type": "text/html; charset=utf-8" },
//   });
// }

// // Optional: reject GET on this endpoint
// export function GET() {
//   return new NextResponse("Use POST", { status: 405 });
// }
// app/api/proxy/checkout/session/route.ts
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const APP_SECRET  = process.env.SHOPIFY_API_SECRET || "";
const APP_ORIGIN  = process.env.APP_ORIGIN || "https://studio-rose-three.vercel.app";
const SOURCE_PATH = "/checkout";

function verify(fullUrl: string) {
  try {
    const u = new URL(fullUrl);
    const given = u.searchParams.get("signature") ?? "";
    const base = Array.from(u.searchParams.entries())
      .filter(([k]) => k !== "signature")
      .sort(([a,b]) => a.localeCompare(b))
      .map(([k,v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join("&");
    const expected = crypto.createHmac("sha256", APP_SECRET).update(base).digest("hex");
    return given.length === expected.length &&
           crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected));
  } catch { return false; }
}

function rewriteAssetUrls(html: string) {
  html = html.replace(/(\b(?:href|src)=["'])\/_next\//g, `$1/apps/checkout/_next/`);
  html = html.replace(
    /(\b(?:href|src)=["'])\/(favicon\.ico|apple-touch-icon\.png|site\.webmanifest|robots\.txt|humans\.txt|[^"']+\.(?:png|jpg|jpeg|gif|svg|webp|css|js|woff2?|ttf|eot))(["'])/g,
    `$1/apps/checkout/public/$2$3`
  );
  html = html.replace(/<base\b[^>]*>/i, "");
  html = html.replace(/<head([^>]*)>/i, `<head$1><base href="/apps/checkout/">`);
  return html;
}

export async function POST(req: NextRequest) {
  if (!APP_SECRET) return new NextResponse("server config error", { status: 500 });
  if (!verify(req.url)) return new NextResponse("bad signature", { status: 401 });

  // read the form (so you keep sessionId, shopDomain, etc.)
  const form = await req.formData();
  const sessionId  = String(form.get("sessionId")  || "");
  const shopDomain = String(form.get("shopDomain") || "");

  // fetch your real page and absorb one redirect
  let resp = await fetch(`${APP_ORIGIN}${SOURCE_PATH}`, { headers: { Accept: "text/html" }, redirect: "manual" });
  if (resp.status >= 300 && resp.status < 400) {
    const loc = resp.headers.get("location");
    if (!loc) return new NextResponse("upstream redirect w/o location", { status: 502 });
    const absolute = loc.startsWith("http") ? loc : `${APP_ORIGIN}${loc.startsWith("/") ? "" : "/"}${loc}`;
    resp = await fetch(absolute, { headers: { Accept: "text/html" }, redirect: "manual" });
  }
  if (!resp.ok) return new NextResponse("upstream error", { status: 502 });

  let html = await resp.text();
  html = rewriteAssetUrls(html);

  // pass data to the page (cookies are stripped by proxy)
  const boot = `<script>window.__CHECKOUT_SESSION__=${JSON.stringify({ id: sessionId, shop: shopDomain })};</script>`;
  html = html.replace(/<\/head>/i, `${boot}</head>`);

  return new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" }
  });
}
