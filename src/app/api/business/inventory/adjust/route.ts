// app/api/business/inventory/adjust/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { authUserForBusiness } from '@/lib/authoriseUser';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { db } from '@/lib/firebase-admin';

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
        const { businessId, sku, type, amount } = await req.json();

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

        // ============================================================
        // AUTHORIZATION
        // ============================================================

        const result = await authUserForBusiness({ businessId, req });
        const { businessDoc, userId, userDoc } = result;

        if (!result.authorised) {
            const { error, status } = result;
            return NextResponse.json({ error }, { status });
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
        // VALIDATE DEDUCTION
        // ============================================================

        if (type === 'deduction') {
            // Calculate what the physical stock would be after deduction
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
        // PREPARE UPDATE
        // ============================================================

        const fieldToUpdate = type === 'inward' ? 'inventory.inwardAddition' : 'inventory.deduction';
        const oldValue = type === 'inward' ? currentInventory.inwardAddition : currentInventory.deduction;
        const newValue = oldValue + amount;

        // Calculate new stock values for response
        const updatedInventory = { ...currentInventory };
        if (type === 'inward') {
            updatedInventory.inwardAddition = newValue;
        } else {
            updatedInventory.deduction = newValue;
        }
        const newPhysicalStock = calculatePhysicalStock(updatedInventory);
        const newAvailableStock = newPhysicalStock - updatedInventory.blockedStock;

        // ============================================================
        // CREATE AUDIT LOG
        // ============================================================

        const userData = userDoc?.data();
        const userEmail = userData?.email || userData?.primaryContact?.email || null;

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
            performedAt: Timestamp.now(),
            metadata: {
                userAgent: req.headers.get('user-agent') || undefined,
                previousPhysicalStock: calculatePhysicalStock(currentInventory),
                newPhysicalStock: newPhysicalStock,
                previousAvailableStock: calculatePhysicalStock(currentInventory) - currentInventory.blockedStock,
                newAvailableStock: newAvailableStock,
            },
        };

        // ============================================================
        // BATCH WRITE: Update inventory + Create log
        // ============================================================

        const batch = db.batch();

        // Update the inventory field using increment for atomic operation
        batch.update(productRef!, {
            [fieldToUpdate]: FieldValue.increment(amount),
            updatedAt: Timestamp.now(),
            updatedBy: userId,
        });

        // Create the log entry
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