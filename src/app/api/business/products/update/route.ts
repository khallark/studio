// app/api/business/products/update/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { authUserForBusiness } from '@/lib/authoriseUser';
import { Timestamp } from 'firebase-admin/firestore';
import { db } from '@/lib/firebase-admin';
import { Product } from '@/types/warehouse';

// ============================================================
// TYPES
// ============================================================

interface ChangeLogEntry {
    field: string;
    fieldLabel: string;
    oldValue: any;
    newValue: any;
}

interface ProductLog {
    action: 'created' | 'updated' | 'deleted';
    changes: ChangeLogEntry[];
    performedBy: string;
    performedByEmail: string | null;
    performedAt: Timestamp;
    metadata?: {
        userAgent?: string;
        ip?: string;
    };
}

// Field labels for human-readable logs
const FIELD_LABELS: Record<string, string> = {
    name: 'Product Name',
    weight: 'Weight',
    category: 'Category',
    hsn: 'HSN Code',
    taxRate: 'GST Rate',
    description: 'Description',
    price: 'Price',
    stock: 'Stock',
    status: 'Status',
};

// ============================================================
// HELPER FUNCTIONS
// ============================================================

function getChanges(
    oldData: Record<string, any>,
    newData: Record<string, any>
): ChangeLogEntry[] {
    const changes: ChangeLogEntry[] = [];
    const fieldsToTrack: Array<keyof Omit<Product, 'id' | 'sku' | 'createdAt' | 'createdBy' | 'updatedAt' | 'updatedBy' | 'mappedVariants' | 'inventory' | 'inShelfQuantity'>> = [
        'name', 'weight', 'category', 'hsn', 'taxRate',
        'description', 'price', 'stock', 'status',
    ];

    for (const field of fieldsToTrack) {
        const oldValue = oldData[field];
        const newValue = newData[field];

        // Normalise: treat null, undefined and '' as equivalent for comparison
        const normalizedOld = oldValue === undefined || oldValue === '' ? null : oldValue;
        const normalizedNew = newValue === undefined || newValue === '' ? null : newValue;

        if (normalizedOld !== normalizedNew) {
            changes.push({
                field,
                fieldLabel: FIELD_LABELS[field] ?? field,
                oldValue: normalizedOld,
                newValue: normalizedNew,
            });
        }
    }

    return changes;
}

function formatValueForLog(value: any, field: string): string {
    if (value === null || value === undefined) return '—';
    if (field === 'weight') return `${value}g`;
    if (field === 'price') return `₹${value}`;
    if (field === 'stock') return `${value} units`;
    if (field === 'taxRate') return `${value}%`;
    return String(value);
}

// ============================================================
// MAIN HANDLER
// ============================================================

export async function POST(req: NextRequest) {
    try {
        const {
            businessId,
            sku,
            product,
        }: { businessId: string; sku: string; product: Partial<Product> } = await req.json();

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

        if (!product || typeof product !== 'object') {
            return NextResponse.json(
                { error: 'Validation Error', message: 'product is required and must be an object' },
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
        // CORE LOGIC
        // ============================================================

        const { name, weight, category, hsn, taxRate } = product;

        if (!name || !weight || !category || !hsn || taxRate === undefined || taxRate === null) {
            return NextResponse.json(
                {
                    error: 'Validation Error',
                    message: 'Missing required fields: name, weight, category, hsn, or taxRate',
                },
                { status: 400 }
            );
        }

        const productRef = businessDoc?.ref.collection('products').doc(sku);
        const productDoc = await productRef?.get();

        if (!productDoc?.exists) {
            return NextResponse.json(
                { error: 'Not Found', message: 'Product with this SKU does not exist' },
                { status: 404 }
            );
        }

        const existingData = productDoc.data() ?? {};

        // Build the update payload — typed as Partial<Product> since we only
        // write fields that are explicitly provided.
        const updateData: Partial<Product> & { updatedBy: string; updatedAt: Timestamp } = {
            name: product.name!,
            weight: product.weight!,
            category: product.category!,
            hsn: product.hsn!,
            taxRate: product.taxRate!,
            updatedBy: userId ?? 'unknown',
            updatedAt: Timestamp.now(),
        };

        // Optional fields — always write them (even as null) so the doc stays in sync
        if (product.description !== undefined) {
            updateData.description = product.description ?? null;
        }
        if (product.price !== undefined) {
            updateData.price = product.price ?? null;
        }
        if (product.stock !== undefined) {
            updateData.stock = product.stock !== null ? Number(product.stock) : null;
        }
        if (product.status !== undefined) {
            updateData.status = product.status ?? null;
        }

        // ============================================================
        // DETECT CHANGES
        // ============================================================

        const changes = getChanges(existingData, updateData);

        if (changes.length === 0) {
            return NextResponse.json(
                {
                    success: true,
                    message: 'No changes detected.',
                    product: { id: sku, ...existingData } as Product,
                    changes: [],
                },
                { status: 200 }
            );
        }

        // ============================================================
        // CREATE AUDIT LOG
        // ============================================================

        const userData = userDoc?.data();
        const userEmail = userData?.email ?? userData?.primaryContact?.email ?? null;

        const logEntry: ProductLog = {
            action: 'updated',
            changes,
            performedBy: userId ?? 'unknown',
            performedByEmail: userEmail,
            performedAt: Timestamp.now(),
            metadata: {
                userAgent: req.headers.get('user-agent') ?? undefined,
            },
        };

        // ============================================================
        // BATCH WRITE: Update product + Create log
        // ============================================================

        const batch = db.batch();

        batch.update(productRef!, updateData);

        const logRef = productRef!.collection('logs').doc();
        batch.set(logRef, logEntry);

        await batch.commit();

        // ============================================================
        // RETURN SUCCESS RESPONSE
        // ============================================================

        return NextResponse.json(
            {
                success: true,
                message: 'Product updated successfully.',
                product: { id: sku, ...updateData } as Product,
                changes: changes.map((c) => ({
                    ...c,
                    oldValueFormatted: formatValueForLog(c.oldValue, c.field),
                    newValueFormatted: formatValueForLog(c.newValue, c.field),
                })),
                logId: logRef.id,
            },
            { status: 200 }
        );

    } catch (error: any) {
        console.error('❌ API error:', error);
        return NextResponse.json(
            {
                error: 'Internal Server Error',
                message: error.message || 'An unexpected error occurred',
            },
            { status: 500 }
        );
    }
}