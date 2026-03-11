// /api/business/b2b/create-buyer

import { authUserForBusiness } from "@/lib/authoriseUser";
import { db } from "@/lib/firebase-admin";
import { Buyer } from "@/types/b2b";
import { Timestamp } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { businessId, name, contactPerson, phone, email, address, gstNumber, createdBy } = body;

        if (!businessId || !name || !contactPerson || !phone || !email || !address || !createdBy) {
            return NextResponse.json({ error: "businessId, name, contactPerson, phone, email, address, createdBy are required." }, { status: 400 });
        }

        const result = await authUserForBusiness({ businessId, req });
        if (!result.authorised) {
            const { error, status } = result;
            return NextResponse.json({ error }, { status });
        }

        const buyerId = db.collection(`users/${businessId}/buyers`).doc().id;
        const now = Timestamp.now();

        await db.doc(`users/${businessId}/buyers/${buyerId}`).set({
            id: buyerId,
            name,
            contactPerson,
            phone,
            email,
            address,
            gstNumber: gstNumber ?? null,
            isActive: true,
            createdAt: now,
            updatedAt: now,
        } satisfies Buyer);

        return NextResponse.json({ buyerId }, { status: 200 });

    } catch (error) {
        console.error("createBuyer error:", error);
        return NextResponse.json({ error: "internal", message: (error as Error).message }, { status: 500 });
    }
}