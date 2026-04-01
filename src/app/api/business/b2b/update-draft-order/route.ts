// /api/business/b2b/update-draft-order

import { authUserForBusiness } from "@/lib/authoriseUser";
import { db } from "@/lib/firebase-admin";
import { Buyer, DraftLotInput, Order, Product } from "@/types/b2b";
import { Timestamp } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { businessId, orderId, buyerId, buyerName, buyerContact, shipDate, deliveryAddress, note, lots }: {
            businessId: string;
            orderId: string;
            buyerId: string;
            buyerName: string;
            buyerContact: string;
            shipDate: string;
            deliveryAddress: string;
            note?: string;
            lots: DraftLotInput[];
        } = body;

        if (!businessId || !orderId || !buyerId || !buyerName || !buyerContact || !shipDate || !deliveryAddress || !lots) {
            return NextResponse.json(
                { error: "businessId, orderId, buyerId, buyerName, buyerContact, shipDate, deliveryAddress, lots are required." },
                { status: 400 },
            );
        }
        if (!Array.isArray(lots) || lots.length === 0) {
            return NextResponse.json({ error: "At least one lot is required." }, { status: 400 });
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
        if (order.status !== "DRAFT") {
            return NextResponse.json(
                { error: "order_not_draft", message: `Only DRAFT orders can be edited. This order is currently ${order.status}.` },
                { status: 400 },
            );
        }

        const buyerDoc = await db.doc(`users/${businessId}/buyers/${buyerId}`).get();
        if (!buyerDoc.exists) {
            return NextResponse.json({ error: "buyer_not_found" }, { status: 404 });
        }
        if (!(buyerDoc.data() as Buyer).isActive) {
            return NextResponse.json({ error: "buyer_inactive", message: "Cannot assign an inactive buyer to an order." }, { status: 400 });
        }

        for (const lot of lots) {
            if (!lot.productId) {
                return NextResponse.json({ error: "lot_missing_product" }, { status: 400 });
            }
            if (!lot.quantity || lot.quantity <= 0) {
                return NextResponse.json({ error: "lot_invalid_quantity" }, { status: 400 });
            }
            if (!lot.stages?.length) {
                return NextResponse.json({ error: "lot_missing_stages" }, { status: 400 });
            }
            const productDoc = await db.doc(`users/${businessId}/b2bProducts/${lot.productId}`).get();
            if (!productDoc.exists) {
                return NextResponse.json({ error: "product_not_found", message: `Product ${lot.productId} does not exist.` }, { status: 404 });
            }
            if (!(productDoc.data() as Product).isActive) {
                return NextResponse.json({ error: "product_inactive", message: `Product "${lot.productName}" is inactive.` }, { status: 400 });
            }
            // BOM validation deferred to confirm-order
        }

        await orderRef.update({
            buyerId,
            buyerName,
            buyerContact,
            shipDate:        Timestamp.fromDate(new Date(shipDate)),
            deliveryAddress,
            draftLots:       lots,
            note:            note ?? null,
            updatedAt:       Timestamp.now(),
        });

        return NextResponse.json({ success: true, orderId }, { status: 200 });

    } catch (error) {
        console.error("updateDraftOrder error:", error);
        return NextResponse.json({ error: "internal", message: (error as Error).message }, { status: 500 });
    }
}