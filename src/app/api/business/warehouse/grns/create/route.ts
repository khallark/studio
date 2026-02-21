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
                    { error: 'Validation Error', message: 'Each item must have sku and productName' },
                    { status: 400 }
                );
            }
            if (typeof item.expectedQty !== 'number' || item.expectedQty < 0) {
                return NextResponse.json(
                    { error: 'Validation Error', message: `Item ${item.sku}: expectedQty must be >= 0` },
                    { status: 400 }
                );
            }
            if (typeof item.receivedQty !== 'number' || item.receivedQty < 0) {
                return NextResponse.json(
                    { error: 'Validation Error', message: `Item ${item.sku}: receivedQty must be >= 0` },
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
                    message: `Duplicate SKUs found: ${[...new Set(duplicates)].join(', ')}`,
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
            return NextResponse.json({ error: 'User not logged in' }, { status: 401 });
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
            const productSnap = await productsRef.where('sku', '==', item.sku).limit(1).get();
            if (productSnap.empty) missingProducts.push(item.sku);
        }

        if (missingProducts.length > 0) {
            return NextResponse.json(
                { error: 'Validation Error', message: `Products not found for SKUs: ${missingProducts.join(', ')}` },
                { status: 400 }
            );
        }

        // ============================================================
        // VALIDATE PO EXISTS AND IS RECEIVABLE
        // GRNs can be created until PO is manually closed/cancelled
        // ============================================================

        const poRef = db.collection('users').doc(businessId).collection('purchaseOrders').doc(poId);
        const poSnap = await poRef.get();

        if (!poSnap.exists) {
            return NextResponse.json({ error: 'Not Found', message: 'Purchase order not found' }, { status: 404 });
        }

        const poData = poSnap.data()! as PurchaseOrder;

        if (['draft', 'closed', 'cancelled'].includes(poData.status)) {
            return NextResponse.json(
                { error: 'Validation Error', message: `Cannot create GRN for PO with status '${poData.status}'. PO must not be draft, closed, or cancelled.` },
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

        const grnItems: GRNItem[] = items.map((item: any) => {
            const notReceivedQty = Math.max(0, item.expectedQty - item.receivedQty);
            return {
                sku: item.sku,
                productName: item.productName,
                expectedQty: item.expectedQty,
                receivedQty: item.receivedQty,
                notReceivedQty,
                unitCost: item.unitCost || 0,
                totalCost: Math.round((item.receivedQty * (item.unitCost || 0)) * 100) / 100,
            };
        });

        const totalExpectedQty = grnItems.reduce((s, i) => s + i.expectedQty, 0);
        const totalReceivedQty = grnItems.reduce((s, i) => s + i.receivedQty, 0);
        const totalNotReceivedQty = grnItems.reduce((s, i) => s + i.notReceivedQty, 0);
        const totalReceivedValue = grnItems.reduce((s, i) => s + i.totalCost, 0);

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
            receivedSkus: grnItems.map(i => i.sku),
            items: grnItems,
            totalExpectedQty,
            totalReceivedQty,
            totalNotReceivedQty,
            totalReceivedValue: Math.round(totalReceivedValue * 100) / 100,
            receivedBy: userId,
            receivedAt: now,
            createdAt: now,
            updatedAt: now,
            notes: notes || null,
        };

        // ============================================================
        // SAVE GRN & UPDATE PO
        // ============================================================

        const batch = db.batch();
        batch.set(grnRef, grnData);

        // Update PO item receivedQty
        const updatedPoItems: PurchaseOrderItem[] = [...poData.items];
        for (const grnItem of grnItems) {
            const idx = updatedPoItems.findIndex(pi => pi.sku === grnItem.sku);
            if (idx !== -1) {
                updatedPoItems[idx] = {
                    ...updatedPoItems[idx],
                    receivedQty: updatedPoItems[idx].receivedQty + grnItem.receivedQty,
                    notReceivedQty: Math.max(0, grnItem.expectedQty - (updatedPoItems[idx].receivedQty + grnItem.receivedQty)),
                };

                const poItem = updatedPoItems[idx];
                if (poItem.receivedQty > 0) {
                    if (poItem.receivedQty < poItem.expectedQty)
                        poItem.status = 'partially_received';
                    else
                        poItem.status = 'fully_received';
                } else {
                    poItem.status = 'pending';
                }
            }
        }

        // Recalculate PO status
        let newPoStatus = poData.status;
        if (poData.status !== 'draft') {
            const anyPartiallyReceived = updatedPoItems.some(pi => pi.status === 'partially_received');
            const anyFullyReceived = updatedPoItems.some(pi => pi.status === 'fully_received');
            const allFullyReceived = updatedPoItems.every(pi => pi.status === 'fully_received');
            if (allFullyReceived) newPoStatus = 'fully_received';
            else if (anyPartiallyReceived || anyFullyReceived) newPoStatus = 'partially_received';
            else newPoStatus = 'confirmed';
        }

        const poUpdatedData: Partial<PurchaseOrder> = {
            items: updatedPoItems,
            status: newPoStatus,
            updatedAt: now,
        }

        batch.update(poRef, poUpdatedData);

        await batch.commit();

        return NextResponse.json(
            { success: true, grnId: grnRef.id, grnNumber, poStatus: newPoStatus },
            { status: 200 }
        );

    } catch (error: any) {
        console.error('❌ GRN Create API error:', error);
        return NextResponse.json(
            { error: 'Internal Server Error', message: error.message || 'An unexpected error occurred' },
            { status: 500 }
        );
    }
}