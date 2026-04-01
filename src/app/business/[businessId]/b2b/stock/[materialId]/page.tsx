'use client';

// /business/[businessId]/b2b/stock/[materialId]/page.tsx

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useBusinessContext } from '../../../layout';
import { db } from '@/lib/firebase';
import { doc, collection, onSnapshot, query, where, orderBy } from 'firebase/firestore';
import { RawMaterial, MaterialTransaction } from '@/types/b2b';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
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
    ArrowLeft, Boxes, TrendingUp, TrendingDown,
    Loader2, ArrowUpCircle, ArrowDownCircle,
    MinusCircle,
} from 'lucide-react';

const TX_TYPE_CONFIG: Record<string, { label: string; icon: any; color: string; sign: string }> = {
    PURCHASE: { label: 'Purchase', icon: ArrowUpCircle, color: 'text-emerald-600', sign: '+' },
    ADJUSTMENT: { label: 'Adjustment', icon: MinusCircle, color: 'text-purple-600', sign: '' },
};

export default function MaterialDetailPage() {
    const params = useParams();
    const router = useRouter();
    const { businessId, isAuthorized, loading: authLoading, user } = useBusinessContext();
    const materialId = params.materialId as string;

    const [material, setMaterial] = useState<RawMaterial | null>(null);
    const [transactions, setTransactions] = useState<MaterialTransaction[]>([]);
    const [loading, setLoading] = useState(true);

    const [addOpen, setAddOpen] = useState(false);
    const [adjustOpen, setAdjustOpen] = useState(false);
    const [qty, setQty] = useState('');
    const [refId, setRefId] = useState('');
    const [note, setNote] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const resetForm = () => { setQty(''); setRefId(''); setNote(''); };

    const handleStockSubmit = async (adjust: boolean) => {
        if (!material || !user) return;
        const quantity = parseFloat(qty);
        if (isNaN(quantity) || quantity === 0) { toast({ title: 'Invalid quantity', variant: 'destructive' }); return; }
        if (!adjust && quantity <= 0) { toast({ title: 'Quantity must be positive', variant: 'destructive' }); return; }
        if (!adjust && !refId.trim()) { toast({ title: 'Reference ID required', variant: 'destructive' }); return; }
        if (adjust && !note.trim()) { toast({ title: 'Note required for adjustments', variant: 'destructive' }); return; }

        setIsSubmitting(true);
        try {
            const token = await user.getIdToken();
            const endpoint = adjust ? '/api/business/b2b/adjust-stock' : '/api/business/b2b/add-stock';
            const payload: Record<string, unknown> = {
                businessId, materialId, quantity,
                createdBy: user.displayName || user.email || 'Unknown',
            };
            if (!adjust) payload.referenceId = refId.trim();
            payload.note = note.trim() || null;
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify(payload),
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.error || 'Failed');
            toast({ title: adjust ? 'Stock Adjusted' : 'Stock Added' });
            adjust ? setAdjustOpen(false) : setAddOpen(false);
            resetForm();
        } catch (err) {
            toast({ title: 'Error', description: (err as Error).message, variant: 'destructive' });
        } finally {
            setIsSubmitting(false);
        }
    };

    useEffect(() => {
        if (!isAuthorized || !businessId || !materialId) return;
        const u1 = onSnapshot(doc(db, 'users', businessId, 'raw_materials', materialId), snap => {
            if (snap.exists()) setMaterial({ id: snap.id, ...snap.data() } as RawMaterial);
            setLoading(false);
        });
        const u2 = onSnapshot(
            query(
                collection(db, 'users', businessId, 'material_transactions'),
                where('materialId', '==', materialId),
                orderBy('createdAt', 'desc')
            ),
            snap => setTransactions(snap.docs.map(d => ({ id: d.id, ...d.data() } as MaterialTransaction)))
        );
        return () => { u1(); u2(); };
    }, [businessId, isAuthorized, materialId]);

    const stockPct = material && material.totalStock > 0
        ? Math.round((material.availableStock / material.totalStock) * 100) : 0;
    const healthColor = !material ? 'bg-muted'
        : material.availableStock <= 0 ? 'bg-red-500'
            : material.availableStock <= material.reorderLevel ? 'bg-amber-500'
                : 'bg-emerald-500';

    if (authLoading || loading) return (
        <div className="p-6 space-y-4">
            <Skeleton className="h-8 w-48" />
            <div className="grid grid-cols-2 gap-4">{[1, 2].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
            <Skeleton className="h-64 rounded-xl" />
        </div>
    );
    if (!isAuthorized || !material) return null;

    return (
        <div className="flex flex-col h-full overflow-y-auto">
            {/* Header */}
            <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-4 p-4 md:p-6 border-b bg-gradient-to-r from-background to-muted/20 sticky top-0 z-10 bg-background">
                <Button variant="ghost" size="icon" onClick={() => router.back()}><ArrowLeft className="h-4 w-4" /></Button>
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-primary/10 ring-1 ring-primary/20">
                        <Boxes className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold">{material.name}</h1>
                        <p className="text-xs text-muted-foreground font-mono">{material.sku} · {material.category} · {material.unit}</p>
                    </div>
                </div>
                <div className="flex items-center gap-2 ml-auto">
                    <Button variant="outline" size="sm" className="gap-2" onClick={() => { resetForm(); setAddOpen(true); }}>
                        <TrendingUp className="h-4 w-4" /> Add Stock
                    </Button>
                    <Button variant="ghost" size="sm" className="gap-2" onClick={() => { resetForm(); setAdjustOpen(true); }}>
                        <TrendingDown className="h-4 w-4" /> Adjust
                    </Button>
                </div>
            </motion.div>

            <div className="p-4 md:p-6 space-y-6">
                {/* Stock Cards — no "Reserved" card anymore */}
                <div className="grid grid-cols-2 gap-4">
                    {[
                        { label: 'Total Stock', value: material.totalStock, unit: material.unit, color: 'text-foreground' },
                        { label: 'Available', value: material.availableStock, unit: material.unit, color: material.availableStock <= 0 ? 'text-red-600' : material.availableStock <= material.reorderLevel ? 'text-amber-600' : 'text-emerald-600' },
                    ].map(card => (
                        <Card key={card.label} className="border-border/50">
                            <CardContent className="p-4">
                                <p className="text-xs text-muted-foreground">{card.label}</p>
                                <p className={cn('text-xl font-bold mt-1 font-mono', card.color)}>{card.value.toLocaleString()}</p>
                                <p className="text-xs text-muted-foreground">{card.unit}</p>
                            </CardContent>
                        </Card>
                    ))}
                </div>

                {/* Stock health bar */}
                <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>Stock level</span>
                        <span className="font-mono">{stockPct}%</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <motion.div className={cn('h-full rounded-full', healthColor)}
                            initial={{ width: 0 }} animate={{ width: `${Math.max(0, Math.min(100, stockPct))}%` }} transition={{ duration: 0.6, ease: 'easeOut' }} />
                    </div>
                    {material.availableStock <= material.reorderLevel && (
                        <p className="text-xs text-amber-600">
                            {material.availableStock <= 0
                                ? 'Out of stock'
                                : `Below reorder level (${material.reorderLevel} ${material.unit})`}
                        </p>
                    )}
                </div>

                {/* Transaction Log */}
                <div className="space-y-3">
                    <h2 className="font-semibold text-sm">Transaction Log ({transactions.length})</h2>
                    {transactions.length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground text-sm border rounded-xl">No transactions yet</div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Type</TableHead>
                                    <TableHead className="text-right">Quantity</TableHead>
                                    <TableHead className="text-right">Before</TableHead>
                                    <TableHead className="text-right">After</TableHead>
                                    <TableHead>Note</TableHead>
                                    <TableHead>By</TableHead>
                                    <TableHead>Date</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {transactions.map((tx, i) => {
                                    const config = TX_TYPE_CONFIG[tx.type] ?? { label: tx.type, icon: MinusCircle, color: 'text-muted-foreground', sign: '' };
                                    const Icon = config.icon;
                                    return (
                                        <motion.tr key={tx.id} initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { delay: i * 0.02 } }}
                                            className="border-b hover:bg-muted/30 transition-colors">
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                    <Icon className={cn('h-4 w-4 shrink-0', config.color)} />
                                                    <span className="text-sm font-medium">{config.label}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell className={cn('text-right font-mono text-sm font-semibold', config.color)}>
                                                {config.sign}{Math.abs(tx.quantity)} {material.unit}
                                            </TableCell>
                                            <TableCell className="text-right font-mono text-sm text-muted-foreground">
                                                {tx.stockBefore !== null && tx.stockBefore !== undefined ? tx.stockBefore : '—'}
                                            </TableCell>
                                            <TableCell className="text-right font-mono text-sm text-muted-foreground">
                                                {tx.stockAfter !== null && tx.stockAfter !== undefined ? tx.stockAfter : '—'}
                                            </TableCell>
                                            <TableCell className="text-sm text-muted-foreground max-w-xs truncate">{tx.note || '—'}</TableCell>
                                            <TableCell className="text-sm text-muted-foreground">{tx.createdBy}</TableCell>
                                            <TableCell className="text-xs text-muted-foreground">
                                                {tx.createdAt ? format(tx.createdAt.toDate(), 'dd MMM, HH:mm') : '—'}
                                            </TableCell>
                                        </motion.tr>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    )}
                </div>
            </div>

            {/* Add Stock Dialog */}
            <Dialog open={addOpen} onOpenChange={o => !o && setAddOpen(false)}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Add Stock</DialogTitle>
                        <DialogDescription>{material.name} · Current: <span className="font-mono">{material.availableStock} {material.unit}</span></DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <div className="space-y-2">
                            <Label className="text-xs">Quantity ({material.unit}) <span className="text-destructive">*</span></Label>
                            <Input type="number" min="0.001" step="0.01" placeholder="e.g. 500" value={qty} onChange={e => setQty(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs">Reference ID / PO Number <span className="text-destructive">*</span></Label>
                            <Input placeholder="e.g. PO-2024-001" value={refId} onChange={e => setRefId(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs">Note</Label>
                            <Input placeholder="Optional note" value={note} onChange={e => setNote(e.target.value)} />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
                        <Button onClick={() => handleStockSubmit(false)} disabled={isSubmitting} className="gap-2">
                            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />} Add Stock
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Adjust Stock Dialog */}
            <Dialog open={adjustOpen} onOpenChange={o => !o && setAdjustOpen(false)}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Adjust Stock</DialogTitle>
                        <DialogDescription>{material.name} · Current: <span className="font-mono">{material.availableStock} {material.unit}</span></DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <div className="space-y-2">
                            <Label className="text-xs">Quantity ({material.unit}) <span className="text-muted-foreground">(negative to reduce)</span> <span className="text-destructive">*</span></Label>
                            <Input type="number" step="0.01" placeholder="e.g. -50 or +100" value={qty} onChange={e => setQty(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs">Reason <span className="text-destructive">*</span></Label>
                            <Input placeholder="e.g. Damaged goods, counting error..." value={note} onChange={e => setNote(e.target.value)} />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setAdjustOpen(false)}>Cancel</Button>
                        <Button onClick={() => handleStockSubmit(true)} disabled={isSubmitting} className="gap-2">
                            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />} Apply Adjustment
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}