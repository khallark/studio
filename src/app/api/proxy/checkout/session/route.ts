// // app/api/proxy/checkout/session/route.ts
// import { NextRequest, NextResponse } from "next/server";
// import { verifyAppProxySignature as verify } from "@/lib/verifyAppProxy";

// export const runtime = "nodejs";
// export const dynamic = "force-dynamic";

// const APP_SECRET  = process.env.SHOPIFY_API_SECRET || "";
// const APP_ORIGIN  = (process.env.APP_ORIGIN || "https://studio-rose-three.vercel.app").replace(/\/+$/,"");
// const SOURCE_PATH = "/checkout";
// const PROXY_PREFIX = "/apps/checkout";

// // --- rewrite: send ALL assets to APP_ORIGIN (no proxy for assets) ---
// function escapeRe(s: string) { return s.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&"); }
// function rewriteAssetUrls(html: string) {
//   const ORIGIN = APP_ORIGIN; // already trimmed

//   // 1) _next assets → absolute to APP_ORIGIN
//   html = html.replace(/(\b(?:href|src)=["'])\/_next\//g, `$1${ORIGIN}/_next/`);
//   // also catch absolute shop URLs that might still reference your origin differently
//   const originNoProto = ORIGIN.replace(/^https?:\/\//, "");
//   html = html.replace(
//     new RegExp(`(\\b(?:href|src)=["'])https?:\\/\\/${escapeRe(originNoProto)}\\/_next\\/`, "g"),
//     `$1${ORIGIN}/_next/`
//   );

//   // 2) public-ish files (css/js/fonts/images/etc) → absolute to APP_ORIGIN
//   html = html.replace(
//     /(\b(?:href|src)=["'])\/(?!_next\/)([^"']+\.(?:css|js|png|jpe?g|gif|svg|webp|ico|woff2?|woff|ttf|eot|webmanifest|txt))(["'])/g,
//     `$1${ORIGIN}/$2$3`
//   );

//   // 3) Ensure relative links resolve under /apps/checkout/
//   html = html.replace(/<base\b[^>]*>/i, "");
//   html = html.replace(/<head([^>]*)>/i, `<head$1><base href="${PROXY_PREFIX}/">`);

//   return html;
// }

// export async function POST(req: NextRequest) {
//   if (!APP_SECRET) return new NextResponse("server config error", { status: 500 });
//   if (!verify(req.url, APP_SECRET)) return new NextResponse("bad signature", { status: 401 });

//   const form = await req.formData();
//   const sessionId  = String(form.get("sessionId")  || "");
//   const shopDomain = String(form.get("shopDomain") || "");

//   // 1) fetch your page and absorb one redirect
//   let resp = await fetch(`${APP_ORIGIN}${SOURCE_PATH}`, {
//     headers: { Accept: "text/html" },
//     redirect: "manual",
//   });
//   if (resp.status >= 300 && resp.status < 400) {
//     const loc = resp.headers.get("location");
//     if (!loc) return new NextResponse("upstream redirect w/o location", { status: 502 });
//     const absolute = loc.startsWith("http") ? loc : `${APP_ORIGIN}${loc.startsWith("/") ? "" : "/"}${loc}`;
//     resp = await fetch(absolute, { headers: { Accept: "text/html" }, redirect: "manual" });
//   }
//   if (!resp.ok) return new NextResponse("upstream error", { status: 502 });

//   // 2) rewrite assets to absolute APP_ORIGIN and inject boot data
//   let html = await resp.text();
//   html = rewriteAssetUrls(html);

//   const boot = `<script>
//     window.__CHECKOUT_SESSION__=${JSON.stringify({ id: sessionId, shop: shopDomain })};
//     window.__APP_PROXY_PREFIX__=${JSON.stringify(PROXY_PREFIX)};
//   </script>`;
//   html = html.replace(/<\/head>/i, `${boot}</head>`);

//   return new NextResponse(html, {
//     status: 200,
//     headers: {
//       "Content-Type": "text/html; charset=utf-8",
//       "Cache-Control": "no-store",
//     },
//   });
// }
// app/api/proxy/checkout/session/route.ts
import { NextRequest, NextResponse } from "next/server";
import { verifyAppProxySignature as verify } from "@/lib/verifyAppProxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const APP_SECRET  = process.env.SHOPIFY_API_SECRET || "";
const APP_ORIGIN  = (process.env.APP_ORIGIN || "https://studio-rose-three.vercel.app").replace(/\/+$/,"");
const SOURCE_PATH = "/checkout";
const PROXY_PREFIX = "/apps/checkout";

// -------- utilities --------
function escapeRe(s: string) { return s.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&"); }

// send ALL assets to APP_ORIGIN (no proxy for assets)
function rewriteAssetUrls(html: string) {
  const ORIGIN = APP_ORIGIN;

  // 1) _next assets → absolute to APP_ORIGIN
  html = html.replace(/(\b(?:href|src)=["'])\/_next\//g, `$1${ORIGIN}/_next/`);
  const originNoProto = ORIGIN.replace(/^https?:\/\//, "");
  html = html.replace(
    new RegExp(`(\\b(?:href|src)=["'])https?:\\/\\/${escapeRe(originNoProto)}\\/_next\\/`, "g"),
    `$1${ORIGIN}/_next/`
  );

  // 2) public-ish files (css/js/fonts/images/etc) → absolute to APP_ORIGIN
  html = html.replace(
    /(\b(?:href|src)=["'])\/(?!_next\/)([^"']+\.(?:css|js|png|jpe?g|gif|svg|webp|ico|woff2?|woff|ttf|eot|webmanifest|txt))(["'])/g,
    `$1${ORIGIN}/$2$3`
  );

  // 3) Ensure relative links resolve under /apps/checkout/
  html = html.replace(/<base\b[^>]*>/i, "");
  html = html.replace(/<head([^>]*)>/i, `<head$1><base href="${PROXY_PREFIX}/">`);

  return html;
}

async function fetchCheckoutHtml() {
  // fetch upstream page and absorb a single redirect
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

  if (!resp.ok) {
    const peek = await resp.text().catch(() => "");
    console.error("upstream non-200:", resp.status, peek.slice(0, 400));
    return new NextResponse("upstream error", { status: 502 });
  }

  let html = await resp.text();
  return new NextResponse(rewriteAssetUrls(html));
}

function injectBoot(response: NextResponse, sessionId: string, shopDomain: string) {
  const html = response.body ? undefined : null; // satisfy TS (we'll re-read text below)
  // We need to transform the body; re-fetch text from the Response we just built:
  return response.text().then((txt) => {
    const boot = `<script>
      window.__CHECKOUT_SESSION__=${JSON.stringify({ id: sessionId, shop: shopDomain })};
      window.__APP_PROXY_PREFIX__=${JSON.stringify(PROXY_PREFIX)};
    </script>`;
    const outHtml = txt.replace(/<\/head>/i, `${boot}</head>`);
    const out = new NextResponse(outHtml, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
    out.headers.delete("Location");
    return out;
  });
}

// -------- handlers --------

async function render(req: NextRequest, sessionId: string, shopDomain: string) {
  const upstream = await fetchCheckoutHtml();
  if (!(upstream instanceof NextResponse) || !upstream.ok) return upstream;
  return injectBoot(upstream, sessionId, shopDomain);
}

export async function POST(req: NextRequest) {
  if (!APP_SECRET) return new NextResponse("server config error", { status: 500 });
  if (!verify(req.url, APP_SECRET)) return new NextResponse("bad signature", { status: 401 });

  const form = await req.formData();
  const sessionId  = String(form.get("sessionId")  || "");
  const shopDomain = String(form.get("shopDomain") || form.get("shop") || "");

  return render(req, sessionId, shopDomain);
}

export async function GET(req: NextRequest) {
  if (!APP_SECRET) return new NextResponse("server config error", { status: 500 });
  if (!verify(req.url, APP_SECRET)) return new NextResponse("bad signature", { status: 401 });

  const u = new URL(req.url);
  // On reload we might not have a sessionId in the URL. That’s OK:
  // your client will fall back to localStorage; we still serve the page.
  const sessionId  = u.searchParams.get("sessionId") || "";
  const shopDomain = u.searchParams.get("shopDomain") || u.searchParams.get("shop") || "";

  return render(req, sessionId, shopDomain);
}
