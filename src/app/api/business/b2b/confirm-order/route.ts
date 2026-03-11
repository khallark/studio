// /api/business/b2b/confirm-order

import { authUserForBusiness } from "@/lib/authoriseUser";
import { buildLotsAndReservations, checkStockShortfalls } from "@/lib/b2b_helpers";
import { db } from "@/lib/firebase-admin";
import { DraftLotInput, MaterialTransaction, MaterialTransactionType, Order } from "@/types/b2b";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { businessId, orderId, confirmedBy, lots: incomingLots }: {
            businessId: string;
            orderId: string;
            confirmedBy: string;
            lots?: DraftLotInput[];
        } = body;

        if (!businessId || !orderId || !confirmedBy) {
            return NextResponse.json({ error: "businessId, orderId, confirmedBy are required." }, { status: 400 });
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

        if (order.status !== "DRAFT") {
            return NextResponse.json({
                error: "order_not_draft",
                message: `Order is currently ${order.status}. Only DRAFT orders can be confirmed.`,
            }, { status: 400 });
        }

        const lotInputs = incomingLots ?? order.draftLots;

        if (!lotInputs || lotInputs.length === 0) {
            return NextResponse.json({ error: "no_lots_defined" }, { status: 400 });
        }

        await orderRef.update({ status: "CONFIRMED", updatedAt: Timestamp.now() });

        const { lotDocs, reservationDocs } = await buildLotsAndReservations(
            businessId, orderId, order.orderNumber,
            order.buyerId, order.buyerName, order.shipDate,
            confirmedBy, lotInputs,
        );

        const shortfalls = await checkStockShortfalls(businessId, reservationDocs);

        if (shortfalls.length > 0) {
            await orderRef.update({ status: "DRAFT", updatedAt: Timestamp.now() });
            return NextResponse.json({
                error: "insufficient_stock",
                message: `Insufficient raw material stock: ${shortfalls.join(", ")}`,
            }, { status: 400 });
        }

        const batch = db.batch();

        for (const lot of lotDocs) {
            batch.set(db.doc(`users/${businessId}/lots/${lot.id}`), lot);
        }

        for (const reservation of reservationDocs) {
            batch.set(db.doc(`users/${businessId}/material_reservations/${reservation.id}`), reservation);
            batch.update(db.doc(`users/${businessId}/raw_materials/${reservation.materialId}`), {
                reservedStock: FieldValue.increment(reservation.quantityRequired),
                availableStock: FieldValue.increment(-reservation.quantityRequired),
                updatedAt: Timestamp.now(),
            });
            const txRef = db.collection(`users/${businessId}/material_transactions`).doc();
            batch.set(txRef, {
                id: txRef.id,
                materialId: reservation.materialId,
                materialName: reservation.materialName,
                type: "RESERVATION" as MaterialTransactionType,
                quantity: reservation.quantityRequired,
                referenceId: orderId,
                referenceType: "LOT",
                note: `Stock reserved for Lot ${reservation.lotNumber} (Order ${order.orderNumber})`,
                createdBy: confirmedBy,
                createdAt: Timestamp.now(),
                stockBefore: null,
                stockAfter: null,
            } satisfies MaterialTransaction);
        }

        batch.update(orderRef, {
            status: "IN_PRODUCTION",
            draftLots: null,
            totalLots: lotDocs.length,
            totalQuantity: lotDocs.reduce((s, l) => s + l.quantity, 0),
            lotsInProduction: lotDocs.length,
            updatedAt: Timestamp.now(),
        });

        await batch.commit();
        return NextResponse.json({ success: true, lotCount: lotDocs.length }, { status: 200 });

    } catch (error) {
        console.error("confirmOrder error:", error);
        return NextResponse.json({ error: "internal", message: (error as Error).message }, { status: 500 });
    }
}