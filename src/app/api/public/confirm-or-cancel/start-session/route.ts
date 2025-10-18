// app/api/public/confirm-or-cancel/start-session/route.ts
import { db } from "@/lib/firebase-admin";
import { getClientIP } from "@/lib/getClientIP";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
    try {
        const ip = getClientIP(req);
        const userAgent = req.headers.get('user-agent') || 'unknown';

        const { storeId } = await req.json();

        // Validate storeId
        if (!storeId || typeof storeId !== 'string' || storeId.trim() === '') {
            return NextResponse.json({ error: 'Store alias is required' }, { status: 400 });
        }

        // Rate limiting per IP to prevent session creation abuse
        const now = new Date();
        const recentSessions = await db.collection('confirm_or_cancel_sessions')
            .where('ip', '==', ip)
            .get();

        // Filter for non-expired sessions in memory
        const activeSessions = recentSessions.docs.filter(doc => {
            const data = doc.data();
            const expiresAt = data.expiresAt.toDate ? data.expiresAt.toDate() : new Date(data.expiresAt);
            return expiresAt > now;
        });

        if (activeSessions.length >= 3) { // Max 3 non-expired sessions per IP
            return NextResponse.json({ error: 'Too many active sessions' }, { status: 429 }); 
        }

        // Validate store exists
        const storeDoc = await db.collection('accounts').doc(`${storeId}.myshopify.com`).get();
        if (!storeDoc.exists) {
            return NextResponse.json({ error: 'Store not found' }, { status: 404 });
        }

        // Check if there's already an existing valid session
        const existingSessionId = req.cookies.get('confirm_cancel_session')?.value;

        if (existingSessionId) {
            const existingSessionDoc = await db.collection('confirm_or_cancel_sessions').doc(existingSessionId).get();

            if (existingSessionDoc.exists) {
                const sessionData = existingSessionDoc.data()!;
                const expiresAt = sessionData.expiresAt.toDate ? sessionData.expiresAt.toDate() : new Date(sessionData.expiresAt);

                // Check if existing session is still valid
                if (expiresAt > now && sessionData.storeId === `${storeId}.myshopify.com`) {
                    console.log(`Reusing existing session ${existingSessionId} for store ${storeId}`);

                    // Return existing session details
                    return NextResponse.json({
                        csrfToken: sessionData.csrfToken,
                        sessionId: existingSessionId,
                    });
                } else {
                    // Session expired, will create new one
                    console.log(`Session ${existingSessionId} expired`);
                }
            }
        }

        // Create new session
        const sessionId = crypto.randomUUID();
        const csrfToken = crypto.randomUUID();

        // Store session in database with Date objects
        await db.collection('confirm_or_cancel_sessions').doc(sessionId).set({
            storeId: `${storeId}.myshopify.com`,
            csrfToken,
            ip,
            userAgent,
            createdAt: new Date(),
            lastActivity: new Date(),
            expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000), // 2 hours
            requestCount: 0,
            browserFingerprint: req.headers.get('x-browser-fingerprint') || null,
        });

        // Set HTTP-only cookie without expiration
        const response = NextResponse.json({
            csrfToken,
            sessionId,
        });

        response.cookies.set('confirm_cancel_session', sessionId, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            path: '/'
        });

        console.log(`Created new session ${sessionId} for store ${storeId}, IP ${ip}`);
        return response;

    } catch (error) {
        console.error('Session creation error:', error);
        return NextResponse.json({ error: 'Failed to create session' }, { status: 500 });
    }
}