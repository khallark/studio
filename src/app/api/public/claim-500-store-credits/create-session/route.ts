// app/api/public/claim-500-store-credits/create-session/route.ts
//
// POST { storeId, name, phone, email }
// -> creates a claim-500 session, dispatches a WhatsApp OTP, sets an http-only
//    cookie, and returns the CSRF token the client must echo on later calls.

import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import crypto from "crypto";

import { db } from "@/lib/firebase-admin";
import { getClientIP } from "@/lib/getClientIP";
import {
  CLAIM,
  isValidEmail,
  isValidIndianMobile,
  normalizePhone10,
  emailKey,
  genOtp,
  hashOtp,
  redemptionDocId,
  maskPhone,
} from "@/lib/claim500/helpers";
import { sendClaim500OtpWhatsAppMessage } from "@/lib/communication/whatsappMessagesSendingFuncs";

const isProd = process.env.NODE_ENV === "production";

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIP(req);
    const body = await req.json().catch(() => ({}));

    const storeId = String(body.storeId || "").trim().toLowerCase();
    const name = String(body.name || "").trim();
    const phone = String(body.phone || "").trim();
    const email = emailKey(body.email || "");

    // ---- input validation -------------------------------------------------
    if (!storeId) return bad("MISSING_STORE", 400);
    if (name.length < 2 || name.length > 80) return bad("INVALID_NAME", 400);
    if (!isValidIndianMobile(phone)) return bad("INVALID_PHONE", 400);
    if (!isValidEmail(email)) return bad("INVALID_EMAIL", 400);

    const shopName = `${storeId}.myshopify.com`;

    // ---- store must exist & be configured ---------------------------------
    const accountSnap = await db.collection(CLAIM.ACCOUNTS).doc(shopName).get();
    if (!accountSnap.exists) return bad("STORE_NOT_FOUND", 404);

    const account = accountSnap.data()!;
    if (
      !account.accessToken ||
      !account.whatsappPhoneNumberId ||
      !account.whatsappAccessToken
    ) {
      return bad("STORE_NOT_CONFIGURED", 503);
    }

    // ---- already redeemed? (soft check; hard guard is in process-claim) ----
    const redemptionRef = db
      .collection(CLAIM.REDEMPTIONS)
      .doc(redemptionDocId(storeId, email));
    const redemptionSnap = await redemptionRef.get();
    if (redemptionSnap.exists && redemptionSnap.data()?.status === "completed") {
      return bad("ALREADY_CLAIMED", 409);
    }

    // ---- abuse limits (single-field queries; filtered in memory) ----------
    const oneHourAgo = Date.now() - 3600_000;

    const ipDocs = await db
      .collection(CLAIM.SESSIONS)
      .where("ip", "==", ip)
      .limit(80)
      .get();
    const ipRecent = ipDocs.docs.filter(
      (d) => tsMs(d.data().createdAt) > oneHourAgo,
    ).length;
    if (ipRecent >= CLAIM.MAX_SESSIONS_PER_IP_PER_HOUR) {
      return bad("RATE_LIMITED", 429);
    }

    const phone10 = normalizePhone10(phone);
    const phoneDocs = await db
      .collection(CLAIM.SESSIONS)
      .where("phone", "==", phone10)
      .limit(80)
      .get();
    const phoneRecent = phoneDocs.docs.filter(
      (d) => tsMs(d.data().createdAt) > oneHourAgo,
    ).length;
    if (phoneRecent >= CLAIM.MAX_OTP_PER_PHONE_PER_HOUR) {
      return bad("RATE_LIMITED", 429);
    }

    // ---- create session ---------------------------------------------------
    const sessionId = crypto.randomBytes(24).toString("hex");
    const csrfToken = crypto.randomUUID();
    const otp = genOtp();
    const expiresAt = new Date(Date.now() + CLAIM.SESSION_TTL_MIN * 60_000);

    await db.collection(CLAIM.SESSIONS).doc(sessionId).set({
      storeId,
      shopName,
      name,
      phone: phone10,
      email,
      otpHash: hashOtp(otp, sessionId),
      otpAttempts: 0,
      otpVerified: false,
      status: "pending", // pending -> verified -> processing -> completed | expired
      csrfToken,
      ip,
      userAgent: req.headers.get("user-agent") || null,
      createdAt: FieldValue.serverTimestamp(),
      lastOtpSentAt: FieldValue.serverTimestamp(),
      expiresAt,
    });

    // ---- dispatch OTP -----------------------------------------------------
    const shop = {
      shopName,
      whatsappPhoneNumberId: account.whatsappPhoneNumberId,
      whatsappAccessToken: account.whatsappAccessToken,
    };
    const sent = await sendClaim500OtpWhatsAppMessage(shop, phone, otp, sessionId);

    if (!sent) {
      await db.collection(CLAIM.SESSIONS).doc(sessionId).delete().catch(() => {});
      return bad("OTP_SEND_FAILED", 502);
    }

    // ---- response + http-only cookie --------------------------------------
    const res = NextResponse.json({
      success: true,
      csrfToken,
      maskedPhone: maskPhone(phone),
      expiresInSeconds: CLAIM.SESSION_TTL_MIN * 60,
      resendCooldownSeconds: CLAIM.RESEND_COOLDOWN_SEC,
    });

    res.cookies.set(CLAIM.COOKIE, sessionId, {
      httpOnly: true,
      secure: isProd,
      sameSite: "strict",
      maxAge: CLAIM.SESSION_TTL_MIN * 60,
      path: CLAIM.COOKIE_PATH,
    });

    return res;
  } catch (err) {
    console.error("[claim-500 create-session]", err);
    return bad("INTERNAL_ERROR", 500);
  }
}

function bad(code: string, status: number) {
  return NextResponse.json({ error: code }, { status });
}

function tsMs(ts: any): number {
  if (!ts) return 0;
  if (typeof ts.toDate === "function") return ts.toDate().getTime();
  return new Date(ts).getTime();
}