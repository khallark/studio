// src/app/api/public/book-return/start-session/route.ts

import { db } from "@/lib/firebase-admin";
import { getClientIP } from "@/lib/getClientIP";
import { NextRequest, NextResponse } from "next/server";

const SESSION_DURATION_MS = 2 * 60 * 60 * 1000; // 2 hours
const MAX_ACTIVE_SESSIONS_PER_IP = 3;

function normalizeStoreId(input: string): string {
    const trimmed = input.trim().toLowerCase();

    if (trimmed.endsWith(".myshopify.com")) {
        return trimmed;
    }

    return `${trimmed}.myshopify.com`;
}

function toDate(value: any): Date {
    if (!value) return new Date(0);
    return value.toDate ? value.toDate() : new Date(value);
}

export async function POST(req: NextRequest) {
    try {
        const ip = getClientIP(req);
        const userAgent = req.headers.get("user-agent") || "unknown";

        const body = await req.json();
        const storeAlias = body.storeId;

        if (
            !storeAlias ||
            typeof storeAlias !== "string" ||
            storeAlias.trim() === ""
        ) {
            return NextResponse.json(
                { error: "Store alias is required" },
                { status: 400 }
            );
        }

        const normalizedStoreId = normalizeStoreId(storeAlias);
        const now = new Date();

        /**
         * Validate store exists and book-return page is enabled.
         * Orders/settings are still under accounts/{storeId}.
         */
        const storeDoc = await db
            .collection("accounts")
            .doc(normalizedStoreId)
            .get();

        if (
            !storeDoc.exists ||
            !storeDoc.data()?.customerServices?.bookReturnPage?.enabled
        ) {
            return NextResponse.json(
                { error: "Store not found" },
                { status: 404 }
            );
        }

        /**
         * Find the business that owns this store.
         * This removes shared-store assumptions.
         */
        const businessSnapshot = await db
            .collection("users")
            .where("stores", "array-contains", normalizedStoreId)
            .limit(1)
            .get();

        if (businessSnapshot.empty) {
            console.error(`No business owner found for store ${normalizedStoreId}`);

            return NextResponse.json(
                { error: "Store owner not found" },
                { status: 404 }
            );
        }

        const businessId = businessSnapshot.docs[0].id;

        /**
         * Reuse existing valid session first.
         * Do this before rate limiting so page refreshes do not unnecessarily
         * count against the customer.
         */
        const existingSessionId = req.cookies.get("customer_session")?.value;

        if (existingSessionId) {
            const existingSessionDoc = await db
                .collection("book_return_sessions")
                .doc(existingSessionId)
                .get();

            if (existingSessionDoc.exists) {
                const sessionData = existingSessionDoc.data()!;
                const expiresAt = toDate(sessionData.expiresAt);

                if (
                    expiresAt > now &&
                    sessionData.storeId === normalizedStoreId &&
                    sessionData.businessId === businessId
                ) {
                    console.log(
                        `Reusing existing session ${existingSessionId} for business ${businessId}, store ${normalizedStoreId}`
                    );

                    return NextResponse.json(
                        {
                            csrfToken: sessionData.csrfToken,
                            sessionId: existingSessionId,
                        },
                        { status: 200 }
                    );
                }

                console.log(
                    `Existing session ${existingSessionId} is expired or scoped to another store/business`
                );
            }
        }

        /**
         * Rate limiting per IP to prevent session creation abuse.
         * Only checked when we are actually creating a new session.
         */
        const recentSessions = await db
            .collection("book_return_sessions")
            .where("ip", "==", ip)
            .get();

        const activeSessions = recentSessions.docs.filter((doc) => {
            const data = doc.data();
            const expiresAt = toDate(data.expiresAt);
            return expiresAt > now;
        });

        if (activeSessions.length >= MAX_ACTIVE_SESSIONS_PER_IP) {
            return NextResponse.json(
                { error: "Too many active sessions" },
                { status: 429 }
            );
        }

        /**
         * Create new session.
         */
        const sessionId = crypto.randomUUID();
        const csrfToken = crypto.randomUUID();
        const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

        await db.collection("book_return_sessions").doc(sessionId).set({
            businessId,
            storeId: normalizedStoreId,
            storeAlias: storeAlias.trim().toLowerCase(),

            csrfToken,
            ip,
            userAgent,

            createdAt: new Date(),
            lastActivity: new Date(),
            expiresAt,
            requestCount: 0,

            browserFingerprint: req.headers.get("x-browser-fingerprint") || null,
        });

        const response = NextResponse.json(
            {
                csrfToken,
                sessionId,
            },
            { status: 200 }
        );

        response.cookies.set("customer_session", sessionId, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "strict",
            path: "/",
            maxAge: SESSION_DURATION_MS / 1000,
        });

        console.log(
            `Created new session ${sessionId} for business ${businessId}, store ${normalizedStoreId}, IP ${ip}`
        );

        return response;

    } catch (error) {
        console.error("Session creation error:", error);

        if (error instanceof SyntaxError) {
            return NextResponse.json(
                { error: "Invalid request format" },
                { status: 400 }
            );
        }

        return NextResponse.json(
            { error: "Failed to create session" },
            { status: 500 }
        );
    }
}