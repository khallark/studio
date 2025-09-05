import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { db } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// --- helpers ---
function generateOtp(length = 6) {
  const digits = '0123456789';
  let otp = '';
  for (let i = 0; i < length; i++) {
    otp += digits[Math.floor(Math.random() * 10)];
  }
  return otp;
}

function isValidIndianPhone(p: string) {
  return /^\+91[6-9]\d{9}$/.test(p);
}

function maskPhone(p?: string | null) {
  if (!p || p.length < 6) return 'your number';
  // "+91XXXXXXXXXX" -> "+91******1234"
  return p.slice(0, 3) + '******' + p.slice(-4);
}

export async function POST(req: NextRequest) {
  try {
    const { sessionId, phoneNumber } = await req.json();

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

    const interaktApiKey = process.env.INTERAKT_API_KEY;
    if (!interaktApiKey) {
      console.error('INTERAKT_API_KEY missing');
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    // 2) Validate session exists & not expired
    const sessionRef = db.collection('checkout_sessions').doc(sessionId);
    const snap = await sessionRef.get();

    if (!snap.exists) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 404 });
    }

    const s = snap.data() as any;
    const expiresAt = s?.expiresAt?.toMillis?.();
    if (!expiresAt || expiresAt <= Date.now()) {
      return NextResponse.json({ error: 'Session expired' }, { status: 410 });
    }

    // 3) If session already tied to a phone, only allow OTP for THAT phone
    const alreadyVerifiedPhone: string | undefined = s?.customerPhone || undefined;
    if (alreadyVerifiedPhone) {
      if (alreadyVerifiedPhone !== phoneNumber) {
        return NextResponse.json(
          {
            error: 'This session is already tied to a different contact.',
            hint: `Use ${maskPhone(alreadyVerifiedPhone)} to proceed.`,
            code: 'PHONE_MISMATCH',
          },
          { status: 403 }
        );
      }
      // else: phone matches bound contact → allow re-auth; keep tempPhone in sync
    }

    // 4) Generate OTP and store HASH ONLY
    const otp = generateOtp(6);
    const otpHash = crypto.createHash('sha256').update(otp).digest('hex');

    await sessionRef.update({
      otpHash,
      otpGeneratedAt: FieldValue.serverTimestamp(),
      // If already verified, keep tempPhone = bound phone (so verify step can proceed uniformly)
      tempPhone: alreadyVerifiedPhone ? alreadyVerifiedPhone : phoneNumber,
      updatedAt: FieldValue.serverTimestamp(),
    });

    // 5) Send OTP via Interakt
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
        name: 'checkout_otp_verification', // ensure this template exists in Interakt
        languageCode: 'en',
        bodyValues: [otp],                  // fills {{1}} in template body
        buttonValues: { '0': ['checkout'] } // if your template uses a button var
      },
      // callbackData: `session:${sessionId}` // optional for webhook correlation
    };

    const resp = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      let details: unknown;
      try {
        details = await resp.json();
      } catch {
        /* ignore parse error */
      }
      console.error('Interakt API Error:', details ?? resp.statusText);
      return NextResponse.json(
        { error: 'Failed to send OTP via Interakt', details },
        { status: resp.status }
      );
    }

    // 6) Success — DO NOT return the OTP
    return NextResponse.json({
      ok: true,
      message: `OTP sent to ${maskPhone(phoneNumber)}.`,
      alreadyVerified: Boolean(alreadyVerifiedPhone),
    });
  } catch (error) {
    console.error('Error in send-otp route:', error);
    return NextResponse.json(
      { error: 'An internal server error occurred' },
      { status: 500 }
    );
  }
}
