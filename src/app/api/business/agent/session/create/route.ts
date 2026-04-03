// app/api/business/agent/session/create/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { authUserForBusiness } from '@/lib/authoriseUser';
import { Timestamp } from 'firebase-admin/firestore';
import { db } from '@/lib/firebase-admin';
import { AgentSession } from '@/types/agent';

export async function POST(req: NextRequest) {
    try {
        const { businessId }: { businessId: string } = await req.json();

        // ============================================================
        // VALIDATION
        // ============================================================

        if (!businessId || typeof businessId !== 'string') {
            return NextResponse.json(
                { error: 'Validation Error', message: 'businessId is required and must be a string' },
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

        const sessionsRef = db
            .collection('users')
            .doc(businessId)
            .collection('agent_sessions');

        // Craete a fresh active session.
        const newSessionRef = sessionsRef.doc();
        const now = Timestamp.now();

        await newSessionRef.set({
            sessionId: newSessionRef.id,
            businessId,
            status: 'idle',
            generatingStartedAt: null,
            createdAt: now,
            endedAt: null,
            lastActivityAt: now,
        } satisfies AgentSession);

        // ============================================================
        // RETURN SUCCESS RESPONSE
        // ============================================================

        return NextResponse.json(
            {
                success: true,
                message: 'Session created successfully',
                sessionId: newSessionRef.id,
                isNew: true,
            },
            { status: 201 }
        );

    } catch (error: any) {
        console.error('❌ API error [agent/session/create]:', error);
        return NextResponse.json(
            {
                error: 'Internal Server Error',
                message: error.message || 'An unexpected error occurred',
            },
            { status: 500 }
        );
    }
}