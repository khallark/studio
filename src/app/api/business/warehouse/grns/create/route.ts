import { NextRequest, NextResponse } from 'next/server';
import { authUserForBusiness } from '@/lib/authoriseUser';
import { Timestamp } from 'firebase-admin/firestore';
import { db } from '@/lib/firebase-admin';
import { GRN, GRNItem, PurchaseOrder, PurchaseOrderItem } from '@/types/warehouse';

export async function POST(req: NextRequest) {
    try {
        const {
            businessId,
            poId,
            poNumber,
            warehouseId,
            warehouseName,
            items,
            notes,
        } = await req.json();

        // ============================================================
        // VALIDATION
        // ============================================================

        if (!businessId || typeof businessId !== 'string') {
            return NextResponse.json(
                { error: 'Validation Error', message: 'businessId is required and must be a string' },
                { status: 400 }
            );
        }

        if (!poId || typeof poId !== 'string') {
            return NextResponse.json(
                { error: 'Validation Error', message: 'poId is required' },
                { status: 400 }
            );
        }

        if (!warehouseId || typeof warehouseId !== 'string') {
            return NextResponse.json(
                { error: 'Validation Error', message: 'warehouseId is required' },
                { status: 400 }
            );
        }

        if (!items || !Array.isArray(items) || items.length === 0) {
            return NextResponse.json(
                { error: 'Validation Error', message: 'At least one item is required' },
                { status: 400 }
            );
        }

        for (const item of items) {
            if (!item.sku || !item.productName) {
                return NextResponse.json(
                    { error: 'Validation Error', message: 'Each item must have sku, and productName' },
                    { status: 400 }
                );
            }
            if (typeof item.receivedQty !== 'number' || item.receivedQty < 0) {
                return NextResponse.json(
                    { error: 'Validation Error', message: 'receivedQty must be >= 0' },
                    { status: 400 }
                );
            }
            if (typeof item.acceptedQty !== 'number' || item.acceptedQty < 0) {
                return NextResponse.json(
                    { error: 'Validation Error', message: 'acceptedQty must be >= 0' },
                    { status: 400 }
                );
            }
            if (item.acceptedQty + (item.rejectedQty || 0) > item.receivedQty) {
                return NextResponse.json(
                    { error: 'Validation Error', message: `For SKU ${item.sku}: acceptedQty + rejectedQty cannot exceed receivedQty` },
                    { status: 400 }
                );
            }
        }

        // ============================================================
        // DUPLICATE SKU VALIDATION
        // ============================================================

        const skus = items.map((item: any) => item.sku);
        const uniqueSkus = new Set(skus);
        if (uniqueSkus.size !== skus.length) {
            const duplicates = skus.filter((sku: string, index: number) => skus.indexOf(sku) !== index);
            return NextResponse.json(
                {
                    error: 'Validation Error',
                    message: `Duplicate SKUs found in GRN items: ${[...new Set(duplicates)].join(', ')}. Each product can only appear once.`,
                },
                { status: 400 }
            );
        }

        // ============================================================
        // AUTHORIZATION
        // ============================================================

        const result = await authUserForBusiness({ businessId, req });
        const { userId } = result;

        if (!userId) {
            return NextResponse.json(
                { error: 'User not logged in' },
                { status: 401 }
            );
        }

        if (!result.authorised) {
            const { error, status } = result;
            return NextResponse.json({ error }, { status });
        }

        // ============================================================
        // PRODUCT EXISTENCE VALIDATION
        // ============================================================

        const productsRef = db.collection('users').doc(businessId).collection('products');
        const missingProducts: string[] = [];

        for (const item of items) {
            const productSnap = await productsRef
                .where('sku', '==', item.sku)
                .limit(1)
                .get();

            if (productSnap.empty) {
                missingProducts.push(item.sku);
            }
        }

        if (missingProducts.length > 0) {
            return NextResponse.json(
                {
                    error: 'Validation Error',
                    message: `Products not found for SKUs: ${missingProducts.join(', ')}. Please ensure all products exist.`,
                },
                { status: 400 }
            );
        }

        // ============================================================
        // VALIDATE PO EXISTS AND IS RECEIVABLE
        // ============================================================

        const poRef = db.collection('users').doc(businessId).collection('purchaseOrders').doc(poId);
        const poSnap = await poRef.get();

        if (!poSnap.exists) {
            return NextResponse.json(
                { error: 'Not Found', message: 'Purchase order not found' },
                { status: 404 }
            );
        }

        const poData = poSnap.data()! as PurchaseOrder;

        if (!['confirmed', 'partially_received'].includes(poData.status)) {
            return NextResponse.json(
                {
                    error: 'Validation Error',
                    message: `Cannot create GRN for a PO with status '${poData.status}'. PO must be 'confirmed' or 'partially_received'.`,
                },
                { status: 400 }
            );
        }

        // ============================================================
        // GENERATE GRN NUMBER
        // ============================================================

        const counterRef = db.collection('users').doc(businessId).collection('counters').doc('grns');
        const counterSnap = await counterRef.get();
        let nextNumber = 1;

        if (counterSnap.exists) {
            nextNumber = (counterSnap.data()?.lastNumber || 0) + 1;
        }

        await counterRef.set({ lastNumber: nextNumber }, { merge: true });
        const grnNumber = `GRN-${String(nextNumber).padStart(5, '0')}`;

        // ============================================================
        // BUILD GRN DOCUMENT
        // ============================================================

        const now = Timestamp.now();

        const grnItems: GRNItem[] = items.map((item: any) => ({
            sku: item.sku,
            productName: item.productName,

            receivedQty: item.receivedQty,
            acceptedQty: item.acceptedQty,
            rejectedQty: item.rejectedQty || 0,
            rejectionReason: item.rejectionReason || null,

            unitCost: item.unitCost || 0,
            totalCost: Math.round((item.acceptedQty * (item.unitCost || 0)) * 100) / 100,

            putInLocations: item.putInLocations || [],
        }));

        const totalReceivedQty = grnItems.reduce((sum: number, i) => sum + i.receivedQty, 0);
        const totalAcceptedQty = grnItems.reduce((sum: number, i) => sum + i.acceptedQty, 0);
        const totalRejectedQty = grnItems.reduce((sum: number, i) => sum + i.rejectedQty, 0);
        const totalAcceptedValue = grnItems.reduce((sum: number, i) => sum + i.totalCost, 0);

        // Create GRN
        const grnRef = db.collection('users').doc(businessId).collection('grns').doc();

        const grnData: GRN = {
            id: grnRef.id,
            grnNumber,
            businessId,
            poId,
            poNumber: poNumber || poData.poNumber,
            warehouseId,
            warehouseName: warehouseName || '',

            status: 'draft',

            receivedSkus: grnItems.map((item: GRNItem) => item.sku),
            items: grnItems,

            totalAcceptedValue: Math.round(totalAcceptedValue * 100) / 100,
            totalReceivedQty,
            totalAcceptedQty,
            totalRejectedQty,

            receivedBy: userId,
            inspectedBy: null,
            receivedAt: now,
            createdAt: now,
            updatedAt: now,

            notes: notes || null,
        };

        // ============================================================
        // SAVE GRN & UPDATE PO IN A BATCH
        // ============================================================

        const batch = db.batch();
        batch.set(grnRef, grnData);

        // Update PO received quantities
        const updatedPoItems: PurchaseOrderItem[] = [...poData.items];
        for (const grnItem of grnItems) {
            const poItemIndex = updatedPoItems.findIndex((pi: PurchaseOrderItem) => pi.sku === grnItem.sku);
            if (poItemIndex !== -1) {
                updatedPoItems[poItemIndex] = {
                    ...updatedPoItems[poItemIndex],
                    receivedQty: (updatedPoItems[poItemIndex].receivedQty || 0) + grnItem.acceptedQty,
                    rejectedQty: (updatedPoItems[poItemIndex].rejectedQty || 0) + grnItem.rejectedQty,
                };

                // Determine item-level status
                const poItem = updatedPoItems[poItemIndex];
                if (poItem.receivedQty >= poItem.orderedQty) {
                    poItem.status = 'fully_received';
                } else if (poItem.receivedQty > 0) {
                    poItem.status = 'partially_received';
                }
            }
        }

        // Determine PO-level status
        const allFullyReceived = updatedPoItems.every((pi: PurchaseOrderItem) => pi.status === 'fully_received');
        const anyReceived = updatedPoItems.some(
            (pi: PurchaseOrderItem) => pi.status === 'partially_received' || pi.status === 'fully_received'
        );

        let newPoStatus = poData.status;
        if (allFullyReceived) {
            newPoStatus = 'fully_received';
        } else if (anyReceived) {
            newPoStatus = 'partially_received';
        }

        const poUpdate: Partial<PurchaseOrder> = {
            items: updatedPoItems,
            status: newPoStatus,
            updatedAt: now,
        };

        if (newPoStatus === 'fully_received') {
            poUpdate.completedAt = now;
        }

        batch.update(poRef, poUpdate);

        await batch.commit();

        // ============================================================
        // RETURN SUCCESS RESPONSE
        // ============================================================

        return NextResponse.json(
            {
                success: true,
                grnId: grnRef.id,
                grnNumber,
                poStatus: newPoStatus,
            },
            { status: 200 }
        );

    } catch (error: any) {
        console.error('❌ GRN Create API error:', error);
        return NextResponse.json(
            {
                error: 'Internal Server Error',
                message: error.message || 'An unexpected error occurred',
            },
            { status: 500 }
        );
    }
}