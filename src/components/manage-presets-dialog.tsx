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
    Ruler, Plus, X, Trash2, Loader2, PackageOpen,
} from 'lucide-react';
import { SizeChartPresetDoc } from '@/types/warehouse';
import { useSizeChartPresets } from '@/hooks/use-size-chart-presets';

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

    const [creating, setCreating] = useState(false);
    const [name, setName] = useState('');
    const [cols, setCols] = useState<string[]>(['']);
    const [saving, setSaving] = useState(false);

    const [toDelete, setToDelete] = useState<SizeChartPresetDoc | null>(null);
    const [deleting, setDeleting] = useState(false);

    const resetCreate = () => {
        setCreating(false);
        setName('');
        setCols(['']);
    };

    const handleCreate = async () => {
        const n = name.trim();
        const c = cols.map((x) => x.trim()).filter(Boolean);
        if (!n) { toast({ title: 'Name required', variant: 'destructive' }); return; }
        if (c.length === 0) { toast({ title: 'Add at least one column', variant: 'destructive' }); return; }
        if (!user) return;

        setSaving(true);
        try {
            const idToken = await user.getIdToken();
            const res = await fetch('/api/business/parent-products/presets/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
                body: JSON.stringify({ businessId, name: n, columns: c.map((label) => ({ label })) }),
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.message || 'Failed to create preset');
            toast({ title: 'Preset created', description: `"${n}" added.` });
            resetCreate();
        } catch (err) {
            toast({
                title: 'Error',
                description: err instanceof Error ? err.message : 'Failed to create preset.',
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
            toast({ title: 'Preset deleted', description: `"${toDelete.name}" removed.` });
            setToDelete(null);
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
                <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-primary/10">
                                <Ruler className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                                <DialogTitle>Size Chart Templates</DialogTitle>
                                <DialogDescription>
                                    Reusable column sets. To change one, create a new template and delete the old.
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
                                        className="flex items-start justify-between gap-3 rounded-lg border p-3">
                                        <div className="space-y-1.5 min-w-0">
                                            <p className="font-medium text-sm">{p.name}</p>
                                            <div className="flex flex-wrap gap-1">
                                                {p.columns.map((c) => (
                                                    <Badge key={c.key} variant="secondary" className="font-normal text-xs">
                                                        {c.label}
                                                    </Badge>
                                                ))}
                                            </div>
                                        </div>
                                        <Button variant="ghost" size="icon"
                                            className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                                            onClick={() => setToDelete(p)}>
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Create */}
                        {creating ? (
                            <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
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
                                <div className="flex justify-end gap-2">
                                    <Button variant="ghost" size="sm" onClick={resetCreate} disabled={saving}>
                                        Cancel
                                    </Button>
                                    <Button size="sm" onClick={handleCreate} disabled={saving} className="gap-2">
                                        {saving && <Loader2 className="h-3 w-3 animate-spin" />}
                                        Save Template
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            <Button variant="outline" onClick={() => setCreating(true)} className="w-full gap-2">
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
                            that used it keep their copied columns — only the reusable template is removed.
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