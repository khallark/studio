// /api/business/b2b/update-product

import { authUserForBusiness } from "@/lib/authoriseUser";
import { db } from "@/lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { businessId, productId, ...fields } = body;

        if (!businessId || !productId) {
            return NextResponse.json({ error: "businessId and productId are required." }, { status: 400 });
        }

        const result = await authUserForBusiness({ businessId, req });
        if (!result.authorised) {
            const { error, status } = result;
            return NextResponse.json({ error }, { status });
        }

        const productRef = db.doc(`users/${businessId}/b2bProducts/${productId}`);
        const productDoc = await productRef.get();

        if (!productDoc.exists) {
            return NextResponse.json({ error: "product_not_found" }, { status: 404 });
        }

        const updates = Object.fromEntries(
            Object.entries(fields).filter(([, v]) => v !== undefined),
        );

        await productRef.update({ ...updates, updatedAt: Timestamp.now() });
        return NextResponse.json({ success: true }, { status: 200 });

    } catch (error) {
        console.error("updateProduct error:", error);
        return NextResponse.json({ error: "internal", message: (error as Error).message }, { status: 500 });
    }
}