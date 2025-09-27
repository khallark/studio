import { NextRequest } from "next/server";
import { db } from "./firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { getClientIP } from "./getClientIP";

interface SessionData {
  storeId: string;
  storeAlias: string;
  csrfToken: string;
  ip: string;
  userAgent: string;
  requestCount: number;
  lastActivity: Date;
  isActive: boolean;
  expiresAt: any; // Firestore timestamp
  // ... other fields
}

export async function validateCustomerSession(req: NextRequest) {
  const sessionId = req.cookies.get('customer_session')?.value;
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
  const sessionDoc = await db.collection('customer_sessions').doc(sessionId).get();
  if (!sessionDoc.exists) {
    throw new Error('INVALID_SESSION');
  }
  
  const sessionData = sessionDoc.data()!;
  
  // Check if session is valid (no storeId check yet)
  if (!sessionData.isActive || sessionData.expiresAt.toDate() < new Date()) {
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
  await db.collection('customer_sessions').doc(sessionId).update({
    requestCount: FieldValue.increment(1),
    lastActivity: FieldValue.serverTimestamp()
  });
  
  return {
    ...sessionData,
    requestCount: (sessionData.requestCount || 0) + 1,
    lastActivity: new Date()
  } as SessionData;
}