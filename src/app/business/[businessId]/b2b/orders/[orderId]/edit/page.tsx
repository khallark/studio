'use client';

// /business/[businessId]/b2b/orders/[orderId]/edit/page.tsx

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useBusinessContext } from '../../../../layout';
import { db } from '@/lib/firebase';
import { doc, collection, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import {
    Buyer, Product, ProductionStageConfig, Order, DraftLotInput,
    StageName, BOM, LotBOMStage, RawMaterial,
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
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import {
    ArrowLeft, CalendarIcon, Plus, Trash2, Loader2, Save, Zap,
    Package, ChevronDown, ChevronUp, X, Lock,
} from 'lucide-react';

// ─────────────────────────────────────────────
// TYPES  (same as create page)
// ─────────────────────────────────────────────

interface CustomBOMStageInput {
    stage: StageName;
    materials: Array<{ materialId: string; quantityPerPiece: string; wastagePercent: string }>;
}

interface LotForm {
    productId: string; productName: string; productSku: string;
    color: string; size: string; quantity: string;
    stages: Array<{ stage: StageName; plannedDate: string; isOutsourced: boolean; outsourceVendorName: string | null }>;
    expanded: boolean;
    bomMode: 'predefined' | 'custom';
    bomId: string | null;
    activeBOM: BOM | null;
    customBOMStages: CustomBOMStageInput[];
}

function buildLotBOMSnapshot(lot: LotForm): LotBOMStage[] | null {
    if (lot.bomMode === 'predefined') return null;
    const qty = parseInt(lot.quantity) || 1;
    return lot.customBOMStages
        .filter(s => s.materials.some(m => m.materialId))
        .map(s => ({
            stage: s.stage,
            materials: s.materials.filter(m => m.materialId).map(m => ({
                materialId: m.materialId,
                materialName: '', materialUnit: '',
                quantityPerPiece: parseFloat(m.quantityPerPiece) || 0,
                wastagePercent: parseFloat(m.wastagePercent) || 0,
                totalQuantity: Math.round(qty * (parseFloat(m.quantityPerPiece) || 0) * (1 + (parseFloat(m.wastagePercent) || 0) / 100) * 100) / 100,
            })),
        }));
}

// Convert existing DraftLotInput back to LotForm (pre-fill)
function draftToForm(dl: DraftLotInput, boms: BOM[]): LotForm {
    const activeBOM = boms.find(b => b.productId === dl.productId) ?? null;
    // If the draft already has a bomId, use predefined mode
    const bomMode = dl.bomId ? 'predefined' : 'custom';
    const customBOMStages: CustomBOMStageInput[] = dl.customBOM
        ? dl.customBOM.map(s => ({
            stage: s.stage,
            materials: s.materials.map(m => ({
                materialId: m.materialId,
                quantityPerPiece: String(m.quantityPerPiece),
                wastagePercent: String(m.wastagePercent),
            })),
        }))
        : [];
    return {
        productId: dl.productId, productName: dl.productName, productSku: dl.productSku,
        color: dl.color, size: dl.size ?? '', quantity: String(dl.quantity),
        stages: dl.stages.map(s => ({
            stage: s.stage,
            plannedDate: typeof s.plannedDate === 'string' ? s.plannedDate.slice(0, 10) : format(new Date(s.plannedDate), 'yyyy-MM-dd'),
            isOutsourced: s.isOutsourced,
            outsourceVendorName: s.outsourceVendorName,
        })),
        expanded: false,
        bomMode, bomId: dl.bomId, activeBOM,
        customBOMStages,
    };
}

// ─────────────────────────────────────────────
// CUSTOM BOM BUILDER (inline)
// ─────────────────────────────────────────────

function CustomBOMBuilder({ stages, stageConfigs, materials, onChange }: {
    stages: CustomBOMStageInput[];
    stageConfigs: ProductionStageConfig[];
    materials: RawMaterial[];
    onChange: (s: CustomBOMStageInput[]) => void;
}) {
    const active = materials.filter(m => m.isActive);
    const addStage = () => {
        const next = stageConfigs.find(sc => !stages.some(s => s.stage === sc.name));
        onChange([...stages, { stage: (next?.name ?? stageConfigs[0]?.name ?? 'CUTTING') as StageName, materials: [{ materialId: '', quantityPerPiece: '', wastagePercent: '5' }] }]);
    };
    const removeStage = (si: number) => onChange(stages.filter((_, i) => i !== si));
    const addMat = (si: number) => onChange(stages.map((s, i) => i === si ? { ...s, materials: [...s.materials, { materialId: '', quantityPerPiece: '', wastagePercent: '5' }] } : s));
    const removeMat = (si: number, mi: number) => onChange(stages.map((s, i) => i === si ? { ...s, materials: s.materials.filter((_, j) => j !== mi) } : s));
    const upd = (si: number, mi: number, f: string, v: string) => onChange(stages.map((s, i) => i === si ? { ...s, materials: s.materials.map((m, j) => j === mi ? { ...m, [f]: v } : m) } : s));
    const updStage = (si: number, stage: StageName) => onChange(stages.map((s, i) => i === si ? { ...s, stage } : s));

    return (
        <div className="space-y-3 p-3 rounded-lg border bg-muted/10">
            <p className="text-xs font-medium text-muted-foreground">Custom BOM — add stages and materials</p>
            {stages.map((stage, si) => (
                <div key={si} className="border rounded-lg p-3 space-y-2 bg-background">
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground w-4">{si + 1}</span>
                        <Select value={stage.stage} onValueChange={v => updStage(si, v as StageName)}>
                            <SelectTrigger className="h-7 text-xs w-36"><SelectValue /></SelectTrigger>
                            <SelectContent>{stageConfigs.map(sc => <SelectItem key={sc.name} value={sc.name} className="text-xs">{sc.label}</SelectItem>)}</SelectContent>
                        </Select>
                        {stages.length > 1 && (
                            <Button variant="ghost" size="icon" className="h-6 w-6 ml-auto text-destructive" onClick={() => removeStage(si)}>
                                <Trash2 className="h-3 w-3" />
                            </Button>
                        )}
                    </div>
                    <div className="space-y-1.5 ml-6">
                        {stage.materials.map((mat, mi) => (
                            <div key={mi} className="flex items-center gap-1.5">
                                <Select value={mat.materialId} onValueChange={v => upd(si, mi, 'materialId', v)}>
                                    <SelectTrigger className="h-7 text-xs flex-1"><SelectValue placeholder="Select material" /></SelectTrigger>
                                    <SelectContent>{active.map(m => <SelectItem key={m.id} value={m.id} className="text-xs">{m.name} ({m.unit})</SelectItem>)}</SelectContent>
                                </Select>
                                <Input type="number" placeholder="Qty/pc" value={mat.quantityPerPiece} onChange={e => upd(si, mi, 'quantityPerPiece', e.target.value)} className="h-7 text-xs w-20" />
                                <Input type="number" placeholder="W%" value={mat.wastagePercent} onChange={e => upd(si, mi, 'wastagePercent', e.target.value)} className="h-7 text-xs w-16" />
                                {stage.materials.length > 1 && (
                                    <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => removeMat(si, mi)}><X className="h-3 w-3" /></Button>
                                )}
                            </div>
                        ))}
                        <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-1 text-muted-foreground px-1" onClick={() => addMat(si)}>
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

export default function EditDraftOrderPage() {
    const params = useParams();
    const router = useRouter();
    const { businessId, user, isAuthorized, loading: authLoading } = useBusinessContext();
    const orderId = params.orderId as string;

    const [buyers, setBuyers] = useState<Buyer[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [stageConfigs, setStageConfigs] = useState<ProductionStageConfig[]>([]);
    const [boms, setBoms] = useState<BOM[]>([]);
    const [materials, setMaterials] = useState<RawMaterial[]>([]);

    const [orderLoading, setOrderLoading] = useState(true);
    const [buyerId, setBuyerId] = useState('');
    const [buyerName, setBuyerName] = useState('');
    const [buyerContact, setBuyerContact] = useState('');
    const [shipDate, setShipDate] = useState<Date | undefined>(undefined);
    const [shipCalOpen, setShipCalOpen] = useState(false);
    const [deliveryAddress, setDeliveryAddress] = useState('');
    const [note, setNote] = useState('');
    const [lots, setLots] = useState<LotForm[]>([]);
    const [isSaving, setIsSaving] = useState(false);
    const [isConfirming, setIsConfirming] = useState(false);

    // ── Load master data ─────────────────────────────────────────────────────
    useEffect(() => {
        if (!isAuthorized || !businessId) return;
        const u1 = onSnapshot(query(collection(db, 'users', businessId, 'buyers'), orderBy('name')),
            snap => setBuyers(snap.docs.map(d => ({ id: d.id, ...d.data() } as Buyer))));
        const u2 = onSnapshot(query(collection(db, 'users', businessId, 'b2bProducts'), orderBy('name')),
            snap => setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() } as Product))));
        const u3 = onSnapshot(query(collection(db, 'users', businessId, 'production_stage_config'), orderBy('sortOrder')),
            snap => setStageConfigs(snap.docs.map(d => ({ id: d.id, ...d.data() } as ProductionStageConfig))));
        const u4 = onSnapshot(query(collection(db, 'users', businessId, 'bom'), where('isActive', '==', true)),
            snap => setBoms(snap.docs.map(d => ({ id: d.id, ...d.data() } as BOM))));
        const u5 = onSnapshot(query(collection(db, 'users', businessId, 'raw_materials'), orderBy('name')),
            snap => setMaterials(snap.docs.map(d => ({ id: d.id, ...d.data() } as RawMaterial))));
        return () => { u1(); u2(); u3(); u4(); u5(); };
    }, [businessId, isAuthorized]);

    // ── Load draft order ─────────────────────────────────────────────────────
    useEffect(() => {
        if (!isAuthorized || !businessId || !orderId || boms === undefined) return;
        const unsub = onSnapshot(doc(db, 'users', businessId, 'orders', orderId), snap => {
            if (!snap.exists()) { toast({ title: 'Order not found', variant: 'destructive' }); router.back(); return; }
            const order = snap.data() as Order;
            if (order.status !== 'DRAFT') {
                toast({ title: 'Only draft orders can be edited', variant: 'destructive' });
                router.push(`/business/${businessId}/b2b/orders/${orderId}`);
                return;
            }
            setBuyerId(order.buyerId); setBuyerName(order.buyerName); setBuyerContact(order.buyerContact);
            setShipDate(order.shipDate?.toDate());
            setDeliveryAddress(order.deliveryAddress);
            setNote(order.note ?? '');
            setLots(order.draftLots?.length ? order.draftLots.map(dl => draftToForm(dl, boms)) : []);
            setOrderLoading(false);
            unsub();
        });
        return () => unsub();
    }, [businessId, isAuthorized, orderId, boms.length > 0]);

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
            customBOMStages: [],
        }));
    };

    const addStageToLot = (lotIdx: number) => {
        const first = stageConfigs[0];
        setLots(prev => prev.map((l, i) => i !== lotIdx ? l : {
            ...l, stages: [...l.stages, { stage: (first?.name ?? 'CUTTING') as StageName, plannedDate: format(addDays(new Date(), 7), 'yyyy-MM-dd'), isOutsourced: false, outsourceVendorName: null as string | null }],
        }));
    };

    const removeStageFromLot = (lotIdx: number, si: number) =>
        setLots(prev => prev.map((l, i) => i !== lotIdx ? l : { ...l, stages: l.stages.filter((_, j) => j !== si) }));

    const updateStage = (lotIdx: number, si: number, field: string, value: string | boolean | null) =>
        setLots(prev => prev.map((l, i) => i !== lotIdx ? l : { ...l, stages: l.stages.map((s, j) => j !== si ? s : { ...s, [field]: value }) }));

    const setBOMMode = (lotIdx: number, mode: 'predefined' | 'custom') =>
        setLots(prev => prev.map((l, i) => i !== lotIdx ? l : { ...l, bomMode: mode, bomId: mode === 'predefined' ? l.activeBOM?.id ?? null : null }));

    const buildPayload = (): DraftLotInput[] => lots.map(l => ({
        productId: l.productId, productName: l.productName, productSku: l.productSku,
        color: l.color.trim(), size: l.size.trim() || null, quantity: parseInt(l.quantity),
        stages: l.stages.map(s => ({ stage: s.stage, plannedDate: new Date(s.plannedDate).toISOString(), isOutsourced: s.isOutsourced, outsourceVendorName: s.outsourceVendorName })),
        bomId: l.bomMode === 'predefined' ? l.bomId : null,
        customBOM: l.bomMode === 'custom' ? buildLotBOMSnapshot(l) : null,
    }));

    const validate = () => {
        if (!buyerId) { toast({ title: 'Select a buyer', variant: 'destructive' }); return false; }
        if (!shipDate) { toast({ title: 'Select a ship date', variant: 'destructive' }); return false; }
        if (!deliveryAddress.trim()) { toast({ title: 'Enter a delivery address', variant: 'destructive' }); return false; }
        if (lots.some(l => !l.productId || !l.color || !l.quantity || Number(l.quantity) <= 0)) {
            toast({ title: 'All lots need product, color, and quantity', variant: 'destructive' }); return false;
        }
        return true;
    };

    const handleSave = async () => {
        if (!user || !validate()) return;
        setIsSaving(true);
        try {
            const token = await user.getIdToken();
            const res = await fetch('/api/business/b2b/update-draft-order', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ businessId, orderId, buyerId, buyerName, buyerContact, shipDate: shipDate!.toISOString(), deliveryAddress: deliveryAddress.trim(), note: note.trim() || undefined, lots: buildPayload() }),
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.error || result.message || 'Failed');
            toast({ title: 'Draft Saved' });
            router.push(`/business/${businessId}/b2b/orders/${orderId}`);
        } catch (err) {
            toast({ title: 'Error', description: (err as Error).message, variant: 'destructive' });
        } finally {
            setIsSaving(false);
        }
    };

    const handleConfirm = async () => {
        if (!user || !validate()) return;
        setIsConfirming(true);
        try {
            const token = await user.getIdToken();
            const res = await fetch('/api/business/b2b/confirm-order', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ businessId, orderId, confirmedBy: user.displayName || user.email || 'Unknown', lots: buildPayload() }),
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.error || result.message || 'Failed');
            toast({ title: 'Order Confirmed' });
            router.push(`/business/${businessId}/b2b/orders/${orderId}`);
        } catch (err) {
            toast({ title: 'Error', description: (err as Error).message, variant: 'destructive' });
        } finally {
            setIsConfirming(false);
        }
    };

    if (authLoading || orderLoading) return (
        <div className="p-6 space-y-4">
            <Skeleton className="h-8 w-48" /><Skeleton className="h-40 rounded-xl" /><Skeleton className="h-64 rounded-xl" />
        </div>
    );
    if (!isAuthorized) return null;

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-4 p-4 md:p-6 border-b bg-gradient-to-r from-background to-muted/20">
                <Button variant="ghost" size="icon" onClick={() => router.back()}><ArrowLeft className="h-4 w-4" /></Button>
                <div>
                    <h1 className="text-xl font-bold">Edit Draft Order</h1>
                    <p className="text-xs text-muted-foreground">Changes are saved back to the draft</p>
                </div>
                <div className="ml-auto flex items-center gap-2">
                    <Button variant="outline" onClick={handleSave} disabled={isSaving || isConfirming}>
                        {isSaving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                        <Save className="h-4 w-4 mr-2" /> Save Draft
                    </Button>
                    <Button onClick={handleConfirm} disabled={isSaving || isConfirming} className="gap-2">
                        {isConfirming && <Loader2 className="h-4 w-4 animate-spin" />}
                        <Zap className="h-4 w-4" /> Confirm Order
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
                            <Input placeholder="Special instructions" value={note} onChange={e => setNote(e.target.value)} />
                        </div>
                    </CardContent>
                </Card>

                {/* Lots */}
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="font-semibold">Lots <Badge variant="secondary" className="ml-2">{lots.length}</Badge></h2>
                        <Button variant="outline" size="sm" className="gap-2" onClick={() => setLots(prev => [...prev, {
                            productId: '', productName: '', productSku: '', color: '', size: '', quantity: '',
                            stages: stageConfigs.map((sc, i) => ({ stage: sc.name as StageName, plannedDate: format(addDays(new Date(), stageConfigs.slice(0, i + 1).reduce((s, c) => s + c.defaultDurationDays, 0)), 'yyyy-MM-dd'), isOutsourced: false, outsourceVendorName: null as string | null })),
                            expanded: true, bomMode: 'custom', bomId: null, activeBOM: null, customBOMStages: [],
                        }])}>
                            <Plus className="h-3.5 w-3.5" /> Add Lot
                        </Button>
                    </div>

                    {lots.map((lot, lotIdx) => (
                        <motion.div key={lotIdx} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0, transition: { delay: lotIdx * 0.04 } }}>
                            <Card className={cn('border-2', lot.productId ? 'border-primary/20' : 'border-border')}>
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
                                                {lot.stages.map((stage, si) => (
                                                    <div key={si} className="flex items-center gap-3 p-2 rounded-lg bg-muted/40">
                                                        <span className="text-xs text-muted-foreground w-5 text-center font-mono">{si + 1}</span>
                                                        <Select value={stage.stage} onValueChange={v => updateStage(lotIdx, si, 'stage', v)}>
                                                            <SelectTrigger className="h-8 text-xs w-36"><SelectValue /></SelectTrigger>
                                                            <SelectContent>{stageConfigs.map(s => <SelectItem key={s.name} value={s.name} className="text-xs">{s.label}</SelectItem>)}</SelectContent>
                                                        </Select>
                                                        <Input type="date" value={stage.plannedDate} onChange={e => updateStage(lotIdx, si, 'plannedDate', e.target.value)} className="h-8 text-xs flex-1" />
                                                        {lot.stages.length > 1 && (
                                                            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0" onClick={() => removeStageFromLot(lotIdx, si)}>
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
                                                                    <Lock className="h-3 w-3" /> Predefined BOM (locked)
                                                                </p>
                                                                {lot.activeBOM.stages.map(stage => (
                                                                    <div key={stage.stage} className="space-y-0.5">
                                                                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">{stage.stage}</Badge>
                                                                        {stage.materials.map(m => (
                                                                            <p key={m.materialId} className="text-xs text-muted-foreground ml-3">
                                                                                {m.materialName}: {m.quantityPerPiece} {m.materialUnit}/pc (+{m.wastagePercent}%)
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
                                                                onChange={s => setLots(prev => prev.map((l, i) => i !== lotIdx ? l : { ...l, customBOMStages: s }))}
                                                            />
                                                        )}
                                                    </div>
                                                ) : (
                                                    <CustomBOMBuilder
                                                        stages={lot.customBOMStages}
                                                        stageConfigs={stageConfigs}
                                                        materials={materials}
                                                        onChange={s => setLots(prev => prev.map((l, i) => i !== lotIdx ? l : { ...l, customBOMStages: s }))}
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