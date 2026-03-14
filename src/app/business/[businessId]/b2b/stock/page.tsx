'use client';

// /business/[businessId]/b2b/stock/page.tsx

import React, { useState, useEffect, useMemo } from 'react';
import { useBusinessContext } from '../../layout';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { RawMaterial } from '@/types/b2b';
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
    Card, CardContent,
} from '@/components/ui/card';
import {
    Boxes, Plus, Search, X, Loader2,
    AlertTriangle, TrendingUp, TrendingDown,
    ArrowUpDown, PackagePlus,
} from 'lucide-react';

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

function stockHealthColor(mat: RawMaterial): string {
    if (mat.availableStock <= 0) return 'text-red-600';
    if (mat.availableStock <= mat.reorderLevel) return 'text-amber-600';
    return 'text-emerald-600';
}

function stockHealthBg(mat: RawMaterial): string {
    if (mat.availableStock <= 0) return 'bg-red-500';
    if (mat.availableStock <= mat.reorderLevel) return 'bg-amber-500';
    return 'bg-emerald-500';
}

const rowVariants = {
    hidden:  { opacity: 0, y: 8 },
    visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.03, duration: 0.2 } }),
};

// ─────────────────────────────────────────────
// ADD STOCK DIALOG
// ─────────────────────────────────────────────

interface AddStockDialogProps {
    open: boolean;
    onClose: () => void;
    material: RawMaterial | null;
    businessId: string;
    user: any;
    adjust?: boolean;
}

function StockDialog({ open, onClose, material, businessId, user, adjust = false }: AddStockDialogProps) {
    const [quantity, setQuantity]   = useState('');
    const [referenceId, setRef]     = useState('');
    const [note, setNote]           = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (open) { setQuantity(''); setRef(''); setNote(''); }
    }, [open]);

    const handleSubmit = async () => {
        if (!material || !user) return;
        const qty = parseFloat(quantity);
        if (isNaN(qty) || qty === 0) {
            toast({ title: 'Invalid quantity', variant: 'destructive' }); return;
        }
        if (!adjust && qty <= 0) {
            toast({ title: 'Quantity must be positive', variant: 'destructive' }); return;
        }
        if (!adjust && !referenceId.trim()) {
            toast({ title: 'Reference ID required', variant: 'destructive' }); return;
        }
        if (adjust && !note.trim()) {
            toast({ title: 'Note is required for adjustments', variant: 'destructive' }); return;
        }

        setIsSubmitting(true);
        try {
            const token = await user.getIdToken();
            const endpoint = adjust ? '/api/business/b2b/adjust-stock' : '/api/business/b2b/add-stock';
            const payload: Record<string, unknown> = {
                businessId,
                materialId: material.id,
                quantity: qty,
                createdBy: user.displayName || user.email || 'Unknown',
            };
            if (!adjust) payload.referenceId = referenceId.trim();
            payload.note = note.trim() || null;

            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify(payload),
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.error || 'Failed');
            toast({ title: adjust ? 'Stock Adjusted' : 'Stock Added', description: `${material.name} updated successfully.` });
            onClose();
        } catch (err) {
            toast({ title: 'Error', description: (err as Error).message, variant: 'destructive' });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={o => !o && onClose()}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{adjust ? 'Adjust Stock' : 'Add Stock'}</DialogTitle>
                    <DialogDescription>
                        {material?.name} · Current: <span className="font-mono font-medium">{material?.availableStock} {material?.unit}</span>
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
                    <div className="space-y-2">
                        <Label className="text-xs">
                            Quantity ({material?.unit})
                            {adjust && <span className="text-muted-foreground ml-1">(negative to reduce)</span>}
                            <span className="text-destructive ml-1">*</span>
                        </Label>
                        <Input
                            type="number"
                            placeholder={adjust ? 'e.g. -50 or +100' : 'e.g. 500'}
                            value={quantity}
                            onChange={e => setQuantity(e.target.value)}
                            step="0.01"
                        />
                    </div>
                    {!adjust && (
                        <div className="space-y-2">
                            <Label className="text-xs">Reference ID / PO Number <span className="text-destructive">*</span></Label>
                            <Input
                                placeholder="e.g. PO-2024-001"
                                value={referenceId}
                                onChange={e => setRef(e.target.value)}
                            />
                        </div>
                    )}
                    <div className="space-y-2">
                        <Label className="text-xs">Note {adjust && <span className="text-destructive">*</span>}</Label>
                        <Input
                            placeholder={adjust ? 'Reason for adjustment (required)' : 'Optional note'}
                            value={note}
                            onChange={e => setNote(e.target.value)}
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button onClick={handleSubmit} disabled={isSubmitting} className="gap-2">
                        {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                        {adjust ? 'Apply Adjustment' : 'Add Stock'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// ─────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────

export default function StockPage() {
    const { businessId, user, isAuthorized, loading: authLoading } = useBusinessContext();

    const [materials, setMaterials] = useState<RawMaterial[]>([]);
    const [loading, setLoading]     = useState(true);
    const [search, setSearch]       = useState('');
    const [sortField, setSortField] = useState<keyof RawMaterial>('name');
    const [sortDir, setSortDir]     = useState<'asc' | 'desc'>('asc');

    const [addStockTarget, setAddStockTarget]       = useState<RawMaterial | null>(null);
    const [adjustStockTarget, setAdjustStockTarget] = useState<RawMaterial | null>(null);

    // Create raw material
    const [createOpen, setCreateOpen]   = useState(false);
    const [isCreating, setIsCreating]   = useState(false);
    const [createForm, setCreateForm]   = useState({
        name: '', sku: '', unit: '', category: '', reorderLevel: '', supplierName: '',
    });

    const handleCreate = async () => {
        if (!user) return;
        const { name, sku, unit, category, reorderLevel, supplierName } = createForm;
        if (!name.trim() || !sku.trim() || !unit.trim() || !category.trim() || !reorderLevel) {
            toast({ title: 'Fill all required fields', variant: 'destructive' }); return;
        }
        const level = parseFloat(reorderLevel);
        if (isNaN(level) || level < 0) {
            toast({ title: 'Invalid reorder level', variant: 'destructive' }); return;
        }
        setIsCreating(true);
        try {
            const token = await user.getIdToken();
            const res = await fetch('/api/business/b2b/create-raw-material', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({
                    businessId,
                    name: name.trim(),
                    sku: sku.trim().toUpperCase(),
                    unit: unit.trim(),
                    category: category.trim(),
                    reorderLevel: level,
                    supplierName: supplierName.trim() || undefined,
                    createdBy: user.displayName || user.email || 'Unknown',
                }),
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.error || 'Failed');
            toast({ title: 'Raw Material Created', description: name });
            setCreateOpen(false);
            setCreateForm({ name: '', sku: '', unit: '', category: '', reorderLevel: '', supplierName: '' });
        } catch (err) {
            toast({ title: 'Error', description: (err as Error).message, variant: 'destructive' });
        } finally {
            setIsCreating(false);
        }
    };

    // ── Firestore listener ──────────────────────────────────────────────────
    useEffect(() => {
        if (!isAuthorized || !businessId) return;

        const q = query(collection(db, 'users', businessId, 'raw_materials'), orderBy('name'));
        const unsub = onSnapshot(q, snap => {
            setMaterials(snap.docs.map(d => ({ id: d.id, ...d.data() } as RawMaterial)));
            setLoading(false);
        }, err => {
            console.error('materials snapshot error:', err);
            setLoading(false);
        });
        return () => unsub();
    }, [businessId, isAuthorized]);

    // ── Derived ─────────────────────────────────────────────────────────────
    const filtered = useMemo(() => {
        let result = [...materials].filter(m =>
            !search ||
            m.name.toLowerCase().includes(search.toLowerCase()) ||
            m.sku.toLowerCase().includes(search.toLowerCase()) ||
            m.category.toLowerCase().includes(search.toLowerCase())
        );
        result.sort((a, b) => {
            const av = a[sortField] as any;
            const bv = b[sortField] as any;
            if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
            return sortDir === 'asc' ? av - bv : bv - av;
        });
        return result;
    }, [materials, search, sortField, sortDir]);

    const handleSort = (field: keyof RawMaterial) => {
        if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        else { setSortField(field); setSortDir('asc'); }
    };

    const lowStockCount = materials.filter(m => m.availableStock > 0 && m.availableStock <= m.reorderLevel).length;
    const outOfStockCount = materials.filter(m => m.availableStock <= 0).length;
    const totalReserved = materials.reduce((s, m) => s + m.reservedStock, 0);

    if (authLoading) return <div className="flex items-center justify-center h-64"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
    if (!isAuthorized) return null;

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <motion.div
                initial={{ opacity: 0, y: -16 }}
                animate={{ opacity: 1, y: 0 }}
                className="shrink-0 p-4 md:p-6 border-b bg-gradient-to-r from-background to-muted/20"
            >
                <div className="flex items-center justify-between gap-4 mb-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-xl bg-primary/10 ring-1 ring-primary/20">
                            <Boxes className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold">Raw Materials</h1>
                            <p className="text-xs text-muted-foreground">{materials.length} materials tracked</p>
                        </div>
                    </div>
                    <Button onClick={() => setCreateOpen(true)} className="gap-2 shadow-sm shadow-primary/20">
                        <Plus className="h-4 w-4" /> Add Material
                    </Button>
                </div>

                {/* Stats row */}
                <div className="grid grid-cols-3 gap-3 mb-4">
                    {[
                        { label: 'Low Stock',    value: lowStockCount,  color: 'text-amber-600', bg: 'bg-amber-50 border-amber-200' },
                        { label: 'Out of Stock', value: outOfStockCount, color: 'text-red-600',   bg: 'bg-red-50 border-red-200'   },
                        { label: 'Total Reserved', value: `${totalReserved.toFixed(0)} units`, color: 'text-primary', bg: 'bg-primary/5 border-primary/20' },
                    ].map(stat => (
                        <Card key={stat.label} className={cn('border', stat.bg)}>
                            <CardContent className="p-3">
                                <p className="text-xs text-muted-foreground">{stat.label}</p>
                                <p className={cn('text-lg font-bold mt-0.5', stat.color)}>{stat.value}</p>
                            </CardContent>
                        </Card>
                    ))}
                </div>

                {/* Search */}
                <div className="relative max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search by name, SKU, category..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="pl-9 h-9"
                    />
                    {search && (
                        <Button variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7" onClick={() => setSearch('')}>
                            <X className="h-3 w-3" />
                        </Button>
                    )}
                </div>
            </motion.div>

            {/* Table */}
            <div className="flex-1 overflow-auto">
                {loading ? (
                    <div className="p-6 space-y-3">
                        {Array.from({ length: 6 }).map((_, i) => (
                            <div key={i} className="flex items-center gap-4">
                                <Skeleton className="h-5 w-32" />
                                <Skeleton className="h-5 w-20" />
                                <Skeleton className="h-5 w-48 ml-auto" />
                                <Skeleton className="h-6 w-16 rounded-full" />
                            </div>
                        ))}
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-center">
                        <Boxes className="h-12 w-12 text-muted-foreground/30 mb-3" />
                        <h3 className="font-medium text-muted-foreground">No materials found</h3>
                    </div>
                ) : (
                    <Table>
                        <TableHeader className="sticky top-0 bg-card z-10">
                            <TableRow>
                                <TableHead>
                                    <Button variant="ghost" size="sm" className="-ml-3 h-8 gap-1 font-semibold" onClick={() => handleSort('name')}>
                                        Material <ArrowUpDown className="h-3 w-3" />
                                    </Button>
                                </TableHead>
                                <TableHead>Category</TableHead>
                                <TableHead className="text-right">
                                    <Button variant="ghost" size="sm" className="h-8 gap-1 font-semibold" onClick={() => handleSort('totalStock')}>
                                        Total <ArrowUpDown className="h-3 w-3" />
                                    </Button>
                                </TableHead>
                                <TableHead className="text-right">Reserved</TableHead>
                                <TableHead className="text-right">
                                    <Button variant="ghost" size="sm" className="h-8 gap-1 font-semibold" onClick={() => handleSort('availableStock')}>
                                        Available <ArrowUpDown className="h-3 w-3" />
                                    </Button>
                                </TableHead>
                                <TableHead className="w-48">Health</TableHead>
                                <TableHead className="w-32">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            <AnimatePresence mode="popLayout">
                                {filtered.map((mat, i) => {
                                    const pct = mat.totalStock > 0
                                        ? Math.round((mat.availableStock / mat.totalStock) * 100)
                                        : 0;
                                    const isLow = mat.availableStock > 0 && mat.availableStock <= mat.reorderLevel;
                                    const isOut = mat.availableStock <= 0;

                                    return (
                                        <motion.tr
                                            key={mat.id}
                                            custom={i}
                                            variants={rowVariants}
                                            initial="hidden"
                                            animate="visible"
                                            exit={{ opacity: 0 }}
                                            layout
                                            className="group border-b hover:bg-muted/40 transition-colors"
                                        >
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                    {(isOut || isLow) && (
                                                        <AlertTriangle className={cn('h-3.5 w-3.5 shrink-0', isOut ? 'text-red-500' : 'text-amber-500')} />
                                                    )}
                                                    <div>
                                                        <p className="font-medium text-sm">{mat.name}</p>
                                                        <p className="text-xs text-muted-foreground font-mono">{mat.sku}</p>
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="secondary" className="text-xs font-normal">{mat.category}</Badge>
                                            </TableCell>
                                            <TableCell className="text-right font-mono text-sm">
                                                {mat.totalStock.toLocaleString()} <span className="text-muted-foreground text-xs">{mat.unit}</span>
                                            </TableCell>
                                            <TableCell className="text-right font-mono text-sm text-muted-foreground">
                                                {mat.reservedStock.toLocaleString()} <span className="text-xs">{mat.unit}</span>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <span className={cn('font-mono text-sm font-semibold', stockHealthColor(mat))}>
                                                    {mat.availableStock.toLocaleString()} {mat.unit}
                                                </span>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                    <div className="h-2 flex-1 rounded-full bg-muted overflow-hidden">
                                                        <div
                                                            className={cn('h-full rounded-full transition-all', stockHealthBg(mat))}
                                                            style={{ width: `${pct}%` }}
                                                        />
                                                    </div>
                                                    <span className="text-xs text-muted-foreground w-8 text-right">{pct}%</span>
                                                </div>
                                                {isOut && <p className="text-[10px] text-red-600 mt-0.5">Out of stock</p>}
                                                {isLow && <p className="text-[10px] text-amber-600 mt-0.5">Below reorder ({mat.reorderLevel})</p>}
                                            </TableCell>
                                            <TableCell onClick={e => e.stopPropagation()}>
                                                <div className="flex items-center gap-1">
                                                    <Button
                                                        variant="outline" size="sm"
                                                        className="h-7 text-xs px-2 gap-1"
                                                        onClick={() => setAddStockTarget(mat)}
                                                    >
                                                        <TrendingUp className="h-3 w-3" /> Add
                                                    </Button>
                                                    <Button
                                                        variant="ghost" size="sm"
                                                        className="h-7 text-xs px-2 gap-1"
                                                        onClick={() => setAdjustStockTarget(mat)}
                                                    >
                                                        <TrendingDown className="h-3 w-3" /> Adjust
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </motion.tr>
                                    );
                                })}
                            </AnimatePresence>
                        </TableBody>
                    </Table>
                )}
            </div>

            {/* Create Raw Material Dialog */}
            <Dialog open={createOpen} onOpenChange={o => !o && setCreateOpen(false)}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <PackagePlus className="h-5 w-5 text-primary" />
                            Add Raw Material
                        </DialogTitle>
                        <DialogDescription>Stock starts at zero. Use Add Stock after creation.</DialogDescription>
                    </DialogHeader>
                    <div className="grid grid-cols-2 gap-4 py-2">
                        <div className="col-span-2 space-y-2">
                            <Label className="text-xs">Material Name <span className="text-destructive">*</span></Label>
                            <Input placeholder="e.g. White Cotton Fabric"
                                value={createForm.name} onChange={e => setCreateForm(f => ({ ...f, name: e.target.value }))} />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs">SKU <span className="text-destructive">*</span></Label>
                            <Input placeholder="e.g. FAB-WHT-001" className="font-mono"
                                value={createForm.sku} onChange={e => setCreateForm(f => ({ ...f, sku: e.target.value.toUpperCase() }))} />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs">Unit <span className="text-destructive">*</span></Label>
                            <Input placeholder="e.g. metres, kg, pieces"
                                value={createForm.unit} onChange={e => setCreateForm(f => ({ ...f, unit: e.target.value }))} />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs">Category <span className="text-destructive">*</span></Label>
                            <Input placeholder="e.g. Fabric, Thread, Trim"
                                value={createForm.category} onChange={e => setCreateForm(f => ({ ...f, category: e.target.value }))} />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs">Reorder Level <span className="text-destructive">*</span></Label>
                            <Input type="number" min="0" placeholder="e.g. 100"
                                value={createForm.reorderLevel} onChange={e => setCreateForm(f => ({ ...f, reorderLevel: e.target.value }))} />
                        </div>
                        <div className="col-span-2 space-y-2">
                            <Label className="text-xs">Supplier Name</Label>
                            <Input placeholder="e.g. Sharma Textiles (optional)"
                                value={createForm.supplierName} onChange={e => setCreateForm(f => ({ ...f, supplierName: e.target.value }))} />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
                        <Button onClick={handleCreate} disabled={isCreating} className="gap-2">
                            {isCreating && <Loader2 className="h-4 w-4 animate-spin" />}
                            Add Material
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Add / Adjust Stock Dialogs */}
            <StockDialog
                open={!!addStockTarget}
                onClose={() => setAddStockTarget(null)}
                material={addStockTarget}
                businessId={businessId}
                user={user}
                adjust={false}
            />
            <StockDialog
                open={!!adjustStockTarget}
                onClose={() => setAdjustStockTarget(null)}
                material={adjustStockTarget}
                businessId={businessId}
                user={user}
                adjust={true}
            />
        </div>
    );
}