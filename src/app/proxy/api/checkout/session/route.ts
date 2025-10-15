import { NextRequest, NextResponse } from "next/server";
import { verifyAppProxySignature as verify } from "@/lib/verifyAppProxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const APP_SECRET = process.env.SHOPIFY_API_SECRET || "";
const PROXY_PREFIX = "/apps/majime/api/checkout";

// Get the base URL for fetching the checkout page
function getAppBaseUrl() {
  // In production (Vercel), use VERCEL_URL
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  // In development
  if (process.env.NODE_ENV === "development") {
    return "http://localhost:3000";
  }
  // Fallback to APP_ORIGIN if set
  return process.env.APP_ORIGIN || "https://majime.in";
}

// Fetch the checkout page HTML
async function fetchCheckoutHtml() {
  const baseUrl = getAppBaseUrl();
  const checkoutUrl = `${baseUrl}/checkout`;
  
  console.log("[session] Fetching checkout from:", checkoutUrl);
  
  try {
    let resp = await fetch(checkoutUrl, {
      headers: { 
        Accept: "text/html",
        "User-Agent": "Shopify-Proxy-Session"
      },
      redirect: "manual",
    });

    // Handle redirect
    if (resp.status >= 300 && resp.status < 400) {
      const loc = resp.headers.get("location");
      if (!loc) {
        console.error("[session] Redirect without location");
        return new NextResponse("redirect w/o location", { status: 502 });
      }
      const absolute = loc.startsWith("http") ? loc : `${baseUrl}${loc}`;
      console.log("[session] Following redirect to:", absolute);
      resp = await fetch(absolute, { 
        headers: { Accept: "text/html" }, 
        redirect: "manual" 
      });
    }

    if (!resp.ok) {
      const errorText = await resp.text().catch(() => "");
      console.error("[session] Fetch failed:", resp.status, resp.statusText);
      console.error("[session] Error body:", errorText.slice(0, 500));
      return new NextResponse(`upstream error: ${resp.status}`, { status: 502 });
    }

    const html = await resp.text();
    console.log("[session] Successfully fetched checkout HTML");
    return new NextResponse(html);
    
  } catch (error) {
    console.error("[session] Fetch exception:", error);
    return new NextResponse("fetch failed", { status: 502 });
  }
}

// Rewrite asset URLs to work through the proxy
function rewriteAssetUrls(html: string) {
  const baseUrl = getAppBaseUrl();
  
  // Rewrite _next assets to absolute URLs
  html = html.replace(/(\b(?:href|src)=["'])\/_next\//g, `$1${baseUrl}/_next/`);
  
  // Rewrite other static assets
  html = html.replace(
    /(\b(?:href|src)=["'])\/(?!_next\/)([^"']+\.(?:css|js|png|jpe?g|gif|svg|webp|ico|woff2?|ttf|eot))(["'])/g,
    `$1${baseUrl}/$2$3`
  );
  
  // Add base tag for relative URLs
  html = html.replace(/<base\b[^>]*>/i, "");
  html = html.replace(/<head([^>]*)>/i, `<head$1><base href="${PROXY_PREFIX}/">`);
  
  return html;
}

// Inject boot data
function injectBootData(html: string, sessionId: string, shopDomain: string) {
  const boot = `<script>
    window.__CHECKOUT_SESSION__ = ${JSON.stringify({ id: sessionId, shop: shopDomain })};
    window.__APP_PROXY_PREFIX__ = ${JSON.stringify(PROXY_PREFIX)};
  </script>`;
  
  return html.replace(/<\/head>/i, `${boot}</head>`);
}

// Main render function
async function render(sessionId: string, shopDomain: string) {
  const upstream = await fetchCheckoutHtml();
  
  if (!upstream.ok) {
    console.error("[session] Failed to fetch checkout");
    return upstream;
  }

  let html = await upstream.text();
  
  // Rewrite URLs and inject boot data
  html = rewriteAssetUrls(html);
  html = injectBootData(html, sessionId, shopDomain);

  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}

// POST handler (from cart form submission)
export async function POST(req: NextRequest) {
  if (!APP_SECRET) {
    console.error("[session] Missing APP_SECRET");
    return new NextResponse("server config error", { status: 500 });
  }
  
  if (!verify(req.url, APP_SECRET)) {
    console.error("[session] Bad signature");
    return new NextResponse("bad signature", { status: 401 });
  }

  const form = await req.formData();
  const sessionId = String(form.get("sessionId") || "");
  const shopDomain = String(form.get("shopDomain") || form.get("shop") || "");

  console.log("[session] POST request - sessionId:", sessionId, "shop:", shopDomain);

  if (!sessionId) {
    return new NextResponse("sessionId required", { status: 400 });
  }

  return render(sessionId, shopDomain);
}

// GET handler (for reloads)
export async function GET(req: NextRequest) {
  if (!APP_SECRET) {
    console.error("[session] Missing APP_SECRET");
    return new NextResponse("server config error", { status: 500 });
  }
  
  if (!verify(req.url, APP_SECRET)) {
    console.error("[session] Bad signature");
    return new NextResponse("bad signature", { status: 401 });
  }

  const u = new URL(req.url);
  const sessionId = u.searchParams.get("sessionId") || "";
  const shopDomain = u.searchParams.get("shopDomain") || u.searchParams.get("shop") || "";

  console.log("[session] GET request - sessionId:", sessionId, "shop:", shopDomain);

  return render(sessionId, shopDomain);
}