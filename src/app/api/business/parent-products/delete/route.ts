// app/api/business/parent-products/delete/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { authUserForBusiness } from '@/lib/authoriseUser';

export async function POST(req: NextRequest) {
    try {
        const { businessId, parentProductId }: { businessId: string; parentProductId: string } =
            await req.json();

        if (!businessId || typeof businessId !== 'string') {
            return NextResponse.json(
                { error: 'Validation Error', message: 'businessId is required and must be a string' },
                { status: 400 }
            );
        }
        if (!parentProductId || typeof parentProductId !== 'string') {
            return NextResponse.json(
                { error: 'Validation Error', message: 'parentProductId is required and must be a string' },
                { status: 400 }
            );
        }

        const result = await authUserForBusiness({ businessId, req });
        const { businessDoc } = result;
        if (!result.authorised) {
            const { error, status } = result;
            return NextResponse.json({ error }, { status });
        }

        const ref = businessDoc!.ref.collection('parentProducts').doc(parentProductId);
        const snap = await ref.get();
        if (!snap.exists) {
            return NextResponse.json(
                { error: 'Not Found', message: 'Parent product does not exist' },
                { status: 404 }
            );
        }

        // Block deletion if any product references this parent
        const inUse = await businessDoc!.ref
            .collection('products')
            .where('parentProductId', '==', parentProductId)
            .limit(1)
            .get();

        if (!inUse.empty) {
            return NextResponse.json(
                {
                    error: 'Conflict',
                    message: 'Cannot delete: products are still assigned to this parent. Reassign them first.',
                },
                { status: 409 }
            );
        }

        await ref.delete();

        return NextResponse.json(
            { success: true, message: 'Parent product deleted successfully.', parentProductId },
            { status: 200 }
        );
    } catch (error: any) {
        console.error('❌ API error:', error);
        return NextResponse.json(
            { error: 'Internal Server Error', message: error.message || 'An unexpected error occurred' },
            { status: 500 }
        );
    }
}