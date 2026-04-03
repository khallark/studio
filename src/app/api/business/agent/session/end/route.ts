// app/api/business/agent/session/end/route.ts
//
// Called in two ways:
//   1. Normal close — fetch() from the client
//   2. Page unload  — keepalive fetch() from beforeunload
//
// Both send JSON in the request body.

import { NextRequest, NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { db } from '@/lib/firebase-admin';
import { authUserForBusiness } from '@/lib/authoriseUser';
import { AgentSession } from '@/types/agent';

export async function POST(req: NextRequest) {
    try {
        const { businessId, sessionId }: { businessId: string; sessionId: string } =
            await req.json();

        // ============================================================
        // VALIDATION
        // ============================================================

        if (!businessId || typeof businessId !== 'string') {
            return NextResponse.json(
                { error: 'Validation Error', message: 'businessId is required and must be a string' },
                { status: 400 }
            );
        }

        if (!sessionId || typeof sessionId !== 'string') {
            return NextResponse.json(
                { error: 'Validation Error', message: 'sessionId is required and must be a string' },
                { status: 400 }
            );
        }

        // ============================================================
        // AUTH
        // ============================================================

        const authResult = await authUserForBusiness({ req, businessId });
        if (!authResult.authorised) {
            console.log(authResult.error);
            return NextResponse.json(
                { error: authResult.error },
                { status: authResult.status }
            );
        }

        // ============================================================
        // CORE LOGIC
        // ============================================================

        const sessionRef = db
            .collection('users')
            .doc(businessId)
            .collection('agent_sessions')
            .doc(sessionId);

        const sessionSnap = await sessionRef.get();

        if (!sessionSnap.exists) {
            // Treat as success — idempotent, nothing to end.
            return NextResponse.json(
                { success: true, message: 'Session not found — nothing to end' },
                { status: 200 }
            );
        }

        const session = sessionSnap.data() as AgentSession;

        // 'ended' is the only terminal state — all others can be ended.
        if (session.endedAt !== null) {
            return NextResponse.json(
                { success: true, message: 'Session already ended' },
                { status: 200 }
            );
        }

        await sessionRef.update({
            status: 'ended' as AgentSession['status'],
            endedAt: Timestamp.now(),
        });

        // ============================================================
        // RETURN SUCCESS RESPONSE
        // ============================================================

        return NextResponse.json(
            { success: true, message: 'Session ended successfully' },
            { status: 200 }
        );

    } catch (error: any) {
        console.error('❌ API error [agent/session/end]:', error);
        return NextResponse.json(
            {
                error: 'Internal Server Error',
                message: error.message || 'An unexpected error occurred',
            },
            { status: 500 }
        );
    }
}