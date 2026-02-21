import { NextRequest, NextResponse } from 'next/server';
import { authUserForBusiness } from '@/lib/authoriseUser';
import { Timestamp } from 'firebase-admin/firestore';
import { db } from '@/lib/firebase-admin';
import { GRN, PurchaseOrder, PurchaseOrderItem } from '@/types/warehouse';

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

        // ============================================================
        // REVERT PO QUANTITIES IF GRN WAS DRAFT (had updated PO on creation)
        // ============================================================

        const batch = db.batch();

        // if (grnData.status === 'draft') {
        //     const poRef = db.collection('users').doc(businessId).collection('purchaseOrders').doc(grnData.poId);
        //     const poSnap = await poRef.get();

        //     if (poSnap.exists) {
        //         const poData = poSnap.data()! as PurchaseOrder;
        //         const now = Timestamp.now();
        //         const updatedPoItems: PurchaseOrderItem[] = [...poData.items];

        //         for (const grnItem of grnData.items) {
        //             const idx = updatedPoItems.findIndex((pi: PurchaseOrderItem) => pi.sku === grnItem.sku);
        //             if (idx !== -1) {
        //                 updatedPoItems[idx] = {
        //                     ...updatedPoItems[idx],
        //                     receivedQty: Math.max(0, updatedPoItems[idx].receivedQty - grnItem.receivedQty),
        //                     notReceivedQty: Math.max(
        //                     updatedPoItems[idx].expectedQty - (updatedPoItems[idx].receivedQty - grnItem.receivedQty),
        //                     0),
        //                 };

        //                 const poItem = updatedPoItems[idx];
        //                 if (poItem.receivedQty > 0) {
        //                     if (poItem.receivedQty < poItem.expectedQty)
        //                         poItem.status = 'partially_received';
        //                     else
        //                         poItem.status = 'fully_received';
        //                 } else {
        //                     poItem.status = 'pending';
        //                 }
        //             }
        //         }

        //         // Recalculate PO status
        //         let newPoStatus = poData.status;
        //         if (poData.status === 'draft') {
        //             const anyPartiallyReceived = updatedPoItems.some(pi => pi.status === 'partially_received');
        //             const anyFullyReceived = updatedPoItems.some(pi => pi.status === 'fully_received');
        //             const allFullyReceived = updatedPoItems.every(pi => pi.status === 'fully_received');
        //             if (allFullyReceived) newPoStatus = 'fully_received';
        //             else if (anyPartiallyReceived || anyFullyReceived) newPoStatus = 'partially_received';
        //             else newPoStatus = 'confirmed';
        //         }

        //         const poUpdatedData: Partial<PurchaseOrder> = {
        //             items: updatedPoItems,
        //             status: newPoStatus,
        //             updatedAt: now,
        //         }

        //         batch.update(poRef, poUpdatedData);
        //     }
        // }

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