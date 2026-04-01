// /api/business/b2b/update-bom-entry
//
// Replaces the stages (and their materials) on an existing active BOM.
// The product link cannot be changed — deactivate and create a new BOM instead.
// Body: businessId, bomId, stages: Array<{ stage, materials: [...] }>

import { authUserForBusiness } from "@/lib/authoriseUser";
import { getConfiguredStageNames, validateStageName } from "@/lib/b2b_helpers";
import { db } from "@/lib/firebase-admin";
import { BOM, BOMStage, BOMStageItem, RawMaterial, StageName } from "@/types/b2b";
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
        const { businessId, bomId, stages }: {
            businessId: string;
            bomId: string;
            stages: StageInput[];
        } = body;

        if (!businessId || !bomId || !stages) {
            return NextResponse.json(
                { error: "businessId, bomId, stages are required." },
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

        // ── Validate BOM exists and is active ───────────────────────────────
        const bomRef = db.doc(`users/${businessId}/bom/${bomId}`);
        const bomDoc = await bomRef.get();
        if (!bomDoc.exists) {
            return NextResponse.json({ error: "bom_not_found" }, { status: 404 });
        }
        const bom = bomDoc.data() as BOM;
        if (!bom.isActive) {
            return NextResponse.json(
                { error: "bom_inactive", message: "Cannot update an inactive BOM. Create a new one instead." },
                { status: 400 },
            );
        }

        // ── Validate stage names and material fields ─────────────────────────
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
                if (mat.quantityPerPiece <= 0) {
                    return NextResponse.json({ error: "quantity_per_piece_must_be_positive" }, { status: 400 });
                }
                if (mat.wastagePercent < 0 || mat.wastagePercent > 100) {
                    return NextResponse.json({ error: "wastage_percent_must_be_between_0_and_100" }, { status: 400 });
                }
            }
        }

        // ── Build updated stages with denormalized material names ────────────
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

        await bomRef.update({ stages: builtStages, updatedAt: Timestamp.now() });
        return NextResponse.json({ success: true }, { status: 200 });

    } catch (error) {
        console.error("updateBOM error:", error);
        return NextResponse.json({ error: "internal", message: (error as Error).message }, { status: 500 });
    }
}