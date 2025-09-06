// app/api/proxy/checkout/route.ts
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { verifyAppProxySignature } from "@/lib/verifyAppProxy";

const APP_SECRET = process.env.SHOPIFY_API_SECRET!;
const ORIGIN = "https://7htx61xz-9002.inc1.devtunnels.ms";   // <- change me
const SOURCE_PATH = "/checkout";                // your existing page

/** rewrite asset URLs inside your HTML so they load via the proxy */
function rewriteAssetUrls(html: string) {
  // Next assets: /_next/* → /apps/checkout/_next/*
  html = html.replace(/(["'])\/_next\//g, `$1/apps/checkout/_next/`);

  // Common public assets (favicon/images/css/js) → /apps/checkout/public/...
  // Adjust the pattern to your needs if you use custom folders
  html = html.replace(
    /(["'])\/(favicon\.ico|[^"']+\.(png|jpg|jpeg|gif|svg|webp|css|js))(["'])/g,
    `$1/apps/checkout/public/$2$3`
  );

  return html;
}

export async function GET(req: NextRequest) {
  if (!verifyAppProxySignature(req.url, APP_SECRET)) {
    return new NextResponse("bad signature", { status: 401 });
  }

  // Get your real page
  const upstream = await fetch(`${ORIGIN}${SOURCE_PATH}`, {
    headers: { Accept: "text/html" },
    // Optionally forward cookies if your /checkout SSR needs them:
    credentials: "include",
  });

  if (!upstream.ok) {
    return new NextResponse("upstream error", { status: 502 });
  }

  let html = await upstream.text();
  html = rewriteAssetUrls(html);

  // You can inject tiny bootstrap if needed (reads localStorage, etc.)
  // html = html.replace("</body>", `<script>/* your script */</script></body>`);

  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
