import { NextRequest, NextResponse } from 'next/server';
import { authUserForBusiness } from '@/lib/authoriseUser';
import { Timestamp } from 'firebase-admin/firestore';
import { db } from '@/lib/firebase-admin';
import { POStatus, PurchaseOrder, PurchaseOrderItem } from '@/types/warehouse';

export async function POST(req: NextRequest) {
    try {
        const {
            businessId,
            purchaseOrderId,
            supplierPartyId,
            supplierName,
            warehouseId,
            warehouseName,
            status,
            items,
            currency,
            expectedDate,
            notes,
            cancelReason,
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

        if (!purchaseOrderId || typeof purchaseOrderId !== 'string') {
            return NextResponse.json(
                { error: 'Validation Error', message: 'purchaseOrderId is required' },
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
                        message: `Duplicate SKUs found in line items: ${[...new Set(duplicates)].join(', ')}. Each product can only appear once.`,
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

        const existingPO = poSnap.data()! as PurchaseOrder;

        // ============================================================
        // STATUS TRANSITION VALIDATION
        // ============================================================

        if (status) {
            const validTransitions: Record<POStatus, string[]> = {
                'draft': ['confirmed', 'cancelled'],
                'confirmed': ['partially_received', 'closed', 'cancelled'],
                'partially_received': ['partially_received', 'fully_received', 'closed'],
                'fully_received': ['closed'],
                'closed': [],
                'cancelled': [],
            };

            const allowed = validTransitions[existingPO.status] || [];
            if (!allowed.includes(status)) {
                return NextResponse.json(
                    {
                        error: 'Invalid Transition',
                        message: `Cannot transition from '${existingPO.status}' to '${status}'`,
                    },
                    { status: 400 }
                );
            }
        }

        // Don't allow editing items if PO is beyond draft/confirmed
        if (items && !['draft', 'confirmed'].includes(existingPO.status)) {
            return NextResponse.json(
                {
                    error: 'Validation Error',
                    message: 'Cannot modify items on a PO that has already received goods',
                },
                { status: 400 }
            );
        }

        // ============================================================
        // PARTY VALIDATION (if supplier is being changed)
        // ============================================================

        if (supplierPartyId && supplierPartyId !== existingPO.supplierPartyId) {
            const partyRef = db.collection('users').doc(businessId).collection('parties').doc(supplierPartyId);
            const partySnap = await partyRef.get();

            if (!partySnap.exists) {
                return NextResponse.json(
                    { error: 'Validation Error', message: 'Supplier party not found. Please select a valid supplier.' },
                    { status: 400 }
                );
            }

            const partyData = partySnap.data()!;

            if (!partyData.isActive) {
                return NextResponse.json(
                    { error: 'Validation Error', message: `Supplier "${partyData.name}" is inactive. Cannot assign an inactive party.` },
                    { status: 400 }
                );
            }

            if (partyData.type !== 'supplier' && partyData.type !== 'both') {
                return NextResponse.json(
                    { error: 'Validation Error', message: `Party "${partyData.name}" is not a supplier (type: ${partyData.type}).` },
                    { status: 400 }
                );
            }
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
        const updateData: Partial<PurchaseOrder> = {
            updatedAt: now,
        };

        if (supplierPartyId !== undefined) updateData.supplierPartyId = supplierPartyId;
        if (supplierName !== undefined) updateData.supplierName = supplierName;
        if (warehouseId !== undefined) updateData.warehouseId = warehouseId;
        if (warehouseName !== undefined) updateData.warehouseName = warehouseName;
        if (currency !== undefined) updateData.currency = currency;
        if (notes !== undefined) updateData.notes = notes || null;

        if (expectedDate) {
            updateData.expectedDate = Timestamp.fromDate(new Date(expectedDate));
        }

        // Handle status changes with associated timestamps
        if (status) {
            updateData.status = status;

            if (status === 'confirmed' && !existingPO.confirmedAt) {
                updateData.confirmedAt = now;
            }

            if (status === 'fully_received' || status === 'closed') {
                updateData.completedAt = now;
            }

            if (status === 'cancelled') {
                updateData.cancelledAt = now;
                updateData.cancelReason = cancelReason || null;
            }
        }

        // Handle items update
        if (items && Array.isArray(items) && items.length > 0) {
            const poItems: PurchaseOrderItem[] = items.map((item: any) => ({
                sku: item.sku,
                productName: item.productName,
                orderedQty: item.orderedQty,
                unitCost: item.unitCost,
                receivedQty: 0,
                rejectedQty: 0,
                status: 'pending',
            }));

            updateData.items = poItems;
            updateData.orderedSkus = poItems.map((item: PurchaseOrderItem) => item.sku);
            updateData.itemCount = poItems.length;
            updateData.totalAmount = Math.round(
                poItems.reduce((sum: number, item: PurchaseOrderItem) => sum + (item.orderedQty * item.unitCost), 0) * 100
            ) / 100;
        }

        // ============================================================
        // SAVE TO FIRESTORE
        // ============================================================

        await poRef.update(updateData);

        // ============================================================
        // RETURN SUCCESS RESPONSE
        // ============================================================

        return NextResponse.json(
            {
                success: true,
                purchaseOrderId,
                updatedFields: Object.keys(updateData),
            },
            { status: 200 }
        );

    } catch (error: any) {
        console.error('❌ PO Update API error:', error);
        return NextResponse.json(
            {
                error: 'Internal Server Error',
                message: error.message || 'An unexpected error occurred',
            },
            { status: 500 }
        );
    }
}