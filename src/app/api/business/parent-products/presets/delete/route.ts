// app/api/business/parent-products/presets/delete/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { authUserForBusiness } from '@/lib/authoriseUser';

export async function POST(req: NextRequest) {
    try {
        const { businessId, presetId }: { businessId: string; presetId: string } =
            await req.json();

        if (!businessId || typeof businessId !== 'string') {
            return NextResponse.json(
                { error: 'Validation Error', message: 'businessId is required and must be a string' },
                { status: 400 }
            );
        }
        if (!presetId || typeof presetId !== 'string') {
            return NextResponse.json(
                { error: 'Validation Error', message: 'presetId is required and must be a string' },
                { status: 400 }
            );
        }

        const result = await authUserForBusiness({ businessId, req });
        const { businessDoc } = result;
        if (!result.authorised) {
            const { error, status } = result;
            return NextResponse.json({ error }, { status });
        }

        const ref = businessDoc!.ref.collection('sizeChartPresets').doc(presetId);
        const snap = await ref.get();
        if (!snap.exists) {
            return NextResponse.json(
                { error: 'Not Found', message: 'Preset does not exist' },
                { status: 404 }
            );
        }

        await ref.delete();

        return NextResponse.json(
            { success: true, message: 'Preset deleted successfully.', presetId },
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