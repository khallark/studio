// apps/web/src/app/api/returns/bulk-book/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth as adminAuth, db } from "@/lib/firebase-admin";
import { authUserForStore } from "@/lib/authoriseUserForStore";

export const runtime = "nodejs";

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
    const result = await authUserForStore({ shop, req });

    if(!result.authorised) {
      const { error, status } = result;
      return NextResponse.json({ error }, { status });
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
        requestedBy: result.userId,
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