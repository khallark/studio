// /api/business/b2b/create-raw-material

import { authUserForBusiness } from "@/lib/authoriseUser";
import { db } from "@/lib/firebase-admin";
import { RawMaterial } from "@/types/b2b";
import { Timestamp } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { businessId, name, sku, unit, category, reorderLevel, supplierName, createdBy }: {
            businessId: string;
            name: string;
            sku: string;
            unit: string;
            category: string;
            reorderLevel: number;
            supplierName?: string;
            createdBy: string;
        } = body;

        if (!businessId || !name || !sku || !unit || !category || reorderLevel == null || !createdBy) {
            return NextResponse.json({ error: "businessId, name, sku, unit, category, reorderLevel, createdBy are required." }, { status: 400 });
        }

        const result = await authUserForBusiness({ businessId, req });
        if (!result.authorised) {
            const { error, status } = result;
            return NextResponse.json({ error }, { status });
        }

        const materialId = db.collection(`users/${businessId}/raw_materials`).doc().id;
        const now = Timestamp.now();

        await db.doc(`users/${businessId}/raw_materials/${materialId}`).set({
            id: materialId,
            name,
            sku,
            unit,
            category,
            totalStock: 0,
            reservedStock: 0,
            availableStock: 0,
            reorderLevel,
            supplierName: supplierName ?? null,
            isActive: true,
            createdAt: now,
            updatedAt: now,
        } satisfies RawMaterial);

        return NextResponse.json({ materialId }, { status: 200 });

    } catch (error) {
        console.error("createRawMaterial error:", error);
        return NextResponse.json({ error: "internal", message: (error as Error).message }, { status: 500 });
    }
}