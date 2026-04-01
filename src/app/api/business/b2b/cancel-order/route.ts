// /api/business/b2b/cancel-order

import { authUserForBusiness } from "@/lib/authoriseUser";
import { db } from "@/lib/firebase-admin";
import { Lot, Order } from "@/types/b2b";
import { Timestamp } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { businessId, orderId, cancelledBy, reason }: {
            businessId: string;
            orderId: string;
            cancelledBy: string;
            reason: string;
        } = body;

        if (!businessId || !orderId || !cancelledBy || !reason) {
            return NextResponse.json(
                { error: "businessId, orderId, cancelledBy, reason are required." },
                { status: 400 },
            );
        }

        const result = await authUserForBusiness({ businessId, req });
        if (!result.authorised) {
            return NextResponse.json({ error: result.error }, { status: result.status });
        }

        const orderRef = db.doc(`users/${businessId}/orders/${orderId}`);
        const orderDoc = await orderRef.get();
        if (!orderDoc.exists) {
            return NextResponse.json({ error: "order_not_found" }, { status: 404 });
        }

        const order = orderDoc.data() as Order;
        if (order.status === "CANCELLED") {
            return NextResponse.json({ error: "order_already_cancelled" }, { status: 400 });
        }

        // DRAFT: no lots exist — just flip order status
        if (order.status === "DRAFT") {
            await orderRef.update({ status: "CANCELLED", updatedAt: Timestamp.now() });
            return NextResponse.json({ success: true, lotsCancelled: 0 }, { status: 200 });
        }

        // IN_PRODUCTION: cancel all non-terminal lots
        const lotsSnap = await db
            .collection(`users/${businessId}/lots`)
            .where("orderId", "==", orderId)
            .get();

        const cancellableLots = lotsSnap.docs.filter((d) => {
            const s = (d.data() as Lot).status;
            return s !== "CANCELLED" && s !== "COMPLETED";
        });

        const now = Timestamp.now();
        const batch = db.batch();

        for (const lotDoc of cancellableLots) {
            batch.update(lotDoc.ref, {
                status: "CANCELLED",
                isDelayed: false,
                delayDays: 0,
                updatedAt: now,
            });
        }

        batch.update(orderRef, { status: "CANCELLED", updatedAt: now });
        await batch.commit();

        return NextResponse.json({ success: true, lotsCancelled: cancellableLots.length }, { status: 200 });

    } catch (error) {
        console.error("cancelOrder error:", error);
        return NextResponse.json({ error: "internal", message: (error as Error).message }, { status: 500 });
    }
}