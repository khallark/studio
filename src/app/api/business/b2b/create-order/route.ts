// /api/business/b2b/create-order

import { authUserForBusiness } from "@/lib/authoriseUser";
import { buildLotsAndReservations, checkStockShortfalls, CreateOrderPayload, generateOrderNumber } from "@/lib/b2b_helpers";
import { db } from "@/lib/firebase-admin";
import { Order } from "@/types/b2b";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const {
            businessId, buyerId, buyerName, buyerContact,
            shipDate, deliveryAddress, note, createdBy, lots,
        }: CreateOrderPayload = body;

        if (!businessId || !buyerId || !buyerName || !buyerContact || !shipDate || !deliveryAddress || !createdBy || !lots) {
            console.log(`${!businessId ? "businessId, " : ""}${!buyerId ? "buyerId, " : ""}${!buyerName ? "buyerName, " : ""}${!buyerContact ? "buyerContact, " : ""}${!shipDate ? "shipDate, " : ""}${!deliveryAddress ? "deliveryAddress, " : ""}${!createdBy ? "createdBy, " : ""}${!lots ? "lots" : ""} are missing.`);
            return NextResponse.json(
                { error: `${!businessId ? "businessId, " : ""}${!buyerId ? "buyerId, " : ""}${!buyerName ? "buyerName, " : ""}${!buyerContact ? "buyerContact, " : ""}${!shipDate ? "shipDate, " : ""}${!deliveryAddress ? "deliveryAddress, " : ""}${!createdBy ? "createdBy, " : ""}${!lots ? "lots" : ""} are missing.` },
                { status: 400 }
            );
        }

        const result = await authUserForBusiness({ businessId, req });
        if (!result.authorised) {
            const { error, status } = result;
            return NextResponse.json({ error }, { status });
        }

        const orderNumber = await generateOrderNumber(businessId);
        const orderId = db.collection(`users/${businessId}/orders`).doc().id;
        const shipTimestamp = Timestamp.fromDate(new Date(shipDate));

        const { lotDocs, reservationDocs } = await buildLotsAndReservations(
            businessId, orderId, orderNumber,
            buyerId, buyerName, shipTimestamp,
            createdBy, lots
        );

        const shortfalls = await checkStockShortfalls(businessId, reservationDocs);

        if (shortfalls.length > 0) {
            return NextResponse.json({
                error: "insufficient_stock",
                message: `Insufficient raw material stock: ${shortfalls.join(", ")}`,
            }, { status: 400 });
        }

        const batch = db.batch();

        const orderRef = db.doc(`users/${businessId}/orders/${orderId}`);
        batch.set(orderRef, {
            id: orderId,
            orderNumber,
            buyerId,
            buyerName,
            buyerContact,
            shipDate: shipTimestamp,
            deliveryAddress,
            draftLots: null,
            totalLots: lotDocs.length,
            totalQuantity: lotDocs.reduce((s, l) => s + l.quantity, 0),
            lotsCompleted: 0,
            lotsInProduction: lotDocs.length,
            lotsDelayed: 0,
            status: "IN_PRODUCTION",
            note: note ?? null,
            createdBy,
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
        } satisfies Order);

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
        }

        await batch.commit();
        return NextResponse.json({ orderId, orderNumber, lotCount: lotDocs.length }, { status: 200 });

    } catch (error) {
        console.error("createOrder error:", error);
        return NextResponse.json({ error: "internal", message: (error as Error).message }, { status: 500 });
    }
}