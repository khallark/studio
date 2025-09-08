// app/api/proxy/checkout/verify-otp/route.ts
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "@/lib/firebase-admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { verifyAppProxySignature } from "@/lib/verifyAppProxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OTP_MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes

const JWT_SECRET = process.env.CHECKOUT_JWT_SECRET || "";
const APP_SECRET = process.env.SHOPIFY_API_SECRET || "";

/** ---------- Helpers ---------- */
function sha256Hex(s: string) {
  return crypto.createHash("sha256").update(s, "utf8").digest("hex");
}
function timingSafeEq(a: string, b: string) {
  const A = Buffer.from(a, "utf8");
  const B = Buffer.from(b, "utf8");
  return A.length === B.length && crypto.timingSafeEqual(A, B);
}
function maskPhone(p?: string) {
  if (!p || p.length < 6) return null;
  return p.slice(0, 3) + "******" + p.slice(-4);
}

export async function POST(req: NextRequest) {
  try {
    if (!APP_SECRET || APP_SECRET.length < 16)  return NextResponse.json({ error: "server config error" }, { status: 500 });
    // App Proxy HMAC
    if (!verifyAppProxySignature(req.url, APP_SECRET)) {
      return NextResponse.json({ error: "bad signature" }, { status: 401 });
    }

    // Env sanity
    if (!JWT_SECRET || JWT_SECRET.length < 32) {
      console.error("CHECKOUT_JWT_SECRET missing/too short");
      return NextResponse.json({ error: "server config error" }, { status: 500 });
    }

    // Parse body
    let body: any;
    try { body = await req.json(); } catch {
      return NextResponse.json({ error: "invalid json" }, { status: 400 });
    }
    const { sessionId, otp, cartToken, clientNonce } = body || {};
    if (!sessionId || !otp) {
      return NextResponse.json({ error: "sessionId and otp are required" }, { status: 400 });
    }

    // Load session
    const sessionRef = db.collection("checkout_sessions").doc(sessionId);
    const snap = await sessionRef.get();
    if (!snap.exists) return NextResponse.json({ error: "invalid session" }, { status: 404 });

    const s = snap.data() as any;
    const now = Date.now();

    // Expiry check
    const expiresAtMs: number | undefined = s?.expiresAt?.toMillis?.();
    if (!expiresAtMs || expiresAtMs <= now) {
      return NextResponse.json({ error: "session expired" }, { status: 410 });
    }

    // Ownership binders (if present on session, must match)
    if (s.cartToken && cartToken && s.cartToken !== cartToken) {
      return NextResponse.json({ error: "ownership mismatch (cart)" }, { status: 403 });
    }
    if (s.clientNonce && clientNonce && s.clientNonce !== clientNonce) {
      return NextResponse.json({ error: "device binding failed" }, { status: 403 });
    }

    // OTP presence
    const otpHashStored: string | undefined = s?.otpHash;
    const otpGeneratedAtMs: number | undefined = s?.otpGeneratedAt?.toMillis?.();
    if (!otpHashStored || !otpGeneratedAtMs) {
      return NextResponse.json({ error: "no pending otp for this session" }, { status: 400 });
    }

    // Simple attempt limiter: max 5 failed attempts per OTP issuance
    const attempts: number = Number(s?.otpAttemptCount || 0);
    if (attempts >= 5) {
      // wipe OTP so user must resend
      await sessionRef.update({
        otpHash: FieldValue.delete(),
        otpGeneratedAt: FieldValue.delete(),
        otpAttemptCount: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      return NextResponse.json({ error: "too many attempts; request a new OTP" }, { status: 429 });
    }

    // OTP age
    if (now - otpGeneratedAtMs > OTP_MAX_AGE_MS) {
      await sessionRef.update({
        otpHash: FieldValue.delete(),
        otpGeneratedAt: FieldValue.delete(),
        otpAttemptCount: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      return NextResponse.json({ error: "otp expired" }, { status: 410 });
    }

    // Verify OTP (constant-time)
    const providedHash = sha256Hex(String(otp));
    if (!timingSafeEq(providedHash, otpHashStored)) {
      // bump attempt count
      await sessionRef.update({
        otpAttemptCount: (attempts || 0) + 1,
        updatedAt: FieldValue.serverTimestamp(),
      });
      return NextResponse.json({ error: "invalid otp" }, { status: 401 });
    }

    // Promote phone
    const tempPhone: string | undefined = s?.tempPhone;
    if (!tempPhone) {
      return NextResponse.json({ error: "no phone pending verification" }, { status: 400 });
    }

    await sessionRef.update({
      customerPhone: tempPhone,
      phoneVerifiedAt: Timestamp.fromMillis(now),
      status: "phone_verified",
      // clear OTP artifacts
      otpHash: FieldValue.delete(),
      otpGeneratedAt: FieldValue.delete(),
      otpAttemptCount: FieldValue.delete(),
      tempPhone: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Upsert customer doc
    const customerRef = db.collection("checkout_customers").doc(tempPhone);
    await db.runTransaction(async (tx) => {
      const doc = await tx.get(customerRef);
      if (!doc.exists) {
        tx.set(customerRef, {
          phone: tempPhone,
          customer_details: [], // Initialize with an empty array
          lastVerifiedAt: FieldValue.serverTimestamp(),
          createdAt: FieldValue.serverTimestamp(),
        });
      } else {
        tx.update(customerRef, { lastVerifiedAt: FieldValue.serverTimestamp() });
      }
    });

    const res = NextResponse.json({
      ok: true,
      sessionId,
      customerPhoneMasked: maskPhone(tempPhone),
    });
    
    return res;

  } catch (err) {
    console.error("verify-otp error:", err);
    return NextResponse.json({ error: "internal server error" }, { status: 500 });
  }
}
