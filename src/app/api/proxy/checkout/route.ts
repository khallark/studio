// // app/api/proxy/checkout/route.ts
// import type { NextRequest } from "next/server";
// import { NextResponse } from "next/server";
// import crypto from "crypto";

// export const runtime = "nodejs";
// export const dynamic = "force-dynamic";

// const APP_SECRET   = process.env.SHOPIFY_API_SECRET || "";
// const APP_ORIGIN   = process.env.APP_ORIGIN || "https://studio-rose-three.vercel.app";
// const SOURCE_PATH  = "/checkout";

// function verifyAppProxySignature(fullUrl: string) {
//   try {
//     const u = new URL(fullUrl);
//     const given = u.searchParams.get("signature") ?? "";
//     const base = Array.from(u.searchParams.entries())
//       .filter(([k]) => k !== "signature")
//       .sort(([a],[b]) => a.localeCompare(b))
//       .map(([k,v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
//       .join("&");
//     const expected = crypto.createHmac("sha256", APP_SECRET).update(base).digest("hex");
//     return given.length === expected.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected));
//   } catch {
//     return false;
//   }
// }

// function rewriteAssetUrls(html: string) {
//   html = html.replace(/(\b(?:href|src)=["'])\/_next\//g, `$1/apps/checkout/_next/`);
//   html = html.replace(
//     /(\b(?:href|src)=["'])\/(favicon\.ico|apple-touch-icon\.png|site\.webmanifest|robots\.txt|humans\.txt|[^"']+\.(?:png|jpg|jpeg|gif|svg|webp|css|js|woff2?|ttf|eot))(["'])/g,
//     `$1/apps/checkout/public/$2$3`
//   );
//   html = html.replace(/<base\b[^>]*>/i, "");
//   html = html.replace(/<head([^>]*)>/i, `<head$1><base href="/apps/checkout/">`);
//   return html;
// }

// export async function GET(req: NextRequest) {
//   if (!APP_SECRET) return new NextResponse("server config error", { status: 500 });

//   // 1) Verify proxy signature
//   if (!verifyAppProxySignature(req.url)) {
//     return new NextResponse("bad signature", { status: 401 });
//   }

//   // 2) Fetch upstream page and absorb one redirect ourselves
//   let resp = await fetch(`${APP_ORIGIN}${SOURCE_PATH}`, { headers: { Accept: "text/html" }, redirect: "manual" });

//   if (resp.status >= 300 && resp.status < 400) {
//     const loc = resp.headers.get("location");
//     if (!loc) return new NextResponse("upstream redirect w/o location", { status: 502 });
//     const absolute = loc.startsWith("http") ? loc : `${APP_ORIGIN}${loc.startsWith("/") ? "" : "/"}${loc}`;
//     resp = await fetch(absolute, { headers: { Accept: "text/html" }, redirect: "manual" });
//   }

//   if (!resp.ok) {
//     const peek = await resp.text().catch(() => "");
//     console.error("upstream non-200:", resp.status, peek.slice(0, 400));
//     return new NextResponse("upstream error", { status: 502 });
//   }

//   let html = await resp.text();
//   html = rewriteAssetUrls(html);

//   // 3) Always return 200 (no Location header)
//   const out = new NextResponse(html, {
//     status: 200,
//     headers: {
//       "Content-Type": "text/html; charset=utf-8",
//       "Cache-Control": "no-store",
//     },
//   });
//   out.headers.delete("Location");
//   return out;
// }
// app/api/proxy/checkout/route.ts
import { NextRequest, NextResponse } from "next/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // DO keep your signature check in final code; remove it for this 2-minute test:
  // if (!verifyAppProxySignature(req.url, APP_SECRET)) return new NextResponse("bad sig", { status: 401 });

  return new NextResponse(
    `<html><body style="font:16px/1.4 system-ui;padding:24px">
       <h1>Proxy Root OK</h1>
       <p>If you see this under <code>/apps/checkout</code>, mapping works.</p>
     </body></html>`,
    { status: 200, headers: { "content-type": "text/html" } }
  );
}
