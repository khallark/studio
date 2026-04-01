'use client';

// /business/[businessId]/b2b/bom/page.tsx

import React, { useState, useEffect, useMemo } from 'react';
import { useBusinessContext } from '../../layout';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { BOM, BOMStage, Product, ProductionStageConfig, RawMaterial, StageName } from '@/types/b2b';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
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
    Layers, Plus, Search, X, Loader2, Pencil,
    Trash2, Package, Boxes, CheckCircle2, AlertCircle,
} from 'lucide-react';

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────

interface MaterialInput {
    materialId: string;
    quantityPerPiece: string;
    wastagePercent: string;
}

interface StageInput {
    stage: StageName;
    materials: MaterialInput[];
}

function emptyMaterial(): MaterialInput {
    return { materialId: '', quantityPerPiece: '', wastagePercent: '5' };
}

// ─────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────

export default function BOMPage() {
    const { businessId, user, isAuthorized, loading: authLoading } = useBusinessContext();

    const [products, setProducts] = useState<Product[]>([]);
    const [boms, setBoms] = useState<BOM[]>([]);
    const [materials, setMaterials] = useState<RawMaterial[]>([]);
    const [stageConfigs, setStageConfigs] = useState<ProductionStageConfig[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');

    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingProduct, setEditingProduct] = useState<Product | null>(null);
    const [editingBOM, setEditingBOM] = useState<BOM | null>(null);
    const [stages, setStages] = useState<StageInput[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [deactivateTarget, setDeactivateTarget] = useState<BOM | null>(null);

    // ── Firestore listeners ──────────────────────────────────────────────────
    useEffect(() => {
        if (!isAuthorized || !businessId) return;
        const u1 = onSnapshot(query(collection(db, 'users', businessId, 'b2bProducts'), orderBy('name')),
            snap => { setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() } as Product))); setLoading(false); });
        const u2 = onSnapshot(query(collection(db, 'users', businessId, 'bom'), orderBy('productName')),
            snap => setBoms(snap.docs.map(d => ({ id: d.id, ...d.data() } as BOM))));
        const u3 = onSnapshot(query(collection(db, 'users', businessId, 'raw_materials'), orderBy('name')),
            snap => setMaterials(snap.docs.map(d => ({ id: d.id, ...d.data() } as RawMaterial))));
        const u4 = onSnapshot(query(collection(db, 'users', businessId, 'production_stage_config'), orderBy('sortOrder')),
            snap => setStageConfigs(snap.docs.map(d => ({ id: d.id, ...d.data() } as ProductionStageConfig))));
        return () => { u1(); u2(); u3(); u4(); };
    }, [businessId, isAuthorized]);

    // ── Derived ───────────────────────────────────────────────────────────────
    const activeMaterials = useMemo(() => materials.filter(m => m.isActive), [materials]);

    const filtered = useMemo(() => products.filter(p =>
        !search ||
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.sku.toLowerCase().includes(search.toLowerCase())
    ), [products, search]);

    const activeBOMByProduct = useMemo(() => {
        const map: Record<string, BOM> = {};
        boms.filter(b => b.isActive).forEach(b => { map[b.productId] = b; });
        return map;
    }, [boms]);

    // ── Open create/edit dialog ───────────────────────────────────────────────
    const openCreate = (product: Product) => {
        setEditingProduct(product);
        setEditingBOM(null);
        // Seed one stage for each of the product's default stages (or first configured stage)
        const defaultStageInputs: StageInput[] = product.defaultStages.map(s => ({
            stage: s,
            materials: [emptyMaterial()],
        }));
        setStages(defaultStageInputs.length > 0
            ? defaultStageInputs
            : [{ stage: (stageConfigs[0]?.name ?? 'CUTTING') as StageName, materials: [emptyMaterial()] }]);
        setDialogOpen(true);
    };

    const openEdit = (product: Product, bom: BOM) => {
        setEditingProduct(product);
        setEditingBOM(bom);
        setStages(bom.stages.map(s => ({
            stage: s.stage,
            materials: s.materials.map(m => ({
                materialId: m.materialId,
                quantityPerPiece: String(m.quantityPerPiece),
                wastagePercent: String(m.wastagePercent),
            })),
        })));
        setDialogOpen(true);
    };

    // ── Stage / material helpers ──────────────────────────────────────────────
    const addStage = () => {
        const nextStage = stageConfigs.find(sc => !stages.some(s => s.stage === sc.name));
        setStages(prev => [...prev, {
            stage: (nextStage?.name ?? stageConfigs[0]?.name ?? 'CUTTING') as StageName,
            materials: [emptyMaterial()],
        }]);
    };

    const removeStage = (si: number) => {
        setStages(prev => prev.filter((_, i) => i !== si));
    };

    const updateStageField = (si: number, stage: StageName) => {
        setStages(prev => prev.map((s, i) => i === si ? { ...s, stage } : s));
    };

    const addMaterial = (si: number) => {
        setStages(prev => prev.map((s, i) => i === si
            ? { ...s, materials: [...s.materials, emptyMaterial()] }
            : s));
    };

    const removeMaterial = (si: number, mi: number) => {
        setStages(prev => prev.map((s, i) => i === si
            ? { ...s, materials: s.materials.filter((_, j) => j !== mi) }
            : s));
    };

    const updateMaterial = (si: number, mi: number, field: keyof MaterialInput, value: string) => {
        setStages(prev => prev.map((s, i) => i === si
            ? { ...s, materials: s.materials.map((m, j) => j === mi ? { ...m, [field]: value } : m) }
            : s));
    };

    // ── Submit ────────────────────────────────────────────────────────────────
    const handleSubmit = async () => {
        if (!user || !editingProduct) return;

        // Validate
        for (const stage of stages) {
            for (const mat of stage.materials) {
                if (!mat.materialId) { toast({ title: 'Select a material for every row', variant: 'destructive' }); return; }
                const qty = parseFloat(mat.quantityPerPiece);
                if (isNaN(qty) || qty <= 0) { toast({ title: 'Quantity per piece must be positive', variant: 'destructive' }); return; }
            }
        }

        setIsSubmitting(true);
        try {
            const token = await user.getIdToken();
            const payload = {
                businessId,
                stages: stages.map(s => ({
                    stage: s.stage,
                    materials: s.materials.map(m => ({
                        materialId: m.materialId,
                        quantityPerPiece: parseFloat(m.quantityPerPiece),
                        wastagePercent: parseFloat(m.wastagePercent) || 0,
                    })),
                })),
            };

            const endpoint = editingBOM
                ? '/api/business/b2b/update-bom-entry'
                : '/api/business/b2b/create-bom-entry';

            const body = editingBOM
                ? { ...payload, bomId: editingBOM.id }
                : { ...payload, productId: editingProduct.id };

            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify(body),
            });
            const r = await res.json();
            if (!res.ok) throw new Error(r.message || r.error || 'Failed');
            toast({ title: editingBOM ? 'BOM Updated' : 'BOM Created', description: editingProduct.name });
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
            toast({ title: 'BOM Deactivated' });
            setDeactivateTarget(null);
        } catch (err) {
            toast({ title: 'Error', description: (err as Error).message, variant: 'destructive' });
        }
    };

    if (authLoading) return <div className="flex items-center justify-center h-64"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
    if (!isAuthorized) return null;

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }}
                className="flex items-center justify-between gap-4 p-4 md:p-6 border-b bg-gradient-to-r from-background to-muted/20">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-primary/10 ring-1 ring-primary/20">
                        <Layers className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold">BOM Manager</h1>
                        <p className="text-xs text-muted-foreground">
                            {Object.keys(activeBOMByProduct).length} of {products.length} products have an active BOM
                        </p>
                    </div>
                </div>
            </motion.div>

            {/* Search */}
            <div className="shrink-0 p-4 border-b">
                <div className="relative max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Search products..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9" />
                    {search && <Button variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7" onClick={() => setSearch('')}><X className="h-3 w-3" /></Button>}
                </div>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-auto">
                {loading ? (
                    <div className="p-6 space-y-3">
                        {Array.from({ length: 5 }).map((_, i) => <div key={i} className="flex gap-4"><Skeleton className="h-5 w-40" /><Skeleton className="h-5 w-20" /><Skeleton className="h-8 w-24 ml-auto rounded-lg" /></div>)}
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-center">
                        <Package className="h-12 w-12 text-muted-foreground/30 mb-3" />
                        <h3 className="font-medium text-muted-foreground">{search ? 'No products found' : 'No products yet'}</h3>
                        <p className="text-sm text-muted-foreground/70 mt-1">Add products first, then configure their BOM here.</p>
                    </div>
                ) : (
                    <Table>
                        <TableHeader className="sticky top-0 bg-card z-10">
                            <TableRow>
                                <TableHead>Product</TableHead>
                                <TableHead>BOM Status</TableHead>
                                <TableHead>Stages Defined</TableHead>
                                <TableHead>Total Materials</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            <AnimatePresence mode="popLayout">
                                {filtered.map((product, i) => {
                                    const bom = activeBOMByProduct[product.id];
                                    const hasBOM = !!bom;
                                    const totalMaterials = bom
                                        ? bom.stages.reduce((s, st) => s + st.materials.length, 0)
                                        : 0;
                                    return (
                                        <motion.tr key={product.id}
                                            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0, transition: { delay: i * 0.03 } }}
                                            exit={{ opacity: 0 }} layout
                                            className="group border-b hover:bg-muted/40 transition-colors">
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                    <Package className="h-4 w-4 text-muted-foreground shrink-0" />
                                                    <div>
                                                        <p className="font-medium text-sm">{product.name}</p>
                                                        <p className="text-xs text-muted-foreground font-mono">{product.sku}</p>
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                {hasBOM ? (
                                                    <div className="flex items-center gap-1.5 text-emerald-600 text-xs font-medium">
                                                        <CheckCircle2 className="h-3.5 w-3.5" />
                                                        Active BOM
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
                                                        <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
                                                        No BOM
                                                    </div>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-sm text-muted-foreground">
                                                {hasBOM ? (
                                                    <div className="flex flex-wrap gap-1">
                                                        {bom.stages.map(s => (
                                                            <Badge key={s.stage} variant="outline" className="text-[10px] px-1.5 py-0">{s.stage}</Badge>
                                                        ))}
                                                    </div>
                                                ) : '—'}
                                            </TableCell>
                                            <TableCell className="text-sm text-muted-foreground">
                                                {hasBOM ? `${totalMaterials} material${totalMaterials !== 1 ? 's' : ''}` : '—'}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex items-center justify-end gap-2">
                                                    {hasBOM ? (
                                                        <>
                                                            <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs"
                                                                onClick={() => openEdit(product, bom)}>
                                                                <Pencil className="h-3 w-3" /> Edit BOM
                                                            </Button>
                                                            <Button variant="ghost" size="sm" className="gap-1.5 h-8 text-xs text-destructive hover:text-destructive"
                                                                onClick={() => setDeactivateTarget(bom)}>
                                                                <Trash2 className="h-3 w-3" /> Deactivate
                                                            </Button>
                                                        </>
                                                    ) : (
                                                        <Button size="sm" className="gap-1.5 h-8 text-xs"
                                                            onClick={() => openCreate(product)}>
                                                            <Plus className="h-3 w-3" /> Add BOM
                                                        </Button>
                                                    )}
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

            {/* BOM Create / Edit Dialog */}
            <Dialog open={dialogOpen} onOpenChange={o => !o && setDialogOpen(false)}>
                <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col">
                    <DialogHeader>
                        <DialogTitle>{editingBOM ? 'Edit BOM' : 'Create BOM'} — {editingProduct?.name}</DialogTitle>
                        <DialogDescription>
                            Define which raw materials are consumed at each production stage.
                            The same material can appear in multiple stages.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="flex-1 overflow-y-auto space-y-4 py-2 pr-1">
                        {stages.map((stageInput, si) => (
                            <div key={si} className="border rounded-xl p-4 space-y-3 bg-muted/20">
                                {/* Stage header */}
                                <div className="flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-2 flex-1">
                                        <span className="text-xs text-muted-foreground font-mono w-5">{si + 1}</span>
                                        <Select value={stageInput.stage} onValueChange={v => updateStageField(si, v as StageName)}>
                                            <SelectTrigger className="h-8 text-sm w-44">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {stageConfigs.map(sc => (
                                                    <SelectItem key={sc.name} value={sc.name} className="text-xs">{sc.label}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <span className="text-xs text-muted-foreground">{stageInput.materials.length} material{stageInput.materials.length !== 1 ? 's' : ''}</span>
                                    </div>
                                    {stages.length > 1 && (
                                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive shrink-0"
                                            onClick={() => removeStage(si)}>
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                    )}
                                </div>

                                {/* Materials for this stage */}
                                <div className="space-y-2 ml-7">
                                    {stageInput.materials.map((mat, mi) => (
                                        <div key={mi} className="flex items-center gap-2">
                                            <Select value={mat.materialId} onValueChange={v => updateMaterial(si, mi, 'materialId', v)}>
                                                <SelectTrigger className="h-8 text-xs flex-1">
                                                    <SelectValue placeholder="Select material" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {activeMaterials.map(m => (
                                                        <SelectItem key={m.id} value={m.id} className="text-xs">
                                                            {m.name} <span className="text-muted-foreground">({m.unit})</span>
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            <Input type="number" min="0.001" step="0.001" placeholder="Qty/pc"
                                                value={mat.quantityPerPiece}
                                                onChange={e => updateMaterial(si, mi, 'quantityPerPiece', e.target.value)}
                                                className="h-8 text-xs w-24" />
                                            <Input type="number" min="0" max="100" step="0.1" placeholder="Wastage%"
                                                value={mat.wastagePercent}
                                                onChange={e => updateMaterial(si, mi, 'wastagePercent', e.target.value)}
                                                className="h-8 text-xs w-24" />
                                            {stageInput.materials.length > 1 && (
                                                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                                                    onClick={() => removeMaterial(si, mi)}>
                                                    <X className="h-3 w-3" />
                                                </Button>
                                            )}
                                        </div>
                                    ))}
                                    <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-muted-foreground"
                                        onClick={() => addMaterial(si)}>
                                        <Plus className="h-3 w-3" /> Add Material
                                    </Button>
                                </div>
                            </div>
                        ))}

                        <Button variant="outline" size="sm" className="gap-2 w-full" onClick={addStage}>
                            <Plus className="h-4 w-4" /> Add Stage
                        </Button>
                    </div>

                    <DialogFooter className="mt-4">
                        <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                        <Button onClick={handleSubmit} disabled={isSubmitting} className="gap-2">
                            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                            {editingBOM ? 'Save Changes' : 'Create BOM'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Deactivate Confirmation */}
            <AlertDialog open={!!deactivateTarget} onOpenChange={o => !o && setDeactivateTarget(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Deactivate BOM</AlertDialogTitle>
                        <AlertDialogDescription>
                            Deactivate the BOM for <span className="font-semibold">{deactivateTarget?.productName}</span>?
                            New orders for this product will require a custom BOM until a new active BOM is created.
                            Existing lots are unaffected — they carry their own BOM snapshot.
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