// /api/public/join-business/[sessionId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';

export async function GET(
  request: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  try {
    const sessionId = params.sessionId;

    if (!sessionId) {
      return NextResponse.json({ error: 'Session ID is required' }, { status: 400 });
    }

    const sessionRef = db.collection('join-a-business').doc(sessionId);
    const sessionDoc = await sessionRef.get();

    if (!sessionDoc.exists) {
      return NextResponse.json({ error: 'Invitation link is invalid' }, { status: 404 });
    }

    const sessionData = sessionDoc.data()!;

    if (sessionData.used) {
      return NextResponse.json({ error: 'Invitation link has already been used' }, { status: 410 });
    }

    if (sessionData.expiresAt.toDate() < new Date()) {
      return NextResponse.json({ error: 'Invitation link has expired' }, { status: 410 });
    }

    // Return only the data needed by the client
    const clientSafeData = {
      businessId: sessionData.businessId,
      businessName: sessionData.businessName,
      role: sessionData.role,
      permissions: sessionData.permissions,
    };

    return NextResponse.json(clientSafeData);

  } catch (error) {
    console.error('Error fetching join session:', error);
    return NextResponse.json({ error: 'An internal server error occurred' }, { status: 500 });
  }
}