// app/api/proxy/checkout/customer/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { verifyAppProxySignature } from "@/lib/verifyAppProxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const APP_SECRET = process.env.SHOPIFY_API_SECRET || "";

/** Read sessionId & phone from JSON body or form-data; fallback to query params if needed */
async function readSessionAndPhone(req: NextRequest): Promise<
  { sessionId: string; phone: string } | NextResponse
> {
  let sessionId = "";
  let phone = "";

  // Try JSON body
  try {
    const ct = req.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      const j = await req.json();
      sessionId = String(j?.sessionId ?? "");
      phone = String(j?.phone ?? "");
    }
  } catch {
    /* ignore */
  }

  // Try form-data
  if (!sessionId || !phone) {
    try {
      const ct = req.headers.get("content-type") || "";
      if (ct.includes("multipart/form-data") || ct.includes("application/x-www-form-urlencoded")) {
        const f = await req.formData();
        sessionId ||= String(f.get("sessionId") ?? "");
        phone ||= String(f.get("phone") ?? "");
      }
    } catch {
      /* ignore */
    }
  }

  // Fallback: query params (useful for GET)
  if (!sessionId || !phone) {
    const u = new URL(req.url);
    sessionId ||= u.searchParams.get("sessionId") || "";
    phone ||= u.searchParams.get("phone") || "";
  }

  if (!sessionId || !phone) {
    return NextResponse.json({ error: "missing sessionId or phone" }, { status: 400 });
  }
  return { sessionId, phone };
}

/** Ensure the request came from Shopify App Proxy and the session is valid for this phone */
async function verifyContext(
  req: NextRequest
): Promise<{ sessionId: string; phone: string } | NextResponse> {
  // 0) App Proxy HMAC
  if (!APP_SECRET || APP_SECRET.length < 16) {
    return NextResponse.json({ error: "server config error" }, { status: 500 });
  }
  if (!verifyAppProxySignature(req.url, APP_SECRET)) {
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }

  // 1) Inputs
  const sp = await readSessionAndPhone(req);
  if (sp instanceof NextResponse) return sp;
  const { sessionId, phone } = sp;

  // 2) Session checks (existence / expiry / phone match)
  const sessionRef = db.collection("checkout_sessions").doc(sessionId);
  const snap = await sessionRef.get();
  if (!snap.exists) {
    return NextResponse.json({ error: "session not found" }, { status: 404 });
  }

  const s = snap.data() as any;
  const sessionPhone: string | undefined = s?.customerPhone;
  const expiresAtMs: number | undefined = s?.expiresAt?.toMillis?.();

  if (expiresAtMs && expiresAtMs <= Date.now()) {
    return NextResponse.json({ error: "session expired" }, { status: 410 });
  }
  if (sessionPhone && sessionPhone !== phone) {
    return NextResponse.json({ error: "phone mismatch" }, { status: 403 });
  }

  return { sessionId, phone };
}

// -------------------- GET: fetch customer --------------------
export async function GET(req: NextRequest) {
  const ctx = await verifyContext(req);
  if (ctx instanceof NextResponse) return ctx;

  try {
    const customerRef = db.collection("checkout_customers").doc(ctx.phone);
    const doc = await customerRef.get();
    if (!doc.exists) {
      return NextResponse.json({ error: "customer not found" }, { status: 404 });
    }
    const c = doc.data() || {};
    return NextResponse.json({
      ok: true,
      phone: c.phone ?? ctx.phone,
      name: c.name ?? null,
      email: c.email ?? null,
      address: c.address ?? null,
    });
  } catch (err) {
    console.error("Error fetching customer:", err);
    return NextResponse.json({ error: "internal server error" }, { status: 500 });
  }
}

// -------------------- POST: update customer --------------------
export async function POST(req: NextRequest) {
  const ctx = await verifyContext(req);
  if (ctx instanceof NextResponse) return ctx;

  try {
    const body = await req.json().catch(() => ({} as any));

    // Allow partial updates; only accept known fields
    const updates: Record<string, any> = {};
    if ("name" in body) {
      if (body.name != null && typeof body.name !== "string") {
        return NextResponse.json({ error: "invalid name" }, { status: 400 });
      }
      updates.name = body.name ?? null;
    }
    if ("email" in body) {
      if (body.email != null && typeof body.email !== "string") {
        return NextResponse.json({ error: "invalid email" }, { status: 400 });
      }
      if (body.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
        return NextResponse.json({ error: "invalid email format" }, { status: 400 });
      }
      updates.email = body.email ?? null;
    }
    if ("address" in body) {
      if (body.address != null && typeof body.address !== "string") {
        return NextResponse.json({ error: "invalid address" }, { status: 400 });
      }
      updates.address = body.address ?? null;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "no valid fields to update" }, { status: 400 });
    }

    updates.updatedAt = FieldValue.serverTimestamp();

    const customerRef = db.collection("checkout_customers").doc(ctx.phone);
    await customerRef.set(updates, { merge: true });

    return NextResponse.json({ ok: true, message: "Details updated" });
  } catch (err) {
    console.error("Error updating customer:", err);
    return NextResponse.json({ error: "internal server error" }, { status: 500 });
  }
}
