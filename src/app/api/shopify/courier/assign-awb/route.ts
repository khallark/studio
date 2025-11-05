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
    // ----- Input -----
    const { shop, orders, courier, pickupName, shippingMode } = (await req.json()) as {
      shop: string;
      orders: Array<{ orderId: string, name: string }>;
      courier?: string;
      pickupName?: string;
      shippingMode?: string
    };

    if (!shop || !courier || !pickupName || !shippingMode || !Array.isArray(orders) || orders.length === 0) {
      return NextResponse.json({ error: "missing params in the request body" }, { status: 400 });
    }

    // ----- Auth -----
    const shopDoc = await db.collection('accounts').doc(shop).get();
    if(!shopDoc.exists) {
        return NextResponse.json({ error: 'Shop Not Found' }, { status: 401 });
    }
    // 1. Authentication & Authorization
    const userId = await getUserIdFromToken(req);
    if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const member = await db.collection('accounts').doc(shop).collection('members').doc(userId).get();
    
    // This is a placeholder for the real permission check
    const isAuthorized = !member.exists || member.data()?.status !== 'active';
    if (!isAuthorized) {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Ask Firebase Function to enqueue Cloud Tasks (one per job)
    const url = process.env.ENQUEUE_FUNCTION_URL!;
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
      body: JSON.stringify({shop, orders, courier, pickupName, shippingMode, requestedBy: userId}),
    });

    const json = await resp.json();
    if (!resp.ok) {
      return NextResponse.json({ ...json }, { status: 500 });
    }

    return NextResponse.json({ ...json }, { status: 202 });
  } catch (e: any) {
    console.error("bulk-create error:", e);
    return NextResponse.json(
      { error: "start_batch_failed", details: String(e?.message ?? e) },
      { status: 500 });
  }
}
