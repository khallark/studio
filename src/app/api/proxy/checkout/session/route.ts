// app/api/proxy/checkout/start/route.ts
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { verifyAppProxySignature } from "@/lib/verifyAppProxy";
import crypto from "crypto";

const APP_SECRET = process.env.SHOPIFY_API_SECRET || "";

export async function POST(req: NextRequest) {
  if (!APP_SECRET || APP_SECRET.length < 16) return new NextResponse("server config error", { status: 500 });

  // App Proxy always appends ?signature=... — verify it
  if (!verifyAppProxySignature(req.url, APP_SECRET)) {
    return new NextResponse("bad signature", { status: 401 });
  }

  const form = await req.formData();
  const sessionId = form.get("sessionId");
  const shopDomain = form.get("shopDomain"); // optional

  if (typeof sessionId !== "string" || !sessionId) {
    return new NextResponse("Bad Request", { status: 400 });
  }

  // This HTML runs under the *store* domain (because of the proxy)
  // It writes localStorage and navigates to the embedded checkout URL
  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta http-equiv="Referrer-Policy" content="no-referrer">
<title>Starting Checkout…</title>
</head>
<body>
<script>
try {
  localStorage.setItem('checkout_session', ${JSON.stringify(sessionId)});
  ${typeof shopDomain === "string" ? `localStorage.setItem('checkout_shop', ${JSON.stringify(shopDomain)});` : ""}
} catch (e) {}
// Prevent form resubmission on refresh
location.replace('/apps/checkout');
</script>
</body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

// Optional: reject GET on this endpoint
export function GET() {
  return new NextResponse("Use POST", { status: 405 });
}
