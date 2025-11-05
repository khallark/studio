// apps/web/src/app/api/returns/bulk-book/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth as adminAuth, db } from "@/lib/firebase-admin";

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
    const { shop, orderIds, pickupName, shippingMode } = (await req.json()) as {
      shop: string;
      orderIds: string[];
      pickupName?: string;
      shippingMode?: string;
    };

    // Note: No courier param - it's read from order.courier in the function
    if (!shop || !pickupName || !shippingMode || !Array.isArray(orderIds) || orderIds.length === 0) {
      return NextResponse.json(
        { error: "missing params in the request body" },
        { status: 400 }
      );
    }

    // ----- Auth -----
    const shopDoc = await db.collection('accounts').doc(shop).get();
    if(!shopDoc.exists) {
        return NextResponse.json({ error: 'Shop Not Found' }, { status: 401 });
    }
    
    const userId = await getUserIdFromToken(req);
    if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const member = await db.collection('accounts').doc(shop).collection('members').doc(userId).get();
    
    const isAuthorized = member.exists && member.data()?.status === 'active';
    if (!isAuthorized) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Ask Firebase Function to enqueue return Cloud Tasks (one per job)
    const url = process.env.ENQUEUE_RETURN_FUNCTION_URL!;
    const secret = process.env.ENQUEUE_FUNCTION_SECRET!;
    if (!url || !secret) {
      return NextResponse.json(
        { error: "Server not configured (ENQUEUE_RETURN_FUNCTION_URL/ENQUEUE_FUNCTION_SECRET)" },
        { status: 500 }
      );
    }

    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": secret,
      },
      body: JSON.stringify({
        shop,
        orderIds,
        pickupName,
        shippingMode,
        requestedBy: userId,
      }),
    });

    const json = await resp.json();
    if (!resp.ok) {
      return NextResponse.json({ ...json }, { status: resp.status });
    }

    return NextResponse.json({ ...json }, { status: 202 });
  } catch (e: any) {
    console.error("bulk-book-return error:", e);
    return NextResponse.json(
      { error: "start_return_batch_failed", details: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}