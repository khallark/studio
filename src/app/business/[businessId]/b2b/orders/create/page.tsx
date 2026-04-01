'use client';

// /business/[businessId]/b2b/orders/create/page.tsx

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useBusinessContext } from '../../../layout';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import {
    Buyer, Product, ProductionStageConfig, DraftLotInput,
    StageName, BOM, LotBOMStage, LotBOMItem, RawMaterial,
} from '@/types/b2b';
import { motion } from 'framer-motion';
import { format, addDays } from 'date-fns';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import {
    ArrowLeft, CalendarIcon, Plus, Trash2, Loader2, Save, Zap,
    Package, ChevronDown, ChevronUp, Layers, X, Lock,
} from 'lucide-react';

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────

interface CustomBOMStageInput {
    stage: StageName;
    materials: Array<{
        materialId: string;
        quantityPerPiece: string;
        wastagePercent: string;
    }>;
}

interface LotForm {
    productId: string;
    productName: string;
    productSku: string;
    color: string;
    size: string;
    quantity: string;
    stages: Array<{ stage: StageName; plannedDate: string; isOutsourced: boolean; outsourceVendorName: string | null }>;
    expanded: boolean;
    // BOM
    bomMode: 'predefined' | 'custom';
    bomId: string | null;
    activeBOM: BOM | null;
    customBOMStages: CustomBOMStageInput[];
}

function emptyLot(stageConfigs: ProductionStageConfig[] = []): LotForm {
    let cumulativeDays = 0;
    const stages = stageConfigs.map(sc => {
        cumulativeDays += sc.defaultDurationDays;
        return { stage: sc.name as StageName, plannedDate: format(addDays(new Date(), cumulativeDays), 'yyyy-MM-dd'), isOutsourced: false, outsourceVendorName: null as string | null };
    });
    return {
        productId: '', productName: '', productSku: '', color: '', size: '', quantity: '',
        stages: stages.length > 0 ? stages : [{ stage: 'CUTTING' as StageName, plannedDate: format(addDays(new Date(), 7), 'yyyy-MM-dd'), isOutsourced: false, outsourceVendorName: null }],
        expanded: true,
        bomMode: 'custom', bomId: null, activeBOM: null,
        customBOMStages: [],
    };
}

// Build LotBOMStage[] from customBOMStages for the API payload
function buildLotBOMSnapshot(lot: LotForm): LotBOMStage[] | null {
    if (lot.bomMode === 'predefined') return null;
    const qty = parseInt(lot.quantity) || 1;
    return lot.customBOMStages
        .filter(stage => stage.materials.some(m => m.materialId))
        .map(stage => ({
            stage: stage.stage,
            materials: stage.materials
                .filter(m => m.materialId)
                .map(m => ({
                    materialId: m.materialId,
                    materialName: '', // will be resolved by backend from material doc
                    materialUnit: '',
                    quantityPerPiece: parseFloat(m.quantityPerPiece) || 0,
                    wastagePercent: parseFloat(m.wastagePercent) || 0,
                    totalQuantity: Math.round(qty * (parseFloat(m.quantityPerPiece) || 0) * (1 + (parseFloat(m.wastagePercent) || 0) / 100) * 100) / 100,
                })),
        }));
}

// ─────────────────────────────────────────────
// CUSTOM BOM BUILDER
// ─────────────────────────────────────────────

function CustomBOMBuilder({ stages, stageConfigs, materials, lotStages, onChange }: {
    stages: CustomBOMStageInput[];
    stageConfigs: ProductionStageConfig[];
    materials: RawMaterial[];
    lotStages: StageName[];
    onChange: (stages: CustomBOMStageInput[]) => void;
}) {
    const addStage = () => {
        const next = stageConfigs.find(sc => !stages.some(s => s.stage === sc.name));
        onChange([...stages, { stage: (next?.name ?? stageConfigs[0]?.name ?? 'CUTTING') as StageName, materials: [{ materialId: '', quantityPerPiece: '', wastagePercent: '5' }] }]);
    };
    const removeStage = (si: number) => onChange(stages.filter((_, i) => i !== si));
    const addMaterial = (si: number) => onChange(stages.map((s, i) => i === si ? { ...s, materials: [...s.materials, { materialId: '', quantityPerPiece: '', wastagePercent: '5' }] } : s));
    const removeMaterial = (si: number, mi: number) => onChange(stages.map((s, i) => i === si ? { ...s, materials: s.materials.filter((_, j) => j !== mi) } : s));
    const updateField = (si: number, mi: number, field: string, value: string) =>
        onChange(stages.map((s, i) => i === si ? { ...s, materials: s.materials.map((m, j) => j === mi ? { ...m, [field]: value } : m) } : s));
    const updateStage = (si: number, stage: StageName) => onChange(stages.map((s, i) => i === si ? { ...s, stage } : s));

    const activeMaterials = materials.filter(m => m.isActive);

    return (
        <div className="space-y-3 p-3 rounded-lg border bg-muted/10">
            <p className="text-xs font-medium text-muted-foreground">Custom BOM — add stages and materials</p>
            {stages.map((stage, si) => (
                <div key={si} className="border rounded-lg p-3 space-y-2 bg-background">
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground w-4">{si + 1}</span>
                        <Select value={stage.stage} onValueChange={v => updateStage(si, v as StageName)}>
                            <SelectTrigger className="h-7 text-xs w-36"><SelectValue /></SelectTrigger>
                            <SelectContent>{stageConfigs.map(sc => <SelectItem key={sc.name} value={sc.name} className="text-xs">{sc.label}</SelectItem>)}</SelectContent>
                        </Select>
                        {stages.length > 1 && (
                            <Button variant="ghost" size="icon" className="h-6 w-6 ml-auto text-destructive hover:text-destructive" onClick={() => removeStage(si)}>
                                <Trash2 className="h-3 w-3" />
                            </Button>
                        )}
                    </div>
                    <div className="space-y-1.5 ml-6">
                        {stage.materials.map((mat, mi) => (
                            <div key={mi} className="flex items-center gap-1.5">
                                <Select value={mat.materialId} onValueChange={v => updateField(si, mi, 'materialId', v)}>
                                    <SelectTrigger className="h-7 text-xs flex-1"><SelectValue placeholder="Select material" /></SelectTrigger>
                                    <SelectContent>
                                        {activeMaterials.map(m => <SelectItem key={m.id} value={m.id} className="text-xs">{m.name} ({m.unit})</SelectItem>)}
                                    </SelectContent>
                                </Select>
                                <Input type="number" min="0.001" step="0.001" placeholder="Qty/pc"
                                    value={mat.quantityPerPiece} onChange={e => updateField(si, mi, 'quantityPerPiece', e.target.value)}
                                    className="h-7 text-xs w-20" />
                                <Input type="number" min="0" max="100" step="0.1" placeholder="W%"
                                    value={mat.wastagePercent} onChange={e => updateField(si, mi, 'wastagePercent', e.target.value)}
                                    className="h-7 text-xs w-16" />
                                {stage.materials.length > 1 && (
                                    <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => removeMaterial(si, mi)}>
                                        <X className="h-3 w-3" />
                                    </Button>
                                )}
                            </div>
                        ))}
                        <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-1 text-muted-foreground px-1" onClick={() => addMaterial(si)}>
                            <Plus className="h-2.5 w-2.5" /> Add material
                        </Button>
                    </div>
                </div>
            ))}
            <Button variant="outline" size="sm" className="gap-1.5 w-full h-7 text-xs" onClick={addStage}>
                <Plus className="h-3 w-3" /> Add Stage
            </Button>
        </div>
    );
}

// ─────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────

export default function CreateOrderPage() {
    const router = useRouter();
    const { businessId, user, isAuthorized, loading: authLoading } = useBusinessContext();

    const [buyers, setBuyers] = useState<Buyer[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [stageConfigs, setStageConfigs] = useState<ProductionStageConfig[]>([]);
    const [boms, setBoms] = useState<BOM[]>([]);
    const [materials, setMaterials] = useState<RawMaterial[]>([]);

    const [buyerId, setBuyerId] = useState('');
    const [buyerName, setBuyerName] = useState('');
    const [buyerContact, setBuyerContact] = useState('');
    const [shipDate, setShipDate] = useState<Date | undefined>(addDays(new Date(), 30));
    const [shipCalOpen, setShipCalOpen] = useState(false);
    const [deliveryAddress, setDeliveryAddress] = useState('');
    const [note, setNote] = useState('');
    const [lots, setLots] = useState<LotForm[]>([]);
    const [isDraft, setIsDraft] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // ── Firestore listeners ─────────────────────────────────────────────────
    useEffect(() => {
        if (!isAuthorized || !businessId) return;
        const u1 = onSnapshot(query(collection(db, 'users', businessId, 'buyers'), orderBy('name')),
            snap => setBuyers(snap.docs.map(d => ({ id: d.id, ...d.data() } as Buyer))));
        const u2 = onSnapshot(query(collection(db, 'users', businessId, 'b2bProducts'), orderBy('name')),
            snap => setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() } as Product))));
        const u3 = onSnapshot(query(collection(db, 'users', businessId, 'production_stage_config'), orderBy('sortOrder')),
            snap => {
                const configs = snap.docs.map(d => ({ id: d.id, ...d.data() } as ProductionStageConfig));
                setStageConfigs(configs);
                setLots(prev => prev.length === 0 ? [emptyLot(configs)] : prev);
            });
        const u4 = onSnapshot(query(collection(db, 'users', businessId, 'bom'), where('isActive', '==', true)),
            snap => setBoms(snap.docs.map(d => ({ id: d.id, ...d.data() } as BOM))));
        const u5 = onSnapshot(query(collection(db, 'users', businessId, 'raw_materials'), orderBy('name')),
            snap => setMaterials(snap.docs.map(d => ({ id: d.id, ...d.data() } as RawMaterial))));
        return () => { u1(); u2(); u3(); u4(); u5(); };
    }, [businessId, isAuthorized]);

    const handleBuyerChange = (id: string) => {
        const buyer = buyers.find(b => b.id === id);
        if (!buyer) return;
        setBuyerId(id); setBuyerName(buyer.name); setBuyerContact(buyer.phone);
    };

    const handleProductChange = (lotIdx: number, productId: string) => {
        const product = products.find(p => p.id === productId);
        if (!product) return;
        let cumulativeDays = 0;
        const stages = product.defaultStages.map(stageName => {
            const config = stageConfigs.find(sc => sc.name === stageName);
            cumulativeDays += config?.defaultDurationDays ?? 7;
            return { stage: stageName, plannedDate: format(addDays(new Date(), cumulativeDays), 'yyyy-MM-dd'), isOutsourced: false, outsourceVendorName: null as string | null };
        });
        const activeBOM = boms.find(b => b.productId === productId) ?? null;
        setLots(prev => prev.map((l, i) => i !== lotIdx ? l : {
            ...l, productId, productName: product.name, productSku: product.sku, stages,
            activeBOM,
            bomMode: activeBOM ? 'predefined' : 'custom',
            bomId: activeBOM?.id ?? null,
            customBOMStages: activeBOM ? [] : [],
        }));
    };

    const addStageToLot = (lotIdx: number) => {
        const first = stageConfigs[0];
        setLots(prev => prev.map((l, i) => i !== lotIdx ? l : {
            ...l, stages: [...l.stages, { stage: (first?.name ?? 'CUTTING') as StageName, plannedDate: format(addDays(new Date(), 7), 'yyyy-MM-dd'), isOutsourced: false, outsourceVendorName: null as string | null }],
        }));
    };

    const removeStageFromLot = (lotIdx: number, stageIdx: number) => {
        setLots(prev => prev.map((l, i) => i !== lotIdx ? l : { ...l, stages: l.stages.filter((_, si) => si !== stageIdx) }));
    };

    const updateStage = (lotIdx: number, stageIdx: number, field: string, value: string | boolean | null) => {
        setLots(prev => prev.map((l, i) => i !== lotIdx ? l : {
            ...l, stages: l.stages.map((s, si) => si !== stageIdx ? s : { ...s, [field]: value }),
        }));
    };

    const setBOMMode = (lotIdx: number, mode: 'predefined' | 'custom') => {
        setLots(prev => prev.map((l, i) => i !== lotIdx ? l : {
            ...l,
            bomMode: mode,
            bomId: mode === 'predefined' ? l.activeBOM?.id ?? null : null,
        }));
    };

    const buildPayload = (): DraftLotInput[] => lots.map(l => ({
        productId: l.productId,
        productName: l.productName,
        productSku: l.productSku,
        color: l.color.trim(),
        size: l.size.trim() || null,
        quantity: parseInt(l.quantity),
        stages: l.stages.map(s => ({ stage: s.stage, plannedDate: new Date(s.plannedDate).toISOString(), isOutsourced: s.isOutsourced, outsourceVendorName: s.outsourceVendorName })),
        bomId: l.bomMode === 'predefined' ? l.bomId : null,
        customBOM: l.bomMode === 'custom' ? buildLotBOMSnapshot(l) : null,
    }));

    const handleSubmit = async (draft: boolean) => {
        if (!user) return;
        if (!buyerId) { toast({ title: 'Missing buyer', variant: 'destructive' }); return; }
        if (!shipDate) { toast({ title: 'Missing ship date', variant: 'destructive' }); return; }
        if (!deliveryAddress.trim()) { toast({ title: 'Missing delivery address', variant: 'destructive' }); return; }
        if (lots.some(l => !l.productId || !l.color || !l.quantity || Number(l.quantity) <= 0)) {
            toast({ title: 'All lots need product, color, and quantity', variant: 'destructive' }); return;
        }
        setIsDraft(draft); setIsSubmitting(true);
        try {
            const token = await user.getIdToken();
            const payload = {
                businessId, buyerId, buyerName, buyerContact,
                shipDate: shipDate.toISOString(),
                deliveryAddress: deliveryAddress.trim(),
                note: note.trim() || undefined,
                createdBy: user.displayName || user.email || 'Unknown',
                lots: buildPayload(),
            };
            const endpoint = draft ? '/api/business/b2b/save-draft-order' : '/api/business/b2b/create-order';
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify(payload),
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.error || result.message || 'Failed');
            toast({ title: draft ? 'Draft Saved' : 'Order Created', description: result.orderNumber });
            router.push(`/business/${businessId}/b2b/orders`);
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
            {/* Header */}
            <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-4 p-4 md:p-6 border-b bg-gradient-to-r from-background to-muted/20">
                <Button variant="ghost" size="icon" onClick={() => router.back()}><ArrowLeft className="h-4 w-4" /></Button>
                <div>
                    <h1 className="text-xl font-bold">New Order</h1>
                    <p className="text-xs text-muted-foreground">Fill in order details and configure lots</p>
                </div>
                <div className="ml-auto flex items-center gap-2">
                    <Button variant="outline" onClick={() => handleSubmit(true)} disabled={isSubmitting}>
                        {isSubmitting && isDraft && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                        <Save className="h-4 w-4 mr-2" /> Save Draft
                    </Button>
                    <Button onClick={() => handleSubmit(false)} disabled={isSubmitting} className="gap-2">
                        {isSubmitting && !isDraft && <Loader2 className="h-4 w-4 animate-spin" />}
                        <Zap className="h-4 w-4" /> Create Order
                    </Button>
                </div>
            </motion.div>

            <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
                {/* Order Details */}
                <Card>
                    <CardHeader className="pb-4"><CardTitle className="text-base">Order Details</CardTitle></CardHeader>
                    <CardContent className="grid md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Buyer <span className="text-destructive">*</span></Label>
                            <Select value={buyerId} onValueChange={handleBuyerChange}>
                                <SelectTrigger><SelectValue placeholder="Select buyer" /></SelectTrigger>
                                <SelectContent>{buyers.filter(b => b.isActive).map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Ship Date <span className="text-destructive">*</span></Label>
                            <Popover open={shipCalOpen} onOpenChange={setShipCalOpen}>
                                <PopoverTrigger asChild>
                                    <Button variant="outline" className={cn('w-full justify-start font-normal', !shipDate && 'text-muted-foreground')}>
                                        <CalendarIcon className="mr-2 h-4 w-4" />{shipDate ? format(shipDate, 'dd MMM yyyy') : 'Pick a date'}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                    <Calendar mode="single" selected={shipDate} onSelect={d => { setShipDate(d); setShipCalOpen(false); }} initialFocus />
                                </PopoverContent>
                            </Popover>
                        </div>
                        <div className="space-y-2 md:col-span-2">
                            <Label>Delivery Address <span className="text-destructive">*</span></Label>
                            <Textarea placeholder="Full delivery address" value={deliveryAddress} onChange={e => setDeliveryAddress(e.target.value)} rows={2} />
                        </div>
                        <div className="space-y-2 md:col-span-2">
                            <Label>Note <span className="text-muted-foreground text-xs">(optional)</span></Label>
                            <Input placeholder="Special instructions or notes" value={note} onChange={e => setNote(e.target.value)} />
                        </div>
                    </CardContent>
                </Card>

                {stageConfigs.length === 0 && (
                    <div className="p-4 rounded-xl border border-amber-300 bg-amber-50/50 dark:bg-amber-950/20 text-sm text-amber-700 dark:text-amber-400">
                        No production stages configured. Go to <strong>Stages</strong> to add stages before creating orders.
                    </div>
                )}

                {/* Lots */}
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="font-semibold">Lots <Badge variant="secondary" className="ml-2">{lots.length}</Badge></h2>
                        <Button variant="outline" size="sm" onClick={() => setLots(prev => [...prev, emptyLot(stageConfigs)])} className="gap-2">
                            <Plus className="h-3.5 w-3.5" /> Add Lot
                        </Button>
                    </div>

                    {lots.map((lot, lotIdx) => (
                        <motion.div key={lotIdx} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0, transition: { delay: lotIdx * 0.05 } }}>
                            <Card className={cn('border-2', lot.productId ? 'border-primary/20' : 'border-border')}>
                                {/* Lot Header */}
                                <div className="flex items-center justify-between p-4 cursor-pointer select-none"
                                    onClick={() => setLots(prev => prev.map((l, i) => i === lotIdx ? { ...l, expanded: !l.expanded } : l))}>
                                    <div className="flex items-center gap-3">
                                        <div className="p-1.5 rounded-lg bg-primary/10"><Package className="h-4 w-4 text-primary" /></div>
                                        <div>
                                            <p className="font-medium text-sm">{lot.productName || `Lot ${lotIdx + 1}`}</p>
                                            {lot.color && <p className="text-xs text-muted-foreground">{lot.color}{lot.size && ` · ${lot.size}`}{lot.quantity && ` · ${lot.quantity} pcs`}</p>}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {lots.length > 1 && (
                                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                                                onClick={e => { e.stopPropagation(); setLots(prev => prev.filter((_, i) => i !== lotIdx)); }}>
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        )}
                                        {lot.expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                                    </div>
                                </div>

                                {lot.expanded && (
                                    <CardContent className="pt-0 space-y-4">
                                        <Separator />

                                        {/* Product + Color + Size + Qty */}
                                        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
                                            <div className="space-y-2 md:col-span-2">
                                                <Label className="text-xs">Product <span className="text-destructive">*</span></Label>
                                                <Select value={lot.productId} onValueChange={v => handleProductChange(lotIdx, v)}>
                                                    <SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger>
                                                    <SelectContent>{products.filter(p => p.isActive).map(p => <SelectItem key={p.id} value={p.id}>{p.name} <span className="text-muted-foreground text-xs">({p.sku})</span></SelectItem>)}</SelectContent>
                                                </Select>
                                            </div>
                                            <div className="space-y-2">
                                                <Label className="text-xs">Color <span className="text-destructive">*</span></Label>
                                                <Input placeholder="e.g. White" value={lot.color} onChange={e => setLots(prev => prev.map((l, i) => i === lotIdx ? { ...l, color: e.target.value } : l))} />
                                            </div>
                                            <div className="space-y-2">
                                                <Label className="text-xs">Size</Label>
                                                <Input placeholder="e.g. M" value={lot.size} onChange={e => setLots(prev => prev.map((l, i) => i === lotIdx ? { ...l, size: e.target.value } : l))} />
                                            </div>
                                            <div className="space-y-2">
                                                <Label className="text-xs">Quantity <span className="text-destructive">*</span></Label>
                                                <Input type="number" min="1" placeholder="500" value={lot.quantity} onChange={e => setLots(prev => prev.map((l, i) => i === lotIdx ? { ...l, quantity: e.target.value } : l))} />
                                            </div>
                                        </div>

                                        {/* Stages */}
                                        <div className="space-y-2">
                                            <div className="flex items-center justify-between">
                                                <Label className="text-xs font-medium">Stage Pipeline</Label>
                                                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => addStageToLot(lotIdx)}>
                                                    <Plus className="h-3 w-3" /> Add Stage
                                                </Button>
                                            </div>
                                            <div className="space-y-2">
                                                {lot.stages.map((stage, stageIdx) => (
                                                    <div key={stageIdx} className="flex items-center gap-3 p-2 rounded-lg bg-muted/40">
                                                        <span className="text-xs text-muted-foreground w-5 text-center font-mono">{stageIdx + 1}</span>
                                                        <Select value={stage.stage} onValueChange={v => updateStage(lotIdx, stageIdx, 'stage', v)}>
                                                            <SelectTrigger className="h-8 text-xs w-36"><SelectValue /></SelectTrigger>
                                                            <SelectContent>{stageConfigs.map(s => <SelectItem key={s.name} value={s.name} className="text-xs">{s.label}</SelectItem>)}</SelectContent>
                                                        </Select>
                                                        <Input type="date" value={stage.plannedDate} onChange={e => updateStage(lotIdx, stageIdx, 'plannedDate', e.target.value)} className="h-8 text-xs flex-1" />
                                                        {lot.stages.length > 1 && (
                                                            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                                                                onClick={() => removeStageFromLot(lotIdx, stageIdx)}>
                                                                <Trash2 className="h-3.5 w-3.5" />
                                                            </Button>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        {/* BOM Section */}
                                        {lot.productId && (
                                            <div className="space-y-2">
                                                <div className="flex items-center gap-2">
                                                    <Label className="text-xs font-medium">Bill of Materials</Label>
                                                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">optional</Badge>
                                                </div>

                                                {lot.activeBOM ? (
                                                    // Product has a predefined BOM — show toggle
                                                    <div className="space-y-2">
                                                        <div className="flex gap-2">
                                                            <Button type="button" size="sm" variant={lot.bomMode === 'predefined' ? 'default' : 'outline'}
                                                                className="h-8 text-xs gap-1.5" onClick={() => setBOMMode(lotIdx, 'predefined')}>
                                                                <Lock className="h-3 w-3" /> Predefined BOM
                                                            </Button>
                                                            <Button type="button" size="sm" variant={lot.bomMode === 'custom' ? 'default' : 'outline'}
                                                                className="h-8 text-xs" onClick={() => setBOMMode(lotIdx, 'custom')}>
                                                                Custom BOM
                                                            </Button>
                                                        </div>

                                                        {lot.bomMode === 'predefined' && (
                                                            <div className="p-3 rounded-lg bg-muted/50 border space-y-2">
                                                                <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                                                                    <Lock className="h-3 w-3" /> Predefined BOM (locked — cannot be modified)
                                                                </p>
                                                                {lot.activeBOM.stages.map(stage => (
                                                                    <div key={stage.stage} className="space-y-0.5">
                                                                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">{stage.stage}</Badge>
                                                                        {stage.materials.map(m => (
                                                                            <p key={m.materialId} className="text-xs text-muted-foreground ml-3">
                                                                                {m.materialName}: {m.quantityPerPiece} {m.materialUnit}/pc (+{m.wastagePercent}% wastage)
                                                                            </p>
                                                                        ))}
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}

                                                        {lot.bomMode === 'custom' && (
                                                            <CustomBOMBuilder
                                                                stages={lot.customBOMStages}
                                                                stageConfigs={stageConfigs}
                                                                materials={materials}
                                                                lotStages={lot.stages.map(s => s.stage)}
                                                                onChange={newStages => setLots(prev => prev.map((l, i) => i !== lotIdx ? l : { ...l, customBOMStages: newStages }))}
                                                            />
                                                        )}
                                                    </div>
                                                ) : (
                                                    // No predefined BOM — custom only
                                                    <CustomBOMBuilder
                                                        stages={lot.customBOMStages}
                                                        stageConfigs={stageConfigs}
                                                        materials={materials}
                                                        lotStages={lot.stages.map(s => s.stage)}
                                                        onChange={newStages => setLots(prev => prev.map((l, i) => i !== lotIdx ? l : { ...l, customBOMStages: newStages }))}
                                                    />
                                                )}
                                            </div>
                                        )}
                                    </CardContent>
                                )}
                            </Card>
                        </motion.div>
                    ))}
                </div>
            </div>
        </div>
    );
}