// /api/business/b2b/update-raw-material

import { authUserForBusiness } from "@/lib/authoriseUser";
import { db } from "@/lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";

// Only these two stock fields are managed by add-stock / adjust-stock.
// They cannot be set directly via this update route.
const STOCK_FIELDS = ["totalStock", "availableStock"];

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { businessId, materialId, ...fields } = body;

        if (!businessId || !materialId) {
            return NextResponse.json({ error: "businessId and materialId are required." }, { status: 400 });
        }

        const result = await authUserForBusiness({ businessId, req });
        if (!result.authorised) {
            return NextResponse.json({ error: result.error }, { status: result.status });
        }

        const materialRef = db.doc(`users/${businessId}/raw_materials/${materialId}`);
        const materialDoc = await materialRef.get();
        if (!materialDoc.exists) {
            return NextResponse.json({ error: "material_not_found" }, { status: 404 });
        }

        for (const f of STOCK_FIELDS) {
            if (f in fields) {
                return NextResponse.json(
                    { error: "stock_fields_not_allowed", message: `Cannot update ${f} directly. Use add-stock or adjust-stock.` },
                    { status: 400 },
                );
            }
        }

        if ("reorderLevel" in fields) {
            const level = Number(fields.reorderLevel);
            if (isNaN(level) || level < 0) {
                return NextResponse.json({ error: "reorderLevel must be zero or greater." }, { status: 400 });
            }
        }

        const updates = Object.fromEntries(
            Object.entries(fields).filter(([, v]) => v !== undefined),
        );
        await materialRef.update({ ...updates, updatedAt: Timestamp.now() });
        return NextResponse.json({ success: true }, { status: 200 });

    } catch (error) {
        console.error("updateRawMaterial error:", error);
        return NextResponse.json({ error: "internal", message: (error as Error).message }, { status: 500 });
    }
}