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

        if (reorderLevel < 0) {
            return NextResponse.json({ error: "reorderLevel must be zero or greater." }, { status: 400 });
        }

        const result = await authUserForBusiness({ businessId, req });
        if (!result.authorised) {
            const { error, status } = result;
            return NextResponse.json({ error }, { status });
        }

        // SKU is the document ID — normalized to uppercase
        const materialId = sku.trim().toUpperCase();

        // Check for duplicate by reading the doc directly (one read, no query)
        const materialRef = db.doc(`users/${businessId}/raw_materials/${materialId}`);
        const existingDoc = await materialRef.get();
        if (existingDoc.exists) {
            return NextResponse.json({
                error: "sku_already_exists",
                message: `A raw material with SKU "${materialId}" already exists.`,
            }, { status: 400 });
        }

        const now = Timestamp.now();

        await materialRef.set({
            id: materialId,
            name,
            sku: materialId,
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