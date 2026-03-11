// /api/business/b2b/save-draft-order

import { authUserForBusiness } from "@/lib/authoriseUser";
import { generateOrderNumber } from "@/lib/b2b_helpers";
import { db } from "@/lib/firebase-admin";
import { DraftLotInput, Order } from "@/types/b2b";
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

        const result = await authUserForBusiness({ businessId, req });
        if (!result.authorised) {
            const { error, status } = result;
            return NextResponse.json({ error }, { status });
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