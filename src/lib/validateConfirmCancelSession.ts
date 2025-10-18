// lib/validateConfirmCancelSession.ts
import { NextRequest } from "next/server";
import { db } from "./firebase-admin";
import { getClientIP } from "./getClientIP";

interface SessionData {
  storeId: string;
  csrfToken: string;
  ip: string;
  userAgent: string;
  requestCount: number;
  lastActivity: Date;
  expiresAt: Date;
  createdAt: Date;
  browserFingerprint: string | null;
}

export async function validateConfirmCancelSession(req: NextRequest) {
  const sessionId = req.cookies.get('confirm_cancel_session')?.value;
  const csrfToken = req.headers.get('x-csrf-token');
  const ip = getClientIP(req);
  const userAgent = req.headers.get('user-agent');
  
  if (!sessionId) {
    throw new Error('NO_SESSION_COOKIE');
  }
  
  if (!csrfToken) {
    throw new Error('NO_CSRF_TOKEN');
  }
  
  // Validate session in database
  const sessionDoc = await db.collection('confirm_or_cancel_sessions').doc(sessionId).get();
  if (!sessionDoc.exists) {
    throw new Error('INVALID_SESSION');
  }
  
  const sessionData = sessionDoc.data()!;
  
  // Check if session is expired
  const now = new Date();
  const expiresAt = sessionData.expiresAt.toDate ? sessionData.expiresAt.toDate() : new Date(sessionData.expiresAt);
  
  if (expiresAt < now) {
    throw new Error('SESSION_EXPIRED');
  }
  
  // Validate CSRF token
  if (sessionData.csrfToken !== csrfToken) {
    throw new Error('CSRF_MISMATCH');
  }
  
  // Additional security checks
  if (sessionData.ip !== ip) {
    console.warn(`IP mismatch for session ${sessionId}: ${sessionData.ip} vs ${ip}`);
  }
  
  if (sessionData.userAgent !== userAgent) {
    console.warn(`User agent mismatch for session ${sessionId}`);
  }
  
  // Update request count and last activity
  await db.collection('confirm_or_cancel_sessions').doc(sessionId).update({
    requestCount: (sessionData.requestCount || 0) + 1,
    lastActivity: new Date()
  });
  
  return {
    ...sessionData,
    requestCount: (sessionData.requestCount || 0) + 1,
    lastActivity: new Date(),
    expiresAt: expiresAt
  } as SessionData;
}