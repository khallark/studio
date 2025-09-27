import { NextRequest } from "next/server";

export function getClientIP(req: NextRequest): string {
  return (
    req.headers.get('cf-connecting-ip') ||                       // Cloudflare
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || // Most proxies/CDNs
    req.headers.get('x-real-ip') ||                              // Nginx
    req.headers.get('x-client-ip') ||                            // Some proxies
    '127.0.0.1'                                                  // Fallback
  );
}