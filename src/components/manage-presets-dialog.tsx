'use client';

import React, { useState } from 'react';
import { User } from 'firebase/auth';
import {
    Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
    Ruler, Plus, X, Trash2, Loader2, PackageOpen, Pencil,
} from 'lucide-react';
import { SizeChartPresetDoc } from '@/types/warehouse';
import { useSizeChartPresets } from '@/hooks/use-size-chart-presets';
import { DefaultGridEditor, GridRow, buildDefaultGridPayload } from '@/components/default-grid-editor';

// Local stable id for default-grid rows
let _uid = 0;
const guid = () => `mp_${++_uid}`;

interface ManagePresetsDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    businessId: string;
    user: User | null | undefined;
}

export function ManagePresetsDialog({
    open, onOpenChange, businessId, user,
}: ManagePresetsDialogProps) {
    const { toast } = useToast();
    const { presets, loading } = useSizeChartPresets(businessId);

    // Editor state — shared by create and edit. editingId === null means "create".
    const [editorOpen, setEditorOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [name, setName] = useState('');
    const [cols, setCols] = useState<string[]>(['']);
    const [gridRows, setGridRows] = useState<GridRow[]>([]);
    const [gridValues, setGridValues] = useState<Record<string, Record<string, string>>>({});
    const [saving, setSaving] = useState(false);

    const [toDelete, setToDelete] = useState<SizeChartPresetDoc | null>(null);
    const [deleting, setDeleting] = useState(false);

    const resetEditor = () => {
        setEditorOpen(false);
        setEditingId(null);
        setName('');
        setCols(['']);
        setGridRows([]);
        setGridValues({});
    };

    const openCreate = () => {
        setEditingId(null);
        setName('');
        setCols(['']);
        setGridRows([]);
        setGridValues({});
        setEditorOpen(true);
    };

    const openEdit = (p: SizeChartPresetDoc) => {
        setEditingId(p.id);
        setName(p.name);
        setCols(p.columns.length ? p.columns.map((c) => c.label) : ['']);
        // Seed grid rows/values from the preset. Values are keyed by row label + col key;
        // DefaultGridEditor wants row.id-keyed values, so remap onto fresh local ids.
        const localRows: GridRow[] = (p.rows ?? []).map((label) => ({ id: guid(), label }));
        setGridRows(localRows);
        const v: Record<string, Record<string, string>> = {};
        for (const r of localRows) {
            v[r.id] = { ...(p.values?.[r.label] ?? {}) };
        }
        setGridValues(v);
        setEditorOpen(true);
    };

    const handleSave = async () => {
        const n = name.trim();
        const c = cols.map((x) => x.trim()).filter(Boolean);
        if (!n) { toast({ title: 'Name required', variant: 'destructive' }); return; }
        if (c.length === 0) { toast({ title: 'Add at least one column', variant: 'destructive' }); return; }
        if (!user) return;

        setSaving(true);
        try {
            const idToken = await user.getIdToken();
            // DefaultGridEditor keys values by row.id; buildDefaultGridPayload reprojects
            // them to row-label + col-key, which is what the API stores.
            const grid = buildDefaultGridPayload(cols, gridRows, gridValues);

            const endpoint = editingId
                ? '/api/business/parent-products/presets/update'
                : '/api/business/parent-products/presets/create';
            const body = editingId
                ? { businessId, presetId: editingId, name: n, columns: c.map((label) => ({ label })), rows: grid.rows, values: grid.values }
                : { businessId, name: n, columns: c.map((label) => ({ label })), rows: grid.rows, values: grid.values };

            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
                body: JSON.stringify(body),
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.message || 'Failed to save preset');

            toast({
                title: editingId ? 'Template updated' : 'Template created',
                description: `"${n}" saved.`,
            });
            resetEditor();
        } catch (err) {
            toast({
                title: 'Error',
                description: err instanceof Error ? err.message : 'Failed to save preset.',
                variant: 'destructive',
            });
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!toDelete || !user) return;
        setDeleting(true);
        try {
            const idToken = await user.getIdToken();
            const res = await fetch('/api/business/parent-products/presets/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
                body: JSON.stringify({ businessId, presetId: toDelete.id }),
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.message || 'Failed to delete preset');
            toast({ title: 'Template deleted', description: `"${toDelete.name}" removed.` });
            setToDelete(null);
            // If we were editing the one just deleted, close the editor.
            if (editingId === toDelete.id) resetEditor();
        } catch (err) {
            toast({
                title: 'Error',
                description: err instanceof Error ? err.message : 'Failed to delete preset.',
                variant: 'destructive',
            });
        } finally {
            setDeleting(false);
        }
    };

    return (
        <>
            <Dialog open={open} onOpenChange={(o) => !o && onOpenChange(false)}>
                <DialogContent className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-primary/10">
                                <Ruler className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                                <DialogTitle>Size Chart Templates</DialogTitle>
                                <DialogDescription>
                                    Reusable column sets with optional starter values. Editing a template affects
                                    only future applications — existing charts keep their copied values.
                                </DialogDescription>
                            </div>
                        </div>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                        {/* List */}
                        {loading ? (
                            <div className="py-8 text-center text-sm text-muted-foreground">Loading...</div>
                        ) : presets.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-10 text-center">
                                <PackageOpen className="h-10 w-10 text-muted-foreground/50" />
                                <p className="mt-3 text-sm text-muted-foreground">No templates yet.</p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {presets.map((p) => (
                                    <div key={p.id}
                                        className={`flex items-start justify-between gap-3 rounded-lg border p-3 ${editingId === p.id ? 'ring-1 ring-primary/40 bg-primary/5' : ''}`}>
                                        <div className="space-y-1.5 min-w-0">
                                            <p className="font-medium text-sm">{p.name}</p>
                                            <div className="flex flex-wrap gap-1">
                                                {p.columns.map((c) => (
                                                    <Badge key={c.key} variant="secondary" className="font-normal text-xs">
                                                        {c.label}
                                                    </Badge>
                                                ))}
                                            </div>
                                            {(p.rows?.length ?? 0) > 0 && (
                                                <p className="text-[11px] text-muted-foreground">
                                                    {p.rows.length} default row{p.rows.length === 1 ? '' : 's'}
                                                </p>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-0.5 shrink-0">
                                            <Button variant="ghost" size="icon"
                                                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                                onClick={() => openEdit(p)}>
                                                <Pencil className="h-4 w-4" />
                                            </Button>
                                            <Button variant="ghost" size="icon"
                                                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                                onClick={() => setToDelete(p)}>
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Editor (create OR edit) */}
                        {editorOpen ? (
                            <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                                <p className="text-sm font-semibold">
                                    {editingId ? 'Edit Template' : 'New Template'}
                                </p>

                                <div className="space-y-2">
                                    <Label className="text-sm font-medium">Template Name</Label>
                                    <Input value={name} onChange={(e) => setName(e.target.value)}
                                        placeholder="e.g. Men's Pants" />
                                </div>

                                <div className="space-y-2">
                                    <Label className="text-sm font-medium">Columns</Label>
                                    {cols.map((col, i) => (
                                        <div key={i} className="flex items-center gap-2">
                                            <Input value={col}
                                                onChange={(e) => setCols((prev) => prev.map((c, idx) => idx === i ? e.target.value : c))}
                                                placeholder={`Column ${i + 1}`} />
                                            <Button variant="ghost" size="icon"
                                                className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
                                                onClick={() => setCols((prev) => prev.filter((_, idx) => idx !== i))}
                                                disabled={cols.length === 1}>
                                                <X className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    ))}
                                    <Button variant="outline" size="sm"
                                        onClick={() => setCols((prev) => [...prev, ''])} className="gap-2">
                                        <Plus className="h-3 w-3" /> Add column
                                    </Button>
                                </div>

                                <div className="space-y-2">
                                    <Label className="text-sm font-medium">
                                        Starter Values
                                        <span className="ml-1 text-xs font-normal text-muted-foreground">
                                            (optional — copied in when applied)
                                        </span>
                                    </Label>
                                    <DefaultGridEditor
                                        columnLabels={cols}
                                        rows={gridRows}
                                        setRows={setGridRows}
                                        values={gridValues}
                                        setValues={setGridValues}
                                    />
                                </div>

                                <div className="flex justify-end gap-2">
                                    <Button variant="ghost" size="sm" onClick={resetEditor} disabled={saving}>
                                        Cancel
                                    </Button>
                                    <Button size="sm" onClick={handleSave} disabled={saving} className="gap-2">
                                        {saving && <Loader2 className="h-3 w-3 animate-spin" />}
                                        {editingId ? 'Save Changes' : 'Save Template'}
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            <Button variant="outline" onClick={openCreate} className="w-full gap-2">
                                <Plus className="h-4 w-4" /> New Template
                            </Button>
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Template</AlertDialogTitle>
                        <AlertDialogDescription>
                            Delete <span className="font-semibold">{toDelete?.name}</span>? Existing size charts
                            that used it keep their copied columns and values — only the reusable template is removed.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete} disabled={deleting}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                            {deleting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}