// app/api/business/inventory/adjust/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { authUserForBusiness } from '@/lib/authoriseUser';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { db } from '@/lib/firebase-admin';
import { Movement, Placement, PlacementLog } from '@/types/warehouse';

// ============================================================
// TYPES
// ============================================================

interface InventoryData {
    openingStock: number;
    inwardAddition: number;
    deduction: number;
    autoAddition: number;
    autoDeduction: number;
    blockedStock: number;
}

interface PlacementInfo {
    // For inward - shelf location to place product
    shelfId: string;
    shelfName: string;
    rackId: string;
    rackName: string;
    zoneId: string;
    zoneName: string;
    warehouseId: string;
    warehouseName: string;
    // For deduction - existing placement to deduct from
    placementId?: string;
    currentQuantity?: number;
}

// ============================================================
// HELPER FUNCTIONS
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
        const { businessId, sku, productName, type, amount, placement } = await req.json();

        // ============================================================
        // VALIDATION
        // ============================================================

        if (!businessId || typeof businessId !== 'string') {
            return NextResponse.json(
                { error: 'Validation Error', message: 'businessId is required and must be a string' },
                { status: 400 }
            );
        }

        if (!sku || typeof sku !== 'string') {
            return NextResponse.json(
                { error: 'Validation Error', message: 'sku is required and must be a string' },
                { status: 400 }
            );
        }

        if (!type || !['inward', 'deduction'].includes(type)) {
            return NextResponse.json(
                { error: 'Validation Error', message: 'type must be either "inward" or "deduction"' },
                { status: 400 }
            );
        }

        if (typeof amount !== 'number' || amount <= 0 || !Number.isInteger(amount)) {
            return NextResponse.json(
                { error: 'Validation Error', message: 'amount must be a positive integer' },
                { status: 400 }
            );
        }

        // Validate placement info
        if (!placement || !placement.shelfId) {
            return NextResponse.json(
                { error: 'Validation Error', message: 'placement.shelfId is required' },
                { status: 400 }
            );
        }

        // For deduction, validate placement has enough quantity
        if (type === 'deduction') {
            if (!placement.placementId) {
                return NextResponse.json(
                    { error: 'Validation Error', message: 'placement.placementId is required for deduction' },
                    { status: 400 }
                );
            }
            if (typeof placement.currentQuantity !== 'number' || amount > placement.currentQuantity) {
                return NextResponse.json(
                    { error: 'Validation Error', message: `Cannot deduct ${amount} units. Only ${placement.currentQuantity || 0} available at this location.` },
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
        // GET PRODUCT
        // ============================================================

        const productRef = businessDoc?.ref.collection('products').doc(sku);
        const productDoc = await productRef?.get();

        if (!productDoc?.exists) {
            return NextResponse.json(
                { error: 'Not Found', message: `Product with SKU "${sku}" not found` },
                { status: 404 }
            );
        }

        const productData = productDoc.data();
        const currentInventory = getInventoryValues(productData?.inventory);

        // ============================================================
        // VALIDATE DEDUCTION (inventory level)
        // ============================================================

        if (type === 'deduction') {
            const newDeduction = currentInventory.deduction + amount;
            const previewInventory = { ...currentInventory, deduction: newDeduction };
            const previewPhysicalStock = calculatePhysicalStock(previewInventory);

            if (previewPhysicalStock < 0) {
                const currentPhysicalStock = calculatePhysicalStock(currentInventory);
                return NextResponse.json(
                    {
                        error: 'Validation Error',
                        message: `Cannot deduct ${amount} units. Current physical stock is ${currentPhysicalStock}. Maximum deductible: ${currentPhysicalStock}`,
                    },
                    { status: 400 }
                );
            }
        }

        // ============================================================
        // PREPARE INVENTORY UPDATE
        // ============================================================

        const fieldToUpdate = type === 'inward' ? 'inventory.inwardAddition' : 'inventory.deduction';
        const oldValue = type === 'inward' ? currentInventory.inwardAddition : currentInventory.deduction;
        const newValue = oldValue + amount;

        const updatedInventory = { ...currentInventory };
        if (type === 'inward') {
            updatedInventory.inwardAddition = newValue;
        } else {
            updatedInventory.deduction = newValue;
        }
        const newPhysicalStock = calculatePhysicalStock(updatedInventory);
        const newAvailableStock = newPhysicalStock - updatedInventory.blockedStock;

        // ============================================================
        // PREPARE PLACEMENT UPDATE
        // ============================================================

        const now = Timestamp.now();
        const placementInfo = placement as PlacementInfo;

        // For inward: placementId is `${productId}_${shelfId}`
        // For deduction: placementId is provided
        const placementId = type === 'inward'
            ? `${sku}_${placementInfo.shelfId}`
            : placementInfo.placementId!;

        const placementRef = db.doc(`users/${businessId}/placements/${placementId}`);

        // ============================================================
        // CREATE AUDIT LOG
        // ============================================================

        const userData = userDoc?.data();
        const userEmail = userData?.email || userData?.primaryContact?.email || null;
        const userName = userData?.name || userData?.primaryContact?.name || userEmail || 'Unknown';

        const logEntry = {
            action: 'inventory_adjusted',
            changes: [
                {
                    field: fieldToUpdate,
                    fieldLabel: type === 'inward' ? 'Inward Addition' : 'Deduction',
                    oldValue: oldValue,
                    newValue: newValue,
                },
            ],
            adjustmentType: type,
            adjustmentAmount: amount,
            performedBy: userId || 'unknown',
            performedByEmail: userEmail,
            performedAt: now,
            placement: {
                placementId,
                shelfId: placementInfo.shelfId,
                shelfName: placementInfo.shelfName,
                rackId: placementInfo.rackId,
                rackName: placementInfo.rackName,
                zoneId: placementInfo.zoneId,
                zoneName: placementInfo.zoneName,
                warehouseId: placementInfo.warehouseId,
                warehouseName: placementInfo.warehouseName,
            },
            metadata: {
                userAgent: req.headers.get('user-agent') || undefined,
                previousPhysicalStock: calculatePhysicalStock(currentInventory),
                newPhysicalStock: newPhysicalStock,
                previousAvailableStock: calculatePhysicalStock(currentInventory) - currentInventory.blockedStock,
                newAvailableStock: newAvailableStock,
            },
        };

        // ============================================================
        // BATCH WRITE
        // ============================================================

        const batch = db.batch();

        // 1. Update the inventory field
        batch.update(productRef!, {
            [fieldToUpdate]: FieldValue.increment(amount),
            updatedAt: now,
            updatedBy: userId,
        });

        // 2. Create/Update/Delete placement
        if (type === 'inward') {
            // Check if placement already exists
            const existingPlacement = await placementRef.get();

            if (existingPlacement.exists) {
                // Update existing placement - increment quantity
                batch.update(placementRef, {
                    quantity: FieldValue.increment(amount),
                    updatedAt: now,
                    updatedBy: userId,
                    lastMovementReason: 'inward_addition',
                });
            } else {
                const newPlacementData: Placement = {
                    id: placementId,
                    productId: sku,
                    productSKU: sku,
                    quantity: amount,
                    shelfId: placementInfo.shelfId,
                    shelfName: placementInfo.shelfName,
                    rackId: placementInfo.rackId,
                    rackName: placementInfo.rackName,
                    zoneId: placementInfo.zoneId,
                    zoneName: placementInfo.zoneName,
                    warehouseId: placementInfo.warehouseId,
                    warehouseName: placementInfo.warehouseName,
                    createdAt: now,
                    updatedAt: now,
                    createdBy: userId,
                    updatedBy: userId,
                    lastMovementReason: 'inward_addition',
                    coordinates: null,
                    locationCode: null,
                    lastMovementReference: null,
                }
                // Create new placement
                batch.set(placementRef, newPlacementData);
            }
        } else {
            // Deduction - update or delete placement
            const newQuantity = (placementInfo.currentQuantity || 0) - amount;

            // Update placement with reduced quantity
            batch.update(placementRef, {
                quantity: newQuantity,
                updatedAt: now,
                updatedBy: userId,
                lastMovementReason: 'manual_deduction',
            });

            if (newQuantity <= 0) {
                // Delete placement if quantity becomes 0 or less
                batch.delete(placementRef);
            }
        }

        // 3. Create product log entry
        const logRef = productRef!.collection('logs').doc();
        batch.set(logRef, logEntry);

        await batch.commit();

        // ============================================================
        // RETURN SUCCESS RESPONSE
        // ============================================================

        return NextResponse.json(
            {
                success: true,
                message: `Successfully ${type === 'inward' ? 'added' : 'deducted'} ${amount} units`,
                adjustment: {
                    type,
                    amount,
                    sku,
                    productName: productData?.name,
                },
                placement: {
                    placementId,
                    location: `${placementInfo.warehouseName} > ${placementInfo.zoneName} > ${placementInfo.rackName} > ${placementInfo.shelfName}`,
                },
                inventory: {
                    previous: {
                        [type === 'inward' ? 'inwardAddition' : 'deduction']: oldValue,
                        physicalStock: calculatePhysicalStock(currentInventory),
                        availableStock: calculatePhysicalStock(currentInventory) - currentInventory.blockedStock,
                    },
                    current: {
                        [type === 'inward' ? 'inwardAddition' : 'deduction']: newValue,
                        physicalStock: newPhysicalStock,
                        availableStock: newAvailableStock,
                    },
                },
                logId: logRef.id,
            },
            { status: 200 }
        );

    } catch (error: any) {
        console.error('❌ Inventory adjust API error:', error);
        return NextResponse.json(
            {
                error: 'Internal Server Error',
                message: error.message || 'An unexpected error occurred',
            },
            { status: 500 }
        );
    }
}