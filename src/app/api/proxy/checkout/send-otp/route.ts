// app/api/proxy/checkout/send-otp/route.ts
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { db } from '@/lib/firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { verifyAppProxySignature } from '@/lib/verifyAppProxy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** ===================== CONFIG ===================== */
const RESEND_COOLDOWN_MS = 60_000;   // 60s between sends per session
const MAX_PER_SESSION_HR = 5;        // 5 / hour / session
const MAX_PER_PHONE_HR   = 5;        // 5 / hour / phone
const MAX_PER_IP_HR      = 20;       // 20 / hour / IP
const APP_SECRET = process.env.SHOPIFY_API_SECRET || '';
/** ================================================== */

// --- helpers ---
function generateOtp(length = 6) {
  const digits = '0123456789';
  let otp = '';
  for (let i = 0; i < length; i++) otp += digits[Math.floor(Math.random() * 10)];
  return otp;
}
function isValidIndianPhone(p: string) {
  return /^\+91[6-9]\d{9}$/.test(p);
}
function maskPhone(p?: string | null) {
  if (!p || p.length < 6) return 'your number';
  return p.slice(0, 3) + '******' + p.slice(-4);
}
function getClientIp(req: NextRequest) {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  // @ts-ignore
  return (req as any).ip || '0.0.0.0';
}

/** Firestore counter in hour buckets: otp_limits/{kind}:{key}:{bucketMs}
 *  kind ∈ {"ip","phone","session"}
 */
async function bumpFsHourlyCounter(
  kind: 'ip' | 'phone' | 'session',
  key: string,
  allowedPerHour: number,
  now: number
): Promise<{ allowed: boolean; remaining: number; resetSec: number; count: number }> {
  const hourMs = 60 * 60 * 1000;
  const bucketStart = Math.floor(now / hourMs) * hourMs;
  const docId = `${kind}:${key}:${bucketStart}`;
  const ref = db.collection('otp_limits').doc(docId);
  let count = 0;

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) {
      tx.set(ref, {
        count: 1,
        kind,
        key,
        bucketStart: Timestamp.fromMillis(bucketStart),
        expiresAt: Timestamp.fromMillis(bucketStart + 2 * hourMs), // GC after 2h
        updatedAt: FieldValue.serverTimestamp(),
      });
      count = 1;
    } else {
      count = (snap.data()?.count || 0) + 1;
      tx.update(ref, { count, updatedAt: FieldValue.serverTimestamp() });
    }
  });

  const allowed = count <= allowedPerHour;
  const remaining = Math.max(0, allowedPerHour - count);
  const resetSec = Math.ceil((bucketStart + hourMs - now) / 1000);
  return { allowed, remaining, resetSec, count };
}

export async function POST(req: NextRequest) {
  try {
    if (!APP_SECRET || APP_SECRET.length < 16) return NextResponse.json({ error: 'server config error' }, { status: 500 });
    // App Proxy signature check
    if (!verifyAppProxySignature(req.url, APP_SECRET)) {
      return NextResponse.json({ error: 'bad signature' }, { status: 401 });
    }

    const interaktApiKey = process.env.INTERAKT_API_KEY;
    if (!interaktApiKey) {
      console.error('INTERAKT_API_KEY missing');
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    // Parse body
    const { sessionId, phoneNumber, cartToken, clientNonce } = await req.json();

    // 1) Basic input validation
    if (!sessionId || !phoneNumber) {
      return NextResponse.json(
        { error: 'sessionId and phoneNumber are required' },
        { status: 400 }
      );
    }
    if (!isValidIndianPhone(phoneNumber)) {
      return NextResponse.json(
        { error: 'Invalid Indian phone number format. Expected +91XXXXXXXXXX' },
        { status: 400 }
      );
    }

    const now = Date.now();
    const ip = getClientIp(req);

    // 2) Validate session exists & not expired
    const sessionRef = db.collection('checkout_sessions').doc(sessionId);
    const snap = await sessionRef.get();

    if (!snap.exists) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 404 });
    }

    const s = snap.data() as any;
    const expiresAt = s?.expiresAt?.toMillis?.();
    if (!expiresAt || expiresAt <= now) {
      return NextResponse.json({ error: 'Session expired' }, { status: 410 });
    }
    
    const session_status: string | undefined = s?.status || undefined;
    if (session_status && session_status === 'order_created') {
      return NextResponse.json(
        {
          error: 'This checkout session has already been completed.',
          hint: `Please start a new checkout to proceed.`,
          code: 'CHECKOUT_COMPLETED',
        },
        { status: 403 }
      );
    }

    // 3) Ownership binders (if present on session, must match)
    if (s.cartToken && cartToken && s.cartToken !== cartToken) {
      return NextResponse.json({ error: 'ownership mismatch (cart)' }, { status: 403 });
    }
    if (s.clientNonce && clientNonce && s.clientNonce !== clientNonce) {
      return NextResponse.json({ error: 'device binding failed' }, { status: 403 });
    }
    // (Optional: if not set yet, bind them once)
    // await sessionRef.set({ cartToken, clientNonce }, { merge: true });

    // 4) If session already tied to a phone, only allow OTP for THAT phone
    const alreadyVerifiedPhone: string | undefined = s?.customerPhone || undefined;
    if (alreadyVerifiedPhone && alreadyVerifiedPhone !== phoneNumber) {
      return NextResponse.json(
        {
          error: 'This checkout session is already tied to a different contact.',
          hint: `Use ${maskPhone(alreadyVerifiedPhone)} to proceed.`,
          code: 'PHONE_MISMATCH',
        },
        { status: 403 }
      );
    }


    // 5) Per-session resend cooldown
    const lastSentMs: number | undefined = s?.otpLastSentAt?.toMillis?.();
    if (lastSentMs && now - lastSentMs < RESEND_COOLDOWN_MS) {
      const retry = Math.ceil((RESEND_COOLDOWN_MS - (now - lastSentMs)) / 1000);
      return NextResponse.json(
        { error: 'Too many requests. Try again later.' },
        { status: 429, headers: { 'Retry-After': String(retry) } }
      );
    }

    // 6) Hourly counters: session, phone, IP
    const [cSession, cPhone, cIp] = await Promise.all([
      bumpFsHourlyCounter('session', sessionId, MAX_PER_SESSION_HR, now),
      bumpFsHourlyCounter('phone', phoneNumber, MAX_PER_PHONE_HR, now),
      bumpFsHourlyCounter('ip', ip, MAX_PER_IP_HR, now),
    ]);

    const violated =
      !cSession.allowed ? cSession :
      !cPhone.allowed   ? cPhone   :
      !cIp.allowed      ? cIp      : null;

    if (violated) {
      return NextResponse.json(
        { error: 'rate_limited', detail: 'OTP request limit exceeded.' },
        { status: 429, headers: { 'Retry-After': String(violated.resetSec) } }
      );
    }

    // 7) Generate OTP and store HASH ONLY; also stamp otpLastSentAt
    const otp = generateOtp(6);
    const otpHash = crypto.createHash('sha256').update(otp).digest('hex');

    await sessionRef.update({
      otpHash,
      otpGeneratedAt: FieldValue.serverTimestamp(),
      otpLastSentAt: FieldValue.serverTimestamp(), // for cooldown
      tempPhone: alreadyVerifiedPhone ? alreadyVerifiedPhone : phoneNumber,
      updatedAt: FieldValue.serverTimestamp(),
    });

    // 8) Send OTP via Interakt
    const endpoint = 'https://api.interakt.ai/v1/public/message/';
    const headers = {
      Authorization: `Basic ${interaktApiKey}`,
      'Content-Type': 'application/json',
    };
    const body = {
      phoneNumber: phoneNumber.substring(3), // "9876543210"
      countryCode: '+91',
      type: 'Template',
      template: {
        name: 'checkout_otp_verification',
        languageCode: 'en',
        bodyValues: [otp],
        buttonValues: { '0': ['checkout'] },
      },
      // callbackData: `session:${sessionId}` // optional for webhook correlation
    };

    const resp = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(body) });
    if (!resp.ok) {
      let details: unknown;
      try { details = await resp.json(); } catch { /* ignore parse error */ }
      console.error('Interakt API Error:', details ?? resp.statusText);
      return NextResponse.json(
        { error: 'Failed to send OTP via Interakt', details },
        { status: resp.status }
      );
    }

    // 9) Success — DO NOT return the OTP
    return NextResponse.json({
      ok: true,
      message: `OTP sent to ${maskPhone(phoneNumber)}.`,
      alreadyVerified: Boolean(alreadyVerifiedPhone),
      limits: {
        sessionRemaining: cSession.remaining,
        phoneRemaining: cPhone.remaining,
        ipRemaining: cIp.remaining,
      },
    });
  } catch (error) {
    console.error('Error in send-otp route:', error);
    return NextResponse.json(
      { error: 'An internal server error occurred' },
      { status: 500 }
    );
  }
}
