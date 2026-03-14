// /api/business/b2b/save-draft-order

import { authUserForBusiness } from "@/lib/authoriseUser";
import { generateOrderNumber } from "@/lib/b2b_helpers";
import { db } from "@/lib/firebase-admin";
import { Buyer, DraftLotInput, Order, Product } from "@/types/b2b";
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

        // Validate buyer existence and active status
        const buyerDoc = await db.doc(`users/${businessId}/buyers/${buyerId}`).get();
        if (!buyerDoc.exists) {
            return NextResponse.json({ error: "buyer_not_found" }, { status: 404 });
        }
        if (!(buyerDoc.data() as Buyer).isActive) {
            return NextResponse.json({ error: "buyer_inactive", message: "Cannot create an order for an inactive buyer." }, { status: 400 });
        }

        // Validate each lot's product existence, active status, stages non-empty, quantity > 0
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
        }

        const orderNumber = await generateOrderNumber(businessId);
        const orderId = db.collection(`users/${businessId}/orders`).doc().id;

        await db.doc(`users/${businessId}/orders/${orderId}`).set({
            id: orderId,
            orderNumber,
            buyerId,
            buyerName,
            buyerContact,
            shipDate: Timestamp.fromDate(new Date(shipDate)),
            deliveryAddress,
            draftLots: lots,
            totalLots: 0,
            totalQuantity: 0,
            lotsCompleted: 0,
            lotsInProduction: 0,
            lotsDelayed: 0,
            status: "DRAFT",
            note: note ?? null,
            createdBy,
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
        } satisfies Order);

        return NextResponse.json({ orderId, orderNumber }, { status: 200 });

    } catch (error) {
        console.error("saveDraftOrder error:", error);
        return NextResponse.json({ error: "internal", message: (error as Error).message }, { status: 500 });
    }
}