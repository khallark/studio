// app/api/business/parent-products/presets/create/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { authUserForBusiness } from '@/lib/authoriseUser';
import { Timestamp } from 'firebase-admin/firestore';

const MAX_NAME_LENGTH = 200;
const MAX_COLUMNS = 30;
const MAX_LABEL_LENGTH = 60;

// key: lowercase alphanumerics + underscore, derived from label
function toKey(label: string): string {
    return label
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
}

export async function POST(req: NextRequest) {
    try {
        const {
            businessId,
            name,
            columns,
        }: {
            businessId: string;
            name: string;
            columns: { label: string }[];
        } = await req.json();

        if (!businessId || typeof businessId !== 'string') {
            return NextResponse.json(
                { error: 'Validation Error', message: 'businessId is required and must be a string' },
                { status: 400 }
            );
        }

        const trimmedName = String(name ?? '').trim();
        if (!trimmedName) {
            return NextResponse.json(
                { error: 'Validation Error', message: 'Preset name is required' },
                { status: 400 }
            );
        }
        if (trimmedName.length > MAX_NAME_LENGTH) {
            return NextResponse.json(
                { error: 'Validation Error', message: `Preset name must not exceed ${MAX_NAME_LENGTH} characters` },
                { status: 400 }
            );
        }

        if (!Array.isArray(columns) || columns.length === 0) {
            return NextResponse.json(
                { error: 'Validation Error', message: 'At least one column is required' },
                { status: 400 }
            );
        }
        if (columns.length > MAX_COLUMNS) {
            return NextResponse.json(
                { error: 'Validation Error', message: `A preset cannot have more than ${MAX_COLUMNS} columns` },
                { status: 400 }
            );
        }

        // Build {key, label}, validating labels and enforcing unique keys
        const builtColumns: { key: string; label: string }[] = [];
        const seenKeys = new Set<string>();

        for (const col of columns) {
            const label = String(col?.label ?? '').trim();
            if (!label) {
                return NextResponse.json(
                    { error: 'Validation Error', message: 'Every column needs a non-empty label' },
                    { status: 400 }
                );
            }
            if (label.length > MAX_LABEL_LENGTH) {
                return NextResponse.json(
                    { error: 'Validation Error', message: `Column label "${label}" exceeds ${MAX_LABEL_LENGTH} characters` },
                    { status: 400 }
                );
            }

            let key = toKey(label);
            if (!key) {
                return NextResponse.json(
                    { error: 'Validation Error', message: `Column label "${label}" produces an empty key` },
                    { status: 400 }
                );
            }
            // Disambiguate collisions (e.g. "Hip (cm)" and "Hip (in)" -> hip_cm / hip_in already differ,
            // but "Hip" twice would collide) by suffixing.
            let unique = key;
            let n = 2;
            while (seenKeys.has(unique)) {
                unique = `${key}_${n++}`;
            }
            seenKeys.add(unique);
            builtColumns.push({ key: unique, label });
        }

        const result = await authUserForBusiness({ businessId, req });
        const { businessDoc, userId } = result;
        if (!result.authorised) {
            const { error, status } = result;
            return NextResponse.json({ error }, { status });
        }

        const ref = businessDoc!.ref.collection('sizeChartPresets').doc(); // auto-id
        const data = {
            id: ref.id,
            name: trimmedName,
            columns: builtColumns,
            createdBy: userId ?? 'unknown',
            createdAt: Timestamp.now(),
            updatedBy: null,
            updatedAt: null,
        };
        await ref.set(data);

        return NextResponse.json(
            { success: true, message: 'Preset created successfully.', preset: data },
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