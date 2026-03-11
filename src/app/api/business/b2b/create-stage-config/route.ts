// /api/business/b2b/create-stage-config

import { authUserForBusiness } from "@/lib/authoriseUser";
import { db } from "@/lib/firebase-admin";
import { ProductionStageConfig, StageName } from "@/types/b2b";
import { Timestamp } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { businessId, name, label, description, defaultDurationDays, canBeOutsourced, sortOrder }: {
            businessId: string;
            name: StageName;
            label: string;
            description: string;
            defaultDurationDays: number;
            canBeOutsourced: boolean;
            sortOrder: number;
        } = body;

        if (!businessId || !name || !label || !description || defaultDurationDays == null || canBeOutsourced == null || sortOrder == null) {
            return NextResponse.json({ error: "businessId, name, label, description, defaultDurationDays, canBeOutsourced, sortOrder are required." }, { status: 400 });
        }

        const result = await authUserForBusiness({ businessId, req });
        if (!result.authorised) {
            const { error, status } = result;
            return NextResponse.json({ error }, { status });
        }

        const stageId = db.collection(`users/${businessId}/production_stage_config`).doc().id;

        await db.doc(`users/${businessId}/production_stage_config/${stageId}`).set({
            id: stageId,
            name,
            label,
            description,
            defaultDurationDays,
            canBeOutsourced,
            sortOrder,
            createdAt: Timestamp.now(),
        } satisfies ProductionStageConfig);

        return NextResponse.json({ stageId }, { status: 200 });

    } catch (error) {
        console.error("createStageConfig error:", error);
        return NextResponse.json({ error: "internal", message: (error as Error).message }, { status: 500 });
    }
}