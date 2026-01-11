// app/api/business/products/create/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { authUserForBusiness } from '@/lib/authoriseUser';
import { Timestamp } from 'firebase-admin/firestore';
import { db } from '@/lib/firebase-admin';

export async function POST(req: NextRequest) {
    try {
        const { businessId, product } = await req.json();

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
        // CORE LOGIC
        // ============================================================

        const { name, sku, weight, category }: {
            name?: string;
            sku?: string;
            weight?: number;
            category?: string;
        } = product;

        if (!name || !sku || !weight || !category) {
            return NextResponse.json(
                { error: 'Validation Error', message: 'Missing required fields: name, sku, weight, or category' },
                { status: 400 }
            );
        }

        const productRef = businessDoc?.ref.collection('products').doc(sku);
        const productDoc = await productRef?.get();

        if (productDoc?.exists) {
            return NextResponse.json(
                { error: 'Validation Error', message: 'A product with this SKU already exists' },
                { status: 400 }
            );
        }

        // Parse stock value for inventory initialization
        const stockValue = product.stock !== undefined && product.stock !== null && product.stock !== ''
            ? parseInt(product.stock)
            : 0;

        // Build product data with inventory
        const productData = {
            name: product.name,
            sku: product.sku,
            weight: product.weight,
            category: product.category,
            description: product.description || null,
            price: product.price || null,
            stock: stockValue || null,
            createdBy: userId || 'unknown',
            createdAt: Timestamp.now(),
            inShelfQuantity: 0,
            // Initialize inventory data
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
        const userEmail = userData?.email || userData?.primaryContact?.email || null;

        const logEntry = {
            action: 'created',
            changes: [
                { field: 'name', fieldLabel: 'Product Name', oldValue: null, newValue: productData.name },
                { field: 'sku', fieldLabel: 'SKU', oldValue: null, newValue: productData.sku },
                { field: 'weight', fieldLabel: 'Weight', oldValue: null, newValue: productData.weight },
                { field: 'category', fieldLabel: 'Category', oldValue: null, newValue: productData.category },
                ...(productData.description ? [{ field: 'description', fieldLabel: 'Description', oldValue: null, newValue: productData.description }] : []),
                ...(productData.price ? [{ field: 'price', fieldLabel: 'Price', oldValue: null, newValue: productData.price }] : []),
                ...(stockValue > 0 ? [{ field: 'inventory.openingStock', fieldLabel: 'Opening Stock', oldValue: null, newValue: stockValue }] : []),
            ],
            performedBy: userId || 'unknown',
            performedByEmail: userEmail,
            performedAt: Timestamp.now(),
            metadata: {
                userAgent: req.headers.get('user-agent') || undefined,
            },
        };

        // ============================================================
        // BATCH WRITE: Create product + Create log
        // ============================================================

        const batch = db.batch();

        // Create the product
        batch.set(productRef!, productData);

        // Create the initial log entry
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
                product: productData,
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