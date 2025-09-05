// api/checkout/session/route.ts
import type { NextRequest } from "next/server";

const ALLOWED_REFERRERS = [
  "https://ghamandclo.com",
  "https://www.ghamandclo.com",
]; // tighten as needed

function isAllowed(req: NextRequest) {
  const origin = req.headers.get("origin") || "";
  const referer = req.headers.get("referer") || "";
  return ALLOWED_REFERRERS.some(d => origin.startsWith(d) || referer.startsWith(d));
}

export async function POST(req: NextRequest) {
  // (Optional but recommended) origin/referer enforcement
  if (!isAllowed(req)) {
    return new Response("Forbidden", { status: 403 });
  }

  // Read form data
  const form = await req.formData();
  const sessionId = form.get("sessionId");
  const shopDomain = form.get("shopDomain"); // optional

  if (typeof sessionId !== "string" || !sessionId) {
    return new Response("Bad Request", { status: 400 });
  }

  // Return a tiny HTML bootstrap that writes to localStorage, then navigates
  const html = `
    <!doctype html>
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
            // ${typeof shopDomain === "string" ? `localStorage.setItem('checkout_shop', ${JSON.stringify(shopDomain)});` : ""}
          } catch (e) {}
          // Prevent form resubmission on refresh
          location.replace('/checkout');
        </script>
      </body>
    </html>
  `;

  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

// (Optional) for users that hit /start directly with GET:
export function GET() {
  return new Response("Use POST", { status: 405 });
}
