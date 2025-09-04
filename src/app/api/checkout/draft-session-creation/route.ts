
import { NextRequest, NextResponse } from "next/server";
import { db } from '@/lib/firebase-admin';
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { cookies } from "next/headers";
import crypto from 'crypto';
import 'dotenv/config';

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// --- Encryption setup ---
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const SALT_LENGTH = 64;
const TAG_LENGTH = 16;
const ENCRYPTION_KEY = process.env.CHECKOUT_SESSION_SECRET;

if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 32) {
    throw new Error('Invalid CHECKOUT_SESSION_SECRET. It must be a 32-character string.');
}

const getKey = (salt: Buffer) => crypto.pbkdf2Sync(ENCRYPTION_KEY, salt, 100000, 32, 'sha512');

function encrypt(text: string) {
    const salt = crypto.randomBytes(SALT_LENGTH);
    const iv = crypto.randomBytes(IV_LENGTH);
    const key = getKey(salt);

    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    return Buffer.concat([salt, iv, tag, encrypted]).toString('hex');
}

// --- CORS setup ---
const ALLOWED_ORIGINS = new Set(["https://ghamandclo.com"]);

function corsHeaders(origin: string) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Credentials": "true",
    "Vary": "Origin",
    "Access-Control-Max-Age": "600",
  };
}
function resolveAllowedOrigin(req: NextRequest) {
  const origin = req.headers.get("origin") || "";
  return ALLOWED_ORIGINS.has(origin) ? origin : "";
}

export async function OPTIONS(req: NextRequest) {
  const origin = resolveAllowedOrigin(req);
  if (!origin) return new NextResponse(null, { status: 204 });
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
}

export async function POST(req: NextRequest) {
  const origin = resolveAllowedOrigin(req);
  if (!origin) {
    return NextResponse.json({ error: "origin not allowed" }, { status: 403 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400, headers: corsHeaders(origin) });
  }
  
  const { shop_domain, draft_order } = body;

  if (!shop_domain || !draft_order) {
      return NextResponse.json({ error: "shop_domain and draft_order are required" }, { status: 400, headers: corsHeaders(origin) });
  }

  try {
    const accountRef = db.collection('accounts').doc(shop_domain);
    const draftOrdersCollection = accountRef.collection('draft_orders');

    const draftOrderRef = await draftOrdersCollection.add({
        ...draft_order,
        receivedAt: FieldValue.serverTimestamp()
    });

    const sessionsCollection = db.collection('checkout_sessions');
    const sessionExpiry = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes from now

    const sessionRef = await sessionsCollection.add({
        customerPhone: null,
        shopDomain: shop_domain,
        draftOrderId: draftOrderRef.id,
        status: 'pending',
        expiresAt: Timestamp.fromDate(sessionExpiry),
        createdAt: FieldValue.serverTimestamp(),
    });
    
    // Encrypt the session ID and set it in a secure cookie
    const encryptedSessionId = encrypt(sessionRef.id);
    cookies().set('checkout_session', encryptedSessionId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: 30 * 60 // 30 minutes
    });

    return NextResponse.json(
      { 
        ok: true, 
        message: "Draft order and checkout session created successfully.",
        sessionId: sessionRef.id, // For debugging/logging if needed, client shouldn't rely on this
        draftOrderId: draftOrderRef.id,
      },
      { status: 200, headers: corsHeaders(origin) }
    );

  } catch (error) {
    console.error("Error creating draft session:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
    return NextResponse.json(
        { error: "Failed to create draft session", details: errorMessage }, 
        { status: 500, headers: corsHeaders(origin) }
    );
  }
}
