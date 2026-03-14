// /api/business/b2b/create-bom-entry

import { authUserForBusiness } from "@/lib/authoriseUser";
import { db } from "@/lib/firebase-admin";
import { BOMEntry, Product, RawMaterial, StageName } from "@/types/b2b";
import { Timestamp } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { businessId, productId, materialId, quantityPerPiece, consumedAtStage, wastagePercent }: {
            businessId: string;
            productId: string;
            materialId: string;
            quantityPerPiece: number;
            consumedAtStage: StageName;
            wastagePercent: number;
        } = body;

        if (!businessId || !productId || !materialId || quantityPerPiece == null || !consumedAtStage || wastagePercent == null) {
            return NextResponse.json({ error: "businessId, productId, materialId, quantityPerPiece, consumedAtStage, wastagePercent are required." }, { status: 400 });
        }
        if (quantityPerPiece <= 0) {
            return NextResponse.json({ error: "quantity_per_piece_must_be_positive" }, { status: 400 });
        }
        if (wastagePercent < 0 || wastagePercent > 100) {
            return NextResponse.json({ error: "wastage_percent_must_be_between_0_and_100" }, { status: 400 });
        }

        const result = await authUserForBusiness({ businessId, req });
        if (!result.authorised) {
            const { error, status } = result;
            return NextResponse.json({ error }, { status });
        }

        const [productDoc, materialDoc] = await Promise.all([
            db.doc(`users/${businessId}/b2bProducts/${productId}`).get(),
            db.doc(`users/${businessId}/raw_materials/${materialId}`).get(),
        ]);

        if (!productDoc.exists) {
            return NextResponse.json({ error: "product_not_found" }, { status: 404 });
        }
        if (!materialDoc.exists) {
            return NextResponse.json({ error: "material_not_found" }, { status: 404 });
        }

        const product = productDoc.data() as Product;
        const material = materialDoc.data() as RawMaterial;

        if (!product.isActive) {
            return NextResponse.json({ error: "product_inactive", message: "Cannot add BOM entry for an inactive product." }, { status: 400 });
        }
        if (!material.isActive) {
            return NextResponse.json({ error: "material_inactive", message: "Cannot add BOM entry for an inactive raw material." }, { status: 400 });
        }

        // Guard: duplicate active entry
        const existingSnap = await db
            .collection(`users/${businessId}/bom`)
            .where("productId", "==", productId)
            .where("materialId", "==", materialId)
            .where("isActive", "==", true)
            .get();
        if (!existingSnap.empty) {
            return NextResponse.json({
                error: "bom_entry_already_exists",
                message: "An active BOM entry for this product-material pair already exists. Deactivate it first to replace it.",
            }, { status: 400 });
        }

        const bomId = db.collection(`users/${businessId}/bom`).doc().id;
        const now = Timestamp.now();

        await db.doc(`users/${businessId}/bom/${bomId}`).set({
            id: bomId,
            productId,
            productName: product.name,
            productSku: product.sku,
            materialId,
            materialName: material.name,
            materialUnit: material.unit,
            quantityPerPiece,
            consumedAtStage,
            wastagePercent,
            isActive: true,
            createdAt: now,
            updatedAt: now,
        } satisfies BOMEntry);

        return NextResponse.json({ bomId }, { status: 200 });

    } catch (error) {
        console.error("createBOMEntry error:", error);
        return NextResponse.json({ error: "internal", message: (error as Error).message }, { status: 500 });
    }
}