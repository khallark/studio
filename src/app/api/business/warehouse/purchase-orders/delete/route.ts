import { NextRequest, NextResponse } from 'next/server';
import { authUserForBusiness } from '@/lib/authoriseUser';
import { db } from '@/lib/firebase-admin';
import { PurchaseOrder } from '@/types/warehouse';

export async function POST(req: NextRequest) {
    try {
        const { businessId, purchaseOrderId } = await req.json();

        // ============================================================
        // VALIDATION
        // ============================================================

        if (!businessId || typeof businessId !== 'string') {
            return NextResponse.json(
                { error: 'Validation Error', message: 'businessId is required and must be a string' },
                { status: 400 }
            );
        }

        if (!purchaseOrderId || typeof purchaseOrderId !== 'string') {
            return NextResponse.json(
                { error: 'Validation Error', message: 'purchaseOrderId is required' },
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
        // FETCH EXISTING PO
        // ============================================================

        const poRef = db.collection('users').doc(businessId).collection('purchaseOrders').doc(purchaseOrderId);
        const poSnap = await poRef.get();

        if (!poSnap.exists) {
            return NextResponse.json(
                { error: 'Not Found', message: 'Purchase order not found' },
                { status: 404 }
            );
        }

        const poData = poSnap.data()! as PurchaseOrder;

        // Only allow deleting draft or cancelled POs
        if (!['draft', 'cancelled'].includes(poData.status)) {
            return NextResponse.json(
                {
                    error: 'Validation Error',
                    message: `Cannot delete a PO with status '${poData.status}'. Only draft or cancelled POs can be deleted.`,
                },
                { status: 400 }
            );
        }

        // Check if any GRNs reference this PO
        const grnsSnap = await db
            .collection('users')
            .doc(businessId)
            .collection('grns')
            .where('poId', '==', purchaseOrderId)
            .limit(1)
            .get();

        if (!grnsSnap.empty) {
            return NextResponse.json(
                {
                    error: 'Validation Error',
                    message: 'Cannot delete a PO that has associated GRNs. Delete the GRNs first.',
                },
                { status: 400 }
            );
        }

        // ============================================================
        // DELETE FROM FIRESTORE
        // ============================================================

        await poRef.delete();

        // ============================================================
        // RETURN SUCCESS RESPONSE
        // ============================================================

        return NextResponse.json(
            {
                success: true,
                purchaseOrderId,
                deletedPoNumber: poData.poNumber,
            },
            { status: 200 }
        );

    } catch (error: any) {
        console.error('❌ PO Delete API error:', error);
        return NextResponse.json(
            {
                error: 'Internal Server Error',
                message: error.message || 'An unexpected error occurred',
            },
            { status: 500 }
        );
    }
}