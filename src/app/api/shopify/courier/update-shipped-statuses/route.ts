// apps/web/src/app/api/shipments/bulk-create/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db, auth as adminAuth } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

export const runtime = "nodejs";

/** Verify Firebase ID token from Authorization: Bearer <token> */
async function getUserIdFromToken(req: NextRequest): Promise<string | null> {
  try {
    const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
    const idToken = authHeader.slice("Bearer ".length).trim();
    if (!idToken) return null;
    const decoded = await adminAuth.verifyIdToken(idToken);
    return decoded.uid || null;
  } catch (err) {
    console.error("Error verifying auth token:", err);
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await getUserIdFromToken(req);
    if (!userId) {
        return NextResponse.json({ error: 'Unauthorized: Could not identify user.' }, { status: 401 });
    }

    const { shop, orderIds } = await req.json();

    if (!shop || !Array.isArray(orderIds) || orderIds.length === 0) {
      return NextResponse.json({ error: 'Shop and a non-empty array of orderIds are required' }, { status: 400 });
    }

    // Ask Firebase Function to enqueue Cloud Tasks (one per job)
    const url = process.env.UPDATE_STATUS_TASK_MANUAL_TARGET_URL!;
    const secret = process.env.ENQUEUE_FUNCTION_SECRET!;
    if (!url || !secret) {
      return NextResponse.json({ error: 'Server not configured (FIREBASE_FUNCTIONS_BASE/TASKS_SECRET)' }, { status: 500 });
    }

    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": secret,
      },
      body: JSON.stringify({shop, orderIds, requestedBy: userId}),
    });

    const json = await resp.json();
    if (!resp.ok) {
      return NextResponse.json({ ...json }, { status: 500 });
    }

    return NextResponse.json({ ...json }, { status: 202 });
  } catch (error: any) {
    console.error("update-status error:", error);
    return NextResponse.json(
      { error: "updating status failed", details: String(error?.message ?? error) },
      { status: 500 });
  }
}
