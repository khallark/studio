// /api/business/b2b/cancel-order

import { authUserForBusiness } from "@/lib/authoriseUser";
import { db } from "@/lib/firebase-admin";
import { Lot, MaterialReservation, MaterialTransaction, MaterialTransactionType, Order } from "@/types/b2b";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
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
            console.log(`${!businessId ? "businessId, " : ""}${!orderId ? "orderId, " : ""}${!cancelledBy ? "cancelledBy, " : ""}${!reason ? "reason" : ""} are missing.`);
            return NextResponse.json(
                { error: `${!businessId ? "businessId, " : ""}${!orderId ? "orderId, " : ""}${!cancelledBy ? "cancelledBy, " : ""}${!reason ? "reason" : ""} are missing.` },
                { status: 400 }
            );
        }

        const result = await authUserForBusiness({ businessId, req });
        if (!result.authorised) {
            const { error, status } = result;
            return NextResponse.json({ error }, { status });
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

        // DRAFT orders have no lots or reservations — just flip the status
        if (order.status === "DRAFT") {
            await orderRef.update({ status: "CANCELLED", updatedAt: Timestamp.now() });
            return NextResponse.json({ success: true, lotsCancelled: 0 }, { status: 200 });
        }

        // Fetch all cancellable lots (skip already cancelled/completed)
        const lotsSnap = await db.collection(`users/${businessId}/lots`)
            .where("orderId", "==", orderId)
            .get();

        const cancellableLots = lotsSnap.docs.filter(d => {
            const s = (d.data() as Lot).status;
            return s !== "CANCELLED" && s !== "COMPLETED";
        });

        const now = Timestamp.now();
        const batch = db.batch();

        for (const lotDoc of cancellableLots) {
            const lot = lotDoc.data() as Lot;

            batch.update(lotDoc.ref, {
                status: "CANCELLED",
                updatedAt: now,
            });

            const reservationsSnap = await db.collection(`users/${businessId}/material_reservations`)
                .where("lotId", "==", lotDoc.id)
                .where("status", "==", "RESERVED")
                .get();

            for (const resDoc of reservationsSnap.docs) {
                const reservation = resDoc.data() as MaterialReservation;

                batch.update(resDoc.ref, {
                    status: "RELEASED",
                    updatedAt: now,
                });

                batch.update(db.doc(`users/${businessId}/raw_materials/${reservation.materialId}`), {
                    reservedStock: FieldValue.increment(-reservation.quantityRequired),
                    availableStock: FieldValue.increment(reservation.quantityRequired),
                    updatedAt: now,
                });

                const txRef = db.collection(`users/${businessId}/material_transactions`).doc();
                batch.set(txRef, {
                    id: txRef.id,
                    materialId: reservation.materialId,
                    materialName: reservation.materialName,
                    type: "RETURN" as MaterialTransactionType,
                    quantity: reservation.quantityRequired,
                    referenceId: orderId,
                    referenceType: "LOT",
                    note: `Order ${order.orderNumber} cancelled — Lot ${lot.lotNumber} reserved stock released. Reason: ${reason}`,
                    createdBy: cancelledBy,
                    createdAt: now,
                } satisfies Omit<MaterialTransaction, "stockBefore" | "stockAfter">);
            }
        }

        batch.update(orderRef, {
            status: "CANCELLED",
            lotsInProduction: 0,
            updatedAt: now,
        });

        await batch.commit();
        return NextResponse.json({ success: true, lotsCancelled: cancellableLots.length }, { status: 200 });

    } catch (error) {
        console.error("cancelOrder error:", error);
        return NextResponse.json({ error: "internal", message: (error as Error).message }, { status: 500 });
    }
}