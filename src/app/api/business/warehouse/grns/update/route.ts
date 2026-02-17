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
            inspectedBy,
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
                    {
                        error: 'Validation Error',
                        message: `Duplicate SKUs found in GRN items: ${[...new Set(duplicates)].join(', ')}. Each product can only appear once.`,
                    },
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
            return NextResponse.json(
                { error: 'Not Found', message: 'GRN not found' },
                { status: 404 }
            );
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
                    {
                        error: 'Invalid Transition',
                        message: `Cannot transition from '${existingGRN.status}' to '${status}'`,
                    },
                    { status: 400 }
                );
            }
        }

        // Don't allow editing items if GRN is completed
        if (items && existingGRN.status !== 'draft') {
            return NextResponse.json(
                {
                    error: 'Validation Error',
                    message: 'Cannot modify items on a GRN that is not in draft status',
                },
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
        }

        // ============================================================
        // BUILD UPDATE OBJECT
        // ============================================================

        const now = Timestamp.now();
        const updateData: Partial<GRN> = {
            updatedAt: now,
        };

        if (notes !== undefined) updateData.notes = notes || null;
        if (inspectedBy !== undefined) updateData.inspectedBy = inspectedBy || null;

        if (status) {
            updateData.status = status;
        }

        // Handle items update (only for draft GRNs)
        if (items && Array.isArray(items) && items.length > 0) {
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

            updateData.items = grnItems;
            updateData.receivedSkus = grnItems.map((item: GRNItem) => item.sku);
            updateData.totalReceivedQty = grnItems.reduce((s: number, i: GRNItem) => s + i.receivedQty, 0);
            updateData.totalAcceptedQty = grnItems.reduce((s: number, i: GRNItem) => s + i.acceptedQty, 0);
            updateData.totalRejectedQty = grnItems.reduce((s: number, i: GRNItem) => s + i.rejectedQty, 0);
            updateData.totalAcceptedValue = Math.round(
                grnItems.reduce((s: number, i: GRNItem) => s + i.totalCost, 0) * 100
            ) / 100;
        }

        // ============================================================
        // IF CANCELLING, REVERT PO QUANTITIES
        // ============================================================

        const batch = db.batch();

        if (status === 'cancelled' && existingGRN.status === 'draft') {
            // Draft GRNs haven't affected PO quantities yet (if your flow
            // updates PO on GRN creation, you'd revert here)
            const poRef = db.collection('users').doc(businessId).collection('purchaseOrders').doc(existingGRN.poId);
            const poSnap = await poRef.get();

            if (poSnap.exists) {
                const poData = poSnap.data()! as PurchaseOrder;
                const updatedPoItems: PurchaseOrderItem[] = [...poData.items];

                for (const grnItem of existingGRN.items) {
                    const poItemIndex = updatedPoItems.findIndex((pi: PurchaseOrderItem) => pi.sku === grnItem.sku);
                    if (poItemIndex !== -1) {
                        updatedPoItems[poItemIndex] = {
                            ...updatedPoItems[poItemIndex],
                            receivedQty: Math.max(0, (updatedPoItems[poItemIndex].receivedQty || 0) - grnItem.acceptedQty),
                            rejectedQty: Math.max(0, (updatedPoItems[poItemIndex].rejectedQty || 0) - grnItem.rejectedQty),
                        };

                        // Recalculate item status
                        const poItem = updatedPoItems[poItemIndex];
                        if (poItem.receivedQty >= poItem.orderedQty) {
                            poItem.status = 'fully_received';
                        } else if (poItem.receivedQty > 0) {
                            poItem.status = 'partially_received';
                        } else {
                            poItem.status = 'pending';
                        }
                    }
                }

                // Recalculate PO status
                const allPending = updatedPoItems.every((pi: PurchaseOrderItem) => pi.status === 'pending');
                const allFullyReceived = updatedPoItems.every((pi: PurchaseOrderItem) => pi.status === 'fully_received');
                const anyReceived = updatedPoItems.some(
                    (pi: PurchaseOrderItem) => pi.status === 'partially_received' || pi.status === 'fully_received'
                );

                let newPoStatus = poData.status;
                if (allFullyReceived) {
                    newPoStatus = 'fully_received';
                } else if (anyReceived) {
                    newPoStatus = 'partially_received';
                } else if (allPending) {
                    newPoStatus = 'confirmed';
                }

                const poUpdatedData: Partial<PurchaseOrder> = {
                    items: updatedPoItems,
                    status: newPoStatus,
                    updatedAt: now,
                };

                batch.update(poRef, poUpdatedData);
            }
        }

        batch.update(grnRef, updateData);
        await batch.commit();

        // ============================================================
        // RETURN SUCCESS RESPONSE
        // ============================================================

        return NextResponse.json(
            {
                success: true,
                grnId,
                updatedFields: Object.keys(updateData),
            },
            { status: 200 }
        );

    } catch (error: any) {
        console.error('❌ GRN Update API error:', error);
        return NextResponse.json(
            {
                error: 'Internal Server Error',
                message: error.message || 'An unexpected error occurred',
            },
            { status: 500 }
        );
    }
}