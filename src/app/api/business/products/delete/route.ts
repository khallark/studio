// app/api/business/products/delete/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { authUserForBusiness } from '@/lib/authoriseUser';
import { Timestamp } from 'firebase-admin/firestore';
import { db } from '@/lib/firebase-admin';

export async function POST(req: NextRequest) {
    try {
        const { businessId, sku } = await req.json();

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

        const productRef = businessDoc?.ref.collection('products').doc(sku);
        const productDoc = await productRef?.get();

        if (!productDoc?.exists) {
            return NextResponse.json(
                { error: 'Not Found', message: 'Product with this SKU does not exist' },
                { status: 404 }
            );
        }

        const productData = productDoc.data();

        // ============================================================
        // CREATE DELETION LOG (at business level since product is deleted)
        // ============================================================

        const userData = userDoc?.data();
        const userEmail = userData?.email || userData?.primaryContact?.email || null;

        const deletionLog = {
            action: 'deleted',
            entityType: 'product',
            entityId: sku,
            entityName: productData?.name || sku,
            deletedData: {
                name: productData?.name,
                sku: productData?.sku,
                weight: productData?.weight,
                category: productData?.category,
                description: productData?.description || null,
                price: productData?.price || null,
                stock: productData?.stock || null,
                createdAt: productData?.createdAt,
                createdBy: productData?.createdBy,
            },
            performedBy: userId || 'unknown',
            performedByEmail: userEmail,
            performedAt: Timestamp.now(),
            metadata: {
                userAgent: req.headers.get('user-agent') || undefined,
            },
        };

        // ============================================================
        // BATCH: Delete product logs, delete product, create deletion audit
        // ============================================================

        const batch = db.batch();

        // First, get and delete all logs in the product's logs subcollection
        const logsSnapshot = await productRef!.collection('logs').get();
        logsSnapshot.docs.forEach(doc => {
            batch.delete(doc.ref);
        });

        // Delete the product
        batch.delete(productRef!);

        // Store deletion log at business level for audit trail
        const deletionLogRef = businessDoc?.ref.collection('deletedProductsLog').doc();
        batch.set(deletionLogRef!, deletionLog);

        await batch.commit();

        // ============================================================
        // RETURN SUCCESS RESPONSE
        // ============================================================

        return NextResponse.json(
            {
                success: true,
                message: 'Product deleted successfully.',
                sku,
                productName: productData?.name,
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