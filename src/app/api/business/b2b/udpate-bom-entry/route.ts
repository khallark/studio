// /api/business/b2b/update-bom-entry

import { authUserForBusiness } from "@/lib/authoriseUser";
import { db } from "@/lib/firebase-admin";
import { BOMEntry, StageName } from "@/types/b2b";
import { Timestamp } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { businessId, bomId, quantityPerPiece, wastagePercent, consumedAtStage }: {
            businessId: string;
            bomId: string;
            quantityPerPiece?: number;
            wastagePercent?: number;
            consumedAtStage?: StageName;
        } = body;

        if (!businessId || !bomId) {
            return NextResponse.json({ error: "businessId and bomId are required." }, { status: 400 });
        }

        const result = await authUserForBusiness({ businessId, req });
        if (!result.authorised) {
            const { error, status } = result;
            return NextResponse.json({ error }, { status });
        }

        const bomRef = db.doc(`users/${businessId}/bom/${bomId}`);
        const bomDoc = await bomRef.get();

        if (!bomDoc.exists) {
            return NextResponse.json({ error: "bom_entry_not_found" }, { status: 404 });
        }

        // Guard: cannot update an inactive entry
        if (!(bomDoc.data() as BOMEntry).isActive) {
            return NextResponse.json({ error: "bom_entry_inactive", message: "Cannot update an inactive BOM entry. Reactivate it first by creating a new entry." }, { status: 400 });
        }

        if (quantityPerPiece !== undefined && quantityPerPiece <= 0) {
            return NextResponse.json({ error: "quantity_per_piece_must_be_positive" }, { status: 400 });
        }
        if (wastagePercent !== undefined && (wastagePercent < 0 || wastagePercent > 100)) {
            return NextResponse.json({ error: "wastage_percent_must_be_between_0_and_100" }, { status: 400 });
        }

        const updates: Record<string, unknown> = { updatedAt: Timestamp.now() };
        if (quantityPerPiece !== undefined) updates.quantityPerPiece = quantityPerPiece;
        if (wastagePercent !== undefined) updates.wastagePercent = wastagePercent;
        if (consumedAtStage !== undefined) updates.consumedAtStage = consumedAtStage;

        await bomRef.update(updates);
        return NextResponse.json({ success: true }, { status: 200 });

    } catch (error) {
        console.error("updateBOMEntry error:", error);
        return NextResponse.json({ error: "internal", message: (error as Error).message }, { status: 500 });
    }
}