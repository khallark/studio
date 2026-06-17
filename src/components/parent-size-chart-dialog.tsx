'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { User } from 'firebase/auth';
import {
    Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
    Ruler, Plus, X, ChevronUp, ChevronDown, Loader2, Trash2, Save, Sparkles,
} from 'lucide-react';
import { ParentProduct, Product, SizeChartPresetDoc, ProductSizeChart } from '@/types/warehouse';
import { useSizeChartPresets } from '@/hooks/use-size-chart-presets';

// Local-only stable id for rows, so value cells stay attached across label edits.
let _uid = 0;
const uid = () => `row_${++_uid}`;

type LocalRow = { id: string; label: string };

interface ParentSizeChartDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    businessId: string;
    user: User | null | undefined;
    parent: ParentProduct | null;
    children: Product[];
}

export function ParentSizeChartDialog({
    open, onOpenChange, businessId, user, parent, children,
}: ParentSizeChartDialogProps) {
    const { toast } = useToast();
    const { presets } = useSizeChartPresets(businessId);

    const [presetId, setPresetId] = useState<string | null>(null);
    const [presetName, setPresetName] = useState<string | null>(null);
    const [columns, setColumns] = useState<{ key: string; label: string }[]>([]);
    const [rows, setRows] = useState<LocalRow[]>([]);
    const [values, setValues] = useState<Record<string, Record<string, string>>>({});

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isClearing, setIsClearing] = useState(false);

    // Inline preset creation
    const [creatingPreset, setCreatingPreset] = useState(false);
    const [newPresetName, setNewPresetName] = useState('');
    const [newPresetCols, setNewPresetCols] = useState<string[]>(['']);
    const [savingPreset, setSavingPreset] = useState(false);

    const hadChart = !!parent?.sizeChart;

    // Rows derived from children's sizeName (for fresh charts)
    const derivedRows = useMemo(() => {
        const seen = new Set<string>();
        const out: string[] = [];
        for (const c of children) {
            const s = (c.sizeName ?? '').trim();
            if (s && !seen.has(s)) {
                seen.add(s);
                out.push(s);
            }
        }
        return out;
    }, [children]);

    // Keep latest derivedRows reachable without making it an effect dependency
    const derivedRowsRef = React.useRef(derivedRows);
    derivedRowsRef.current = derivedRows;

    // (Re)initialize ONLY when the dialog transitions to open
    useEffect(() => {
        if (!open || !parent) return;

        const chart = parent.sizeChart;
        if (chart) {
            setPresetId(chart.presetId ?? null);
            setPresetName(chart.presetName ?? null);
            setColumns(chart.columns ?? []);
            const localRows = (chart.rows ?? []).map((label) => ({ id: uid(), label }));
            setRows(localRows);
            const v: Record<string, Record<string, string>> = {};
            for (const r of localRows) {
                v[r.id] = { ...(chart.values?.[r.label] ?? {}) };
            }
            setValues(v);
        } else {
            // Fresh chart: open empty. Rows + starter values get seeded when a
            // template is applied (see applyPreset), since we need columns first.
            setPresetId(null);
            setPresetName(null);
            setColumns([]);
            setRows([]);
            setValues({});
        }

        setCreatingPreset(false);
        setNewPresetName('');
        setNewPresetCols(['']);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    // Apply a template. Two modes:
    //  - Empty grid (fresh chart, no rows yet): seed rows = derived ∪ template defaults,
    //    and prefill values from the template's starter values.
    //  - Populated grid (swapping templates mid-edit): swap columns only, keep
    //    surviving keys' values, leave rows untouched.
    const applyPreset = (preset: SizeChartPresetDoc) => {
        const newCols = preset.columns ?? [];
        setPresetId(preset.id);
        setPresetName(preset.name);
        setColumns(newCols);

        if (rows.length === 0) {
            // FRESH: union derived rows (first) with template default rows.
            const seen = new Set<string>();
            const mergedLabels: string[] = [];
            for (const label of derivedRowsRef.current) {
                if (!seen.has(label)) { seen.add(label); mergedLabels.push(label); }
            }
            for (const label of (preset.rows ?? [])) {
                if (!seen.has(label)) { seen.add(label); mergedLabels.push(label); }
            }

            const localRows = mergedLabels.map((label) => ({ id: uid(), label }));
            const v: Record<string, Record<string, string>> = {};
            for (const r of localRows) {
                const presetRowVals = preset.values?.[r.label] ?? {};
                const cell: Record<string, string> = {};
                for (const c of newCols) cell[c.key] = presetRowVals[c.key] ?? '';
                v[r.id] = cell;
            }
            setRows(localRows);
            setValues(v);
        } else {
            // POPULATED: keep rows + surviving column values, drop dead columns.
            setValues((prev) => {
                const next: Record<string, Record<string, string>> = {};
                for (const r of rows) {
                    const old = prev[r.id] ?? {};
                    const kept: Record<string, string> = {};
                    for (const c of newCols) kept[c.key] = old[c.key] ?? '';
                    next[r.id] = kept;
                }
                return next;
            });
        }
    };

    // Row ops
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

    // Inline preset create
    const addPresetCol = () => setNewPresetCols((prev) => [...prev, '']);
    const updatePresetCol = (i: number, val: string) =>
        setNewPresetCols((prev) => prev.map((c, idx) => (idx === i ? val : c)));
    const removePresetCol = (i: number) =>
        setNewPresetCols((prev) => prev.filter((_, idx) => idx !== i));

    const handleCreatePreset = async () => {
        const name = newPresetName.trim();
        const cols = newPresetCols.map((c) => c.trim()).filter(Boolean);
        if (!name) {
            toast({ title: 'Name required', description: 'Give the preset a name.', variant: 'destructive' });
            return;
        }
        if (cols.length === 0) {
            toast({ title: 'Columns required', description: 'Add at least one column.', variant: 'destructive' });
            return;
        }
        if (!user) return;

        setSavingPreset(true);
        try {
            const idToken = await user.getIdToken();
            const res = await fetch('/api/business/parent-products/presets/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
                body: JSON.stringify({ businessId, name, columns: cols.map((label) => ({ label })) }),
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.message || 'Failed to create preset');

            // Immediately apply the freshly created preset
            applyPreset(result.preset as SizeChartPresetDoc);
            setCreatingPreset(false);
            setNewPresetName('');
            setNewPresetCols(['']);
            toast({ title: 'Preset created', description: `"${name}" is ready to use.` });
        } catch (err) {
            toast({
                title: 'Error',
                description: err instanceof Error ? err.message : 'Failed to create preset.',
                variant: 'destructive',
            });
        } finally {
            setSavingPreset(false);
        }
    };

    // Build the API payload from local state
    const buildChart = (): ProductSizeChart | null => {
        const seen = new Set<string>();
        const finalRows: string[] = [];
        const finalValues: Record<string, Record<string, string>> = {};

        for (const r of rows) {
            const label = r.label.trim();
            if (!label || seen.has(label)) continue;
            seen.add(label);
            finalRows.push(label);
            const src = values[r.id] ?? {};
            const cleaned: Record<string, string> = {};
            for (const c of columns) cleaned[c.key] = (src[c.key] ?? '').trim();
            finalValues[label] = cleaned;
        }

        if (finalRows.length === 0 || columns.length === 0) return null;

        return { presetId, presetName, rows: finalRows, columns, values: finalValues };
    };

    const handleSave = async () => {
        if (!parent || !user) return;
        const chart = buildChart();
        if (!chart) {
            toast({
                title: 'Incomplete chart',
                description: 'Select a template and add at least one size row.',
                variant: 'destructive',
            });
            return;
        }

        setIsSubmitting(true);
        try {
            const idToken = await user.getIdToken();
            const res = await fetch('/api/business/parent-products/upsert-size-chart', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
                body: JSON.stringify({ businessId, parentProductId: parent.id, sizeChart: chart }),
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.message || 'Failed to save size chart');
            toast({ title: 'Size chart saved', description: `Updated for "${parent.name}".` });
            onOpenChange(false);
        } catch (err) {
            toast({
                title: 'Error',
                description: err instanceof Error ? err.message : 'Failed to save size chart.',
                variant: 'destructive',
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleClear = async () => {
        if (!parent || !user) return;
        setIsClearing(true);
        try {
            const idToken = await user.getIdToken();
            const res = await fetch('/api/business/parent-products/upsert-size-chart', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
                body: JSON.stringify({ businessId, parentProductId: parent.id, sizeChart: null }),
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.message || 'Failed to clear size chart');
            toast({ title: 'Size chart removed', description: `Cleared for "${parent.name}".` });
            onOpenChange(false);
        } catch (err) {
            toast({
                title: 'Error',
                description: err instanceof Error ? err.message : 'Failed to clear size chart.',
                variant: 'destructive',
            });
        } finally {
            setIsClearing(false);
        }
    };

    const busy = isSubmitting || isClearing || savingPreset;

    return (
        <Dialog open={open} onOpenChange={(o) => !o && !busy && onOpenChange(false)}>
            <DialogContent className="sm:max-w-[760px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-primary/10">
                            <Ruler className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                            <DialogTitle>
                                {hadChart ? 'Edit Size Chart' : 'Create Size Chart'}
                                {parent && <span className="text-muted-foreground"> — {parent.name}</span>}
                            </DialogTitle>
                            <DialogDescription>
                                Pick a template for the columns, then fill measurements per size.
                            </DialogDescription>
                        </div>
                    </div>
                </DialogHeader>

                <div className="space-y-6 py-4">
                    {/* Template selector */}
                    <div className="space-y-2">
                        <Label className="text-sm font-medium">Template</Label>
                        <div className="flex items-center gap-2">
                            <Select
                                value={presetId ?? ''}
                                onValueChange={(val) => {
                                    const p = presets.find((x) => x.id === val);
                                    if (p) applyPreset(p);
                                }}
                            >
                                <SelectTrigger className="flex-1">
                                    <SelectValue placeholder={
                                        presetName ?? (columns.length > 0 ? '(custom — preset deleted)' : 'Select a template')
                                    } />
                                </SelectTrigger>
                                <SelectContent>
                                    {presets.length === 0 ? (
                                        <div className="py-4 text-center text-sm text-muted-foreground">
                                            No templates yet
                                        </div>
                                    ) : (
                                        presets.map((p) => (
                                            <SelectItem key={p.id} value={p.id}>
                                                {p.name}
                                                <span className="ml-2 text-xs text-muted-foreground">
                                                    ({p.columns.length} cols)
                                                </span>
                                            </SelectItem>
                                        ))
                                    )}
                                </SelectContent>
                            </Select>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setCreatingPreset((v) => !v)}
                                className="gap-2 shrink-0"
                            >
                                <Plus className="h-4 w-4" />
                                New
                            </Button>
                        </div>
                        {columns.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 pt-1">
                                {columns.map((c) => (
                                    <Badge key={c.key} variant="secondary" className="font-normal">
                                        {c.label}
                                    </Badge>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Inline preset creation */}
                    {creatingPreset && (
                        <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                            <div className="space-y-2">
                                <Label className="text-sm font-medium">New Template Name</Label>
                                <Input
                                    value={newPresetName}
                                    onChange={(e) => setNewPresetName(e.target.value)}
                                    placeholder="e.g. Men's Pants"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-sm font-medium">Columns</Label>
                                {newPresetCols.map((col, i) => (
                                    <div key={i} className="flex items-center gap-2">
                                        <Input
                                            value={col}
                                            onChange={(e) => updatePresetCol(i, e.target.value)}
                                            placeholder={`Column ${i + 1} (e.g. Waist)`}
                                        />
                                        <Button
                                            type="button" variant="ghost" size="icon"
                                            className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
                                            onClick={() => removePresetCol(i)}
                                            disabled={newPresetCols.length === 1}
                                        >
                                            <X className="h-4 w-4" />
                                        </Button>
                                    </div>
                                ))}
                                <Button type="button" variant="outline" size="sm" onClick={addPresetCol} className="gap-2">
                                    <Plus className="h-3 w-3" /> Add column
                                </Button>
                            </div>
                            <div className="flex justify-end gap-2 pt-1">
                                <Button type="button" variant="ghost" size="sm"
                                    onClick={() => setCreatingPreset(false)} disabled={savingPreset}>
                                    Cancel
                                </Button>
                                <Button type="button" size="sm" onClick={handleCreatePreset}
                                    disabled={savingPreset} className="gap-2">
                                    {savingPreset && <Loader2 className="h-3 w-3 animate-spin" />}
                                    Save Template
                                </Button>
                            </div>
                        </div>
                    )}

                    {/* Rows + values grid */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <Label className="text-sm font-medium">Sizes & Measurements</Label>
                            {derivedRows.length > 0 && !hadChart && (
                                <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                                    <Sparkles className="h-3 w-3" />
                                    Prefilled from {derivedRows.length} product size(s)
                                </span>
                            )}
                        </div>

                        {columns.length === 0 ? (
                            <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                                Select or create a template above to define measurement columns.
                            </div>
                        ) : (
                            <div className="overflow-x-auto rounded-lg border">
                                <table className="w-full text-sm">
                                    <thead className="bg-muted/50">
                                        <tr>
                                            <th className="text-left font-medium px-3 py-2 w-[140px]">Size</th>
                                            {columns.map((c) => (
                                                <th key={c.key} className="text-left font-medium px-3 py-2">
                                                    {c.label}
                                                </th>
                                            ))}
                                            <th className="w-[90px]" />
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {rows.map((row, index) => (
                                            <tr key={row.id} className="border-t">
                                                <td className="px-2 py-1.5">
                                                    <Input
                                                        value={row.label}
                                                        onChange={(e) => updateRowLabel(row.id, e.target.value)}
                                                        placeholder="Size"
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
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {columns.length > 0 && (
                            <Button type="button" variant="outline" size="sm" onClick={addRow} className="gap-2">
                                <Plus className="h-3 w-3" /> Add size row
                            </Button>
                        )}
                    </div>
                </div>

                <DialogFooter className="flex-row justify-between sm:justify-between">
                    <div>
                        {hadChart && (
                            <Button type="button" variant="outline" onClick={handleClear} disabled={busy}
                                className="gap-2 text-destructive border-destructive/30 hover:bg-destructive/10">
                                {isClearing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                Remove Chart
                            </Button>
                        )}
                    </div>
                    <div className="flex gap-2">
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
                            Cancel
                        </Button>
                        <Button type="button" onClick={handleSave} disabled={busy} className="gap-2">
                            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                            Save Chart
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}