// /api/business/b2b/set-lot-stage-blocked

import { authUserForBusiness } from "@/lib/authoriseUser";
import { db } from "@/lib/firebase-admin";
import { Lot } from "@/types/b2b";
import { Timestamp } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { businessId, lotId, blocked, reason }: {
            businessId: string;
            lotId: string;
            blocked: boolean;
            reason?: string;
        } = body;

        if (!businessId || !lotId || blocked == null) {
            return NextResponse.json({ error: "businessId, lotId, blocked are required." }, { status: 400 });
        }

        const result = await authUserForBusiness({ businessId, req });
        if (!result.authorised) {
            const { error, status } = result;
            return NextResponse.json({ error }, { status });
        }

        const lotRef = db.doc(`users/${businessId}/lots/${lotId}`);
        const lotDoc = await lotRef.get();

        if (!lotDoc.exists) {
            return NextResponse.json({ error: "lot_not_found" }, { status: 404 });
        }

        const lot = lotDoc.data() as Lot;
        const currentIndex = lot.currentSequence - 1;

        const updatedStages = lot.stages.map((s, i) => {
            if (i === currentIndex)
                return { ...s, status: blocked ? "BLOCKED" : "IN_PROGRESS", note: reason ?? s.note };
            return s;
        });

        await lotRef.update({ stages: updatedStages, updatedAt: Timestamp.now() });
        return NextResponse.json({ success: true }, { status: 200 });

    } catch (error) {
        console.error("setLotStageBlocked error:", error);
        return NextResponse.json({ error: "internal", message: (error as Error).message }, { status: 500 });
    }
}