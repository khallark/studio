import { NextRequest, NextResponse } from 'next/server';
import { authUserForBusiness } from '@/lib/authoriseUser';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { db } from '@/lib/firebase-admin';
import { PurchaseOrder, PurchaseOrderItem } from '@/types/warehouse';

export async function POST(req: NextRequest) {
    try {
        const {
            businessId,
            supplierPartyId,
            supplierName,
            warehouseId,
            warehouseName,
            items,
            currency,
            expectedDate,
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

        if (!supplierPartyId || typeof supplierPartyId !== 'string') {
            return NextResponse.json(
                { error: 'Validation Error', message: 'supplierPartyId is required' },
                { status: 400 }
            );
        }

        if (!supplierName || typeof supplierName !== 'string') {
            return NextResponse.json(
                { error: 'Validation Error', message: 'supplierName is required' },
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
            if (typeof item.orderedQty !== 'number' || item.orderedQty <= 0) {
                return NextResponse.json(
                    { error: 'Validation Error', message: 'Each item must have orderedQty > 0' },
                    { status: 400 }
                );
            }
            if (typeof item.unitCost !== 'number' || item.unitCost < 0) {
                return NextResponse.json(
                    { error: 'Validation Error', message: 'Each item must have unitCost >= 0' },
                    { status: 400 }
                );
            }
        }

        if (!expectedDate || typeof expectedDate !== 'string') {
            return NextResponse.json(
                { error: 'Validation Error', message: 'expectedDate is required (ISO string)' },
                { status: 400 }
            );
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
                    message: `Duplicate SKUs found in line items: ${[...new Set(duplicates)].join(', ')}. Each product can only appear once.`,
                },
                { status: 400 }
            );
        }

        // ============================================================
        // AUTHORIZATION
        // ============================================================

        const result = await authUserForBusiness({ businessId, req });
        const { userId } = result;

        if(!userId) {
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
        // PARTY VALIDATION
        // ============================================================

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
                { error: 'Validation Error', message: `Supplier "${partyData.name}" is inactive. Cannot create PO for an inactive party.` },
                { status: 400 }
            );
        }

        if (partyData.type !== 'supplier' && partyData.type !== 'both') {
            return NextResponse.json(
                { error: 'Validation Error', message: `Party "${partyData.name}" is not a supplier (type: ${partyData.type}).` },
                { status: 400 }
            );
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
                    message: `Products not found for SKUs: ${missingProducts.join(', ')}. Please ensure all products exist before creating a PO.`,
                },
                { status: 400 }
            );
        }

        // ============================================================
        // GENERATE PO NUMBER
        // ============================================================

        const counterRef = db.collection('users').doc(businessId).collection('counters').doc('purchaseOrders');
        const counterSnap = await counterRef.get();
        let nextNumber = 1;

        if (counterSnap.exists) {
            nextNumber = (counterSnap.data()?.lastNumber || 0) + 1;
        }

        await counterRef.set({ lastNumber: nextNumber }, { merge: true });
        const poNumber = `PO-${String(nextNumber).padStart(5, '0')}`;

        // ============================================================
        // BUILD PO DOCUMENT
        // ============================================================

        const now = Timestamp.now();

        const poItems: PurchaseOrderItem[] = items.map((item: any) => ({
            sku: item.sku,
            productName: item.productName,
            orderedQty: item.orderedQty,
            unitCost: item.unitCost,
            receivedQty: 0,
            rejectedQty: 0,
            status: 'pending' as const,
        }));
        const orderedSkus = poItems.map((item: PurchaseOrderItem) => item.sku);
        const totalAmount = poItems.reduce((sum: number, item: PurchaseOrderItem) => sum + (item.orderedQty * item.unitCost), 0);

        const poRef = db.collection('users').doc(businessId).collection('purchaseOrders').doc();
        
        const poData: PurchaseOrder = {
            id: poRef.id,
            poNumber,
            businessId,
            supplierPartyId,
            supplierName,
            warehouseId,
            warehouseName: warehouseName || '',
            status: 'draft' as const,

            orderedSkus,
            itemCount: items.length,
            items: poItems,

            totalAmount: Math.round(totalAmount * 100) / 100,
            currency: currency || 'INR',

            expectedDate: Timestamp.fromDate(new Date(expectedDate)),
            confirmedAt: null,
            completedAt: null,
            cancelledAt: null,
            cancelReason: null,

            notes: notes || null,
            createdBy: userId,
            createdAt: now,
            updatedAt: now,
        };

        // ============================================================
        // SAVE TO FIRESTORE
        // ============================================================
        await poRef.set(poData);

        // ============================================================
        // RETURN SUCCESS RESPONSE
        // ============================================================

        return NextResponse.json(
            {
                success: true,
                purchaseOrderId: poRef.id,
                poNumber,
            },
            { status: 200 }
        );

    } catch (error: any) {
        console.error('❌ PO Create API error:', error);
        return NextResponse.json(
            {
                error: 'Internal Server Error',
                message: error.message || 'An unexpected error occurred',
            },
            { status: 500 }
        );
    }
}