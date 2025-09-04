// app/api/checkout/session/route.ts
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import crypto from "crypto";

const ALGO = "aes-256-gcm";
const IV_LEN = 16;
const SALT_LEN = 64;
const TAG_LEN = 16;
const KEY = process.env.CHECKOUT_SESSION_SECRET!; // must be 32 chars

function keyFromSalt(salt: Buffer) {
  return crypto.pbkdf2Sync(KEY, salt, 100000, 32, "sha512");
}
function decrypt(hex: string) {
  const buf = Buffer.from(hex, "hex");
  const salt = buf.subarray(0, SALT_LEN);
  const iv   = buf.subarray(SALT_LEN, SALT_LEN + IV_LEN);
  const tag  = buf.subarray(SALT_LEN + IV_LEN, SALT_LEN + IV_LEN + TAG_LEN);
  const enc  = buf.subarray(SALT_LEN + IV_LEN + TAG_LEN);
  const k = keyFromSalt(salt);
  const d = crypto.createDecipheriv(ALGO, k, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
}

export async function GET(_req: NextRequest) {
  try {
    const c = (await cookies()).get("checkout_session");
    if (!c) {
        console.error("No checkout_session cookie found.");
        return NextResponse.json({ error: "no_cookie" }, { status: 401 });
    }

    // Decrypt to raw value (sessionId)
    const sessionId = decrypt(c.value);

    // Return only what you need right now
    return NextResponse.json({ sessionId }, { status: 200 });
  } catch (err) {
    console.error("Error decrypting checkout_session cookie:", err);
    return NextResponse.json({ error: "bad_cookie" }, { status: 401 });
  }
}
