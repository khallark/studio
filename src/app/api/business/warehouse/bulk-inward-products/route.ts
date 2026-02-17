import { NextRequest, NextResponse } from 'next/server';
import { authUserForBusiness } from '@/lib/authoriseUser';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { db } from '@/lib/firebase-admin';
import { Placement, GRN } from '@/types/warehouse';

// ============================================================
// TYPES
// ============================================================

interface InwardItem {
    sku: string;
    productName: string;
    acceptedQty: number;
    unitCost: number;
}

interface LocationInfo {
    warehouseId: string;
    zoneId: string;
    rackId: string;
    shelfId: string;
}

interface InventoryData {
    openingStock: number;
    inwardAddition: number;
    deduction: number;
    autoAddition: number;
    autoDeduction: number;
    blockedStock: number;
}

// ============================================================
// HELPERS (mirrored from inventory/adjust)
// ============================================================

function getInventoryValues(inventory?: Partial<InventoryData>): InventoryData {
    return {
        openingStock: inventory?.openingStock ?? 0,
        inwardAddition: inventory?.inwardAddition ?? 0,
        deduction: inventory?.deduction ?? 0,
        autoAddition: inventory?.autoAddition ?? 0,
        autoDeduction: inventory?.autoDeduction ?? 0,
        blockedStock: inventory?.blockedStock ?? 0,
    };
}

function calculatePhysicalStock(inv: InventoryData): number {
    return inv.openingStock + inv.inwardAddition - inv.deduction + inv.autoAddition - inv.autoDeduction;
}

// ============================================================
// MAIN HANDLER
// ============================================================

export async function POST(req: NextRequest) {
    try {
        const { businessId, grnId, items, location } = await req.json();

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

        if (!items || !Array.isArray(items) || items.length === 0) {
            return NextResponse.json(
                { error: 'Validation Error', message: 'At least one item is required' },
                { status: 400 }
            );
        }

        if (!location || !location.warehouseId || !location.zoneId || !location.rackId || !location.shelfId) {
            return NextResponse.json(
                { error: 'Validation Error', message: 'Complete location is required (warehouseId, zoneId, rackId, shelfId)' },
                { status: 400 }
            );
        }

        // Validate each item
        for (const item of items) {
            if (!item.sku || typeof item.sku !== 'string') {
                return NextResponse.json(
                    { error: 'Validation Error', message: 'Each item must have a valid sku' },
                    { status: 400 }
                );
            }
            if (typeof item.acceptedQty !== 'number' || item.acceptedQty <= 0 || !Number.isInteger(item.acceptedQty)) {
                return NextResponse.json(
                    { error: 'Validation Error', message: `Item ${item.sku}: acceptedQty must be a positive integer` },
                    { status: 400 }
                );
            }
            if (item.acceptedQty > 500) {
                return NextResponse.json(
                    { error: 'Validation Error', message: `Item ${item.sku}: max 500 units per product per inward` },
                    { status: 400 }
                );
            }
        }

        // ============================================================
        // AUTHORIZATION
        // ============================================================

        const result = await authUserForBusiness({ businessId, req });
        const { businessDoc, userId, userDoc } = result;

        if (!result.authorised) {
            const { error, status } = result;
            return NextResponse.json({ error }, { status });
        }

        if (!userId) {
            return NextResponse.json({ error: 'User not logged in' }, { status: 401 });
        }

        // ============================================================
        // VALIDATE GRN EXISTS AND IS DRAFT
        // ============================================================

        const grnRef = db.collection('users').doc(businessId).collection('grns').doc(grnId);
        const grnSnap = await grnRef.get();

        if (!grnSnap.exists) {
            return NextResponse.json(
                { error: 'Not Found', message: 'GRN not found' },
                { status: 404 }
            );
        }

        const grnData = grnSnap.data() as GRN;

        if (grnData.status !== 'draft') {
            return NextResponse.json(
                { error: 'Validation Error', message: `GRN is already '${grnData.status}'. Only draft GRNs can be performed.` },
                { status: 400 }
            );
        }

        // ============================================================
        // VALIDATE ALL PRODUCTS EXIST & FETCH CURRENT DATA
        // ============================================================

        const productsCollection = businessDoc!.ref.collection('products');
        const locationInfo = location as LocationInfo;
        const now = Timestamp.now();

        const userData = userDoc?.data();
        const userEmail = userData?.email || userData?.primaryContact?.email || null;

        // Prefetch all product docs and placement docs
        const productDocs: Map<string, FirebaseFirestore.DocumentSnapshot> = new Map();
        const placementDocs: Map<string, FirebaseFirestore.DocumentSnapshot> = new Map();
        const missingProducts: string[] = [];

        for (const item of items as InwardItem[]) {
            // Product doc (doc ID = sku)
            const productRef = productsCollection.doc(item.sku);
            const productSnap = await productRef.get();

            if (!productSnap.exists) {
                missingProducts.push(item.sku);
                continue;
            }

            productDocs.set(item.sku, productSnap);

            // Placement doc
            const placementId = `${item.sku}_${locationInfo.shelfId}`;
            const placementRef = db.doc(`users/${businessId}/placements/${placementId}`);
            const placementSnap = await placementRef.get();
            placementDocs.set(placementId, placementSnap);
        }

        if (missingProducts.length > 0) {
            return NextResponse.json(
                {
                    error: 'Validation Error',
                    message: `Products not found for SKUs: ${missingProducts.join(', ')}`,
                },
                { status: 400 }
            );
        }

        // ============================================================
        // BATCH WRITE: Inward all products
        // ============================================================

        const batch = db.batch();
        const results: any[] = [];

        for (const item of items as InwardItem[]) {
            if (item.acceptedQty <= 0) continue;

            const productSnap = productDocs.get(item.sku)!;
            const productRef = productsCollection.doc(item.sku);
            const productData = productSnap.data();
            const currentInventory = getInventoryValues(productData?.inventory);

            const previousPhysicalStock = calculatePhysicalStock(currentInventory);
            const newInwardAddition = currentInventory.inwardAddition + item.acceptedQty;
            const updatedInventory = { ...currentInventory, inwardAddition: newInwardAddition };
            const newPhysicalStock = calculatePhysicalStock(updatedInventory);
            const newAvailableStock = newPhysicalStock - updatedInventory.blockedStock;

            // 1. Update product inventory
            batch.update(productRef, {
                'inventory.inwardAddition': FieldValue.increment(item.acceptedQty),
                updatedAt: now,
                updatedBy: userId,
            });

            // 2. Create or update placement
            const placementId = `${item.sku}_${locationInfo.shelfId}`;
            const placementRef = db.doc(`users/${businessId}/placements/${placementId}`);
            const existingPlacement = placementDocs.get(placementId)!;

            if (existingPlacement.exists) {
                const { createUPCs } = existingPlacement.data() as Placement;
                batch.update(placementRef, {
                    createUPCs: !createUPCs,
                    quantity: FieldValue.increment(item.acceptedQty),
                    updatedAt: now,
                    updatedBy: userId,
                    lastMovementReason: 'inward_addition',
                    lastMovementReference: grnData.grnNumber,
                });
            } else {
                const newPlacementData: Placement = {
                    id: placementId,
                    productId: item.sku,
                    createUPCs: true,
                    quantity: item.acceptedQty,
                    shelfId: locationInfo.shelfId,
                    rackId: locationInfo.rackId,
                    zoneId: locationInfo.zoneId,
                    warehouseId: locationInfo.warehouseId,
                    createdAt: now,
                    updatedAt: now,
                    createdBy: userId,
                    updatedBy: userId,
                    lastMovementReason: 'inward_addition',
                    lastMovementReference: grnData.grnNumber,
                };
                batch.set(placementRef, newPlacementData);
            }

            // 3. Create audit log entry on the product
            const logRef = productRef.collection('logs').doc();
            batch.set(logRef, {
                action: 'inventory_adjusted',
                changes: [
                    {
                        field: 'inventory.inwardAddition',
                        fieldLabel: 'Inward Addition',
                        oldValue: currentInventory.inwardAddition,
                        newValue: newInwardAddition,
                    },
                ],
                adjustmentType: 'inward',
                adjustmentAmount: item.acceptedQty,
                source: 'grn_inward',
                sourceReference: grnData.grnNumber,
                grnId: grnId,
                performedBy: userId,
                performedByEmail: userEmail,
                performedAt: now,
                placement: {
                    placementId,
                    shelfId: locationInfo.shelfId,
                    rackId: locationInfo.rackId,
                    zoneId: locationInfo.zoneId,
                    warehouseId: locationInfo.warehouseId,
                },
                metadata: {
                    userAgent: req.headers.get('user-agent') || undefined,
                    previousPhysicalStock,
                    newPhysicalStock,
                    previousAvailableStock: previousPhysicalStock - currentInventory.blockedStock,
                    newAvailableStock,
                },
            });

            results.push({
                sku: item.sku,
                productName: item.productName,
                quantityInwarded: item.acceptedQty,
                placementId,
                previousPhysicalStock,
                newPhysicalStock,
            });
        }

        // 4. Update GRN status to completed
        batch.update(grnRef, {
            status: 'completed',
            updatedAt: now,
            inwardedAt: now,
            inwardedBy: userId,
            inwardLocation: {
                warehouseId: locationInfo.warehouseId,
                zoneId: locationInfo.zoneId,
                rackId: locationInfo.rackId,
                shelfId: locationInfo.shelfId,
            },
        });

        // ============================================================
        // COMMIT BATCH
        // ============================================================

        await batch.commit();

        // ============================================================
        // RETURN SUCCESS
        // ============================================================

        return NextResponse.json(
            {
                success: true,
                message: `Successfully inwarded ${results.length} product(s) from ${grnData.grnNumber}`,
                grnId,
                grnNumber: grnData.grnNumber,
                grnStatus: 'completed',
                location: `${locationInfo.warehouseId} > ${locationInfo.zoneId} > ${locationInfo.rackId} > ${locationInfo.shelfId}`,
                items: results,
            },
            { status: 200 }
        );

    } catch (error: any) {
        console.error('❌ Bulk inward API error:', error);
        return NextResponse.json(
            {
                error: 'Internal Server Error',
                message: error.message || 'An unexpected error occurred',
            },
            { status: 500 }
        );
    }
}