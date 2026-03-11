// /api/business/b2b/update-buyer

import { authUserForBusiness } from "@/lib/authoriseUser";
import { db } from "@/lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { businessId, buyerId, ...fields } = body;

        if (!businessId || !buyerId) {
            return NextResponse.json({ error: "businessId and buyerId are required." }, { status: 400 });
        }

        const result = await authUserForBusiness({ businessId, req });
        if (!result.authorised) {
            const { error, status } = result;
            return NextResponse.json({ error }, { status });
        }

        const buyerRef = db.doc(`users/${businessId}/buyers/${buyerId}`);
        const buyerDoc = await buyerRef.get();

        if (!buyerDoc.exists) {
            return NextResponse.json({ error: "buyer_not_found" }, { status: 404 });
        }

        const updates = Object.fromEntries(
            Object.entries(fields).filter(([, v]) => v !== undefined),
        );

        await buyerRef.update({ ...updates, updatedAt: Timestamp.now() });
        return NextResponse.json({ success: true }, { status: 200 });

    } catch (error) {
        console.error("updateBuyer error:", error);
        return NextResponse.json({ error: "internal", message: (error as Error).message }, { status: 500 });
    }
}