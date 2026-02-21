import { NextRequest, NextResponse } from 'next/server';
import { authUserForBusiness } from '@/lib/authoriseUser';
import { Timestamp } from 'firebase-admin/firestore';
import { db } from '@/lib/firebase-admin';
import { GRN, GRNItem, GRNStatus, PurchaseOrder, PurchaseOrderItem } from '@/types/warehouse';

export async function POST(req: NextRequest) {
    try {
        const {
            businessId,
            grnId,
            status,
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

        if (!grnId || typeof grnId !== 'string') {
            return NextResponse.json(
                { error: 'Validation Error', message: 'grnId is required' },
                { status: 400 }
            );
        }

        // ============================================================
        // DUPLICATE SKU VALIDATION (if items are being updated)
        // ============================================================

        if (items && Array.isArray(items) && items.length > 0) {
            const skus = items.map((item: any) => item.sku);
            const uniqueSkus = new Set(skus);
            if (uniqueSkus.size !== skus.length) {
                const duplicates = skus.filter((sku: string, index: number) => skus.indexOf(sku) !== index);
                return NextResponse.json(
                    { error: 'Validation Error', message: `Duplicate SKUs: ${[...new Set(duplicates)].join(', ')}` },
                    { status: 400 }
                );
            }
        }

        // ============================================================
        // AUTHORIZATION
        // ============================================================

        const result = await authUserForBusiness({ businessId, req });

        if (!result.authorised) {
            const { error, status: authStatus } = result;
            return NextResponse.json({ error }, { status: authStatus });
        }

        // ============================================================
        // FETCH EXISTING GRN
        // ============================================================

        const grnRef = db.collection('users').doc(businessId).collection('grns').doc(grnId);
        const grnSnap = await grnRef.get();

        if (!grnSnap.exists) {
            return NextResponse.json({ error: 'Not Found', message: 'GRN not found' }, { status: 404 });
        }

        const existingGRN = grnSnap.data()! as GRN;

        // ============================================================
        // STATUS TRANSITION VALIDATION
        // ============================================================

        if (status) {
            const validTransitions: Record<GRNStatus, string[]> = {
                'draft': ['completed', 'cancelled'],
                'completed': [],
                'cancelled': [],
            };

            const allowed = validTransitions[existingGRN.status] || [];
            if (!allowed.includes(status)) {
                return NextResponse.json(
                    { error: 'Invalid Transition', message: `Cannot transition from '${existingGRN.status}' to '${status}'` },
                    { status: 400 }
                );
            }
        }

        // Only draft GRNs can have items edited
        if (items && existingGRN.status !== 'draft') {
            return NextResponse.json(
                { error: 'Validation Error', message: 'Cannot modify items on a GRN that is not in draft status' },
                { status: 400 }
            );
        }

        // ============================================================
        // PRODUCT EXISTENCE VALIDATION (if items are being updated)
        // ============================================================

        if (items && Array.isArray(items) && items.length > 0) {
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
        }

        // ============================================================
        // BUILD UPDATE OBJECT
        // ============================================================

        const now = Timestamp.now();
        const updateData: Partial<GRN> = { updatedAt: now };

        if (notes !== undefined) updateData.notes = notes || null;
        if (status) updateData.status = status;

        // Handle items update (only for draft GRNs)
        if (items && Array.isArray(items) && items.length > 0) {
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

            updateData.items = grnItems;
            updateData.receivedSkus = grnItems.map(i => i.sku);
            updateData.totalExpectedQty = grnItems.reduce((s, i) => s + i.expectedQty, 0);
            updateData.totalReceivedQty = grnItems.reduce((s, i) => s + i.receivedQty, 0);
            updateData.totalNotReceivedQty = grnItems.reduce((s, i) => s + i.notReceivedQty, 0);
            updateData.totalReceivedValue = Math.round(
                grnItems.reduce((s, i) => s + i.totalCost, 0) * 100
            ) / 100;
        }

        // ============================================================
        // IF CANCELLING, REVERT PO RECEIVED QUANTITIES
        // ============================================================

        const batch = db.batch();

        if (status === 'cancelled' && existingGRN.status === 'draft') {
            const poRef = db.collection('users').doc(businessId).collection('purchaseOrders').doc(existingGRN.poId);
            const poSnap = await poRef.get();

            if (poSnap.exists) {
                const poData = poSnap.data()! as PurchaseOrder;
                const updatedPoItems: PurchaseOrderItem[] = [...poData.items];

                for (const grnItem of existingGRN.items) {
                    const idx = updatedPoItems.findIndex(pi => pi.sku === grnItem.sku);
                    if (idx !== -1) {
                        updatedPoItems[idx] = {
                            ...updatedPoItems[idx],
                            receivedQty: updatedPoItems[idx].receivedQty - grnItem.receivedQty,
                            notReceivedQty: Math.max(
                            updatedPoItems[idx].expectedQty - (updatedPoItems[idx].receivedQty - grnItem.receivedQty),
                            0),
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
            }
        }

        batch.update(grnRef, updateData);
        await batch.commit();

        return NextResponse.json(
            { success: true, grnId, updatedFields: Object.keys(updateData) },
            { status: 200 }
        );

    } catch (error: any) {
        console.error('❌ GRN Update API error:', error);
        return NextResponse.json(
            { error: 'Internal Server Error', message: error.message || 'An unexpected error occurred' },
            { status: 500 }
        );
    }
}