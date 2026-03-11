// /api/business/b2b/cancel-lot

import { authUserForBusiness } from "@/lib/authoriseUser";
import { db } from "@/lib/firebase-admin";
import { Lot, MaterialReservation, MaterialTransaction, MaterialTransactionType } from "@/types/b2b";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
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
            return NextResponse.json({ error: "businessId, lotId, cancelledBy, reason are required." }, { status: 400 });
        }

        const result = await authUserForBusiness({ businessId, req });
        if (!result.authorised) {
            const { error, status } = result;
            return NextResponse.json({ error }, { status });
        }

        const lotRef = db.doc(`users/${businessId}/lots/${lotId}`);

        await db.runTransaction(async (tx) => {
            const lotDoc = await tx.get(lotRef);
            if (!lotDoc.exists) throw new Error("lot_not_found");

            const lot = lotDoc.data() as Lot;
            if (lot.status === "CANCELLED") throw new Error("lot_already_cancelled");
            if (lot.status === "COMPLETED") throw new Error("lot_already_completed");

            const now = Timestamp.now();

            tx.update(lotRef, { status: "CANCELLED", updatedAt: now });

            const reservationsSnap = await db
                .collection(`users/${businessId}/material_reservations`)
                .where("lotId", "==", lotId)
                .where("status", "==", "RESERVED")
                .get();

            for (const resDoc of reservationsSnap.docs) {
                const reservation = resDoc.data() as MaterialReservation;

                tx.update(resDoc.ref, { status: "RELEASED", updatedAt: now });
                tx.update(db.doc(`users/${businessId}/raw_materials/${reservation.materialId}`), {
                    reservedStock: FieldValue.increment(-reservation.quantityRequired),
                    availableStock: FieldValue.increment(reservation.quantityRequired),
                    updatedAt: now,
                });

                const txRef = db.collection(`users/${businessId}/material_transactions`).doc();
                tx.set(txRef, {
                    id: txRef.id,
                    materialId: reservation.materialId,
                    materialName: reservation.materialName,
                    type: "RETURN" as MaterialTransactionType,
                    quantity: reservation.quantityRequired,
                    referenceId: lotId,
                    referenceType: "LOT",
                    note: `Lot ${lot.lotNumber} cancelled — reserved stock released. Reason: ${reason}`,
                    createdBy: cancelledBy,
                    createdAt: now,
                    stockBefore: null,
                    stockAfter: null,
                } satisfies MaterialTransaction);
            }
        });

        return NextResponse.json({ success: true }, { status: 200 });

    } catch (error) {
        const message = (error as Error).message;
        if (message === "lot_not_found") {
            return NextResponse.json({ error: "lot_not_found" }, { status: 404 });
        } else if (message === "lot_already_cancelled") {
            return NextResponse.json({ error: "lot_already_cancelled" }, { status: 400 });
        } else if (message === "lot_already_completed") {
            return NextResponse.json({ error: "lot_already_completed" }, { status: 400 });
        } else {
            console.error("cancelLot error:", error);
            return NextResponse.json({ error: "internal", message }, { status: 500 });
        }
    }
}