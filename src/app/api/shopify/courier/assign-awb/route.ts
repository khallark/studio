// apps/web/src/app/api/shipments/bulk-create/route.ts
import { NextRequest, NextResponse } from "next/server";
import { authUserForBusinessAndStore } from "@/lib/authoriseUser";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    // ----- Input -----
    const { businessId, shop, orders, courier, pickupName, shippingMode } = (await req.json()) as {
      businessId: string;
      shop: string;
      orders: Array<{ orderId: string, name: string }>;
      courier?: string;
      pickupName?: string;
      shippingMode?: string
    };

    if (!businessId) {
      return NextResponse.json({ error: 'No business id provided.' }, { status: 400 });
    }

    if (!shop || !courier || !pickupName || !shippingMode || !Array.isArray(orders) || orders.length === 0) {
      return NextResponse.json({ error: "missing params in the request body" }, { status: 400 });
    }

    const result = await authUserForBusinessAndStore({ businessId, shop, req });

    if (!result.authorised) {
      const { error, status } = result;
      return NextResponse.json({ error }, { status });
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
      body: JSON.stringify({ businessId, shop, orders, courier, pickupName, shippingMode, requestedBy: result.userId }),
    });

    const json = await resp.json();
    if (!resp.ok) {
      return NextResponse.json({ ...json }, { status: 500 });
    }

    return NextResponse.json({ ...json }, { status: 202 });
  } catch (e: any) {
    console.error("bulk-create error:", e);
    return NextResponse.json(
      { error: "start_batch_failed", details: String(e?.error ?? e) },
      { status: 500 });
  }
}
