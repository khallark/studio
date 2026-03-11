// /api/business/b2b/deactivate-bom-entry

import { authUserForBusiness } from "@/lib/authoriseUser";
import { db } from "@/lib/firebase-admin";
import { BOMEntry } from "@/types/b2b";
import { Timestamp } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { businessId, bomId }: { businessId: string; bomId: string } = body;

        if (!businessId || !bomId) {
            return NextResponse.json({ error: "businessId and bomId are required." }, { status: 400 });
        }

        const result = await authUserForBusiness({ businessId, req });
        if (!result.authorised) {
            const { error, status } = result;
            return NextResponse.json({ error }, { status });
        }

        const bomRef = db.doc(`users/${businessId}/bom/${bomId}`);
        const bomDoc = await bomRef.get();

        if (!bomDoc.exists) {
            return NextResponse.json({ error: "bom_entry_not_found" }, { status: 404 });
        }

        if (!(bomDoc.data() as BOMEntry).isActive) {
            return NextResponse.json({ error: "bom_entry_already_inactive" }, { status: 400 });
        }

        await bomRef.update({ isActive: false, updatedAt: Timestamp.now() });
        return NextResponse.json({ success: true }, { status: 200 });

    } catch (error) {
        console.error("deactivateBOMEntry error:", error);
        return NextResponse.json({ error: "internal", message: (error as Error).message }, { status: 500 });
    }
}