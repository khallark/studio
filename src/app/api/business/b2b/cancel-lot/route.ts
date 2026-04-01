// /api/business/b2b/cancel-lot

import { authUserForBusiness } from "@/lib/authoriseUser";
import { db } from "@/lib/firebase-admin";
import { Lot } from "@/types/b2b";
import { Timestamp } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { businessId, lotId, cancelledBy, reason }: {
            businessId: string;
            lotId: string;
            cancelledBy: string;
            reason: string;
        } = body;

        if (!businessId || !lotId || !cancelledBy || !reason) {
            return NextResponse.json(
                { error: "businessId, lotId, cancelledBy, reason are required." },
                { status: 400 },
            );
        }

        const result = await authUserForBusiness({ businessId, req });
        if (!result.authorised) {
            return NextResponse.json({ error: result.error }, { status: result.status });
        }

        const lotRef = db.doc(`users/${businessId}/lots/${lotId}`);
        const lotDoc = await lotRef.get();

        if (!lotDoc.exists) {
            return NextResponse.json({ error: "lot_not_found" }, { status: 404 });
        }
        const lot = lotDoc.data() as Lot;
        if (lot.status === "CANCELLED") {
            return NextResponse.json({ error: "lot_already_cancelled" }, { status: 400 });
        }
        if (lot.status === "COMPLETED") {
            return NextResponse.json({ error: "lot_already_completed" }, { status: 400 });
        }

        await lotRef.update({
            status: "CANCELLED",
            isDelayed: false,
            delayDays: 0,
            updatedAt: Timestamp.now(),
        });

        return NextResponse.json({ success: true }, { status: 200 });

    } catch (error) {
        console.error("cancelLot error:", error);
        return NextResponse.json({ error: "internal", message: (error as Error).message }, { status: 500 });
    }
}