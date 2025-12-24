// app/api/business/products/logs/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { authUserForBusiness } from '@/lib/authoriseUser';

export async function POST(req: NextRequest) {
    try {
        const { businessId, sku, limit = 50 } = await req.json();

        // ============================================================
        // VALIDATION
        // ============================================================

        if (!businessId || typeof businessId !== 'string') {
            return NextResponse.json(
                { error: 'Validation Error', message: 'businessId is required' },
                { status: 400 }
            );
        }

        if (!sku || typeof sku !== 'string') {
            return NextResponse.json(
                { error: 'Validation Error', message: 'sku is required' },
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
        // FETCH LOGS
        // ============================================================

        const productRef = businessDoc?.ref.collection('products').doc(sku);
        const productDoc = await productRef?.get();

        if (!productDoc?.exists) {
            return NextResponse.json(
                { error: 'Not Found', message: 'Product not found' },
                { status: 404 }
            );
        }

        const logsSnapshot = await productRef!
            .collection('logs')
            .orderBy('performedAt', 'desc')
            .limit(Math.min(limit, 100))
            .get();

        const logs = logsSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            performedAt: doc.data().performedAt?.toDate?.()?.toISOString() || null,
        }));

        // ============================================================
        // RETURN RESPONSE
        // ============================================================

        return NextResponse.json({
            success: true,
            sku,
            productName: productDoc.data()?.name || sku,
            logs,
            totalLogs: logs.length,
        });

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