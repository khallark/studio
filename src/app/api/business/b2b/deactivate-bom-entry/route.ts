// /api/business/b2b/deactivate-bom-entry

import { authUserForBusiness } from "@/lib/authoriseUser";
import { db } from "@/lib/firebase-admin";
import { BOM } from "@/types/b2b";
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
            return NextResponse.json({ error: result.error }, { status: result.status });
        }

        const bomRef = db.doc(`users/${businessId}/bom/${bomId}`);
        const bomDoc = await bomRef.get();

        if (!bomDoc.exists) {
            return NextResponse.json({ error: "bom_not_found" }, { status: 404 });
        }
        if (!(bomDoc.data() as BOM).isActive) {
            return NextResponse.json({ error: "bom_already_inactive" }, { status: 400 });
        }

        await bomRef.update({ isActive: false, updatedAt: Timestamp.now() });
        return NextResponse.json({ success: true }, { status: 200 });

    } catch (error) {
        console.error("deactivateBOM error:", error);
        return NextResponse.json({ error: "internal", message: (error as Error).message }, { status: 500 });
    }
}