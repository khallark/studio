import { NextRequest, NextResponse } from "next/server";
import { auth as adminAuth } from "@/lib/firebase-admin";

export const runtime = "nodejs";

async function getUserIdFromToken(req: NextRequest): Promise<string | null> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const idToken = authHeader.slice("Bearer ".length);
  try {
    const decoded = await adminAuth.verifyIdToken(idToken);
    return decoded.uid;
  } catch (e) {
    console.error("Error verifying auth token:", e);
    return null;
  }
}

export async function POST(req: NextRequest) {
  const userId = await getUserIdFromToken(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const fnUrl = process.env.MERGE_SLIPS_FN_URL!;
  const apiKey = process.env.ENQUEUE_FUNCTION_SECRET!;

  const r = await fetch(fnUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify(body),
  });

  const headers = new Headers();
  headers.set("Content-Type", r.headers.get("content-type") ?? "application/pdf");
  headers.set(
    "Content-Disposition",
    r.headers.get("content-disposition") ?? `attachment; filename="awb-slips-${Date.now()}.pdf"`
  );
  const missing = r.headers.get("x-missing-awbs");
  if (missing) headers.set("X-Missing-AWBs", missing);
  const invalid = r.headers.get("x-invalid-awbs");
  if (invalid) headers.set("X-Invalid-AWBs", invalid);
  headers.set("Cache-Control", "no-store");

  return new NextResponse(r.body, { status: r.status, headers });
}
