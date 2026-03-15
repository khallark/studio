'use client';

// /business/[businessId]/b2b/bom/page.tsx

import React, { useState, useEffect, useMemo } from 'react';
import { useBusinessContext } from '../../layout';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { BOMEntry, Product, ProductionStageConfig, RawMaterial, StageName } from '@/types/b2b';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
    Table, TableBody, TableCell, TableHead,
    TableHeader, TableRow,
} from '@/components/ui/table';
import {
    Dialog, DialogContent, DialogHeader,
    DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel,
    AlertDialogContent, AlertDialogDescription,
    AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
    Select, SelectContent, SelectItem,
    SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem,
    DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    Layers, Plus, Search, X, Loader2,
    MoreHorizontal, Pencil, Trash2, Package, Boxes,
} from 'lucide-react';

interface BOMForm { productId: string; materialId: string; quantityPerPiece: string; wastagePercent: string; consumedAtStage: StageName; }
const emptyForm = (): BOMForm => ({ productId: '', materialId: '', quantityPerPiece: '', wastagePercent: '5', consumedAtStage: 'CUTTING' });

export default function BOMPage() {
    const { businessId, user, isAuthorized, loading: authLoading } = useBusinessContext();

    const [entries, setEntries]   = useState<BOMEntry[]>([]);
    const [stageConfigs, setStageConfigs] = useState<ProductionStageConfig[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [materials, setMaterials] = useState<RawMaterial[]>([]);
    const [loading, setLoading]   = useState(true);
    const [search, setSearch]     = useState('');
    const [filterProduct, setFilterProduct] = useState('all');

    const [dialogOpen, setDialogOpen]   = useState(false);
    const [editing, setEditing]         = useState<BOMEntry | null>(null);
    const [form, setForm]               = useState<BOMForm>(emptyForm());
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [deactivateTarget, setDeactivateTarget] = useState<BOMEntry | null>(null);

    useEffect(() => {
        if (!isAuthorized || !businessId) return;
        const q1 = onSnapshot(query(collection(db, 'users', businessId, 'bom'), orderBy('productName')), snap => {
            setEntries(snap.docs.map(d => ({ id: d.id, ...d.data() } as BOMEntry)));
            setLoading(false);
        });
        const q2 = onSnapshot(query(collection(db, 'users', businessId, 'b2bProducts'), orderBy('name')), snap =>
            setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() } as Product))));
        const q3 = onSnapshot(query(collection(db, 'users', businessId, 'raw_materials'), orderBy('name')), snap =>
            setMaterials(snap.docs.map(d => ({ id: d.id, ...d.data() } as RawMaterial))));
        const q4 = onSnapshot(query(collection(db, 'users', businessId, 'production_stage_config'), orderBy('sortOrder')), snap =>
            setStageConfigs(snap.docs.map(d => ({ id: d.id, ...d.data() } as ProductionStageConfig))));
        return () => { q1(); q2(); q3(); q4(); };
    }, [businessId, isAuthorized]);

    const filtered = useMemo(() => entries.filter(e => {
        const matchSearch = !search ||
            e.productName.toLowerCase().includes(search.toLowerCase()) ||
            e.materialName.toLowerCase().includes(search.toLowerCase());
        const matchProduct = filterProduct === 'all' || e.productId === filterProduct;
        return matchSearch && matchProduct;
    }), [entries, search, filterProduct]);

    const openCreate = () => { setEditing(null); setForm(emptyForm()); setDialogOpen(true); };
    const openEdit = (e: BOMEntry) => {
        setEditing(e);
        setForm({ productId: e.productId, materialId: e.materialId, quantityPerPiece: String(e.quantityPerPiece), wastagePercent: String(e.wastagePercent), consumedAtStage: e.consumedAtStage });
        setDialogOpen(true);
    };

    const handleSubmit = async () => {
        if (!user) return;
        const qty = parseFloat(form.quantityPerPiece);
        const wastage = parseFloat(form.wastagePercent);
        if (!editing && !form.productId) { toast({ title: 'Select a product', variant: 'destructive' }); return; }
        if (!editing && !form.materialId) { toast({ title: 'Select a material', variant: 'destructive' }); return; }
        if (isNaN(qty) || qty <= 0) { toast({ title: 'Invalid quantity per piece', variant: 'destructive' }); return; }

        setIsSubmitting(true);
        try {
            const token = await user.getIdToken();
            if (editing) {
                const res = await fetch('/api/business/b2b/update-bom-entry', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                    body: JSON.stringify({ businessId, bomId: editing.id, quantityPerPiece: qty, wastagePercent: isNaN(wastage) ? 0 : wastage, consumedAtStage: form.consumedAtStage }),
                });
                const r = await res.json();
                if (!res.ok) throw new Error(r.error || 'Failed');
            } else {
                const res = await fetch('/api/business/b2b/create-bom-entry', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                    body: JSON.stringify({ businessId, productId: form.productId, materialId: form.materialId, quantityPerPiece: qty, wastagePercent: isNaN(wastage) ? 0 : wastage, consumedAtStage: form.consumedAtStage }),
                });
                const r = await res.json();
                if (!res.ok) throw new Error(r.error || 'Failed');
            }
            toast({ title: editing ? 'BOM Entry Updated' : 'BOM Entry Created' });
            setDialogOpen(false);
        } catch (err) {
            toast({ title: 'Error', description: (err as Error).message, variant: 'destructive' });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDeactivate = async () => {
        if (!deactivateTarget || !user) return;
        try {
            const token = await user.getIdToken();
            const res = await fetch('/api/business/b2b/deactivate-bom-entry', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ businessId, bomId: deactivateTarget.id }),
            });
            const r = await res.json();
            if (!res.ok) throw new Error(r.error || 'Failed');
            toast({ title: 'BOM Entry Deactivated' });
            setDeactivateTarget(null);
        } catch (err) {
            toast({ title: 'Error', description: (err as Error).message, variant: 'destructive' });
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
                        <Layers className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold">BOM Manager</h1>
                        <p className="text-xs text-muted-foreground">{entries.filter(e => e.isActive).length} active entries</p>
                    </div>
                </div>
                <Button onClick={openCreate} className="gap-2 shadow-sm shadow-primary/20">
                    <Plus className="h-4 w-4" /> Add Entry
                </Button>
            </motion.div>

            <div className="shrink-0 p-4 border-b flex gap-3">
                <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Search product or material..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9" />
                    {search && <Button variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7" onClick={() => setSearch('')}><X className="h-3 w-3" /></Button>}
                </div>
                <Select value={filterProduct} onValueChange={setFilterProduct}>
                    <SelectTrigger className="w-48 h-9"><SelectValue placeholder="All products" /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Products</SelectItem>
                        {products.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                    </SelectContent>
                </Select>
            </div>

            <div className="flex-1 overflow-auto">
                {loading ? (
                    <div className="p-6 space-y-3">
                        {Array.from({ length: 5 }).map((_, i) => <div key={i} className="flex gap-4"><Skeleton className="h-5 w-36" /><Skeleton className="h-5 w-32" /><Skeleton className="h-5 w-20" /></div>)}
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-center">
                        <Layers className="h-12 w-12 text-muted-foreground/30 mb-3" />
                        <h3 className="font-medium text-muted-foreground">{search ? 'No entries found' : 'No BOM entries yet'}</h3>
                        {!search && <Button className="mt-4 gap-2" onClick={openCreate}><Plus className="h-4 w-4" />Add First Entry</Button>}
                    </div>
                ) : (
                    <Table>
                        <TableHeader className="sticky top-0 bg-card z-10">
                            <TableRow>
                                <TableHead>Product</TableHead>
                                <TableHead>Material</TableHead>
                                <TableHead className="text-right">Qty / Piece</TableHead>
                                <TableHead className="text-right">Wastage %</TableHead>
                                <TableHead>Consumed At Stage</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="w-10" />
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            <AnimatePresence mode="popLayout">
                                {filtered.map((entry, i) => (
                                    <motion.tr key={entry.id}
                                        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0, transition: { delay: i * 0.03 } }}
                                        exit={{ opacity: 0 }} layout
                                        className={cn('group border-b hover:bg-muted/40 transition-colors', !entry.isActive && 'opacity-50')}>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                <Package className="h-4 w-4 text-muted-foreground shrink-0" />
                                                <div>
                                                    <p className="font-medium text-sm">{entry.productName}</p>
                                                    <p className="text-xs text-muted-foreground font-mono">{entry.productSku}</p>
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                <Boxes className="h-4 w-4 text-muted-foreground shrink-0" />
                                                <span className="text-sm">{entry.materialName}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-right font-mono text-sm">
                                            {entry.quantityPerPiece} <span className="text-xs text-muted-foreground">{entry.materialUnit}</span>
                                        </TableCell>
                                        <TableCell className="text-right font-mono text-sm">{entry.wastagePercent}%</TableCell>
                                        <TableCell><Badge variant="outline" className="text-xs">{entry.consumedAtStage}</Badge></TableCell>
                                        <TableCell>
                                            <Badge variant={entry.isActive ? 'success' : 'secondary'} className="text-xs">
                                                {entry.isActive ? 'Active' : 'Inactive'}
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
                                                    <DropdownMenuItem onClick={() => openEdit(entry)} className="gap-2"><Pencil className="h-4 w-4" />Edit</DropdownMenuItem>
                                                    {entry.isActive && (
                                                        <>
                                                            <DropdownMenuSeparator />
                                                            <DropdownMenuItem onClick={() => setDeactivateTarget(entry)} className="gap-2 text-destructive focus:text-destructive">
                                                                <Trash2 className="h-4 w-4" />Deactivate
                                                            </DropdownMenuItem>
                                                        </>
                                                    )}
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

            {/* Create/Edit Dialog */}
            <Dialog open={dialogOpen} onOpenChange={o => !o && setDialogOpen(false)}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>{editing ? 'Edit BOM Entry' : 'Add BOM Entry'}</DialogTitle>
                        <DialogDescription>Define how much raw material one finished piece requires.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        {!editing && (
                            <>
                                <div className="space-y-2">
                                    <Label className="text-xs">Product <span className="text-destructive">*</span></Label>
                                    <Select value={form.productId} onValueChange={v => setForm(f => ({ ...f, productId: v }))}>
                                        <SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger>
                                        <SelectContent>{products.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-xs">Raw Material <span className="text-destructive">*</span></Label>
                                    <Select value={form.materialId} onValueChange={v => setForm(f => ({ ...f, materialId: v }))}>
                                        <SelectTrigger><SelectValue placeholder="Select material" /></SelectTrigger>
                                        <SelectContent>{materials.map(m => <SelectItem key={m.id} value={m.id}>{m.name} <span className="text-muted-foreground text-xs">({m.unit})</span></SelectItem>)}</SelectContent>
                                    </Select>
                                </div>
                            </>
                        )}
                        {editing && (
                            <div className="p-3 rounded-lg bg-muted/50 text-sm space-y-1">
                                <p><span className="text-muted-foreground">Product:</span> <span className="font-medium">{editing.productName}</span></p>
                                <p><span className="text-muted-foreground">Material:</span> <span className="font-medium">{editing.materialName}</span></p>
                            </div>
                        )}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-xs">Qty per Piece <span className="text-destructive">*</span></Label>
                                <Input type="number" min="0.001" step="0.001" placeholder="e.g. 1.5"
                                    value={form.quantityPerPiece} onChange={e => setForm(f => ({ ...f, quantityPerPiece: e.target.value }))} />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-xs">Wastage %</Label>
                                <Input type="number" min="0" max="100" step="0.1" placeholder="e.g. 5"
                                    value={form.wastagePercent} onChange={e => setForm(f => ({ ...f, wastagePercent: e.target.value }))} />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs">Consumed at Stage <span className="text-destructive">*</span></Label>
                            <Select value={form.consumedAtStage} onValueChange={v => setForm(f => ({ ...f, consumedAtStage: v as StageName }))}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>{stageConfigs.map(s => <SelectItem key={s.name} value={s.name}>{s.label}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                        <Button onClick={handleSubmit} disabled={isSubmitting} className="gap-2">
                            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                            {editing ? 'Save Changes' : 'Add Entry'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Deactivate Confirmation */}
            <AlertDialog open={!!deactivateTarget} onOpenChange={o => !o && setDeactivateTarget(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Deactivate BOM Entry</AlertDialogTitle>
                        <AlertDialogDescription>
                            Deactivate the entry for <span className="font-semibold">{deactivateTarget?.materialName}</span> on <span className="font-semibold">{deactivateTarget?.productName}</span>?
                            It will be ignored by new orders. You can create a new entry to replace it.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDeactivate} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                            Deactivate
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}