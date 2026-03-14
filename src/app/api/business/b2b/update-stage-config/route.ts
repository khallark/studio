// /api/business/b2b/update-stage-config

import { authUserForBusiness } from "@/lib/authoriseUser";
import { db } from "@/lib/firebase-admin";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { businessId, stageId, ...fields } = body;

        if (!businessId || !stageId) {
            return NextResponse.json({ error: "businessId and stageId are required." }, { status: 400 });
        }

        const result = await authUserForBusiness({ businessId, req });
        if (!result.authorised) {
            const { error, status } = result;
            return NextResponse.json({ error }, { status });
        }

        const stageRef = db.doc(`users/${businessId}/production_stage_config/${stageId}`);
        const stageDoc = await stageRef.get();

        if (!stageDoc.exists) {
            return NextResponse.json({ error: "stage_config_not_found" }, { status: 404 });
        }

        // name is not updatable — it is referenced as a string on every lot
        if ("name" in fields) {
            return NextResponse.json({
                error: "name_not_updatable",
                message: "Stage name cannot be changed as it is referenced by existing lots.",
            }, { status: 400 });
        }

        if ("defaultDurationDays" in fields) {
            const days = Number(fields.defaultDurationDays);
            if (isNaN(days) || days <= 0) {
                return NextResponse.json({ error: "defaultDurationDays must be greater than zero." }, { status: 400 });
            }
        }

        if ("sortOrder" in fields) {
            const order = Number(fields.sortOrder);
            if (isNaN(order) || order < 1) {
                return NextResponse.json({ error: "sortOrder must be a positive integer." }, { status: 400 });
            }
        }

        const updates = Object.fromEntries(
            Object.entries(fields).filter(([, v]) => v !== undefined),
        );

        await stageRef.update(updates);
        return NextResponse.json({ success: true }, { status: 200 });

    } catch (error) {
        console.error("updateStageConfig error:", error);
        return NextResponse.json({ error: "internal", message: (error as Error).message }, { status: 500 });
    }
}