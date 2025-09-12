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
    // ----- Auth -----
    const userId = await getUserIdFromToken(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ----- Input -----
    const { shop, orders, pickupName, shippingMode } = (await req.json()) as {
      shop: string;
      orders: Array<{ orderId: string }>;
      pickupName?: string;
      shippingMode?: string
    };

    if (!shop || !pickupName || !shippingMode || !Array.isArray(orders) || orders.length === 0) {
      return NextResponse.json({ error: "missing params in the request body" }, { status: 400 });
    }

    // 1) Create batch header
    const batchRef = db
      .collection("accounts")
      .doc(shop)
      .collection("shipment_batches")
      .doc();

    await batchRef.set({
      shop,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: userId,                 // <-- stamp UID
      total: orders.length,
      queued: orders.length,
      processing: 0,
      success: 0,
      failed: 0,
      status: "running",
      carrier: "delhivery",
    });

    // 2) Create job docs
    const writer = db.bulkWriter();
    for (const o of orders) {
      writer.set(
        batchRef.collection("jobs").doc(String(o.orderId)),
        {
          orderId: String(o.orderId),
          status: "queued",
          attempts: 0,
        },
        { merge: true }
      );
    }
    await writer.close();

    // 3) Ask Firebase Function to enqueue Cloud Tasks (one per job)
    const url = process.env.ENQUEUE_FUNCTION_URL!;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": process.env.ENQUEUE_FUNCTION_SECRET!, // function-side shared secret
        // (optional) forward user identity if your function wants it:
        // "X-User-Id": userId,
      },
      body: JSON.stringify({
        shop,
        batchId: batchRef.id,
        jobIds: orders.map((o) => String(o.orderId)),
        pickupName,
        shippingMode
      }),
    });

    if (!res.ok) {
      const t = await res.text();
      return NextResponse.json({ error: "enqueue failed", details: t }, { status: 502 });
    }

    return NextResponse.json({ batchId: batchRef.id, total: orders.length });
  } catch (e: any) {
    console.error("bulk-create error:", e);
    return NextResponse.json(
      { error: "failed", details: String(e?.message || e) },
      { status: 500 }
    );
  }
}
