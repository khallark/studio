// /api/business/b2b/advance-lot-stage

import { authUserForBusiness } from "@/lib/authoriseUser";
import { computeDelayStatus } from "@/lib/b2b_helpers";
import { db } from "@/lib/firebase-admin";
import { Lot, LotStage } from "@/types/b2b";
import { Timestamp } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { businessId, lotId, completedBy, note }: {
            businessId: string;
            lotId: string;
            completedBy: string;
            note?: string;
        } = body;

        if (!businessId || !lotId || !completedBy) {
            return NextResponse.json(
                { error: "businessId, lotId, completedBy are required." },
                { status: 400 },
            );
        }

        const result = await authUserForBusiness({ businessId, req });
        if (!result.authorised) {
            return NextResponse.json({ error: result.error }, { status: result.status });
        }

        const lotRef = db.doc(`users/${businessId}/lots/${lotId}`);

        await db.runTransaction(async (tx) => {
            const lotDoc = await tx.get(lotRef);
            if (!lotDoc.exists) throw new Error("lot_not_found");

            const lot = lotDoc.data() as Lot;
            if (lot.status !== "ACTIVE") throw new Error("lot_not_active");

            const currentIndex = lot.currentSequence - 1;
            const currentStage = lot.stages[currentIndex];
            const nextStage = lot.stages[currentIndex + 1];

            if (currentStage.status === "BLOCKED") throw new Error("lot_stage_blocked");

            const now = Timestamp.now();

            const updatedStages = lot.stages.map((s, i) => {
                if (i === currentIndex)
                    return { ...s, status: "COMPLETED", actualDate: now, completedBy, note: note ?? null };
                if (i === currentIndex + 1)
                    return { ...s, status: "IN_PROGRESS" };
                return s;
            });

            const isLastStage = !nextStage;
            const { isDelayed, delayDays } = computeDelayStatus(updatedStages as LotStage[]);

            tx.update(lotRef, {
                stages: updatedStages,
                currentStage: isLastStage ? lot.currentStage : nextStage.stage,
                currentSequence: isLastStage ? lot.currentSequence : lot.currentSequence + 1,
                status: isLastStage ? "COMPLETED" : "ACTIVE",
                isDelayed,
                delayDays,
                updatedAt: now,
            });
        });

        return NextResponse.json({ success: true }, { status: 200 });

    } catch (error) {
        const message = (error as Error).message;
        if (message === "lot_not_found") return NextResponse.json({ error: "lot_not_found" }, { status: 404 });
        if (message === "lot_not_active") return NextResponse.json({ error: "lot_not_active" }, { status: 400 });
        if (message === "lot_stage_blocked") return NextResponse.json({ error: "lot_stage_blocked", message: "Cannot advance a blocked stage. Unblock it first." }, { status: 400 });
        console.error("advanceLotStage error:", error);
        return NextResponse.json({ error: "internal", message }, { status: 500 });
    }
}