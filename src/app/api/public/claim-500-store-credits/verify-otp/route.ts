// app/api/public/claim-500-store-credits/verify-otp/route.ts
//
// POST { otp }   (session via cookie, CSRF via x-csrf-token header)
// -> verifies the OTP with a transactional attempt counter.

import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";

import { db } from "@/lib/firebase-admin";
import {
  CLAIM,
  validateClaim500Session,
  hashOtp,
  safeEqualHex,
  claimErrorPayload,
} from "@/lib/claim500/helpers";

export async function POST(req: NextRequest) {
  try {
    const { sessionId, session, ref } = await validateClaim500Session(req);

    const body = await req.json().catch(() => ({}));
    const otp = String(body.otp || "").replace(/\D/g, "");
    if (otp.length !== 6) {
      return NextResponse.json({ error: "INVALID_OTP_FORMAT" }, { status: 400 });
    }

    // Already verified — idempotent success.
    if (session.otpVerified) {
      return NextResponse.json({ success: true, alreadyVerified: true });
    }
    if (session.status !== "pending") {
      return NextResponse.json({ error: "INVALID_STATE" }, { status: 409 });
    }

    const expected = hashOtp(otp, sessionId);

    const result = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const d = snap.data()!;

      if (d.otpVerified) return { ok: true as const };
      const attempts = d.otpAttempts || 0;
      if (attempts >= CLAIM.MAX_OTP_ATTEMPTS) {
        tx.update(ref, { status: "expired" });
        return { ok: false as const, locked: true };
      }

      if (safeEqualHex(expected, d.otpHash)) {
        tx.update(ref, {
          otpVerified: true,
          status: "verified",
          verifiedAt: FieldValue.serverTimestamp(),
        });
        return { ok: true as const };
      }

      const next = attempts + 1;
      const locked = next >= CLAIM.MAX_OTP_ATTEMPTS;
      tx.update(ref, {
        otpAttempts: next,
        ...(locked ? { status: "expired" } : {}),
      });
      return {
        ok: false as const,
        locked,
        attemptsLeft: Math.max(0, CLAIM.MAX_OTP_ATTEMPTS - next),
      };
    });

    if (result.ok) {
      return NextResponse.json({ success: true });
    }
    if (result.locked) {
      return NextResponse.json(
        { error: "TOO_MANY_ATTEMPTS" },
        { status: 429 },
      );
    }
    return NextResponse.json(
      { error: "INCORRECT_OTP", attemptsLeft: result.attemptsLeft },
      { status: 401 },
    );
  } catch (err) {
    const { code, status } = claimErrorPayload(err);
    if (status === 500) console.error("[claim-500 verify-otp]", err);
    return NextResponse.json({ error: code }, { status });
  }
}