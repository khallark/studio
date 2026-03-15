'use client';

// /business/[businessId]/b2b/orders/[orderId]/edit/page.tsx

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useBusinessContext } from '../../../../layout';
import { db } from '@/lib/firebase';
import { doc, collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { Buyer, Product, ProductionStageConfig, Order, DraftLotInput, StageName } from '@/types/b2b';
import { motion } from 'framer-motion';
import { format, addDays } from 'date-fns';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import {
    Select, SelectContent, SelectItem,
    SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import {
    ArrowLeft, CalendarIcon, Plus, Trash2,
    Loader2, Save, Zap, Package, ChevronDown, ChevronUp,
} from 'lucide-react';

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────

interface LotForm {
    productId: string;
    productName: string;
    productSku: string;
    color: string;
    size: string;
    quantity: string;
    stages: Array<{
        stage: StageName;
        plannedDate: string;
        isOutsourced: boolean;
        outsourceVendorName: string | null;
    }>;
    expanded: boolean;
}

function draftLotToForm(dl: DraftLotInput): LotForm {
    return {
        productId: dl.productId,
        productName: dl.productName,
        productSku: dl.productSku,
        color: dl.color,
        size: dl.size ?? '',
        quantity: String(dl.quantity),
        stages: dl.stages.map(s => ({
            stage: s.stage,
            plannedDate: typeof s.plannedDate === 'string'
                ? s.plannedDate.slice(0, 10)
                : format(new Date(s.plannedDate), 'yyyy-MM-dd'),
            isOutsourced: s.isOutsourced,
            outsourceVendorName: s.outsourceVendorName,
        })),
        expanded: false,
    };
}

function emptyLot(): LotForm {
    return {
        productId: '', productName: '', productSku: '',
        color: '', size: '', quantity: '',
        stages: [
            { stage: 'CUTTING', plannedDate: format(addDays(new Date(), 7), 'yyyy-MM-dd'), isOutsourced: false, outsourceVendorName: null },
            { stage: 'STITCHING', plannedDate: format(addDays(new Date(), 14), 'yyyy-MM-dd'), isOutsourced: false, outsourceVendorName: null },
            { stage: 'FINISHING', plannedDate: format(addDays(new Date(), 18), 'yyyy-MM-dd'), isOutsourced: false, outsourceVendorName: null },
            { stage: 'PACKING', plannedDate: format(addDays(new Date(), 21), 'yyyy-MM-dd'), isOutsourced: false, outsourceVendorName: null },
        ],
        expanded: true,
    };
}

// ─────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────

export default function EditDraftOrderPage() {
    const params = useParams();
    const router = useRouter();
    const { businessId, user, isAuthorized, loading: authLoading } = useBusinessContext();
    const orderId = params.orderId as string;

    // Master data
    const [buyers, setBuyers] = useState<Buyer[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [stageConfigs, setStageConfigs] = useState<ProductionStageConfig[]>([]);

    // Form state — initialized from the draft order
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

    // ── Load master data ────────────────────────────────────────────────────
    useEffect(() => {
        if (!isAuthorized || !businessId) return;
        const u1 = onSnapshot(
            query(collection(db, 'users', businessId, 'buyers'), orderBy('name')),
            snap => setBuyers(snap.docs.map(d => ({ id: d.id, ...d.data() } as Buyer)))
        );
        const u2 = onSnapshot(
            query(collection(db, 'users', businessId, 'b2bProducts'), orderBy('name')),
            snap => setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() } as Product)))
        );
        const u3 = onSnapshot(
            query(collection(db, 'users', businessId, 'production_stage_config'), orderBy('sortOrder')),
            snap => setStageConfigs(snap.docs.map(d => ({ id: d.id, ...d.data() } as ProductionStageConfig)))
        );
        return () => { u1(); u2(); u3(); };
    }, [businessId, isAuthorized]);

    // ── Load the existing draft order ────────────────────────────────────────
    useEffect(() => {
        if (!isAuthorized || !businessId || !orderId) return;
        const unsub = onSnapshot(doc(db, 'users', businessId, 'orders', orderId), snap => {
            if (!snap.exists()) {
                toast({ title: 'Order not found', variant: 'destructive' });
                router.back();
                return;
            }
            const order = snap.data() as Order;
            if (order.status !== 'DRAFT') {
                toast({ title: 'Only draft orders can be edited', variant: 'destructive' });
                router.push(`/business/${businessId}/b2b/orders/${orderId}`);
                return;
            }

            setBuyerId(order.buyerId);
            setBuyerName(order.buyerName);
            setBuyerContact(order.buyerContact);
            setShipDate(order.shipDate?.toDate());
            setDeliveryAddress(order.deliveryAddress);
            setNote(order.note ?? '');
            setLots(
                order.draftLots && order.draftLots.length > 0
                    ? order.draftLots.map(draftLotToForm)
                    : [emptyLot()]
            );
            setOrderLoading(false);

            // Only populate once — unsubscribe after first read
            unsub();
        });
        return () => unsub();
    }, [businessId, isAuthorized, orderId]);

    // ── Lot helpers ──────────────────────────────────────────────────────────
    const handleBuyerChange = (id: string) => {
        const buyer = buyers.find(b => b.id === id);
        if (!buyer) return;
        setBuyerId(id);
        setBuyerName(buyer.name);
        setBuyerContact(buyer.phone);
    };

    const handleProductChange = (lotIdx: number, productId: string) => {
        const product = products.find(p => p.id === productId);
        if (!product) return;
        let cumulativeDays = 0;
        const stages = product.defaultStages.map(stageName => {
            const config = stageConfigs.find(sc => sc.name === stageName);
            cumulativeDays += config?.defaultDurationDays ?? 7;
            return {
                stage: stageName,
                plannedDate: format(addDays(new Date(), cumulativeDays), 'yyyy-MM-dd'),
                isOutsourced: false,
                outsourceVendorName: null as string | null,
            };
        });
        setLots(prev => prev.map((l, i) => i !== lotIdx ? l : {
            ...l, productId, productName: product.name, productSku: product.sku, stages,
        }));
    };

    const addStageToLot = (lotIdx: number) => {
        const firstConfig = stageConfigs[0];
        setLots(prev => prev.map((l, i) => i !== lotIdx ? l : {
            ...l,
            stages: [...l.stages, {
                stage: (firstConfig?.name ?? 'CUTTING') as StageName,
                plannedDate: format(addDays(new Date(), 7), 'yyyy-MM-dd'),
                isOutsourced: false,
                outsourceVendorName: null as string | null,
            }],
        }));
    };

    const removeStageFromLot = (lotIdx: number, stageIdx: number) => {
        setLots(prev => prev.map((l, i) => i !== lotIdx ? l : ({
            ...l,
            stages: l.stages.filter((_, si) => si !== stageIdx),
        })));
    };

    const updateStage = (lotIdx: number, stageIdx: number, field: string, value: string | boolean | null) => {
        setLots(prev => prev.map((l, i) => i !== lotIdx ? l : ({
            ...l,
            stages: l.stages.map((s, si) => si !== stageIdx ? s : { ...s, [field]: value }),
        })));
    };

    // ── Build lot payload ────────────────────────────────────────────────────
    const buildLotPayload = (): DraftLotInput[] => lots.map(l => ({
        productId: l.productId,
        productName: l.productName,
        productSku: l.productSku,
        color: l.color.trim(),
        size: l.size.trim() || null,
        quantity: parseInt(l.quantity),
        stages: l.stages.map(s => ({
            stage: s.stage,
            plannedDate: new Date(s.plannedDate).toISOString(),
            isOutsourced: s.isOutsourced,
            outsourceVendorName: s.outsourceVendorName,
        })),
    }));

    // ── Validation ───────────────────────────────────────────────────────────
    const validate = (): boolean => {
        if (!buyerId) { toast({ title: 'Select a buyer', variant: 'destructive' }); return false; }
        if (!shipDate) { toast({ title: 'Select a ship date', variant: 'destructive' }); return false; }
        if (!deliveryAddress.trim()) { toast({ title: 'Enter a delivery address', variant: 'destructive' }); return false; }
        if (lots.some(l => !l.productId || !l.color || !l.quantity || Number(l.quantity) <= 0)) {
            toast({ title: 'All lots need product, color, and quantity', variant: 'destructive' }); return false;
        }
        if (lots.some(l => l.stages.length === 0)) {
            toast({ title: 'Each lot needs at least one stage', variant: 'destructive' }); return false;
        }
        return true;
    };

    // ── Save draft ───────────────────────────────────────────────────────────
    const handleSave = async () => {
        if (!user || !validate()) return;
        setIsSaving(true);
        try {
            const token = await user.getIdToken();
            const res = await fetch('/api/business/b2b/update-draft-order', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({
                    businessId,
                    orderId,
                    buyerId,
                    buyerName,
                    buyerContact,
                    shipDate: shipDate!.toISOString(),
                    deliveryAddress: deliveryAddress.trim(),
                    note: note.trim() || undefined,
                    lots: buildLotPayload(),
                }),
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.error || result.message || 'Failed');
            toast({ title: 'Draft Saved', description: 'Changes saved successfully.' });
            router.push(`/business/${businessId}/b2b/orders/${orderId}`);
        } catch (err) {
            toast({ title: 'Error', description: (err as Error).message, variant: 'destructive' });
        } finally {
            setIsSaving(false);
        }
    };

    // ── Confirm order ────────────────────────────────────────────────────────
    const handleConfirm = async () => {
        if (!user || !validate()) return;
        setIsConfirming(true);
        try {
            const token = await user.getIdToken();
            // Pass the updated lots directly to confirm-order so it can validate BOM etc.
            const res = await fetch('/api/business/b2b/confirm-order', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({
                    businessId,
                    orderId,
                    confirmedBy: user.displayName || user.email || 'Unknown',
                    lots: buildLotPayload(),
                }),
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.error || result.message || 'Failed');
            toast({ title: 'Order Confirmed', description: 'Lots created and stock reserved.' });
            router.push(`/business/${businessId}/b2b/orders/${orderId}`);
        } catch (err) {
            toast({ title: 'Error', description: (err as Error).message, variant: 'destructive' });
        } finally {
            setIsConfirming(false);
        }
    };

    // ── Render ────────────────────────────────────────────────────────────────
    if (authLoading || orderLoading) return (
        <div className="p-6 space-y-4">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-40 rounded-xl" />
            <Skeleton className="h-64 rounded-xl" />
        </div>
    );

    if (!isAuthorized) return null;

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <motion.div
                initial={{ opacity: 0, y: -16 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-4 p-4 md:p-6 border-b bg-gradient-to-r from-background to-muted/20"
            >
                <Button variant="ghost" size="icon" onClick={() => router.back()}>
                    <ArrowLeft className="h-4 w-4" />
                </Button>
                <div>
                    <h1 className="text-xl font-bold">Edit Draft Order</h1>
                    <p className="text-xs text-muted-foreground">Changes are saved back to the draft — not yet in production</p>
                </div>
                <div className="ml-auto flex items-center gap-2">
                    <Button
                        variant="outline"
                        onClick={handleSave}
                        disabled={isSaving || isConfirming}
                    >
                        {isSaving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                        <Save className="h-4 w-4 mr-2" />
                        Save Draft
                    </Button>
                    <Button
                        onClick={handleConfirm}
                        disabled={isSaving || isConfirming}
                        className="gap-2"
                    >
                        {isConfirming && <Loader2 className="h-4 w-4 animate-spin" />}
                        <Zap className="h-4 w-4" />
                        Confirm Order
                    </Button>
                </div>
            </motion.div>

            <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
                {/* Order Details */}
                <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
                    <Card>
                        <CardHeader className="pb-4">
                            <CardTitle className="text-base">Order Details</CardTitle>
                        </CardHeader>
                        <CardContent className="grid md:grid-cols-2 gap-4">
                            {/* Buyer */}
                            <div className="space-y-2">
                                <Label>Buyer <span className="text-destructive">*</span></Label>
                                <Select value={buyerId} onValueChange={handleBuyerChange}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select buyer" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {buyers.filter(b => b.isActive).map(b => (
                                            <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Ship Date */}
                            <div className="space-y-2">
                                <Label>Ship Date <span className="text-destructive">*</span></Label>
                                <Popover open={shipCalOpen} onOpenChange={setShipCalOpen}>
                                    <PopoverTrigger asChild>
                                        <Button variant="outline" className={cn('w-full justify-start font-normal', !shipDate && 'text-muted-foreground')}>
                                            <CalendarIcon className="mr-2 h-4 w-4" />
                                            {shipDate ? format(shipDate, 'dd MMM yyyy') : 'Pick a date'}
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0" align="start">
                                        <Calendar
                                            mode="single"
                                            selected={shipDate}
                                            onSelect={d => { setShipDate(d); setShipCalOpen(false); }}
                                            initialFocus
                                        />
                                    </PopoverContent>
                                </Popover>
                            </div>

                            {/* Delivery Address */}
                            <div className="space-y-2 md:col-span-2">
                                <Label>Delivery Address <span className="text-destructive">*</span></Label>
                                <Textarea
                                    placeholder="Full delivery address"
                                    value={deliveryAddress}
                                    onChange={e => setDeliveryAddress(e.target.value)}
                                    rows={2}
                                />
                            </div>

                            {/* Note */}
                            <div className="space-y-2 md:col-span-2">
                                <Label>Note <span className="text-muted-foreground text-xs">(optional)</span></Label>
                                <Input
                                    placeholder="Any special instructions or notes"
                                    value={note}
                                    onChange={e => setNote(e.target.value)}
                                />
                            </div>
                        </CardContent>
                    </Card>
                </motion.div>

                {/* Lots */}
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="font-semibold">
                            Lots
                            <Badge variant="secondary" className="ml-2">{lots.length}</Badge>
                        </h2>
                        <Button
                            variant="outline" size="sm"
                            onClick={() => setLots(prev => [...prev, { productId: '', productName: '', productSku: '', color: '', size: '', quantity: '', stages: stageConfigs.map((sc, i) => ({ stage: sc.name as StageName, plannedDate: format(addDays(new Date(), stageConfigs.slice(0, i + 1).reduce((s, c) => s + c.defaultDurationDays, 0)), 'yyyy-MM-dd'), isOutsourced: false, outsourceVendorName: null as string | null })), expanded: true }])}
                            className="gap-2"
                        >
                            <Plus className="h-3.5 w-3.5" /> Add Lot
                        </Button>
                    </div>

                    {lots.map((lot, lotIdx) => (
                        <motion.div
                            key={lotIdx}
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: lotIdx * 0.04 }}
                        >
                            <Card className={cn('border-2', lot.productId ? 'border-primary/20' : 'border-border')}>
                                {/* Lot Header */}
                                <div
                                    className="flex items-center justify-between p-4 cursor-pointer select-none"
                                    onClick={() => setLots(prev => prev.map((l, i) => i === lotIdx ? { ...l, expanded: !l.expanded } : l))}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="p-1.5 rounded-lg bg-primary/10">
                                            <Package className="h-4 w-4 text-primary" />
                                        </div>
                                        <div>
                                            <p className="font-medium text-sm">
                                                {lot.productName || `Lot ${lotIdx + 1}`}
                                            </p>
                                            {lot.color && (
                                                <p className="text-xs text-muted-foreground">
                                                    {lot.color}{lot.size && ` · ${lot.size}`}{lot.quantity && ` · ${lot.quantity} pcs`}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {lots.length > 1 && (
                                            <Button
                                                variant="ghost" size="icon"
                                                className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                                                onClick={e => { e.stopPropagation(); setLots(prev => prev.filter((_, i) => i !== lotIdx)); }}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        )}
                                        {lot.expanded
                                            ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                                            : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                                    </div>
                                </div>

                                {lot.expanded && (
                                    <CardContent className="pt-0 space-y-4">
                                        <Separator />

                                        {/* Product + Details */}
                                        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
                                            <div className="space-y-2 md:col-span-2">
                                                <Label className="text-xs">Product <span className="text-destructive">*</span></Label>
                                                <Select value={lot.productId} onValueChange={v => handleProductChange(lotIdx, v)}>
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="Select product" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {products.filter(p => p.isActive).map(p => (
                                                            <SelectItem key={p.id} value={p.id}>
                                                                {p.name}
                                                                <span className="text-muted-foreground ml-1 text-xs">({p.sku})</span>
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <div className="space-y-2">
                                                <Label className="text-xs">Color <span className="text-destructive">*</span></Label>
                                                <Input
                                                    placeholder="e.g. White"
                                                    value={lot.color}
                                                    onChange={e => setLots(prev => prev.map((l, i) => i === lotIdx ? { ...l, color: e.target.value } : l))}
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <Label className="text-xs">Size</Label>
                                                <Input
                                                    placeholder="e.g. M"
                                                    value={lot.size}
                                                    onChange={e => setLots(prev => prev.map((l, i) => i === lotIdx ? { ...l, size: e.target.value } : l))}
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <Label className="text-xs">Quantity <span className="text-destructive">*</span></Label>
                                                <Input
                                                    type="number" min="1" placeholder="500"
                                                    value={lot.quantity}
                                                    onChange={e => setLots(prev => prev.map((l, i) => i === lotIdx ? { ...l, quantity: e.target.value } : l))}
                                                />
                                            </div>
                                        </div>

                                        {/* Stages */}
                                        <div className="space-y-2">
                                            <div className="flex items-center justify-between">
                                                <Label className="text-xs font-medium">Stage Pipeline</Label>
                                                <Button
                                                    variant="ghost" size="sm"
                                                    className="h-7 text-xs gap-1"
                                                    onClick={() => addStageToLot(lotIdx)}
                                                >
                                                    <Plus className="h-3 w-3" /> Add Stage
                                                </Button>
                                            </div>
                                            <div className="space-y-2">
                                                {lot.stages.map((stage, stageIdx) => (
                                                    <div key={stageIdx} className="flex items-center gap-3 p-2 rounded-lg bg-muted/40">
                                                        <span className="text-xs text-muted-foreground w-5 text-center font-mono">{stageIdx + 1}</span>
                                                        <Select
                                                            value={stage.stage}
                                                            onValueChange={v => updateStage(lotIdx, stageIdx, 'stage', v)}
                                                        >
                                                            <SelectTrigger className="h-8 text-xs w-36">
                                                                <SelectValue />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                {stageConfigs.map(s => (
                                                                    <SelectItem key={s.name} value={s.name} className="text-xs">{s.label}</SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                        <Input
                                                            type="date"
                                                            value={stage.plannedDate}
                                                            onChange={e => updateStage(lotIdx, stageIdx, 'plannedDate', e.target.value)}
                                                            className="h-8 text-xs flex-1"
                                                        />
                                                        {lot.stages.length > 1 && (
                                                            <Button
                                                                variant="ghost" size="icon"
                                                                className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                                                                onClick={() => removeStageFromLot(lotIdx, stageIdx)}
                                                            >
                                                                <Trash2 className="h-3.5 w-3.5" />
                                                            </Button>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </CardContent>
                                )}
                            </Card>
                        </motion.div>
                    ))}
                </div>

                {/* Mobile bottom actions */}
                <div className="flex gap-3 md:hidden pb-4">
                    <Button
                        variant="outline" className="flex-1"
                        onClick={handleSave}
                        disabled={isSaving || isConfirming}
                    >
                        {isSaving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                        Save Draft
                    </Button>
                    <Button
                        className="flex-1"
                        onClick={handleConfirm}
                        disabled={isSaving || isConfirming}
                    >
                        {isConfirming && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                        Confirm Order
                    </Button>
                </div>
            </div>
        </div>
    );
}