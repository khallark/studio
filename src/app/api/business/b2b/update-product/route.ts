// /api/business/b2b/update-product

import { authUserForBusiness } from "@/lib/authoriseUser";
import { getConfiguredStageNames, validateStageNames } from "@/lib/b2b_helpers";
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

        if ("sku" in fields) {
            return NextResponse.json({
                error: "sku_not_updatable",
                message: "SKU cannot be changed as it is the document ID and is referenced by existing lots and BOM entries.",
            }, { status: 400 });
        }

        if ("defaultStages" in fields) {
            if (!Array.isArray(fields.defaultStages) || fields.defaultStages.length === 0) {
                return NextResponse.json({ error: "defaultStages must be a non-empty array." }, { status: 400 });
            }
            // Validate all stage names exist in this business's stage config
            const configuredStages = await getConfiguredStageNames(businessId);
            const stageError = validateStageNames(fields.defaultStages, configuredStages, "defaultStages");
            if (stageError) {
                return NextResponse.json({ error: "invalid_stage", message: stageError }, { status: 400 });
            }
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