// /api/business/b2b/create-order

import { authUserForBusiness } from "@/lib/authoriseUser";
import { buildLotsAndReservations, checkStockShortfalls, generateOrderNumber } from "@/lib/b2b_helpers";
import { db } from "@/lib/firebase-admin";
import { Buyer, DraftLotInput, MaterialTransaction, MaterialTransactionType, Order, Product } from "@/types/b2b";
import { Timestamp } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { businessId, buyerId, buyerName, buyerContact, shipDate, deliveryAddress, note, createdBy, lots }: {
            businessId: string;
            buyerId: string;
            buyerName: string;
            buyerContact: string;
            shipDate: string;
            deliveryAddress: string;
            note?: string;
            createdBy: string;
            lots: DraftLotInput[];
        } = body;

        if (!businessId || !buyerId || !buyerName || !buyerContact || !shipDate || !deliveryAddress || !createdBy || !lots) {
            return NextResponse.json({ error: "businessId, buyerId, buyerName, buyerContact, shipDate, deliveryAddress, createdBy, lots are required." }, { status: 400 });
        }
        if (!lots.length) {
            return NextResponse.json({ error: "at_least_one_lot_required" }, { status: 400 });
        }

        const result = await authUserForBusiness({ businessId, req });
        if (!result.authorised) {
            const { error, status } = result;
            return NextResponse.json({ error }, { status });
        }

        // Validate buyer
        const buyerDoc = await db.doc(`users/${businessId}/buyers/${buyerId}`).get();
        if (!buyerDoc.exists) {
            return NextResponse.json({ error: "buyer_not_found" }, { status: 404 });
        }
        if (!(buyerDoc.data() as Buyer).isActive) {
            return NextResponse.json({ error: "buyer_inactive", message: "Cannot create an order for an inactive buyer." }, { status: 400 });
        }

        // Validate each lot: product exists + active, quantity > 0, stages non-empty, BOM exists
        for (const lot of lots) {
            if (!lot.productId) {
                return NextResponse.json({ error: "lot_missing_product", message: "Each lot must have a productId." }, { status: 400 });
            }
            if (!lot.quantity || lot.quantity <= 0) {
                return NextResponse.json({ error: "lot_invalid_quantity", message: "Each lot must have a quantity greater than 0." }, { status: 400 });
            }
            if (!lot.stages?.length) {
                return NextResponse.json({ error: "lot_missing_stages", message: "Each lot must have at least one stage." }, { status: 400 });
            }

            const productDoc = await db.doc(`users/${businessId}/b2bProducts/${lot.productId}`).get();
            if (!productDoc.exists) {
                return NextResponse.json({ error: "product_not_found", message: `Product ${lot.productId} does not exist.` }, { status: 404 });
            }
            if (!(productDoc.data() as Product).isActive) {
                return NextResponse.json({ error: "product_inactive", message: `Product ${lot.productName} is inactive.` }, { status: 400 });
            }

            // BOM must exist — block order creation if no active BOM entries for this product
            const bomSnap = await db
                .collection(`users/${businessId}/bom`)
                .where("productId", "==", lot.productId)
                .where("isActive", "==", true)
                .limit(1)
                .get();
            if (bomSnap.empty) {
                return NextResponse.json({
                    error: "no_bom_for_product",
                    message: `Product "${lot.productName}" has no active BOM entries. Add at least one BOM entry before creating an order.`,
                }, { status: 400 });
            }
        }

        const orderNumber = await generateOrderNumber(businessId);
        const orderId = db.collection(`users/${businessId}/orders`).doc().id;
        const shipTimestamp = Timestamp.fromDate(new Date(shipDate));

        const { lotDocs, reservationDocs } = await buildLotsAndReservations(
            businessId, orderId, orderNumber,
            buyerId, buyerName, shipTimestamp,
            createdBy, lots,
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
            const txRef = db.collection(`users/${businessId}/material_transactions`).doc();
            batch.set(txRef, {
                id: txRef.id,
                materialId: reservation.materialId,
                materialName: reservation.materialName,
                type: "RESERVATION" as MaterialTransactionType,
                quantity: reservation.quantityRequired,
                referenceId: orderId,
                referenceType: "LOT",
                note: `Stock reserved for Lot ${reservation.lotNumber} (Order ${orderNumber})`,
                createdBy,
                createdAt: Timestamp.now(),
                stockBefore: null,
                stockAfter: null,
            } satisfies MaterialTransaction);
        }

        await batch.commit();
        return NextResponse.json({ orderId, orderNumber, lotCount: lotDocs.length }, { status: 200 });

    } catch (error) {
        console.error("createOrder error:", error);
        return NextResponse.json({ error: "internal", message: (error as Error).message }, { status: 500 });
    }
}