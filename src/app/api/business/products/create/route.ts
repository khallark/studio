// app/api/business/products/create/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { authUserForBusiness } from '@/lib/authoriseUser';
import { Timestamp } from 'firebase-admin/firestore';
import { db } from '@/lib/firebase-admin';
import { Product } from '@/types/warehouse';

// ============================================================
// CONSTANTS
// ============================================================

const VALID_TAX_RATES = [0, 5, 12, 18, 28];
const MAX_WEIGHT_GRAMS = 50000;
const MAX_NAME_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 1000;
const HSN_REGEX = /^\d{4,8}$/;
const SKU_REGEX = /^[A-Z0-9][A-Z0-9' -]*[A-Z0-9]$/;

const VALID_CATEGORIES = [
    'Apparel',
    'Accessories',
    'Footwear',
    'Electronics',
    'Home & Living',
    'Beauty & Personal Care',
    'Sports & Outdoors',
    'Books & Stationery',
    'Food & Beverages',
    'Other',
];

export async function POST(req: NextRequest) {
    try {
        const { businessId, product }: { businessId: string; product: Partial<Product> } =
            await req.json();

        // ============================================================
        // VALIDATION
        // ============================================================

        if (!businessId || typeof businessId !== 'string') {
            return NextResponse.json(
                { error: 'Validation Error', message: 'businessId is required and must be a string' },
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
        // FIELD EXTRACTION & NORMALIZATION
        // ============================================================

        const { name, sku, weight, category, hsn, taxRate, price } = product;
        const normalizedSku = String(sku ?? '').trim().toUpperCase();
        const trimmedName = String(name ?? '').trim();
        const trimmedHsn = String(hsn ?? '').trim().toUpperCase();
        const trimmedCategory = String(category ?? '').trim();
        const trimmedDescription = product.description ? String(product.description).trim() : null;

        // ============================================================
        // REQUIRED FIELDS CHECK
        // ============================================================

        if (!trimmedName || !normalizedSku || weight === undefined || weight === null || !trimmedCategory || !trimmedHsn || taxRate === undefined || taxRate === null) {
            return NextResponse.json(
                {
                    error: 'Validation Error',
                    message: 'Missing required fields: name, sku, weight, category, hsn, or taxRate',
                },
                { status: 400 }
            );
        }

        // ============================================================
        // NAME VALIDATION
        // ============================================================

        if (trimmedName.length > MAX_NAME_LENGTH) {
            return NextResponse.json(
                { error: 'Validation Error', message: `Product name must not exceed ${MAX_NAME_LENGTH} characters` },
                { status: 400 }
            );
        }

        // ============================================================
        // SKU VALIDATION
        // ============================================================

        if (normalizedSku.length < 2 || normalizedSku.length > 100) {
            return NextResponse.json(
                { error: 'Validation Error', message: 'SKU must be between 2 and 100 characters' },
                { status: 400 }
            );
        }

        if (!SKU_REGEX.test(normalizedSku)) {
            return NextResponse.json(
                { error: 'Validation Error', message: 'SKU can only contain letters, numbers, hyphens, spaces, and apostrophes' },
                { status: 400 }
            );
        }

        // ============================================================
        // WEIGHT VALIDATION
        // ============================================================

        const parsedWeight = Number(weight);
        if (isNaN(parsedWeight) || parsedWeight <= 0 || parsedWeight > MAX_WEIGHT_GRAMS) {
            return NextResponse.json(
                { error: 'Validation Error', message: `Weight must be a number between 0 and ${MAX_WEIGHT_GRAMS} grams` },
                { status: 400 }
            );
        }

        // ============================================================
        // CATEGORY VALIDATION
        // ============================================================

        if (!VALID_CATEGORIES.includes(trimmedCategory)) {
            return NextResponse.json(
                { error: 'Validation Error', message: `Category must be one of: ${VALID_CATEGORIES.join(', ')}` },
                { status: 400 }
            );
        }

        // ============================================================
        // HSN VALIDATION
        // ============================================================

        if (!HSN_REGEX.test(trimmedHsn)) {
            return NextResponse.json(
                { error: 'Validation Error', message: 'HSN code must be 4 to 8 digits' },
                { status: 400 }
            );
        }

        // ============================================================
        // TAX RATE VALIDATION
        // ============================================================

        const parsedTaxRate = Number(taxRate);
        if (isNaN(parsedTaxRate) || !VALID_TAX_RATES.includes(parsedTaxRate)) {
            return NextResponse.json(
                { error: 'Validation Error', message: `Tax Rate must be one of: ${VALID_TAX_RATES.join(', ')}` },
                { status: 400 }
            );
        }

        // ============================================================
        // PRICE VALIDATION (optional field)
        // ============================================================

        let parsedPrice: number | null = null;
        if (price !== undefined && price !== null) {
            parsedPrice = Number(price);
            if (isNaN(parsedPrice) || parsedPrice < 0) {
                return NextResponse.json(
                    { error: 'Validation Error', message: 'Price must be a non-negative number' },
                    { status: 400 }
                );
            }
        }

        // ============================================================
        // STOCK VALIDATION (optional field)
        // ============================================================

        const stockRaw = product.stock !== undefined && product.stock !== null ? Number(product.stock) : 0;
        const stockValue = Math.floor(stockRaw);
        if (isNaN(stockRaw) || stockRaw < 0 || !Number.isInteger(stockRaw)) {
            return NextResponse.json(
                { error: 'Validation Error', message: 'Stock must be a non-negative integer' },
                { status: 400 }
            );
        }

        // ============================================================
        // DESCRIPTION VALIDATION (optional field)
        // ============================================================

        if (trimmedDescription && trimmedDescription.length > MAX_DESCRIPTION_LENGTH) {
            return NextResponse.json(
                { error: 'Validation Error', message: `Description must not exceed ${MAX_DESCRIPTION_LENGTH} characters` },
                { status: 400 }
            );
        }

        // ============================================================
        // CHECK EXISTING PRODUCT
        // ============================================================

        const productRef = businessDoc?.ref.collection('products').doc(normalizedSku);
        const productDoc = await productRef?.get();

        if (productDoc?.exists) {
            return NextResponse.json(
                { error: 'Validation Error', message: 'A product with this SKU already exists' },
                { status: 400 }
            );
        }

        // ============================================================
        // BUILD PRODUCT DATA
        // ============================================================

        const productData: Omit<Product, 'id'> = {
            name: trimmedName,
            sku: normalizedSku,
            weight: parsedWeight,
            category: trimmedCategory,
            hsn: trimmedHsn,
            taxRate: parsedTaxRate,
            description: trimmedDescription,
            price: parsedPrice,
            stock: stockValue > 0 ? stockValue : null,
            status: null,
            mappedVariants: null,
            createdBy: userId ?? 'unknown',
            createdAt: Timestamp.now(),
            updatedBy: null,
            updatedAt: null,
            inShelfQuantity: 0,
            inventory: {
                openingStock: stockValue,
                inwardAddition: 0,
                deduction: 0,
                autoAddition: 0,
                autoDeduction: 0,
                blockedStock: 0,
            },
        };

        // ============================================================
        // CREATE AUDIT LOG
        // ============================================================

        const userData = userDoc?.data();
        const userEmail = userData?.email ?? userData?.primaryContact?.email ?? null;

        const logEntry = {
            action: 'created',
            changes: [
                { field: 'name', fieldLabel: 'Product Name', oldValue: null, newValue: productData.name },
                { field: 'sku', fieldLabel: 'SKU', oldValue: null, newValue: normalizedSku },
                { field: 'weight', fieldLabel: 'Weight', oldValue: null, newValue: productData.weight },
                { field: 'category', fieldLabel: 'Category', oldValue: null, newValue: productData.category },
                { field: 'hsn', fieldLabel: 'HSN Code', oldValue: null, newValue: productData.hsn },
                { field: 'taxRate', fieldLabel: 'GST Rate', oldValue: null, newValue: productData.taxRate },
                ...(productData.description
                    ? [{ field: 'description', fieldLabel: 'Description', oldValue: null, newValue: productData.description }]
                    : []),
                ...(productData.price !== null
                    ? [{ field: 'price', fieldLabel: 'Price', oldValue: null, newValue: productData.price }]
                    : []),
                ...(stockValue > 0
                    ? [{ field: 'inventory.openingStock', fieldLabel: 'Opening Stock', oldValue: null, newValue: stockValue }]
                    : []),
            ],
            performedBy: userId ?? 'unknown',
            performedByEmail: userEmail,
            performedAt: Timestamp.now(),
            metadata: {
                userAgent: req.headers.get('user-agent') ?? undefined,
            },
        };

        // ============================================================
        // BATCH WRITE: Create product + Create log
        // ============================================================

        const batch = db.batch();

        batch.set(productRef!, productData);

        const logRef = productRef!.collection('logs').doc();
        batch.set(logRef, logEntry);

        await batch.commit();

        // ============================================================
        // RETURN SUCCESS RESPONSE
        // ============================================================

        return NextResponse.json(
            {
                success: true,
                message: 'Product created successfully.',
                product: { id: normalizedSku, ...productData } as Product,
                logId: logRef.id,
            },
            { status: 201 }
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