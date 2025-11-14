import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { authUserForBusiness } from "@/lib/authoriseUser";

export const runtime = "nodejs"; // required for firebase-admin

function parseAwbs(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim().replace(/^"|"$/g, "")) // trim and strip quotes if any
    .filter(Boolean);
}

export async function POST(req: NextRequest) {
  try {
    const { businessId, count } = await req.json();

    if (!businessId || count === undefined) {
      return NextResponse.json({ error: "Shop and count are required" }, { status: 400 });
    }

    const result = await authUserForBusiness({ businessId, req });

    if (!result.authorised) {
      const { error, status } = result;
      return NextResponse.json({ error }, { status });
    }

    if (typeof count !== "number" || count < 0 || count > 500) {
      return NextResponse.json(
        { error: "Count must be a number between 0 and 500" },
        { status: 400 }
      );
    }

    if (count === 0) {
      return NextResponse.json({ awbs: [], count: 0, added: 0, duplicates: 0 });
    }

    const { businessDoc } = result;

    const delhiveryApiKey = businessDoc?.data()?.integrations?.couriers?.delhivery?.apiKey as
      | string
      | undefined;
    if (!delhiveryApiKey) {
      return NextResponse.json(
        { error: "Delhivery API key not found. Please configure it in settings." },
        { status: 412 }
      );
    }

    // Delhivery bulk AWB endpoint (production)
    const delhiveryApiUrl = `https://track.delhivery.com/waybill/api/bulk/json/?count=${count}`;

    const response = await fetch(delhiveryApiUrl, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Token ${delhiveryApiKey}`,
      },
    });

    const raw = await response.text();
    if (!response.ok) {
      console.error("Delhivery API Error:", raw);
      return NextResponse.json(
        { error: "Failed to fetch AWBs from Delhivery", details: raw },
        { status: response.status }
      );
    }

    const awbs = parseAwbs(raw);
    if (awbs.length === 0) {
      return NextResponse.json(
        { error: "Delhivery returned no AWBs", details: raw?.slice(0, 200) ?? "" },
        { status: 502 }
      );
    }

    // ---- FAST, NO-OVERWRITE INSERTION ----
    const awbsRef = businessDoc?.ref?.collection("unused_awbs");
    const writer = db.bulkWriter();  // no options supported for concurrency

    let duplicates = 0;

    writer.onWriteError((err) => {
      // 'already-exists' (code 6) => skip, don't retry
      if ((err as any).code === 6 || (err as any).code === "already-exists") {
        duplicates++;
        return false;
      }
      // Retry other transient errors up to 3 times
      if (err.failedAttempts < 3) return true;
      return false;
    });

    for (const awb of awbs) {
      const docRef = awbsRef?.doc(awb);
      if(!docRef) continue;
      writer.create(docRef, {
        status: "unused",
        createdAt: FieldValue.serverTimestamp(),
      });
    }

    await writer.close();

    const added = awbs.length - duplicates;

    return NextResponse.json({
      awbs,
      requested: count,
      count: awbs.length,
      added,
      duplicates,
    });

  } catch (error) {
    console.error("Error fetching AWBs:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
    return NextResponse.json(
      { error: "Failed to fetch AWBs", details: errorMessage },
      { status: 500 }
    );
  }
}
