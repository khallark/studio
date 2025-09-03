// app/apps/your-proxy/start-checkout/route.ts
import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const APP_SECRET = process.env.SHOPIFY_API_SECRET; // App's shared secret
const SIGNING_SECRET = process.env.SIGNING_SECRET; // (optional) your current custom scheme
const MAX_SKEW_SECONDS = Number(process.env.HMAC_MAX_SKEW_SECONDS ?? 300);

// ---- util
function timingSafeEqStr(a: string, b: string) {
  const A = Buffer.from(a, "utf8");
  const B = Buffer.from(b, "utf8");
  return A.length === B.length && crypto.timingSafeEqual(A, B);
}
function sha256Hex(buf: Buffer) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

// ---- verify Shopify App Proxy signature (query param `signature`, hex HMAC-SHA256 over sorted query without `signature`)
function verifyAppProxySignature(url: URL): boolean {
  if (!APP_SECRET) return false;
  const params = Array.from(url.searchParams.entries())
    .filter(([k]) => k !== "signature")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("");

  const digest = crypto.createHmac("sha256", APP_SECRET).update(params).digest("hex");
  const sig = url.searchParams.get("signature") ?? "";
  return timingSafeEqStr(digest, sig);
}

// ---- your existing custom scheme (fallback)
function canonicalize(method: string, urlStr: string, raw: Buffer, ts: number, nonce: string) {
  const u = new URL(urlStr);
  const entries = Array.from(u.searchParams.entries()).sort(([a], [b]) => a.localeCompare(b));
  const q = entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");
  return [method.toUpperCase(), u.pathname, q, sha256Hex(raw), String(ts), nonce].join("\n");
}
function hmacBase64(secret: string, data: string) {
  return crypto.createHmac("sha256", secret).update(data).digest("base64");
}

export async function POST(req: NextRequest) {
  // Read raw body ONCE
  const raw = Buffer.from(await req.arrayBuffer());
  const now = Math.floor(Date.now() / 1000);

  const url = new URL(req.url);

  // --- Path 1: Shopify App Proxy signed request
  if (url.searchParams.has("signature")) {
    if (!verifyAppProxySignature(url)) {
      return NextResponse.json({ error: "bad proxy signature" }, { status: 401 });
    }

    // Optional extra integrity: verify client-provided body hash
    const bodySha = sha256Hex(raw);
    const sentSha = url.searchParams.get("body_sha256");
    if (sentSha && !timingSafeEqStr(bodySha, sentSha)) {
      return NextResponse.json({ error: "body hash mismatch" }, { status: 400 });
    }

    // (Optional) timestamp freshness check if you include & sign `t=...` in query
    const t = Number(url.searchParams.get("t") ?? now);
    if (Math.abs(now - t) > MAX_SKEW_SECONDS) {
      return NextResponse.json({ error: "timestamp out of window" }, { status: 401 });
    }

    // Safe to trust `raw` and the store identity in query (e.g., shop=example.myshopify.com)
    let payload: any = {};
    try { if (raw.length) payload = JSON.parse(raw.toString("utf8")); } catch {}
    // ... your logic here ...
    return NextResponse.json({ ok: true, mode: "app-proxy", received: payload }, { status: 200 });
  }

  // --- Path 2 (fallback): your current custom x-signature scheme
  const sigHeader = req.headers.get("x-signature");
  if (sigHeader && SIGNING_SECRET) {
    const parts = Object.fromEntries(
      sigHeader.split(",").map(p => {
        const [k, v] = p.split("=").map(s => s.trim());
        return [k, v];
      })
    );
    const ts = Number(parts.t);
    const nonce = String(parts.nonce || "");
    const sig = String(parts.sig || "");

    if (!ts || !nonce || !sig) {
      return NextResponse.json({ error: "bad signature header" }, { status: 401 });
    }
    if (Math.abs(now - ts) > MAX_SKEW_SECONDS) {
      return NextResponse.json({ error: "timestamp out of window" }, { status: 401 });
    }

    const canon = canonicalize(req.method, req.url, raw, ts, nonce);
    const expected = hmacBase64(SIGNING_SECRET, canon);
    if (!timingSafeEqStr(expected, sig)) {
      return NextResponse.json({ error: "bad signature" }, { status: 401 });
    }

    let payload: any = {};
    try { if (raw.length) payload = JSON.parse(raw.toString("utf8")); } catch {}
    return NextResponse.json({ ok: true, mode: "custom-header", received: payload }, { status: 200 });
  }

  return NextResponse.json({ error: "no signature" }, { status: 401 });
}
