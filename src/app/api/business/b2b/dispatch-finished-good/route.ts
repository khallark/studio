// /api/business/b2b/dispatch-finished-good

import { authUserForBusiness } from "@/lib/authoriseUser";
import { db } from "@/lib/firebase-admin";
import { FinishedGood } from "@/types/b2b";
import { Timestamp } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { businessId, finishedGoodId, courierName, awb, cartonCount, totalWeightKg, dispatchedBy }: {
            businessId: string;
            finishedGoodId: string;
            courierName: string;
            awb: string;
            cartonCount?: number;
            totalWeightKg?: number;
            dispatchedBy: string;
        } = body;

        if (!businessId || !finishedGoodId || !courierName || !awb || !dispatchedBy) {
            return NextResponse.json({ error: "businessId, finishedGoodId, courierName, awb, dispatchedBy are required." }, { status: 400 });
        }

        const result = await authUserForBusiness({ businessId, req });
        if (!result.authorised) {
            const { error, status } = result;
            return NextResponse.json({ error }, { status });
        }

        const fgRef = db.doc(`users/${businessId}/finished_goods/${finishedGoodId}`);
        const fgDoc = await fgRef.get();

        if (!fgDoc.exists) {
            return NextResponse.json({ error: "finished_good_not_found" }, { status: 404 });
        }

        const fg = fgDoc.data() as FinishedGood;

        if (fg.isDispatched) {
            return NextResponse.json({
                error: "already_dispatched",
                message: `This lot was already dispatched with AWB ${fg.awb}.`,
            }, { status: 400 });
        }

        const now = Timestamp.now();

        await fgRef.update({
            isDispatched: true,
            dispatchedAt: now,
            courierName,
            awb,
            ...(cartonCount !== undefined && { cartonCount }),
            ...(totalWeightKg !== undefined && { totalWeightKg }),
            updatedAt: now,
        });

        return NextResponse.json({ success: true }, { status: 200 });

    } catch (error) {
        console.error("dispatchFinishedGood error:", error);
        return NextResponse.json({ error: "internal", message: (error as Error).message }, { status: 500 });
    }
}