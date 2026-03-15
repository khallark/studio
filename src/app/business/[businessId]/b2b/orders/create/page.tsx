'use client';

// /business/[businessId]/b2b/orders/create/page.tsx

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useBusinessContext } from '../../../layout';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { Buyer, Product, ProductionStageConfig, DraftLotInput, StageName } from '@/types/b2b';
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
// CONSTANTS
// ─────────────────────────────────────────────

interface LotForm {
    productId: string;
    productName: string;
    productSku: string;
    color: string;
    size: string;
    quantity: string;
    stages: Array<{ stage: StageName; plannedDate: string; isOutsourced: boolean; outsourceVendorName: string | null }>;
    expanded: boolean;
}

function emptyLot(stageConfigs: ProductionStageConfig[] = []): LotForm {
    // Build default stages from stageConfigs with cumulative planned dates
    let cumulativeDays = 0;
    const stages = stageConfigs.map(sc => {
        cumulativeDays += sc.defaultDurationDays;
        return {
            stage: sc.name as StageName,
            plannedDate: format(addDays(new Date(), cumulativeDays), 'yyyy-MM-dd'),
            isOutsourced: false,
            outsourceVendorName: null as string | null,
        };
    });
    return {
        productId: '', productName: '', productSku: '',
        color: '', size: '', quantity: '',
        stages: stages.length > 0 ? stages : [
            // Fallback if no stage configs yet — user will see a warning
            { stage: 'CUTTING' as StageName, plannedDate: format(addDays(new Date(), 7), 'yyyy-MM-dd'), isOutsourced: false, outsourceVendorName: null },
        ],
        expanded: true,
    };
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

    // Form state
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

        const unsub1 = onSnapshot(
            query(collection(db, 'users', businessId, 'buyers'), orderBy('name')),
            snap => setBuyers(snap.docs.map(d => ({ id: d.id, ...d.data() } as Buyer)))
        );
        const unsub2 = onSnapshot(
            query(collection(db, 'users', businessId, 'b2bProducts'), orderBy('name')),
            snap => setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() } as Product)))
        );
        const unsub3 = onSnapshot(
            query(collection(db, 'users', businessId, 'production_stage_config'), orderBy('sortOrder')),
            snap => {
                const configs = snap.docs.map(d => ({ id: d.id, ...d.data() } as ProductionStageConfig));
                setStageConfigs(configs);
                // Seed initial lot once configs load
                setLots(prev => prev.length === 0 ? [emptyLot(configs)] : prev);
            }
        );
        return () => { unsub1(); unsub2(); unsub3(); };
    }, [businessId, isAuthorized]);

    // ── Buyer select ────────────────────────────────────────────────────────
    const handleBuyerChange = (id: string) => {
        const buyer = buyers.find(b => b.id === id);
        if (!buyer) return;
        setBuyerId(id);
        setBuyerName(buyer.name);
        setBuyerContact(buyer.phone);
    };

    // ── Lot helpers ──────────────────────────────────────────────────────────
    const handleProductChange = (lotIdx: number, productId: string) => {
        const product = products.find(p => p.id === productId);
        if (!product) return;
        // Build planned dates using defaultDurationDays from stageConfigs
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
        setLots(prev => prev.map((l, i) => i !== lotIdx ? l : {
            ...l,
            stages: l.stages.filter((_, si) => si !== stageIdx),
        }));
    };

    const updateStage = (lotIdx: number, stageIdx: number, field: string, value: string | boolean | null) => {
        setLots(prev => prev.map((l, i) => i !== lotIdx ? l : {
            ...l,
            stages: l.stages.map((s, si) => si !== stageIdx ? s : { ...s, [field]: value }),
        }));
    };

    // ── Submit ────────────────────────────────────────────────────────────────
    const handleSubmit = async (draft: boolean) => {
        if (!user) return;

        // Basic validation
        if (!buyerId) { toast({ title: 'Missing buyer', variant: 'destructive' }); return; }
        if (!shipDate) { toast({ title: 'Missing ship date', variant: 'destructive' }); return; }
        if (!deliveryAddress.trim()) { toast({ title: 'Missing delivery address', variant: 'destructive' }); return; }
        if (lots.some(l => !l.productId || !l.color || !l.quantity || Number(l.quantity) <= 0)) {
            toast({ title: 'All lots need product, color, and quantity', variant: 'destructive' }); return;
        }

        setIsDraft(draft);
        setIsSubmitting(true);

        try {
            const token = await user.getIdToken();
            const payload = {
                businessId,
                buyerId,
                buyerName,
                buyerContact,
                shipDate: shipDate.toISOString(),
                deliveryAddress: deliveryAddress.trim(),
                note: note.trim() || undefined,
                createdBy: user.displayName || user.email || 'Unknown',
                lots: lots.map(l => ({
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
                } satisfies DraftLotInput)),
            };

            const endpoint = draft
                ? '/api/business/b2b/save-draft-order'
                : '/api/business/b2b/create-order';

            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify(payload),
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.error || result.message || 'Failed');

            toast({
                title: draft ? 'Draft Saved' : 'Order Created',
                description: `${result.orderNumber} ${draft ? 'saved as draft' : 'is now in production'}.`,
            });
            router.push(`/business/${businessId}/b2b/orders`);
        } catch (err) {
            toast({ title: 'Error', description: (err as Error).message, variant: 'destructive' });
        } finally {
            setIsSubmitting(false);
        }
    };

    if (authLoading) return <div className="flex items-center justify-center h-64"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
    if (!isAuthorized) return null;

    // ── Render ────────────────────────────────────────────────────────────────
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
                    <h1 className="text-xl font-bold">New Order</h1>
                    <p className="text-xs text-muted-foreground">Fill in order details and configure lots</p>
                </div>
                <div className="ml-auto flex items-center gap-2">
                    <Button
                        variant="outline"
                        onClick={() => handleSubmit(true)}
                        disabled={isSubmitting}
                    >
                        {isSubmitting && isDraft && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                        <Save className="h-4 w-4 mr-2" />
                        Save Draft
                    </Button>
                    <Button
                        onClick={() => handleSubmit(false)}
                        disabled={isSubmitting}
                        className="gap-2"
                    >
                        {isSubmitting && !isDraft && <Loader2 className="h-4 w-4 animate-spin" />}
                        <Zap className="h-4 w-4" />
                        Create Order
                    </Button>
                </div>
            </motion.div>

            <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
                {/* Order Details Card */}
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
                                        {buyers.map(b => (
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
                                        <Calendar mode="single" selected={shipDate} onSelect={d => { setShipDate(d); setShipCalOpen(false); }} initialFocus />
                                    </PopoverContent>
                                </Popover>
                            </div>

                            {/* Delivery Address */}
                            <div className="space-y-2 md:col-span-2">
                                <Label>Delivery Address <span className="text-destructive">*</span></Label>
                                <Textarea
                                    placeholder="Enter full delivery address"
                                    value={deliveryAddress}
                                    onChange={e => setDeliveryAddress(e.target.value)}
                                    rows={2}
                                />
                            </div>

                            {/* Note */}
                            <div className="space-y-2 md:col-span-2">
                                <Label>Note <span className="text-muted-foreground text-xs">(optional)</span></Label>
                                <Input placeholder="Any special instructions or notes" value={note} onChange={e => setNote(e.target.value)} />
                            </div>
                        </CardContent>
                    </Card>
                </motion.div>

                {/* Warn if no stage configs */}
                {stageConfigs.length === 0 && (
                    <div className="p-4 rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/20 text-sm text-amber-700 dark:text-amber-400">
                        No production stages configured yet. Go to <strong>Stages</strong> to add stages before creating orders.
                    </div>
                )}

                {/* Lots */}
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="font-semibold">
                            Lots
                            <Badge variant="secondary" className="ml-2">{lots.length}</Badge>
                        </h2>
                        <Button variant="outline" size="sm" onClick={() => setLots(prev => [...prev, emptyLot(stageConfigs)])} className="gap-2">
                            <Plus className="h-3.5 w-3.5" />
                            Add Lot
                        </Button>
                    </div>

                    {lots.map((lot, lotIdx) => (
                        <motion.div
                            key={lotIdx}
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: lotIdx * 0.05 }}
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
                                                    {lot.color}{lot.size && ` • ${lot.size}`}{lot.quantity && ` • ${lot.quantity} pcs`}
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
                                        {lot.expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
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
                                                        {products.map(p => (
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
                                                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => addStageToLot(lotIdx)}>
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
                                                                {stageConfigs.map(s => <SelectItem key={s.name} value={s.name} className="text-xs">{s.label}</SelectItem>)}
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

                {/* Bottom Actions (mobile) */}
                <div className="flex gap-3 md:hidden pb-4">
                    <Button variant="outline" className="flex-1" onClick={() => handleSubmit(true)} disabled={isSubmitting}>
                        {isSubmitting && isDraft && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                        Save Draft
                    </Button>
                    <Button className="flex-1" onClick={() => handleSubmit(false)} disabled={isSubmitting}>
                        {isSubmitting && !isDraft && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                        Create Order
                    </Button>
                </div>
            </div>
        </div>
    );
}