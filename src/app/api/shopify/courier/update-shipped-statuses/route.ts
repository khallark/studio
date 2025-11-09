// apps/web/src/app/api/shipments/bulk-create/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db, auth as adminAuth } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { authUserForStore } from "@/lib/authoriseUserForStore";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { shop, orderIds } = await req.json();

    if (!shop || !Array.isArray(orderIds) || orderIds.length === 0) {
      return NextResponse.json({ error: 'Shop and a non-empty array of orderIds are required' }, { status: 400 });
    }

    // ----- Auth -----
    const result = await authUserForStore({ shop, req });
    
    if(!result.authorised) {
      const { error, status } = result;
      return NextResponse.json({ error }, { status });
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
      body: JSON.stringify({shop, orderIds, requestedBy: result.userId}),
    });

    const json = await resp.json();
    if (!resp.ok) {
      return NextResponse.json({ ...json }, { status: 500 });
    }

    return NextResponse.json({ ...json }, { status: 202 });
  } catch (error: any) {
    console.error("update-status error:", error);
    return NextResponse.json(
      { error: "updating status failed", details: String("error within the function") },
      { status: 500 });
  }
}
