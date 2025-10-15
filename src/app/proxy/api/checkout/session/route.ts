// app/proxy/api/checkout/session/route.ts
import { NextRequest, NextResponse } from "next/server";
import { verifyAppProxySignature as verify } from "@/lib/verifyAppProxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const APP_SECRET = process.env.SHOPIFY_API_SECRET || "";
const PROXY_PREFIX = "/apps/majime/api/checkout";

function generateStandaloneCheckoutHTML(sessionId: string, shopDomain: string) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Checkout - OWR</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    // Inject session data BEFORE any React code loads
    window.__CHECKOUT_SESSION__ = ${JSON.stringify({ id: sessionId, shop: shopDomain })};
    window.__APP_PROXY_PREFIX__ = ${JSON.stringify(PROXY_PREFIX)};
    
    // Prevent Next.js from taking over navigation
    window.__NEXT_DATA__ = { props: { pageProps: {} } };
  </script>
</head>
<body>
  <div id="checkout-root"></div>
  
  <script type="module">
    // Import your checkout component directly
    import { createElement } from 'https://esm.sh/react@18';
    import { createRoot } from 'https://esm.sh/react-dom@18/client';
    
    // Dynamically import and render your checkout
    const root = createRoot(document.getElementById('checkout-root'));
    
    // Simple loading state
    root.render(createElement('div', {
      className: 'flex min-h-screen items-center justify-center',
      children: createElement('p', { className: 'text-lg' }, 'Loading checkout...')
    }));
    
    // Load your actual checkout bundle
    import('https://majime.in/_next/static/chunks/app/checkout/page.js')
      .then(module => {
        // Render your checkout component
        const CheckoutPage = module.default;
        root.render(createElement(CheckoutPage, { 
          sessionId: window.__CHECKOUT_SESSION__.id 
        }));
      })
      .catch(err => {
        console.error('Failed to load checkout:', err);
        root.render(createElement('div', {
          className: 'p-8 text-center',
          children: [
            createElement('h1', { key: 'h1', className: 'text-2xl font-bold text-red-600' }, 'Failed to load checkout'),
            createElement('p', { key: 'p', className: 'mt-4' }, 'Please refresh the page.'),
            createElement('button', {
              key: 'btn',
              onClick: () => location.reload(),
              className: 'mt-6 px-6 py-3 bg-blue-600 text-white rounded-lg'
            }, 'Refresh')
          ]
        }));
      });
  </script>
</body>
</html>`;
}

export async function GET(req: NextRequest) {
  if (!APP_SECRET) return new NextResponse("server config error", { status: 500 });
  if (!verify(req.url, APP_SECRET)) return new NextResponse("bad signature", { status: 401 });

  const u = new URL(req.url);
  const sessionId = u.searchParams.get("sessionId") || "";
  const shopDomain = u.searchParams.get("shop") || "";

  const html = generateStandaloneCheckoutHTML(sessionId, shopDomain);

  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "X-Frame-Options": "SAMEORIGIN",
    },
  });
}

export async function POST(req: NextRequest) {
  // Redirect POST to GET with params
  const form = await req.formData();
  const sessionId = String(form.get("sessionId") || "");
  const shopDomain = String(form.get("shopDomain") || "");
  
  const redirectUrl = `/apps/majime/api/checkout/session?sessionId=${encodeURIComponent(sessionId)}&shop=${encodeURIComponent(shopDomain)}`;
  
  return NextResponse.redirect(new URL(redirectUrl, req.url), 303);
}