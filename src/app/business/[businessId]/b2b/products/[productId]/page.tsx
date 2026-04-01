'use client';

// /business/[businessId]/b2b/products/[productId]/page.tsx

import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useBusinessContext } from '../../../layout';
import { db } from '@/lib/firebase';
import { doc, collection, onSnapshot, query, where, orderBy } from 'firebase/firestore';
import { Product, BOM, BOMStage, BOMStageItem, ProductionStageConfig, RawMaterial, StageName } from '@/types/b2b';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';
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
    ArrowLeft, Package, Layers, Plus, Loader2, Pencil,
    Trash2, Boxes, CheckCircle2, AlertCircle, X,
} from 'lucide-react';

// ─────────────────────────────────────────────
// TYPES FOR BOM EDITOR
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

export default function ProductDetailPage() {
    const params = useParams();
    const router = useRouter();
    const { businessId, user, isAuthorized, loading: authLoading } = useBusinessContext();
    const productId = params.productId as string;

    const [product, setProduct] = useState<Product | null>(null);
    const [activeBOM, setActiveBOM] = useState<BOM | null>(null);
    const [materials, setMaterials] = useState<RawMaterial[]>([]);
    const [stageConfigs, setStageConfigs] = useState<ProductionStageConfig[]>([]);
    const [loading, setLoading] = useState(true);

    // BOM editor dialog
    const [bomDialogOpen, setBomDialogOpen] = useState(false);
    const [bomStages, setBomStages] = useState<StageInput[]>([]);
    const [isSubmittingBOM, setIsSubmittingBOM] = useState(false);

    // Deactivate confirmation
    const [deactivateOpen, setDeactivateOpen] = useState(false);

    // ── Firestore listeners ──────────────────────────────────────────────────
    useEffect(() => {
        if (!isAuthorized || !businessId || !productId) return;
        const u1 = onSnapshot(doc(db, 'users', businessId, 'b2bProducts', productId), snap => {
            if (snap.exists()) setProduct({ id: snap.id, ...snap.data() } as Product);
            setLoading(false);
        });
        // Load the single active BOM for this product
        const u2 = onSnapshot(
            query(collection(db, 'users', businessId, 'bom'), where('productId', '==', productId), where('isActive', '==', true)),
            snap => setActiveBOM(snap.empty ? null : ({ id: snap.docs[0].id, ...snap.docs[0].data() } as BOM))
        );
        const u3 = onSnapshot(
            query(collection(db, 'users', businessId, 'raw_materials'), orderBy('name')),
            snap => setMaterials(snap.docs.map(d => ({ id: d.id, ...d.data() } as RawMaterial)))
        );
        const u4 = onSnapshot(
            query(collection(db, 'users', businessId, 'production_stage_config'), orderBy('sortOrder')),
            snap => setStageConfigs(snap.docs.map(d => ({ id: d.id, ...d.data() } as ProductionStageConfig)))
        );
        return () => { u1(); u2(); u3(); u4(); };
    }, [businessId, isAuthorized, productId]);

    const activeMaterials = useMemo(() => materials.filter(m => m.isActive), [materials]);

    // ── BOM editor helpers ─────────────────────────────────────────────────
    const openBOMEditor = () => {
        if (activeBOM) {
            // pre-fill from existing BOM
            setBomStages(activeBOM.stages.map(s => ({
                stage: s.stage,
                materials: s.materials.map(m => ({
                    materialId: m.materialId,
                    quantityPerPiece: String(m.quantityPerPiece),
                    wastagePercent: String(m.wastagePercent),
                })),
            })));
        } else {
            // default: product's default stages, each with one empty material
            const defaultStages: StageInput[] = product?.defaultStages.map(s => ({
                stage: s,
                materials: [emptyMaterial()],
            })) ?? [{ stage: (stageConfigs[0]?.name ?? 'CUTTING') as StageName, materials: [emptyMaterial()] }];
            setBomStages(defaultStages.length > 0 ? defaultStages : [{ stage: (stageConfigs[0]?.name ?? 'CUTTING') as StageName, materials: [emptyMaterial()] }]);
        }
        setBomDialogOpen(true);
    };

    const addStage = () => {
        const next = stageConfigs.find(sc => !bomStages.some(s => s.stage === sc.name));
        setBomStages(prev => [...prev, {
            stage: (next?.name ?? stageConfigs[0]?.name ?? 'CUTTING') as StageName,
            materials: [emptyMaterial()],
        }]);
    };

    const removeStage = (si: number) => setBomStages(prev => prev.filter((_, i) => i !== si));

    const updateStageField = (si: number, stage: StageName) =>
        setBomStages(prev => prev.map((s, i) => i === si ? { ...s, stage } : s));

    const addMaterial = (si: number) =>
        setBomStages(prev => prev.map((s, i) => i === si ? { ...s, materials: [...s.materials, emptyMaterial()] } : s));

    const removeMaterial = (si: number, mi: number) =>
        setBomStages(prev => prev.map((s, i) => i === si ? { ...s, materials: s.materials.filter((_, j) => j !== mi) } : s));

    const updateMaterial = (si: number, mi: number, field: keyof MaterialInput, value: string) =>
        setBomStages(prev => prev.map((s, i) => i === si
            ? { ...s, materials: s.materials.map((m, j) => j === mi ? { ...m, [field]: value } : m) }
            : s));

    const handleBOMSubmit = async () => {
        if (!user || !product) return;
        for (const stage of bomStages) {
            for (const mat of stage.materials) {
                if (!mat.materialId) { toast({ title: 'Select a material for every row', variant: 'destructive' }); return; }
                const qty = parseFloat(mat.quantityPerPiece);
                if (isNaN(qty) || qty <= 0) { toast({ title: 'Quantity per piece must be positive', variant: 'destructive' }); return; }
            }
        }
        setIsSubmittingBOM(true);
        try {
            const token = await user.getIdToken();
            const payload = {
                businessId,
                stages: bomStages.map(s => ({
                    stage: s.stage,
                    materials: s.materials.map(m => ({
                        materialId: m.materialId,
                        quantityPerPiece: parseFloat(m.quantityPerPiece),
                        wastagePercent: parseFloat(m.wastagePercent) || 0,
                    })),
                })),
            };
            const endpoint = activeBOM
                ? '/api/business/b2b/update-bom-entry'
                : '/api/business/b2b/create-bom-entry';
            const body = activeBOM
                ? { ...payload, bomId: activeBOM.id }
                : { ...payload, productId };
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify(body),
            });
            const r = await res.json();
            if (!res.ok) throw new Error(r.message || r.error || 'Failed');
            toast({ title: activeBOM ? 'BOM Updated' : 'BOM Created' });
            setBomDialogOpen(false);
        } catch (err) {
            toast({ title: 'Error', description: (err as Error).message, variant: 'destructive' });
        } finally {
            setIsSubmittingBOM(false);
        }
    };

    const handleDeactivateBOM = async () => {
        if (!activeBOM || !user) return;
        try {
            const token = await user.getIdToken();
            const res = await fetch('/api/business/b2b/deactivate-bom-entry', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ businessId, bomId: activeBOM.id }),
            });
            const r = await res.json();
            if (!res.ok) throw new Error(r.error || 'Failed');
            toast({ title: 'BOM Deactivated' });
            setDeactivateOpen(false);
        } catch (err) {
            toast({ title: 'Error', description: (err as Error).message, variant: 'destructive' });
        }
    };

    const handleToggleActive = async () => {
        if (!product || !user) return;
        try {
            const token = await user.getIdToken();
            await fetch('/api/business/b2b/update-product', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ businessId, productId, isActive: !product.isActive }),
            });
            toast({ title: product.isActive ? 'Product Deactivated' : 'Product Activated' });
        } catch (err) {
            toast({ title: 'Error', description: (err as Error).message, variant: 'destructive' });
        }
    };

    const totalMaterials = activeBOM
        ? activeBOM.stages.reduce((s, st) => s + st.materials.length, 0)
        : 0;

    if (authLoading || loading) return (
        <div className="p-6 space-y-4">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-48 rounded-xl" />
            <Skeleton className="h-64 rounded-xl" />
        </div>
    );
    if (!isAuthorized || !product) return null;

    return (
        <div className="flex flex-col h-full overflow-y-auto">
            {/* Header */}
            <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-4 p-4 md:p-6 border-b bg-gradient-to-r from-background to-muted/20 sticky top-0 z-10 bg-background">
                <Button variant="ghost" size="icon" onClick={() => router.back()}><ArrowLeft className="h-4 w-4" /></Button>
                <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="p-2 rounded-xl bg-primary/10 ring-1 ring-primary/20 shrink-0">
                        <Package className="h-5 w-5 text-primary" />
                    </div>
                    <div className="min-w-0">
                        <div className="flex items-center gap-3 flex-wrap">
                            <h1 className="text-xl font-bold truncate">{product.name}</h1>
                            <code className="text-xs bg-muted px-2 py-0.5 rounded font-mono">{product.sku}</code>
                            <Badge variant={product.isActive ? 'success' : 'secondary'}>{product.isActive ? 'Active' : 'Inactive'}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{product.category}{product.description && ` · ${product.description}`}</p>
                    </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{product.isActive ? 'Active' : 'Inactive'}</span>
                        <Switch checked={product.isActive} onCheckedChange={handleToggleActive} />
                    </div>
                </div>
            </motion.div>

            <div className="p-4 md:p-6 space-y-6">
                {/* Default Stage Pipeline */}
                <div className="space-y-2">
                    <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Default Stage Pipeline</h2>
                    <div className="flex flex-wrap items-center gap-2">
                        {product.defaultStages.map((stage, i) => (
                            <React.Fragment key={stage}>
                                <Badge variant="outline" className="font-mono text-xs">{stage}</Badge>
                                {i < product.defaultStages.length - 1 && <span className="text-muted-foreground text-xs">→</span>}
                            </React.Fragment>
                        ))}
                    </div>
                </div>

                {/* BOM Section */}
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-sm font-semibold">Bill of Materials</h2>
                            <p className="text-xs text-muted-foreground mt-0.5">
                                {activeBOM
                                    ? `${activeBOM.stages.length} stage${activeBOM.stages.length !== 1 ? 's' : ''} · ${totalMaterials} material${totalMaterials !== 1 ? 's' : ''} defined`
                                    : 'No BOM configured for this product'}
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            {activeBOM && (
                                <Button variant="ghost" size="sm" className="gap-1.5 text-destructive hover:text-destructive"
                                    onClick={() => setDeactivateOpen(true)}>
                                    <Trash2 className="h-3.5 w-3.5" /> Deactivate
                                </Button>
                            )}
                            <Button size="sm" className="gap-1.5" onClick={openBOMEditor} disabled={!product.isActive}>
                                {activeBOM ? <><Pencil className="h-3.5 w-3.5" /> Edit BOM</> : <><Plus className="h-3.5 w-3.5" /> Add BOM</>}
                            </Button>
                        </div>
                    </div>

                    {activeBOM ? (
                        <div className="space-y-3">
                            {activeBOM.stages.map((stage, si) => (
                                <motion.div key={si} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0, transition: { delay: si * 0.05 } }}
                                    className="border rounded-xl overflow-hidden">
                                    <div className="px-4 py-2.5 bg-muted/50 border-b flex items-center justify-between">
                                        <Badge variant="outline" className="text-xs font-mono">{stage.stage}</Badge>
                                        <span className="text-xs text-muted-foreground">{stage.materials.length} material{stage.materials.length !== 1 ? 's' : ''}</span>
                                    </div>
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Material</TableHead>
                                                <TableHead className="text-right">Qty / Piece</TableHead>
                                                <TableHead className="text-right">Wastage %</TableHead>
                                                <TableHead className="text-right">Effective Qty</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {stage.materials.map((m, mi) => {
                                                const effective = m.quantityPerPiece * (1 + m.wastagePercent / 100);
                                                return (
                                                    <TableRow key={mi}>
                                                        <TableCell>
                                                            <div className="flex items-center gap-2">
                                                                <Boxes className="h-4 w-4 text-muted-foreground" />
                                                                <span className="text-sm font-medium">{m.materialName}</span>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="text-right font-mono text-sm">
                                                            {m.quantityPerPiece} <span className="text-xs text-muted-foreground">{m.materialUnit}</span>
                                                        </TableCell>
                                                        <TableCell className="text-right font-mono text-sm text-muted-foreground">{m.wastagePercent}%</TableCell>
                                                        <TableCell className="text-right font-mono text-sm font-medium">
                                                            {effective.toFixed(3)} <span className="text-xs text-muted-foreground font-normal">{m.materialUnit}</span>
                                                        </TableCell>
                                                    </TableRow>
                                                );
                                            })}
                                        </TableBody>
                                    </Table>
                                </motion.div>
                            ))}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-12 border rounded-xl border-dashed text-center">
                            <div className="flex items-center gap-2 text-muted-foreground/50 mb-3">
                                <AlertCircle className="h-10 w-10" />
                            </div>
                            <h3 className="font-medium text-muted-foreground text-sm">No BOM configured</h3>
                            <p className="text-xs text-muted-foreground/70 mt-1 mb-3">
                                Add a BOM to define which raw materials and stages this product requires.
                            </p>
                            <Button size="sm" variant="outline" className="gap-2" onClick={openBOMEditor} disabled={!product.isActive}>
                                <Plus className="h-3.5 w-3.5" /> Add BOM
                            </Button>
                        </div>
                    )}
                </div>

                <div className="text-xs text-muted-foreground pt-2 border-t">
                    Created {product.createdAt ? format(product.createdAt.toDate(), 'dd MMM yyyy') : '—'} ·
                    Last updated {product.updatedAt ? format(product.updatedAt.toDate(), 'dd MMM yyyy') : '—'}
                </div>
            </div>

            {/* BOM Editor Dialog */}
            <Dialog open={bomDialogOpen} onOpenChange={o => !o && setBomDialogOpen(false)}>
                <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col">
                    <DialogHeader>
                        <DialogTitle>{activeBOM ? 'Edit BOM' : 'Create BOM'} — {product.name}</DialogTitle>
                        <DialogDescription>
                            Define which raw materials are consumed at each production stage.
                            The same material can appear in multiple stages.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="flex-1 overflow-y-auto space-y-4 py-2 pr-1">
                        {bomStages.map((stageInput, si) => (
                            <div key={si} className="border rounded-xl p-4 space-y-3 bg-muted/20">
                                <div className="flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-2 flex-1">
                                        <span className="text-xs text-muted-foreground font-mono w-5">{si + 1}</span>
                                        <Select value={stageInput.stage} onValueChange={v => updateStageField(si, v as StageName)}>
                                            <SelectTrigger className="h-8 text-sm w-44"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                {stageConfigs.map(sc => <SelectItem key={sc.name} value={sc.name} className="text-xs">{sc.label}</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                        <span className="text-xs text-muted-foreground">{stageInput.materials.length} material{stageInput.materials.length !== 1 ? 's' : ''}</span>
                                    </div>
                                    {bomStages.length > 1 && (
                                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive shrink-0" onClick={() => removeStage(si)}>
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                    )}
                                </div>

                                <div className="space-y-2 ml-7">
                                    {stageInput.materials.map((mat, mi) => (
                                        <div key={mi} className="flex items-center gap-2">
                                            <Select value={mat.materialId} onValueChange={v => updateMaterial(si, mi, 'materialId', v)}>
                                                <SelectTrigger className="h-8 text-xs flex-1"><SelectValue placeholder="Select material" /></SelectTrigger>
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
                                                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0" onClick={() => removeMaterial(si, mi)}>
                                                    <X className="h-3 w-3" />
                                                </Button>
                                            )}
                                        </div>
                                    ))}
                                    <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-muted-foreground" onClick={() => addMaterial(si)}>
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
                        <Button variant="outline" onClick={() => setBomDialogOpen(false)}>Cancel</Button>
                        <Button onClick={handleBOMSubmit} disabled={isSubmittingBOM} className="gap-2">
                            {isSubmittingBOM && <Loader2 className="h-4 w-4 animate-spin" />}
                            {activeBOM ? 'Save Changes' : 'Create BOM'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Deactivate BOM */}
            <AlertDialog open={deactivateOpen} onOpenChange={o => !o && setDeactivateOpen(false)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Deactivate BOM</AlertDialogTitle>
                        <AlertDialogDescription>
                            Deactivate the BOM for <span className="font-semibold">{product.name}</span>?
                            Existing lots carry their own BOM snapshot and are unaffected.
                            New orders for this product will require a custom BOM until a new one is created.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDeactivateBOM} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                            Deactivate
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}