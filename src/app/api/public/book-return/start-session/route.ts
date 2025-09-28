import { db } from "@/lib/firebase-admin";
import { getClientIP } from "@/lib/getClientIP";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";

// --- Config ---
const TTL_SEC = 20;                 // session lifetime (seconds)
const TTL_MS  = TTL_SEC * 1000;     // session lifetime (ms)

// /api/public/book-return/start-session/route.ts
export async function POST(req: NextRequest) {
  try {
    const ip = getClientIP(req);
    const userAgent = req.headers.get("user-agent") || "unknown";
    const browserFingerprint = req.headers.get("x-browser-fingerprint") || null;

    const body = await req.json().catch(() => ({}));
    const alias = typeof body?.storeId === "string" ? body.storeId.trim() : "";
    if (!alias) {
      return NextResponse.json({ error: "Store alias is required" }, { status: 400 });
    }
    const storeId = `${alias}.myshopify.com`;

    // Use Firestore clock as the single time source
    const nowTs = Timestamp.now();

    // --- Optional hygiene: proactively deactivate expired sessions for this IP (prevents rate-limit lock) ---
    // const expiredSnap = await db
    //   .collection("book_return_sessions")
    //   .where("ip", "==", ip)
    //   .where("isActive", "==", true)
    //   .where("expiresAt", "<=", nowTs)
    //   .get();

    // if (!expiredSnap.empty) {
    //   const batch = db.batch();
    //   expiredSnap.forEach((d) => {
    //     batch.update(d.ref, {
    //       isActive: false,
    //       endedAt: FieldValue.serverTimestamp(),
    //       endReason: "expired",
    //     });
    //   });
    //   await batch.commit();
    // }

    // --- Rate limit: only count still-valid active sessions ---
    // const recentSessions = await db
    //   .collection("book_return_sessions")
    //   .where("ip", "==", ip)
    //   .where("isActive", "==", true)
    //   .where("expiresAt", ">", nowTs) // exclude expired
    //   .get();

    // if (recentSessions.size >= 3) {
    //   return NextResponse.json({ error: "Too many active sessions" }, { status: 429 });
    // }

    // --- Validate store exists & feature flag ---
    const storeDoc = await db.collection("accounts").doc(storeId).get();
    if (!storeDoc.exists || !storeDoc.data()?.customerServices?.bookReturnPage?.enabled) {
      return NextResponse.json({ error: "Store not found" }, { status: 404 });
    }

    // --- Reuse existing valid session (sliding TTL) ---
    const existingSessionId = req.cookies.get("customer_session")?.value;
    if (existingSessionId) {
      const existingDoc = await db.collection("book_return_sessions").doc(existingSessionId).get();
      if (existingDoc.exists) {
        const s = existingDoc.data()!;
        const expMs =
          s?.expiresAt?.toMillis?.() ? s.expiresAt.toMillis()
          : s?.expiresAt instanceof Date ? s.expiresAt.getTime()
          : NaN;

        const nowMs = nowTs.toMillis();
        const reusable =
          Number.isFinite(expMs) &&
          expMs > nowMs &&
          s.isActive !== false &&
          s.storeId === storeId;

        if (reusable) {
          // Extend TTL & touch activity (sliding window)
          const newExpMs = nowMs + TTL_MS;
          await existingDoc.ref.update({
            lastActivity: FieldValue.serverTimestamp(),
            expiresAt: Timestamp.fromMillis(newExpMs),
          });

          const res = NextResponse.json({
            csrfToken: s.csrfToken,
            sessionId: existingSessionId,
          });

          // Refresh cookie TTL to match DB
          res.cookies.set("customer_session", existingSessionId, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "strict",
            path: "/",
            maxAge: TTL_SEC,
            expires: new Date(newExpMs), // Expires is UTC by spec
          });

          return res;
        } else {
          // Deactivate stale/invalid session; fall through to create a new one
          await existingDoc.ref.update({
            isActive: false,
            endedAt: FieldValue.serverTimestamp(),
            endReason: "expired_or_invalid",
          });
        }
      }
    }

    // --- Create a new session ---
    const sessionId = crypto.randomUUID();
    const csrfToken = crypto.randomUUID();

    const startMs = Timestamp.now().toMillis(); // fresh "now" for aligned DB+cookie expiry
    const expMs = startMs + TTL_MS;

    await db.collection("book_return_sessions").doc(sessionId).set({
      storeId,
      csrfToken,
      ip,
      userAgent,
      browserFingerprint,
      createdAt: FieldValue.serverTimestamp(),
      lastActivity: FieldValue.serverTimestamp(),
      expiresAt: Timestamp.fromMillis(expMs),
      requestCount: 0,
      isActive: true,
    });

    const res = NextResponse.json({ csrfToken, sessionId });
    res.cookies.set("customer_session", sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: TTL_SEC,           // 20 seconds
      expires: new Date(expMs),  // explicit Expires (UTC)
    });

    return res;
  } catch (error) {
    console.error("Session creation error:", error);
    return NextResponse.json({ error: "Failed to create session" }, { status: 500 });
  }
}
