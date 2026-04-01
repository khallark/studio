// /api/business/b2b/create-bom-entry
//
// Creates a full BOM for a product.  One active BOM per product at a time.
// Body:
//   businessId, productId,
//   stages: Array<{ stage: StageName, materials: Array<{ materialId, quantityPerPiece, wastagePercent }> }>

import { authUserForBusiness } from "@/lib/authoriseUser";
import { getConfiguredStageNames, validateStageName } from "@/lib/b2b_helpers";
import { db } from "@/lib/firebase-admin";
import { BOM, BOMStage, BOMStageItem, Product, RawMaterial, StageName } from "@/types/b2b";
import { Timestamp } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";

interface StageInput {
    stage: StageName;
    materials: Array<{
        materialId: string;
        quantityPerPiece: number;
        wastagePercent: number;
    }>;
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { businessId, productId, stages }: {
            businessId: string;
            productId: string;
            stages: StageInput[];
        } = body;

        if (!businessId || !productId || !stages) {
            return NextResponse.json(
                { error: "businessId, productId, stages are required." },
                { status: 400 },
            );
        }
        if (!Array.isArray(stages) || stages.length === 0) {
            return NextResponse.json(
                { error: "stages must be a non-empty array." },
                { status: 400 },
            );
        }

        const result = await authUserForBusiness({ businessId, req });
        if (!result.authorised) {
            return NextResponse.json({ error: result.error }, { status: result.status });
        }

        // ── Validate product ────────────────────────────────────────────────
        const productDoc = await db.doc(`users/${businessId}/b2bProducts/${productId}`).get();
        if (!productDoc.exists) {
            return NextResponse.json({ error: "product_not_found" }, { status: 404 });
        }
        const product = productDoc.data() as Product;
        if (!product.isActive) {
            return NextResponse.json(
                { error: "product_inactive", message: "Cannot add a BOM for an inactive product." },
                { status: 400 },
            );
        }

        // ── Guard: no duplicate active BOM ──────────────────────────────────
        const existingSnap = await db
            .collection(`users/${businessId}/bom`)
            .where("productId", "==", productId)
            .where("isActive", "==", true)
            .limit(1)
            .get();
        if (!existingSnap.empty) {
            return NextResponse.json(
                {
                    error: "bom_already_exists",
                    message: "An active BOM already exists for this product. Deactivate it first before creating a new one.",
                },
                { status: 400 },
            );
        }

        // ── Validate stage names ────────────────────────────────────────────
        const configuredStages = await getConfiguredStageNames(businessId);
        for (const stageInput of stages) {
            const stageError = validateStageName(stageInput.stage, configuredStages, "BOM stage");
            if (stageError) {
                return NextResponse.json({ error: "invalid_stage", message: stageError }, { status: 400 });
            }
            if (!Array.isArray(stageInput.materials) || stageInput.materials.length === 0) {
                return NextResponse.json(
                    { error: "empty_stage_materials", message: `Stage "${stageInput.stage}" must have at least one material.` },
                    { status: 400 },
                );
            }
            for (const mat of stageInput.materials) {
                if (!mat.materialId) {
                    return NextResponse.json({ error: "missing_material_id" }, { status: 400 });
                }
                if (mat.quantityPerPiece <= 0) {
                    return NextResponse.json({ error: "quantity_per_piece_must_be_positive" }, { status: 400 });
                }
                if (mat.wastagePercent < 0 || mat.wastagePercent > 100) {
                    return NextResponse.json({ error: "wastage_percent_must_be_between_0_and_100" }, { status: 400 });
                }
            }
        }

        // ── Fetch and validate materials, build denormalized stage items ─────
        const builtStages: BOMStage[] = [];
        for (const stageInput of stages) {
            const items: BOMStageItem[] = [];
            for (const mat of stageInput.materials) {
                const matDoc = await db.doc(`users/${businessId}/raw_materials/${mat.materialId}`).get();
                if (!matDoc.exists) {
                    return NextResponse.json(
                        { error: "material_not_found", message: `Material ${mat.materialId} does not exist.` },
                        { status: 404 },
                    );
                }
                const material = matDoc.data() as RawMaterial;
                if (!material.isActive) {
                    return NextResponse.json(
                        { error: "material_inactive", message: `Material "${material.name}" is inactive.` },
                        { status: 400 },
                    );
                }
                items.push({
                    materialId: material.id,
                    materialName: material.name,
                    materialUnit: material.unit,
                    quantityPerPiece: mat.quantityPerPiece,
                    wastagePercent: mat.wastagePercent,
                });
            }
            builtStages.push({ stage: stageInput.stage, materials: items });
        }

        // ── Create BOM doc ──────────────────────────────────────────────────
        const bomId = db.collection(`users/${businessId}/bom`).doc().id;
        const now = Timestamp.now();

        await db.doc(`users/${businessId}/bom/${bomId}`).set({
            id: bomId,
            productId,
            productName: product.name,
            productSku: product.sku,
            stages: builtStages,
            isActive: true,
            createdAt: now,
            updatedAt: now,
        } satisfies BOM);

        return NextResponse.json({ bomId }, { status: 200 });

    } catch (error) {
        console.error("createBOM error:", error);
        return NextResponse.json({ error: "internal", message: (error as Error).message }, { status: 500 });
    }
}