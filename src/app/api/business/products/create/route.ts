// app/api/business/table-data/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { authUserForBusiness } from '@/lib/authoriseUser';
import { Timestamp } from 'firebase-admin/firestore';

export async function POST(req: NextRequest) {
    try {
        const { businessId, product } = await req.json();

        // ============================================================
        // VALIDATION
        // ============================================================

        if (!businessId || typeof businessId !== 'string') {
            return NextResponse.json(
                { error: 'Validation Error', message: 'businessId is required and must be a string' },
                { status: 400 }
            );
        }

        if (!product || typeof product !== 'object') {
            return NextResponse.json(
                { error: 'Validation Error', message: 'products is required and must be an object' },
                { status: 400 }
            );
        }

        // ============================================================
        // AUTHORIZATION
        // ============================================================

        const result = await authUserForBusiness({ businessId, req });
        const { businessDoc } = result;

        if (!result.authorised) {
            const { error, status } = result;
            return NextResponse.json({ error }, { status });
        }

        // ============================================================
        // CORE LOGIC
        // ============================================================

        const { name, sku, weight, category }: {
            name?: string;
            sku?: string;
            weight?: number;
            category?: string;
        } = product;

        if (!name || !sku || !weight || !category) {
            return NextResponse.json(
                { error: 'Validation Error', message: 'missing fields in the "Products"' },
                { status: 400 }
            );
        }

        const productDoc = await businessDoc?.ref.collection('products').doc(sku).get();

        if (productDoc?.exists) {
            return NextResponse.json(
                { error: 'Validation Error', message: 'Cannot Create already existing product' },
                { status: 400 }
            );
        }

        await productDoc?.ref.set({
            createdBy: result?.userId || "unknown",
            createdAt: Timestamp.now(),
            ...product
        }, { merge: true });

        // ============================================================
        // RETURN ACCEPTED RESPONSE
        // ============================================================

        return NextResponse.json(
            {
                success: true,
                message: 'Product created.',
                product,
            },
            { status: 202 }
        );

    } catch (error: any) {
        console.error('❌ API error:', error);
        return NextResponse.json(
            {
                error: 'Internal Server Error',
                message: error.message || 'An unexpected error occurred',
            },
            { status: 500 }
        );
    }
}