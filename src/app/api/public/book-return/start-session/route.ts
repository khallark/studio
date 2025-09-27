import { db } from "@/lib/firebase-admin";
import { getClientIP } from "@/lib/getClientIP";
import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";

// /api/public/book-return/start-session/route.ts
export async function POST(req: NextRequest) {
try {
    const ip = getClientIP(req);
    const userAgent = req.headers.get('user-agent') || 'unknown';

    const { storeAlias } = await req.json();

    // Validate storeAlias
    if (!storeAlias || typeof storeAlias !== 'string' || storeAlias.trim() === '') {
        return NextResponse.json({ error: 'Store alias is required' }, { status: 400 });
    }

    // Rate limiting per IP to prevent session creation abuse
    const recentSessions = await db.collection('customer_sessions')
        .where('ip', '==', ip)
        .where('isActive', '==', true)  // Only active sessions
        .get();

    if (recentSessions.size >= 3) { // Max 3 active sessions per IP
        return NextResponse.json({ error: 'Too many active sessions' }, { status: 429 });
    }

    // Validate store exists and has customer service enabled
    const storeIdDoc = await db.collection('store_aliases').doc(storeAlias).get();
    if (!storeIdDoc.exists) {
        return NextResponse.json({ error: "Store alias doesn't exists" }, { status: 404 })
    }
    const storeId = storeIdDoc.data()?.mapped_store;
    const storeDoc = await db.collection('accounts').doc(storeId).get();
    if (!storeDoc.exists || !storeDoc.data()?.customerServices?.bookReturnPage?.enabled) {
        return NextResponse.json({ error: 'Store not found' }, { status: 404 });
    }

    // Check if there's already an existing valid session
    const existingSessionId = req.cookies.get('customer_session')?.value;

    if (existingSessionId) {
        const existingSessionDoc = await db.collection('customer_sessions').doc(existingSessionId).get();

        if (existingSessionDoc.exists) {
            const sessionData = existingSessionDoc.data()!;
            const now = new Date();
            const expiresAt = sessionData.expiresAt.toDate();

            // Check if existing session is still valid
            if (sessionData.isActive && sessionData.storeId === storeId && expiresAt > now) {
                console.log(`Reusing existing session ${existingSessionId} for store ${storeId}`);

                // Return existing session details
                return NextResponse.json({
                    csrfToken: sessionData.csrfToken,
                    sessionId: existingSessionId,
                });
            } else {
                // Clean up expired/invalid session
                await db.collection('customer_sessions').doc(existingSessionId).update({
                    isActive: false,
                    endedAt: FieldValue.serverTimestamp(),
                    endReason: 'expired_or_invalid'
                });
                console.log(`Cleaned up expired session ${existingSessionId}`);
            }
        }
    }

    // Create new session
    const sessionId = crypto.randomUUID();
    const csrfToken = crypto.randomUUID();

    // Store session in database
    await db.collection('customer_sessions').doc(sessionId).set({
        storeId: storeId,
        storeAlias: storeAlias.trim(),
        csrfToken,
        ip,
        userAgent,
        createdAt: FieldValue.serverTimestamp(),
        lastActivity: FieldValue.serverTimestamp(),
        expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000), // 2 hours
        requestCount: 0,
        isActive: true,
        browserFingerprint: req.headers.get('x-browser-fingerprint') || null,
    });

    // Set HTTP-only cookie
    const response = NextResponse.json({
        csrfToken,
        sessionId,
    });

    response.cookies.set('customer_session', sessionId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 2 * 60 * 60, // 2 hours
        path: '/' // More flexible path
    });

    console.log(`Created new session ${sessionId} for store ${storeId}, IP ${ip}`);
    return response;

} catch (error) {
    console.error('Session creation error:', error);
    return NextResponse.json({ error: 'Failed to create session' }, { status: 500 });
}
}