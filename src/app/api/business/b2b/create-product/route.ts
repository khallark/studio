// /api/business/b2b/create-product

import { authUserForBusiness } from "@/lib/authoriseUser";
import { db } from "@/lib/firebase-admin";
import { Product, StageName } from "@/types/b2b";
import { Timestamp } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { businessId, name, sku, category, description, defaultStages, createdBy }: {
            businessId: string;
            name: string;
            sku: string;
            category: string;
            description?: string;
            defaultStages: StageName[];
            createdBy: string;
        } = body;

        if (!businessId || !name || !sku || !category || !defaultStages || !createdBy) {
            return NextResponse.json({ error: "businessId, name, sku, category, defaultStages, createdBy are required." }, { status: 400 });
        }

        const result = await authUserForBusiness({ businessId, req });
        if (!result.authorised) {
            const { error, status } = result;
            return NextResponse.json({ error }, { status });
        }

        const productId = db.collection(`users/${businessId}/b2bProducts`).doc().id;
        const now = Timestamp.now();

        await db.doc(`users/${businessId}/b2bProducts/${productId}`).set({
            id: productId,
            name,
            sku,
            category,
            description: description ?? null,
            defaultStages,
            isActive: true,
            createdAt: now,
            updatedAt: now,
        } satisfies Product);

        return NextResponse.json({ productId }, { status: 200 });

    } catch (error) {
        console.error("createProduct error:", error);
        return NextResponse.json({ error: "internal", message: (error as Error).message }, { status: 500 });
    }
}