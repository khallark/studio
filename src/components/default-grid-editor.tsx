'use client';

import React, { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, X, ChevronUp, ChevronDown } from 'lucide-react';
import { buildColumns } from '@/lib/size-chart-keys';

// Stable local id per row so value cells stay attached across label edits.
let _uid = 0;
const uid = () => `dge_${++_uid}`;

export type GridRow = { id: string; label: string };

interface DefaultGridEditorProps {
    // Raw column labels as the user typed them (creator owns these)
    columnLabels: string[];
    // Local row state (creator owns these so it can reset on save)
    rows: GridRow[];
    setRows: React.Dispatch<React.SetStateAction<GridRow[]>>;
    // values keyed by row.id -> colKey -> value
    values: Record<string, Record<string, string>>;
    setValues: React.Dispatch<React.SetStateAction<Record<string, Record<string, string>>>>;
}

export function DefaultGridEditor({
    columnLabels, rows, setRows, values, setValues,
}: DefaultGridEditorProps) {
    // Derived {key,label} columns — same logic as the server's buildColumns,
    // so the keys we store values under match what the API will expect.
    const columns = useMemo(
        () => buildColumns(columnLabels.filter((l) => l.trim())),
        [columnLabels]
    );

    const updateRowLabel = (id: string, label: string) =>
        setRows((prev) => prev.map((r) => (r.id === id ? { ...r, label } : r)));

    const addRow = () => {
        const id = uid();
        setRows((prev) => [...prev, { id, label: '' }]);
        setValues((prev) => ({ ...prev, [id]: {} }));
    };

    const removeRow = (id: string) => {
        setRows((prev) => prev.filter((r) => r.id !== id));
        setValues((prev) => {
            const next = { ...prev };
            delete next[id];
            return next;
        });
    };

    const moveRow = (index: number, dir: -1 | 1) => {
        setRows((prev) => {
            const target = index + dir;
            if (target < 0 || target >= prev.length) return prev;
            const next = [...prev];
            [next[index], next[target]] = [next[target], next[index]];
            return next;
        });
    };

    const setCell = (rowId: string, colKey: string, val: string) =>
        setValues((prev) => ({ ...prev, [rowId]: { ...prev[rowId], [colKey]: val } }));

    if (columns.length === 0) {
        return (
            <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
                Add at least one column above to define default rows.
            </div>
        );
    }

    return (
        <div className="space-y-2">
            <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                        <tr>
                            <th className="text-left font-medium px-3 py-2 w-[120px]">Size</th>
                            {columns.map((c) => (
                                <th key={c.key} className="text-left font-medium px-3 py-2">
                                    {c.label}
                                </th>
                            ))}
                            <th className="w-[90px]" />
                        </tr>
                    </thead>
                    <tbody>
                        {rows.length === 0 ? (
                            <tr>
                                <td colSpan={columns.length + 2}
                                    className="px-3 py-4 text-center text-xs text-muted-foreground">
                                    No default rows. Add one to pre-fill starter values (optional).
                                </td>
                            </tr>
                        ) : (
                            rows.map((row, index) => (
                                <tr key={row.id} className="border-t">
                                    <td className="px-2 py-1.5">
                                        <Input
                                            value={row.label}
                                            onChange={(e) => updateRowLabel(row.id, e.target.value)}
                                            placeholder="e.g. 26"
                                            className="h-8"
                                        />
                                    </td>
                                    {columns.map((c) => (
                                        <td key={c.key} className="px-2 py-1.5">
                                            <Input
                                                value={values[row.id]?.[c.key] ?? ''}
                                                onChange={(e) => setCell(row.id, c.key, e.target.value)}
                                                className="h-8"
                                            />
                                        </td>
                                    ))}
                                    <td className="px-2 py-1.5">
                                        <div className="flex items-center gap-0.5">
                                            <Button type="button" variant="ghost" size="icon"
                                                className="h-7 w-7" onClick={() => moveRow(index, -1)}
                                                disabled={index === 0}>
                                                <ChevronUp className="h-3.5 w-3.5" />
                                            </Button>
                                            <Button type="button" variant="ghost" size="icon"
                                                className="h-7 w-7" onClick={() => moveRow(index, 1)}
                                                disabled={index === rows.length - 1}>
                                                <ChevronDown className="h-3.5 w-3.5" />
                                            </Button>
                                            <Button type="button" variant="ghost" size="icon"
                                                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                                onClick={() => removeRow(row.id)}>
                                                <X className="h-3.5 w-3.5" />
                                            </Button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={addRow} className="gap-2">
                <Plus className="h-3 w-3" /> Add default row
            </Button>
        </div>
    );
}

// Project the editor's local state into the API payload shape:
// rows: string[] (trimmed, de-duped) and values keyed by row LABEL + col key.
export function buildDefaultGridPayload(
    columnLabels: string[],
    rows: GridRow[],
    values: Record<string, Record<string, string>>
): { rows: string[]; values: Record<string, Record<string, string>> } {
    const columns = buildColumns(columnLabels.filter((l) => l.trim()));
    const seen = new Set<string>();
    const outRows: string[] = [];
    const outValues: Record<string, Record<string, string>> = {};

    for (const r of rows) {
        const label = r.label.trim();
        if (!label || seen.has(label)) continue;
        seen.add(label);
        outRows.push(label);
        const src = values[r.id] ?? {};
        const cell: Record<string, string> = {};
        for (const c of columns) cell[c.key] = (src[c.key] ?? '').trim();
        outValues[label] = cell;
    }

    return { rows: outRows, values: outValues };
}