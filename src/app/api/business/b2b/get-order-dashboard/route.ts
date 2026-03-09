// /api/business/b2b/get-order-dashboard

import { authUserForBusiness } from "@/lib/authoriseUser";
import { db } from "@/lib/firebase-admin";
import { Lot } from "@/types/b2b";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { businessId, orderId }: { businessId: string; orderId: string } = body;

        if (!businessId || !orderId) {
            console.log(`${!businessId ? "businessId, " : ""}${!orderId ? "orderId" : ""} are missing.`);
            return NextResponse.json(
                { error: `${!businessId ? "businessId, " : ""}${!orderId ? "orderId" : ""} are missing.` },
                { status: 400 }
            );
        }

        const result = await authUserForBusiness({ businessId, req });
        if (!result.authorised) {
            const { error, status } = result;
            return NextResponse.json({ error }, { status });
        }

        const [orderDoc, lotsSnap] = await Promise.all([
            db.doc(`users/${businessId}/orders/${orderId}`).get(),
            db.collection(`users/${businessId}/lots`).where("orderId", "==", orderId).get(),
        ]);

        if (!orderDoc.exists) {
            NextResponse.json({ error: "order_not_found" }, { status: 404 });
        }

        const lots = lotsSnap.docs.map(d => d.data() as Lot);

        const byStage: Record<string, Lot[]> = {};
        for (const lot of lots) {
            if (!byStage[lot.currentStage]) byStage[lot.currentStage] = [];
            byStage[lot.currentStage].push(lot);
        }

        const tnaSummary = lots.map(lot => ({
            lotNumber: lot.lotNumber,
            productName: lot.productName,
            color: lot.color,
            quantity: lot.quantity,
            currentStage: lot.currentStage,
            isDelayed: lot.isDelayed,
            delayDays: lot.delayDays,
            stages: lot.stages.map(s => ({
                stage: s.stage,
                status: s.status,
                plannedDate: s.plannedDate,
                actualDate: s.actualDate,
            })),
        }));

        NextResponse.json({
            order: orderDoc.data(),
            lotsByStage: byStage,
            tnaSummary,
            totalLots: lots.length,
            lotsDelayed: lots.filter(l => l.isDelayed).length,
        }, { status: 200 });

    } catch (error) {
        console.error("getOrderDashboard error:", error);
        NextResponse.json({ error: "internal", message: (error as Error).message }, { status: 500 });
    }
}