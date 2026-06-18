// app/api/business/parent-products/presets/update/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { authUserForBusiness } from '@/lib/authoriseUser';
import { Timestamp } from 'firebase-admin/firestore';
import { buildColumns } from '@/lib/size-chart-keys';

const MAX_NAME_LENGTH = 200;
const MAX_COLUMNS = 30;
const MAX_LABEL_LENGTH = 60;

export async function POST(req: NextRequest) {
    try {
        const {
            businessId,
            presetId,
            name,
            columns,
            rows,
            values,
        }: {
            businessId: string;
            presetId: string;
            name: string;
            columns: { label: string }[];
            rows?: string[];
            values?: Record<string, Record<string, string>>;
        } = await req.json();

        if (!businessId || typeof businessId !== 'string') {
            return NextResponse.json(
                { error: 'Validation Error', message: 'businessId is required and must be a string' },
                { status: 400 }
            );
        }
        if (!presetId || typeof presetId !== 'string') {
            return NextResponse.json(
                { error: 'Validation Error', message: 'presetId is required and must be a string' },
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
        }

        // Rebuild columns via shared helper so keys match what the client used.
        const builtColumns = buildColumns(columns.map((c) => String(c?.label ?? '')));
        if (builtColumns.length === 0) {
            return NextResponse.json(
                { error: 'Validation Error', message: 'Columns produced no valid keys' },
                { status: 400 }
            );
        }

        // Normalize rows (optional): trim, drop empty, de-dupe
        const seenRows = new Set<string>();
        const cleanRows: string[] = [];
        for (const r of Array.isArray(rows) ? rows : []) {
            const t = String(r ?? '').trim();
            if (t && !seenRows.has(t)) {
                seenRows.add(t);
                cleanRows.push(t);
            }
        }

        // Rebuild values strictly from cleanRows × builtColumns keys.
        // This is the reconciliation: any value keyed under a renamed/removed
        // column simply drops, because its key no longer exists in builtColumns.
        const incomingValues = values && typeof values === 'object' ? values : {};
        const cleanValues: Record<string, Record<string, string>> = {};
        for (const row of cleanRows) {
            const src = incomingValues[row] ?? {};
            const cell: Record<string, string> = {};
            for (const c of builtColumns) {
                const raw = src[c.key];
                cell[c.key] = raw === undefined || raw === null ? '' : String(raw).trim();
            }
            cleanValues[row] = cell;
        }

        const result = await authUserForBusiness({ businessId, req });
        const { businessDoc, userId } = result;
        if (!result.authorised) {
            const { error, status } = result;
            return NextResponse.json({ error }, { status });
        }

        const ref = businessDoc!.ref.collection('sizeChartPresets').doc(presetId);
        const snap = await ref.get();
        if (!snap.exists) {
            return NextResponse.json(
                { error: 'Not Found', message: 'Preset does not exist' },
                { status: 404 }
            );
        }

        await ref.update({
            name: trimmedName,
            columns: builtColumns,
            rows: cleanRows,
            values: cleanValues,
            updatedBy: userId ?? 'unknown',
            updatedAt: Timestamp.now(),
        });

        return NextResponse.json(
            {
                success: true,
                message: 'Preset updated successfully.',
                preset: { id: presetId, name: trimmedName, columns: builtColumns, rows: cleanRows, values: cleanValues },
            },
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