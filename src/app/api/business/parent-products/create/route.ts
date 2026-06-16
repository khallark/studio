// app/api/business/parent-products/create/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { authUserForBusiness } from '@/lib/authoriseUser';
import { Timestamp } from 'firebase-admin/firestore';

const MAX_NAME_LENGTH = 200;

export async function POST(req: NextRequest) {
    try {
        const { businessId, id, name }: { businessId: string; id: string; name: string } = await req.json();

        if (!businessId || typeof businessId !== 'string') {
            return NextResponse.json(
                { error: 'Validation Error', message: 'businessId is required and must be a string' },
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

        // Normalize the user-supplied id: uppercase, strip everything but A-Z 0-9 and hyphen
        const parentId = String(id ?? '').toUpperCase().replace(/[^A-Z0-9-]/g, '');
        if (!parentId) {
            return NextResponse.json(
                { error: 'Validation Error', message: 'ID is required and must contain at least one letter, number, or hyphen' },
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
        const ref = parentsRef.doc(parentId);

        const existing = await ref.get();
        if (existing.exists) {
            return NextResponse.json(
                { error: 'Validation Error', message: `A parent product with id "${parentId}" already exists` },
                { status: 400 }
            );
        }

        const data = {
            id: parentId,
            name: trimmedName,
            createdBy: userId ?? 'unknown',
            createdAt: Timestamp.now(),
            updatedBy: null,
            updatedAt: null,
        };
        await ref.set(data);

        return NextResponse.json(
            { success: true, message: 'Parent product created successfully.', parentProduct: data },
            { status: 201 }
        );
    } catch (error: any) {
        console.error('❌ API error:', error);
        return NextResponse.json(
            { error: 'Internal Server Error', message: error.message || 'An unexpected error occurred' },
            { status: 500 }
        );
    }
}