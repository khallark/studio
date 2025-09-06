// lib/verifyAppProxy.ts
import crypto from "crypto";

export function verifyAppProxySignature(rawUrl: string, appSecret: string) {
  const url = new URL(rawUrl);
  const provided = url.searchParams.get("signature") || "";
  const msg = Array.from(url.searchParams.entries())
    .filter(([k]) => k !== "signature")
    .sort(([a],[b]) => a.localeCompare(b))
    .map(([k,v]) => `${k}=${v}`)
    .join("");
  const expected = crypto.createHmac("sha256", appSecret).update(msg).digest("hex");
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
