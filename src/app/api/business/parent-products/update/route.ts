// app/api/business/parent-products/update/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { authUserForBusiness } from '@/lib/authoriseUser';
import { Timestamp } from 'firebase-admin/firestore';

const MAX_NAME_LENGTH = 200;

export async function POST(req: NextRequest) {
    try {
        const { businessId, parentProductId, name, description, specifications }:
            { businessId: string; parentProductId: string; name: string; description?: unknown; specifications?: unknown } = await req.json();

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

        // ── Validate optional description ──
        const MAX_DESCRIPTION_LENGTH = 5000;
        let cleanDescription: string | null = null;
        if (description !== undefined && description !== null) {
            if (typeof description !== 'string') {
                return NextResponse.json(
                    { error: 'Validation Error', message: 'description must be a string or null' }, { status: 400 });
            }
            const t = description.trim();
            if (t.length > MAX_DESCRIPTION_LENGTH) {
                return NextResponse.json(
                    { error: 'Validation Error', message: `description must not exceed ${MAX_DESCRIPTION_LENGTH} characters` }, { status: 400 });
            }
            cleanDescription = t.length ? t : null;
        }

        // ── Validate optional specifications ──
        const MAX_SPEC_FIELD = 500;
        let cleanSpecifications: { fit: string; composition: string; technique: string; fabric: string } | null = null;
        if (specifications !== undefined && specifications !== null) {
            if (typeof specifications !== 'object' || Array.isArray(specifications)) {
                return NextResponse.json(
                    { error: 'Validation Error', message: 'specifications must be an object or null' }, { status: 400 });
            }
            const fit = String((specifications as any).fit ?? '').trim();
            const composition = String((specifications as any).composition ?? '').trim();
            const technique = String((specifications as any).technique ?? '').trim();
            const fabric = String((specifications as any).fabric ?? '').trim();
            if (fit.length > MAX_SPEC_FIELD || composition.length > MAX_SPEC_FIELD || technique.length > MAX_SPEC_FIELD || fabric.length > MAX_SPEC_FIELD) {
                return NextResponse.json(
                    { error: 'Validation Error', message: `Each specification field must not exceed ${MAX_SPEC_FIELD} characters` }, { status: 400 });
            }
            cleanSpecifications = (fit || composition || technique || fabric) ? { fit, composition, technique, fabric } : null;
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

        const updatePayload: Record<string, any> = {
            name: trimmedName,
            updatedBy: userId ?? 'unknown',
            updatedAt: Timestamp.now(),
        };
        if (description !== undefined) updatePayload.description = cleanDescription;
        if (specifications !== undefined) updatePayload.specifications = cleanSpecifications;
        await ref.update(updatePayload);

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