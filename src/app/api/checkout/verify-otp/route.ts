// app/api/checkout/verify-otp/route.ts
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { db } from "@/lib/firebase-admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OTP_MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes
const JWT_TTL_SECONDS = 30 * 60;      // 30 minutes
const JWT_SECRET = process.env.CHECKOUT_JWT_SECRET || "";

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
    if (!JWT_SECRET || JWT_SECRET.length < 16) {
      console.error("CHECKOUT_JWT_SECRET missing/too short");
      return NextResponse.json({ error: "server config error" }, { status: 500 });
    }

    // 1) Parse input
    let body: any;
    try { body = await req.json(); } catch {
      return NextResponse.json({ error: "invalid json" }, { status: 400 });
    }
    const { sessionId, otp } = body || {};
    if (!sessionId || !otp) {
      return NextResponse.json({ error: "sessionId and otp are required" }, { status: 400 });
    }

    // 2) Load session & basic checks
    const sessionRef = db.collection("checkout_sessions").doc(sessionId);
    const snap = await sessionRef.get();
    if (!snap.exists) return NextResponse.json({ error: "invalid session" }, { status: 404 });

    const s = snap.data() as any;
    const expiresAtMs: number | undefined = s?.expiresAt?.toMillis?.();
    if (!expiresAtMs || expiresAtMs <= Date.now()) {
      return NextResponse.json({ error: "session expired" }, { status: 410 });
    }

    const otpHashStored: string | undefined = s?.otpHash;
    const otpGeneratedAtMs: number | undefined = s?.otpGeneratedAt?.toMillis?.();
    if (!otpHashStored || !otpGeneratedAtMs) {
      return NextResponse.json({ error: "no pending otp for this session" }, { status: 400 });
    }

    // 3) Expiry window
    if (Date.now() - otpGeneratedAtMs > OTP_MAX_AGE_MS) {
      await sessionRef.update({
        otpHash: FieldValue.delete(),
        otpGeneratedAt: FieldValue.delete(),
      });
      return NextResponse.json({ error: "otp expired" }, { status: 410 });
    }

    // 4) Verify OTP
    const providedHash = sha256Hex(String(otp));
    if (!timingSafeEq(providedHash, otpHashStored)) {
      return NextResponse.json({ error: "invalid otp" }, { status: 401 });
    }

    const tempPhone: string | undefined = s?.tempPhone;
    if (!tempPhone) {
      return NextResponse.json({ error: "no phone pending verification" }, { status: 400 });
    }

    // 5) Promote phone + clear OTP artifacts
    await sessionRef.update({
      customerPhone: tempPhone,
      phoneVerifiedAt: Timestamp.fromMillis(Date.now()),
      status: "phone_verified",
      otpHash: FieldValue.delete(),
      otpGeneratedAt: FieldValue.delete(),
      tempPhone: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    // 6) Create/update customer document
    const customerRef = db.collection("checkout_customers").doc(tempPhone);
    await customerRef.set(
      {
        phone: tempPhone,
        lastVerifiedAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(), // only sets on first creation
      },
      { merge: true } // Creates if !exists, merges if exists
    );


    // 7) Issue same-domain HttpOnly JWT cookie
    const nowSec = Math.floor(Date.now() / 1000);
    const token = jwt.sign(
      {
        aud: "checkout",
        iat: nowSec,
        nbf: nowSec,
        exp: nowSec + JWT_TTL_SECONDS,
        session_id: sessionId,
        phone_no: tempPhone,
      },
      JWT_SECRET,
      { algorithm: "HS256" }
    );

    const cookie = [
      `checkout_token=${token}`,
      "HttpOnly",
      "Secure",
      "SameSite=Lax", // good default for same-origin app
      "Path=/",
      `Max-Age=${JWT_TTL_SECONDS}`,
    ].join("; ");

    const res = NextResponse.json({
      ok: true,
      sessionId,
      customerPhoneMasked: maskPhone(tempPhone),
    });
    res.headers.set("Set-Cookie", cookie);
    return res;

  } catch (err) {
    console.error("verify-otp error:", err);
    return NextResponse.json({ error: "internal server error" }, { status: 500 });
  }
}
