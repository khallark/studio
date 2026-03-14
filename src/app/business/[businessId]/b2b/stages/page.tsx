'use client';

// /business/[businessId]/b2b/stages/page.tsx

import React, { useState, useEffect } from 'react';
import { useBusinessContext } from '../../layout';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { ProductionStageConfig, StageName } from '@/types/b2b';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from '@/hooks/use-toast';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
    Table, TableBody, TableCell, TableHead,
    TableHeader, TableRow,
} from '@/components/ui/table';
import {
    Dialog, DialogContent, DialogHeader,
    DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
    Select, SelectContent, SelectItem,
    SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem,
    DropdownMenuLabel, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Settings2, Plus, Loader2, MoreHorizontal, Pencil } from 'lucide-react';

const ALL_STAGE_NAMES: StageName[] = ['DESIGN','FRAMING','SAMPLING','CUTTING','PRINTING','EMBROIDERY','STITCHING','WASHING','FINISHING','PACKING'];

interface StageForm { name: StageName; label: string; description: string; defaultDurationDays: string; canBeOutsourced: boolean; sortOrder: string; }
const emptyForm = (): StageForm => ({ name: 'CUTTING', label: '', description: '', defaultDurationDays: '7', canBeOutsourced: false, sortOrder: '1' });

export default function StagesPage() {
    const { businessId, user, isAuthorized, loading: authLoading } = useBusinessContext();

    const [stages, setStages]   = useState<ProductionStageConfig[]>([]);
    const [loading, setLoading] = useState(true);

    const [dialogOpen, setDialogOpen]     = useState(false);
    const [editing, setEditing]           = useState<ProductionStageConfig | null>(null);
    const [form, setForm]                 = useState<StageForm>(emptyForm());
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (!isAuthorized || !businessId) return;
        const q = query(collection(db, 'users', businessId, 'production_stage_config'), orderBy('sortOrder'));
        const unsub = onSnapshot(q, snap => {
            setStages(snap.docs.map(d => ({ id: d.id, ...d.data() } as ProductionStageConfig)));
            setLoading(false);
        });
        return () => unsub();
    }, [businessId, isAuthorized]);

    const openCreate = () => { setEditing(null); setForm(emptyForm()); setDialogOpen(true); };
    const openEdit = (s: ProductionStageConfig) => {
        setEditing(s);
        setForm({ name: s.name, label: s.label, description: s.description, defaultDurationDays: String(s.defaultDurationDays), canBeOutsourced: s.canBeOutsourced, sortOrder: String(s.sortOrder) });
        setDialogOpen(true);
    };

    const handleSubmit = async () => {
        if (!user) return;
        if (!form.label.trim() || !form.description.trim()) { toast({ title: 'Fill all required fields', variant: 'destructive' }); return; }
        setIsSubmitting(true);
        try {
            const token = await user.getIdToken();
            if (editing) {
                const res = await fetch('/api/business/b2b/update-stage-config', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                    body: JSON.stringify({ businessId, stageId: editing.id, label: form.label, description: form.description, defaultDurationDays: parseInt(form.defaultDurationDays) || 7, canBeOutsourced: form.canBeOutsourced, sortOrder: parseInt(form.sortOrder) || 1 }),
                });
                const r = await res.json();
                if (!res.ok) throw new Error(r.error || 'Failed');
            } else {
                const res = await fetch('/api/business/b2b/create-stage-config', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                    body: JSON.stringify({ businessId, name: form.name, label: form.label, description: form.description, defaultDurationDays: parseInt(form.defaultDurationDays) || 7, canBeOutsourced: form.canBeOutsourced, sortOrder: parseInt(form.sortOrder) || 1 }),
                });
                const r = await res.json();
                if (!res.ok) throw new Error(r.error || 'Failed');
            }
            toast({ title: editing ? 'Stage Updated' : 'Stage Created' });
            setDialogOpen(false);
        } catch (err) {
            toast({ title: 'Error', description: (err as Error).message, variant: 'destructive' });
        } finally {
            setIsSubmitting(false);
        }
    };

    if (authLoading) return <div className="flex items-center justify-center h-64"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
    if (!isAuthorized) return null;

    return (
        <div className="flex flex-col h-full">
            <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }}
                className="flex items-center justify-between gap-4 p-4 md:p-6 border-b bg-gradient-to-r from-background to-muted/20">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-primary/10 ring-1 ring-primary/20">
                        <Settings2 className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold">Stage Config</h1>
                        <p className="text-xs text-muted-foreground">{stages.length} stages configured</p>
                    </div>
                </div>
                <Button onClick={openCreate} className="gap-2 shadow-sm shadow-primary/20">
                    <Plus className="h-4 w-4" /> Add Stage
                </Button>
            </motion.div>

            <div className="flex-1 overflow-auto">
                {loading ? (
                    <div className="p-6 space-y-3">
                        {Array.from({ length: 5 }).map((_, i) => <div key={i} className="flex gap-4"><Skeleton className="h-5 w-24" /><Skeleton className="h-5 w-40" /><Skeleton className="h-5 w-16" /></div>)}
                    </div>
                ) : stages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-center">
                        <Settings2 className="h-12 w-12 text-muted-foreground/30 mb-3" />
                        <h3 className="font-medium text-muted-foreground">No stages configured yet</h3>
                        <p className="text-xs text-muted-foreground/70 mt-1">Add stage configurations for the lot pipeline picker UI</p>
                        <Button className="mt-4 gap-2" onClick={openCreate}><Plus className="h-4 w-4" />Add First Stage</Button>
                    </div>
                ) : (
                    <Table>
                        <TableHeader className="sticky top-0 bg-card z-10">
                            <TableRow>
                                <TableHead className="w-16">Order</TableHead>
                                <TableHead>Stage Name</TableHead>
                                <TableHead>Label</TableHead>
                                <TableHead>Description</TableHead>
                                <TableHead className="text-center">Default Days</TableHead>
                                <TableHead className="text-center">Outsourceable</TableHead>
                                <TableHead className="w-10" />
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            <AnimatePresence mode="popLayout">
                                {stages.map((stage, i) => (
                                    <motion.tr key={stage.id}
                                        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0, transition: { delay: i * 0.04 } }}
                                        exit={{ opacity: 0 }} layout
                                        className="group border-b hover:bg-muted/40 transition-colors">
                                        <TableCell className="font-mono text-center text-muted-foreground">{stage.sortOrder}</TableCell>
                                        <TableCell><Badge variant="outline" className="text-xs font-mono">{stage.name}</Badge></TableCell>
                                        <TableCell className="font-medium text-sm">{stage.label}</TableCell>
                                        <TableCell className="text-sm text-muted-foreground max-w-xs truncate">{stage.description}</TableCell>
                                        <TableCell className="text-center font-mono text-sm">{stage.defaultDurationDays}d</TableCell>
                                        <TableCell className="text-center">
                                            <Badge variant={stage.canBeOutsourced ? 'success' : 'secondary'} className="text-xs">
                                                {stage.canBeOutsourced ? 'Yes' : 'No'}
                                            </Badge>
                                        </TableCell>
                                        <TableCell onClick={e => e.stopPropagation()}>
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <MoreHorizontal className="h-4 w-4" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                                    <DropdownMenuItem onClick={() => openEdit(stage)} className="gap-2"><Pencil className="h-4 w-4" />Edit</DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </TableCell>
                                    </motion.tr>
                                ))}
                            </AnimatePresence>
                        </TableBody>
                    </Table>
                )}
            </div>

            <Dialog open={dialogOpen} onOpenChange={o => !o && setDialogOpen(false)}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>{editing ? 'Edit Stage' : 'Add Stage'}</DialogTitle>
                        <DialogDescription>
                            {editing
                                ? 'Stage name cannot be changed — it is referenced by existing lots.'
                                : 'Configure a production stage for the lot pipeline picker.'}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        {!editing && (
                            <div className="space-y-2">
                                <Label className="text-xs">Stage Name <span className="text-destructive">*</span></Label>
                                <Select value={form.name} onValueChange={v => setForm(f => ({ ...f, name: v as StageName }))}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>{ALL_STAGE_NAMES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                                </Select>
                            </div>
                        )}
                        {editing && (
                            <div className="p-3 rounded-lg bg-muted/50 text-sm">
                                <span className="text-muted-foreground">Stage: </span>
                                <Badge variant="outline" className="font-mono">{editing.name}</Badge>
                            </div>
                        )}
                        <div className="space-y-2">
                            <Label className="text-xs">Display Label <span className="text-destructive">*</span></Label>
                            <Input placeholder="e.g. Fabric Cutting" value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs">Description <span className="text-destructive">*</span></Label>
                            <Textarea placeholder="Brief description of this stage" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-xs">Default Duration (days)</Label>
                                <Input type="number" min="1" placeholder="7" value={form.defaultDurationDays} onChange={e => setForm(f => ({ ...f, defaultDurationDays: e.target.value }))} />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-xs">Sort Order</Label>
                                <Input type="number" min="1" placeholder="1" value={form.sortOrder} onChange={e => setForm(f => ({ ...f, sortOrder: e.target.value }))} />
                            </div>
                        </div>
                        <div className="flex items-center justify-between">
                            <Label className="text-xs">Can Be Outsourced</Label>
                            <Switch checked={form.canBeOutsourced} onCheckedChange={v => setForm(f => ({ ...f, canBeOutsourced: v }))} />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                        <Button onClick={handleSubmit} disabled={isSubmitting} className="gap-2">
                            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                            {editing ? 'Save Changes' : 'Add Stage'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}