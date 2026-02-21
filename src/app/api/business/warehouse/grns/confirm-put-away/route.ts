import { NextRequest, NextResponse } from 'next/server';
import { authUserForBusiness } from '@/lib/authoriseUser';
import { DocumentReference, Timestamp, WriteBatch } from 'firebase-admin/firestore';
import { db } from '@/lib/firebase-admin';
import { GRN, UPC } from '@/types/warehouse';

export async function POST(req: NextRequest) {
    try {
        const { businessId, grnId } = await req.json();

        // ============================================================
        // VALIDATION
        // ============================================================

        if (!businessId || typeof businessId !== 'string') {
            return NextResponse.json(
                { error: 'Validation Error', message: 'businessId is required' },
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
        const { userId } = result;

        if (!userId) {
            return NextResponse.json({ error: 'User not logged in' }, { status: 401 });
        }

        if (!result.authorised) {
            const { error, status } = result;
            return NextResponse.json({ error }, { status });
        }

        // ============================================================
        // FETCH & VALIDATE GRN
        // ============================================================

        const grnRef = db.collection('users').doc(businessId).collection('grns').doc(grnId);
        const grnSnap = await grnRef.get();

        if (!grnSnap.exists) {
            return NextResponse.json({ error: 'Not Found', message: 'GRN not found' }, { status: 404 });
        }

        const grnData = grnSnap.data() as GRN;

        if (grnData.status !== 'draft') {
            return NextResponse.json(
                { error: 'Validation Error', message: `GRN is already '${grnData.status}'. Only draft GRNs can be confirmed for put away.` },
                { status: 400 }
            );
        }

        // ============================================================
        // CREATE UPCs FOR EACH RECEIVED ITEM
        // ============================================================

        const now = Timestamp.now();
        const upcsCollection = db.collection('users').doc(businessId).collection('upcs');

        // Firestore batch limit is 500 writes. We have 1 GRN update + N UPCs.
        // If total UPCs exceed ~490, we need multiple batches.
        const itemsToProcess = grnData.items.filter(item => item.receivedQty > 0);

        // Calculate total UPCs needed
        const totalUPCs = itemsToProcess.reduce((sum, item) => sum + item.receivedQty, 0);

        if (totalUPCs === 0) {
            return NextResponse.json(
                { error: 'Validation Error', message: 'No items with received quantity > 0 to create UPCs for.' },
                { status: 400 }
            );
        }

        // Build all UPC documents
        const upcDocs: { ref: DocumentReference; data: any }[] = [];

        for (const item of itemsToProcess) {
            for (let i = 0; i < item.receivedQty; i++) {
                const upcRef = upcsCollection.doc();
                const upcData: UPC = {
                    id: upcRef.id,
                    createdAt: now,
                    updatedAt: now,
                    createdBy: userId,
                    updatedBy: userId,
                    storeId: null,
                    orderId: null,
                    grnRef: grnId,
                    putAway: 'inbound',
                    productId: item.sku,
                    warehouseId: null,
                    zoneId: null,
                    rackId: null,
                    shelfId: null,
                    placementId: null,
                }
                upcDocs.push({
                    ref: upcRef,
                    data: upcData,
                });
            }
        }

        // ============================================================
        // COMMIT IN BATCHES (max 500 writes per batch)
        // ============================================================

        const BATCH_LIMIT = 490; // Leave room for the GRN update in the last batch
        const batches: WriteBatch[] = [];
        let currentBatch = db.batch();
        let currentBatchCount = 0;

        for (const upc of upcDocs) {
            if (currentBatchCount >= BATCH_LIMIT) {
                batches.push(currentBatch);
                currentBatch = db.batch();
                currentBatchCount = 0;
            }
            currentBatch.set(upc.ref, upc.data);
            currentBatchCount++;
        }

        // Add GRN update to the last batch
        currentBatch.update(grnRef, {
            status: 'completed',
            completedAt: now,
            completedBy: userId,
            updatedAt: now,
            totalUPCsCreated: totalUPCs,
        });

        batches.push(currentBatch);

        // Commit all batches
        for (const batch of batches) {
            await batch.commit();
        }

        // ============================================================
        // BUILD SUMMARY
        // ============================================================

        const itemSummary = itemsToProcess.map(item => ({
            sku: item.sku,
            productName: item.productName,
            upcsCreated: item.receivedQty,
        }));

        return NextResponse.json(
            {
                success: true,
                message: `Created ${totalUPCs} UPC(s) from ${grnData.grnNumber} and marked GRN as completed.`,
                grnId,
                grnNumber: grnData.grnNumber,
                grnStatus: 'completed',
                totalUPCsCreated: totalUPCs,
                items: itemSummary,
            },
            { status: 200 }
        );

    } catch (error: any) {
        console.error('❌ Confirm Put Away API error:', error);
        return NextResponse.json(
            { error: 'Internal Server Error', message: error.message || 'An unexpected error occurred' },
            { status: 500 }
        );
    }
}