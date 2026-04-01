// /api/business/b2b/add-stock

import { authUserForBusiness } from "@/lib/authoriseUser";
import { db } from "@/lib/firebase-admin";
import { MaterialTransaction, MaterialTransactionType, RawMaterial } from "@/types/b2b";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { businessId, materialId, quantity, referenceId, note, createdBy }: {
            businessId: string;
            materialId: string;
            quantity: number;
            referenceId: string;
            note?: string;
            createdBy: string;
        } = body;

        if (!businessId || !materialId || quantity == null || !referenceId || !createdBy) {
            return NextResponse.json(
                { error: "businessId, materialId, quantity, referenceId, createdBy are required." },
                { status: 400 },
            );
        }

        const result = await authUserForBusiness({ businessId, req });
        if (!result.authorised) {
            return NextResponse.json({ error: result.error }, { status: result.status });
        }

        if (quantity <= 0) {
            return NextResponse.json({ error: "quantity_must_be_positive" }, { status: 400 });
        }

        const materialRef = db.doc(`users/${businessId}/raw_materials/${materialId}`);

        await db.runTransaction(async (tx) => {
            const matDoc = await tx.get(materialRef);
            if (!matDoc.exists) throw new Error("material_not_found");

            const material = matDoc.data() as RawMaterial;
            if (!material.isActive) throw new Error("material_inactive");

            const stockBefore = material.totalStock;
            const stockAfter = stockBefore + quantity;
            const now = Timestamp.now();

            // totalStock and availableStock are always equal (no reservations)
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
                type: "PURCHASE" as MaterialTransactionType,
                quantity,
                stockBefore,
                stockAfter,
                referenceId,
                referenceType: "PURCHASE_ORDER",
                note: note ?? null,
                createdBy,
                createdAt: now,
            } satisfies MaterialTransaction);
        });

        return NextResponse.json({ success: true }, { status: 200 });

    } catch (error) {
        const message = (error as Error).message;
        if (message === "material_not_found") return NextResponse.json({ error: "material_not_found" }, { status: 404 });
        if (message === "material_inactive") return NextResponse.json({ error: "material_inactive", message: "Cannot add stock to an inactive material." }, { status: 400 });
        console.error("addStock error:", error);
        return NextResponse.json({ error: "internal", message }, { status: 500 });
    }
}