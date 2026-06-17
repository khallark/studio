// app/api/business/parent-products/upsert-size-chart/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { authUserForBusiness } from '@/lib/authoriseUser';
import { Timestamp } from 'firebase-admin/firestore';
import { ProductSizeChart } from '@/types/warehouse';

const MAX_ROWS = 100;
const MAX_COLUMNS = 30;
const MAX_CELL_LENGTH = 60;

export async function POST(req: NextRequest) {
    try {
        const {
            businessId,
            parentProductId,
            sizeChart,
        }: {
            businessId: string;
            parentProductId: string;
            sizeChart: ProductSizeChart | null;
        } = await req.json();

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

        // sizeChart may be null (clearing). If present, validate its shape.
        let cleanChart: ProductSizeChart | null = null;

        if (sizeChart !== null) {
            if (typeof sizeChart !== 'object') {
                return NextResponse.json(
                    { error: 'Validation Error', message: 'sizeChart must be an object or null' },
                    { status: 400 }
                );
            }

            const rows = Array.isArray(sizeChart.rows) ? sizeChart.rows : null;
            const columns = Array.isArray(sizeChart.columns) ? sizeChart.columns : null;

            if (!rows || rows.length === 0) {
                return NextResponse.json(
                    { error: 'Validation Error', message: 'sizeChart must have at least one row' },
                    { status: 400 }
                );
            }
            if (rows.length > MAX_ROWS) {
                return NextResponse.json(
                    { error: 'Validation Error', message: `sizeChart cannot have more than ${MAX_ROWS} rows` },
                    { status: 400 }
                );
            }
            if (!columns || columns.length === 0) {
                return NextResponse.json(
                    { error: 'Validation Error', message: 'sizeChart must have at least one column' },
                    { status: 400 }
                );
            }
            if (columns.length > MAX_COLUMNS) {
                return NextResponse.json(
                    { error: 'Validation Error', message: `sizeChart cannot have more than ${MAX_COLUMNS} columns` },
                    { status: 400 }
                );
            }

            // Normalize rows: trim, drop empties, de-dupe (preserve order)
            const seenRows = new Set<string>();
            const cleanRows: string[] = [];
            for (const r of rows) {
                const t = String(r ?? '').trim();
                if (t && !seenRows.has(t)) {
                    seenRows.add(t);
                    cleanRows.push(t);
                }
            }
            if (cleanRows.length === 0) {
                return NextResponse.json(
                    { error: 'Validation Error', message: 'sizeChart rows are all empty after trimming' },
                    { status: 400 }
                );
            }

            // Normalize columns: each needs key + label; keys unique
            const seenKeys = new Set<string>();
            const cleanCols: { key: string; label: string }[] = [];
            for (const c of columns) {
                const key = String(c?.key ?? '').trim();
                const label = String(c?.label ?? '').trim();
                if (!key || !label) {
                    return NextResponse.json(
                        { error: 'Validation Error', message: 'Every column needs a non-empty key and label' },
                        { status: 400 }
                    );
                }
                if (seenKeys.has(key)) {
                    return NextResponse.json(
                        { error: 'Validation Error', message: `Duplicate column key "${key}"` },
                        { status: 400 }
                    );
                }
                seenKeys.add(key);
                cleanCols.push({ key, label });
            }

            // Rebuild values strictly from clean rows × clean column keys.
            // Anything outside the grid (orphaned row/col) is dropped here.
            const incomingValues =
                sizeChart.values && typeof sizeChart.values === 'object' ? sizeChart.values : {};
            const cleanValues: Record<string, Record<string, string>> = {};

            for (const row of cleanRows) {
                const rowVals = incomingValues[row] ?? {};
                const cleanRow: Record<string, string> = {};
                for (const col of cleanCols) {
                    const raw = rowVals[col.key];
                    const v = raw === undefined || raw === null ? '' : String(raw).trim();
                    if (v.length > MAX_CELL_LENGTH) {
                        return NextResponse.json(
                            { error: 'Validation Error', message: `Cell value at row "${row}", column "${col.label}" exceeds ${MAX_CELL_LENGTH} characters` },
                            { status: 400 }
                        );
                    }
                    cleanRow[col.key] = v;
                }
                cleanValues[row] = cleanRow;
            }

            cleanChart = {
                presetId: sizeChart.presetId ? String(sizeChart.presetId) : null,
                presetName: sizeChart.presetName ? String(sizeChart.presetName) : null,
                rows: cleanRows,
                columns: cleanCols,
                values: cleanValues,
            };
        }

        const result = await authUserForBusiness({ businessId, req });
        const { businessDoc, userId } = result;
        if (!result.authorised) {
            const { error, status } = result;
            return NextResponse.json({ error }, { status });
        }

        const ref = businessDoc!.ref.collection('parentProducts').doc(parentProductId);
        const snap = await ref.get();
        if (!snap.exists) {
            return NextResponse.json(
                { error: 'Not Found', message: 'Parent product does not exist' },
                { status: 404 }
            );
        }

        await ref.update({
            sizeChart: cleanChart,
            updatedBy: userId ?? 'unknown',
            updatedAt: Timestamp.now(),
        });

        return NextResponse.json(
            {
                success: true,
                message: cleanChart ? 'Size chart saved successfully.' : 'Size chart cleared.',
                parentProductId,
                sizeChart: cleanChart,
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