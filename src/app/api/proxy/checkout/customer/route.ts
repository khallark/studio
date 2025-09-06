// app/api/proxy/checkout/customer/route.ts
import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { db } from "@/lib/firebase-admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { verifyAppProxySignature } from "@/lib/verifyAppProxy";

const JWT_SECRET = process.env.CHECKOUT_JWT_SECRET || "";
const APP_SECRET = process.env.SHOPIFY_API_SECRET || "";

interface AuthenticatedContext {
  sessionId: string;
  phone: string;
}

/** Auth helper: verify proxy HMAC, JWT cookie, session existence/expiry/phone match */
async function verifyAndGetContext(req: NextRequest): Promise<AuthenticatedContext | NextResponse> {
  // 0) App Proxy signature
  if (!APP_SECRET || APP_SECRET.length < 16) return NextResponse.json({ error: "server config error" }, { status: 500 });
  
  if (!verifyAppProxySignature(req.url, APP_SECRET)) {
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }

  // 1) Env sanity
  if (!JWT_SECRET || JWT_SECRET.length < 32) {
    console.error("CHECKOUT_JWT_SECRET missing/too short");
    return NextResponse.json({ error: "server config error" }, { status: 500 });
  }

  // 2) Read and verify JWT
  const token = req.cookies.get("checkout_token")?.value;
  if (!token) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  let decoded: any;
  try {
    decoded = jwt.verify(token, JWT_SECRET, { audience: "checkout" });
  } catch {
    return NextResponse.json({ error: "invalid or expired token" }, { status: 401 });
  }

  const sessionId = decoded?.session_id;
  const phone = decoded?.phone_no;
  if (!sessionId || !phone) {
    return NextResponse.json({ error: "malformed token" }, { status: 401 });
  }

  // 3) Ensure session exists, not expired, and phone matches
  const sessionRef = db.collection("checkout_sessions").doc(sessionId);
  const snap = await sessionRef.get();
  if (!snap.exists) return NextResponse.json({ error: "session not found" }, { status: 404 });

  const s = snap.data() as any;
  const sessionPhone = s?.customerPhone;
  const expiresAtMs: number | undefined = s?.expiresAt?.toMillis?.();
  if (!expiresAtMs || expiresAtMs <= Date.now()) {
    return NextResponse.json({ error: "session expired" }, { status: 410 });
  }
  if (sessionPhone !== phone) {
    return NextResponse.json({ error: "token/session mismatch" }, { status: 403 });
  }

  return { sessionId, phone };
}

// -------------------- GET: fetch customer --------------------
export async function GET(req: NextRequest) {
  const context = await verifyAndGetContext(req);
  if (context instanceof NextResponse) return context;

  try {
    const customerRef = db.collection("checkout_customers").doc(context.phone);
    const doc = await customerRef.get();
    if (!doc.exists) {
      return NextResponse.json({ error: "customer not found" }, { status: 404 });
    }
    const c = doc.data() || {};
    return NextResponse.json({
      ok: true,
      phone: c.phone ?? context.phone,
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
  const context = await verifyAndGetContext(req);
  if (context instanceof NextResponse) return context;

  try {
    const body = await req.json().catch(() => ({}));
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
      // (Optional) naive email check
      if (body.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
        return NextResponse.json({ error: "invalid email format" }, { status: 400 });
      }
      updates.email = body.email ?? null;
    }
    if ("address" in body) {
      // Keep your original string type, or switch to object if you plan structured addresses
      if (body.address != null && typeof body.address !== "string") {
        return NextResponse.json({ error: "invalid address" }, { status: 400 });
      }
      updates.address = body.address ?? null;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "no valid fields to update" }, { status: 400 });
    }

    updates.updatedAt = FieldValue.serverTimestamp();

    const customerRef = db.collection("checkout_customers").doc(context.phone);
    await customerRef.set(updates, { merge: true });

    return NextResponse.json({ ok: true, message: "Details updated" });
  } catch (err) {
    console.error("Error updating customer:", err);
    return NextResponse.json({ error: "internal server error" }, { status: 500 });
  }
}
