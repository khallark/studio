// apps/web/src/app/api/shipments/bulk-create/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db, auth as adminAuth } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Verify Firebase ID token from Authorization: Bearer <token> */
async function getUserIdFromToken(req: NextRequest): Promise<string | null> {
  try {
    const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
    const idToken = authHeader.slice("Bearer ".length).trim();
    if (!idToken) return null;
    const decoded = await adminAuth.verifyIdToken(idToken);
    return decoded.uid || null;
  } catch {
    return null;
  }
}

type OrderLite = {
  id: string;
  order_number?: string | number;
  // any other fields you want to pass through to the Cloud Function payload
};

export async function POST(req: NextRequest) {
  try {
    const userId = await getUserIdFromToken(req);
    if (!userId) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const { shop, orders, pickupName, shippingMode, requestId } = (await req.json()) as {
      shop?: string;
      orders?: OrderLite[];
      pickupName?: string;
      shippingMode?: string;
      requestId?: string; // optional idempotency key
    };

    if (!shop || !Array.isArray(orders) || orders.length === 0) {
      return NextResponse.json({ error: "bad_payload" }, { status: 400 });
    }

    // 1) Create a batch doc up-front so UI can subscribe to it
    const batchRef = db
      .collection("accounts")
      .doc(shop)
      .collection("shipment_batches")
      .doc();

    await batchRef.set({
      shop,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: userId, // stamp UID
      total: orders.length,
      queued: orders.length,
      processing: 0,
      success: 0,
      failed: 0,
      status: "running",
      carrier: "delhivery",
      pickupName: pickupName || null,
      shippingMode: shippingMode || null,
      requestId: requestId || null,
    });

    const url = process.env.ENQUEUE_FUNCTION_URL!;
    const apiKey = process.env.ENQUEUE_FUNCTION_SECRET!;
    
    if (!apiKey) {
      return NextResponse.json({ error: "server_misconfigured:ENQUEUE_FUNCTION_SECRET" }, { status: 500 });
    }

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
      } as any,
      body: JSON.stringify({
        shop,
        batchId: batchRef.id,
        orders,
        pickupName,
        shippingMode,
        requestId: requestId || null,
        // also pass who triggered this, for audit
        triggeredBy: userId,
      }),
      cache: "no-store",
    });

    if (!res.ok) {
      const t = await res.text();
      return NextResponse.json({ error: "enqueue_failed", details: t }, { status: 502 });
    }

    const json = await res.json().catch(() => ({}));
    return NextResponse.json({ batchId: batchRef.id, ...json });
  } catch (e: any) {
    console.error("bulk-create error:", e);
    return NextResponse.json(
      { error: "failed", details: String(e?.message || e) },
      { status: 500 }
    );
  }
}
