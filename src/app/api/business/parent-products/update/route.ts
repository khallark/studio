// app/api/business/parent-products/update/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { authUserForBusiness } from '@/lib/authoriseUser';
import { Timestamp } from 'firebase-admin/firestore';

const MAX_NAME_LENGTH = 200;

export async function POST(req: NextRequest) {
    try {
        const {
            businessId,
            parentProductId,
            name,
        }: { businessId: string; parentProductId: string; name: string } = await req.json();

        if (!businessId || typeof businessId !== 'string') {
            return NextResponse.json(
                { error: 'Validation Error', message: 'businessId is required and must be a string' },
                { status: 400 }
            );
        }
        if (!parentProductId || typeof parentProductId !== 'string') {
            return NextResponse.json(
                { error: 'Validation Error', message: 'parentProductId is required and must be a string' },
                { status: 400 }
            );
        }

        const trimmedName = String(name ?? '').trim();
        if (!trimmedName) {
            return NextResponse.json(
                { error: 'Validation Error', message: 'Name is required' },
                { status: 400 }
            );
        }
        if (trimmedName.length > MAX_NAME_LENGTH) {
            return NextResponse.json(
                { error: 'Validation Error', message: `Name must not exceed ${MAX_NAME_LENGTH} characters` },
                { status: 400 }
            );
        }

        const result = await authUserForBusiness({ businessId, req });
        const { businessDoc, userId } = result;
        if (!result.authorised) {
            const { error, status } = result;
            return NextResponse.json({ error }, { status });
        }

        const parentsRef = businessDoc!.ref.collection('parentProducts');
        const ref = parentsRef.doc(parentProductId);
        const snap = await ref.get();
        if (!snap.exists) {
            return NextResponse.json(
                { error: 'Not Found', message: 'Parent product does not exist' },
                { status: 404 }
            );
        }

        // Uniqueness excluding self
        const all = await parentsRef.get();
        const clash = all.docs.some(
            (d) =>
                d.id !== parentProductId &&
                (d.data().name ?? '').toString().trim().toLowerCase() === trimmedName.toLowerCase()
        );
        if (clash) {
            return NextResponse.json(
                { error: 'Validation Error', message: 'A parent product with this name already exists' },
                { status: 400 }
            );
        }

        await ref.update({
            name: trimmedName,
            updatedBy: userId ?? 'unknown',
            updatedAt: Timestamp.now(),
        });

        return NextResponse.json(
            { success: true, message: 'Parent product updated successfully.', parentProductId, name: trimmedName },
            { status: 200 }
        );
    } catch (error: any) {
        console.error('❌ API error:', error);
        return NextResponse.json(
            { error: 'Internal Server Error', message: error.message || 'An unexpected error occurred' },
            { status: 500 }
        );
    }
}