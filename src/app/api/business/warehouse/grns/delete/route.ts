import { NextRequest, NextResponse } from 'next/server';
import { authUserForBusiness } from '@/lib/authoriseUser';
import { db } from '@/lib/firebase-admin';
import { GRN } from '@/types/warehouse';

export async function POST(req: NextRequest) {
    try {
        const { businessId, grnId } = await req.json();

        // ============================================================
        // VALIDATION
        // ============================================================

        if (!businessId || typeof businessId !== 'string') {
            return NextResponse.json(
                { error: 'Validation Error', message: 'businessId is required and must be a string' },
                { status: 400 }
            );
        }

        if (!grnId || typeof grnId !== 'string') {
            return NextResponse.json(
                { error: 'Validation Error', message: 'grnId is required' },
                { status: 400 }
            );
        }

        // ============================================================
        // AUTHORIZATION
        // ============================================================

        const result = await authUserForBusiness({ businessId, req });

        if (!result.authorised) {
            const { error, status } = result;
            return NextResponse.json({ error }, { status });
        }

        // ============================================================
        // FETCH EXISTING GRN
        // ============================================================

        const grnRef = db.collection('users').doc(businessId).collection('grns').doc(grnId);
        const grnSnap = await grnRef.get();

        if (!grnSnap.exists) {
            return NextResponse.json(
                { error: 'Not Found', message: 'GRN not found' },
                { status: 404 }
            );
        }

        const grnData = grnSnap.data()! as GRN;

        // Only allow deleting draft or cancelled GRNs
        if (!['cancelled'].includes(grnData.status)) {
            return NextResponse.json(
                {
                    error: 'Validation Error',
                    message: `Cannot delete a GRN with status '${grnData.status}'. Only draft or cancelled GRNs can be deleted.`,
                },
                { status: 400 }
            );
        }

        const batch = db.batch();

        // Delete the GRN
        batch.delete(grnRef);
        await batch.commit();

        // ============================================================
        // RETURN SUCCESS RESPONSE
        // ============================================================

        return NextResponse.json(
            {
                success: true,
                grnId,
                deletedGrnNumber: grnData.grnNumber,
            },
            { status: 200 }
        );

    } catch (error: any) {
        console.error('❌ GRN Delete API error:', error);
        return NextResponse.json(
            {
                error: 'Internal Server Error',
                message: error.message || 'An unexpected error occurred',
            },
            { status: 500 }
        );
    }
}