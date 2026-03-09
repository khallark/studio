// /api/business/b2b/adjust-stock

import { AdjustStockPayload } from "@/lib/b2b_helpers";
import { db } from "@/lib/firebase-admin";
import { MaterialTransaction, MaterialTransactionType, RawMaterial } from "@/types/b2b";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { businessId, materialId, quantity, note, createdBy }: AdjustStockPayload = body;

        if (!businessId || !materialId || !quantity || !note || !createdBy) {
            console.log(`${!businessId ? "businessId, " : ""}${!materialId ? "materialId, " : ""}${!quantity ? "quantity, " : ""}${!note ? "note, " : ""}${!createdBy ? "createdBy" : ""} are missing.`);
            return NextResponse.json(
                { error: `${!businessId ? "businessId, " : ""}${!materialId ? "materialId, " : ""}${!quantity ? "quantity, " : ""}${!note ? "note, " : ""}${!createdBy ? "createdBy" : ""} are missing.` },
                { status: 400 }
            );
        }

        if (quantity === 0) {
            return NextResponse.json({ error: "quantity_cannot_be_zero" }, { status: 400 });
        }

        const materialRef = db.doc(`users/${businessId}/raw_materials/${materialId}`);

        await db.runTransaction(async (tx) => {
            const matDoc = await tx.get(materialRef);
            if (!matDoc.exists) throw new Error("material_not_found");

            const material = matDoc.data() as RawMaterial;

            // Guard: adjustment cannot push availableStock below zero
            const projectedAvailable = material.availableStock + quantity;
            if (projectedAvailable < 0) throw new Error("adjustment_exceeds_available_stock");

            const stockBefore = material.totalStock;
            const stockAfter = stockBefore + quantity;
            const now = Timestamp.now();

            tx.update(materialRef, {
                totalStock: FieldValue.increment(quantity),
                availableStock: FieldValue.increment(quantity),
                updatedAt: now,
            });

            const txRef = db.collection(`users/${businessId}/material_transactions`).doc();
            tx.set(txRef, {
                id: txRef.id,
                materialId,
                materialName: material.name,
                type: "ADJUSTMENT" as MaterialTransactionType,
                quantity,
                stockBefore,
                stockAfter,
                referenceId: null,
                referenceType: "ADJUSTMENT",
                note,
                createdBy,
                createdAt: now,
            } satisfies MaterialTransaction);
        });

        return NextResponse.json({ success: true }, { status: 200 });

    } catch (error) {
        const message = (error as Error).message;
        if (message === "material_not_found") {
            return NextResponse.json({ error: "material_not_found" }, { status: 404 });
        } else if (message === "adjustment_exceeds_available_stock") {
            return NextResponse.json({ error: "adjustment_exceeds_available_stock" }, { status: 400 });
        } else {
            console.error("adjustStock error:", error);
            return NextResponse.json({ error: "internal", message }, { status: 500 });
        }
    }
}