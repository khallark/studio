// lib/claim500/helpers.ts
//
// Shared constants + helpers for the "Claim ₹500 store credits" public flow.
// Mirrors the session/CSRF conventions used by book-return and confirm-or-cancel.

import { NextRequest } from "next/server";
import crypto from "crypto";
import { db } from "@/lib/firebase-admin";

export const CLAIM = {
  // Firestore
  SESSIONS: "claim-500",
  REDEMPTIONS: "claim-500-redemptions",
  ACCOUNTS: "accounts",

  // Cookie
  COOKIE: "claim500_session",
  COOKIE_PATH: "/api/public/claim-500-store-credits",

  // Lifecycle
  SESSION_TTL_MIN: 15, // OTP is valid for the whole session
  MAX_OTP_ATTEMPTS: 5,
  RESEND_COOLDOWN_SEC: 30,

  // Abuse limits (counted in-memory over a 1h window to avoid composite indexes)
  MAX_SESSIONS_PER_IP_PER_HOUR: 6,
  MAX_OTP_PER_PHONE_PER_HOUR: 4,

  // Reward
  CREDIT_AMOUNT: "500.00",
  CREDIT_CURRENCY: "INR",

  // Shopify
  SHOPIFY_API_VERSION: "2025-07", // bump as Shopify releases new stable versions
} as const;

/** Typed error so routes can map a single catch to the right HTTP status. */
export class ClaimError extends Error {
  status: number;
  code: string;
  constructor(code: string, status: number) {
    super(code);
    this.code = code;
    this.status = status;
    this.name = "ClaimError";
  }
}

/** Map a ClaimError (or unknown) to a JSON response shape. */
export function claimErrorPayload(e: unknown): { code: string; status: number } {
  if (e instanceof ClaimError) return { code: e.code, status: e.status };
  return { code: "INTERNAL_ERROR", status: 500 };
}

// ---------------------------------------------------------------------------
// Validation / formatting
// ---------------------------------------------------------------------------

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}

export function emailKey(email: string): string {
  return String(email || "").trim().toLowerCase();
}

/** Last 10 digits — matches the convention in whatsappMessagesSendingFuncs.ts */
export function normalizePhone10(raw: string): string {
  return String(raw || "").replace(/\D/g, "").slice(-10);
}

export function isValidIndianMobile(raw: string): boolean {
  const ten = normalizePhone10(raw);
  return /^[6-9]\d{9}$/.test(ten);
}

/** E.164 for Shopify (+91XXXXXXXXXX). */
export function toE164India(raw: string): string {
  return "+91" + normalizePhone10(raw);
}

export function maskPhone(raw: string): string {
  const ten = normalizePhone10(raw);
  if (ten.length < 4) return "•••• ••••";
  return `+91 •••••• ${ten.slice(-4)}`;
}

export function splitName(full: string): { firstName: string; lastName: string } {
  const parts = String(full || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

// ---------------------------------------------------------------------------
// OTP
// ---------------------------------------------------------------------------

/** Cryptographically-random 6-digit code. */
export function genOtp(): string {
  // 0..999999, zero-padded — uniform via rejection-free modulo on a large range
  const n = crypto.randomInt(0, 1_000_000);
  return n.toString().padStart(6, "0");
}

/** OTP is never stored in plaintext; we keep a salted SHA-256 hash. */
export function hashOtp(otp: string, salt: string): string {
  return crypto
    .createHash("sha256")
    .update(`${salt}:${String(otp).trim()}`)
    .digest("hex");
}

/** Constant-time compare for the stored hash. */
export function safeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a || "", "hex");
  const bb = Buffer.from(b || "", "hex");
  if (ab.length !== bb.length || ab.length === 0) return false;
  return crypto.timingSafeEqual(ab, bb);
}

// ---------------------------------------------------------------------------
// Redemption lock id (idempotency key)
// ---------------------------------------------------------------------------

/** Deterministic, Firestore-safe doc id for the per-store, per-email lock. */
export function redemptionDocId(storeId: string, email: string): string {
  return crypto
    .createHash("sha256")
    .update(`${storeId}:${emailKey(email)}`)
    .digest("hex");
}

// ---------------------------------------------------------------------------
// Session validation (cookie + CSRF + expiry)
// ---------------------------------------------------------------------------

export interface ValidatedSession {
  sessionId: string;
  session: any;
  ref: FirebaseFirestore.DocumentReference;
}

export async function validateClaim500Session(
  req: NextRequest,
): Promise<ValidatedSession> {
  const sessionId = req.cookies.get(CLAIM.COOKIE)?.value;
  const csrf = req.headers.get("x-csrf-token");

  if (!sessionId) throw new ClaimError("NO_SESSION", 401);
  if (!csrf) throw new ClaimError("NO_CSRF_TOKEN", 403);

  const ref = db.collection(CLAIM.SESSIONS).doc(sessionId);
  const snap = await ref.get();
  if (!snap.exists) throw new ClaimError("INVALID_SESSION", 401);

  const session = snap.data()!;
  if (session.csrfToken !== csrf) throw new ClaimError("BAD_CSRF_TOKEN", 403);
  if (session.status === "expired") throw new ClaimError("SESSION_EXPIRED", 401);

  const expiresAt =
    typeof session.expiresAt?.toDate === "function"
      ? session.expiresAt.toDate()
      : new Date(session.expiresAt);

  if (!expiresAt || expiresAt.getTime() < Date.now()) {
    await ref.update({ status: "expired" }).catch(() => {});
    throw new ClaimError("SESSION_EXPIRED", 401);
  }

  return { sessionId, session, ref };
}

/** True if a Firestore Timestamp/Date is within the last `seconds`. */
export function isRecent(ts: any, seconds: number): boolean {
  if (!ts) return false;
  const d = typeof ts?.toDate === "function" ? ts.toDate() : new Date(ts);
  return Date.now() - d.getTime() < seconds * 1000;
}