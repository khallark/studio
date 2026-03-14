'use client';

// /business/[businessId]/b2b/stock/[materialId]/page.tsx

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useBusinessContext } from '../../../layout';
import { db } from '@/lib/firebase';
import { doc, collection, onSnapshot, query, where, orderBy } from 'firebase/firestore';
import { RawMaterial, MaterialTransaction, MaterialReservation } from '@/types/b2b';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
    Dialog, DialogContent, DialogHeader,
    DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
    Table, TableBody, TableCell, TableHead,
    TableHeader, TableRow,
} from '@/components/ui/table';
import {
    ArrowLeft, Boxes, TrendingUp, TrendingDown,
    Loader2, ArrowUpCircle, ArrowDownCircle,
    MinusCircle, RotateCcw, Lock,
} from 'lucide-react';

const TX_TYPE_CONFIG: Record<string, { label: string; icon: any; color: string; sign: string }> = {
    PURCHASE: { label: 'Purchase', icon: ArrowUpCircle, color: 'text-emerald-600', sign: '+' },
    RESERVATION: { label: 'Reserved', icon: Lock, color: 'text-blue-600', sign: '-' },
    CONSUMPTION: { label: 'Consumed', icon: ArrowDownCircle, color: 'text-red-600', sign: '-' },
    RETURN: { label: 'Return', icon: RotateCcw, color: 'text-amber-600', sign: '+' },
    ADJUSTMENT: { label: 'Adjustment', icon: MinusCircle, color: 'text-purple-600', sign: '' },
};

export default function MaterialDetailPage() {
    const params = useParams();
    const router = useRouter();
    const { businessId, isAuthorized, loading: authLoading, user } = useBusinessContext();
    const materialId = params.materialId as string;

    const [material, setMaterial] = useState<RawMaterial | null>(null);
    const [transactions, setTransactions] = useState<MaterialTransaction[]>([]);
    const [reservations, setReservations] = useState<MaterialReservation[]>([]);
    const [loading, setLoading] = useState(true);

    // Stock dialogs
    const [addOpen, setAddOpen] = useState(false);
    const [adjustOpen, setAdjustOpen] = useState(false);
    const [qty, setQty] = useState('');
    const [refId, setRefId] = useState('');
    const [note, setNote] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const resetStockForm = () => { setQty(''); setRefId(''); setNote(''); };

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
            resetStockForm();
        } catch (err) {
            toast({ title: 'Error', description: (err as Error).message, variant: 'destructive' });
        } finally {
            setIsSubmitting(false);
        }
    };

    useEffect(() => {
        if (!isAuthorized || !businessId || !materialId) return;

        const unsub1 = onSnapshot(doc(db, 'users', businessId, 'raw_materials', materialId), snap => {
            if (snap.exists()) setMaterial({ id: snap.id, ...snap.data() } as RawMaterial);
            setLoading(false);
        });
        const unsub2 = onSnapshot(
            query(collection(db, 'users', businessId, 'material_transactions'), where('materialId', '==', materialId), orderBy('createdAt', 'desc')),
            snap => setTransactions(snap.docs.map(d => ({ id: d.id, ...d.data() } as MaterialTransaction)))
        );
        const unsub3 = onSnapshot(
            query(collection(db, 'users', businessId, 'material_reservations'), where('materialId', '==', materialId), where('status', '==', 'RESERVED')),
            snap => setReservations(snap.docs.map(d => ({ id: d.id, ...d.data() } as MaterialReservation)))
        );
        return () => { unsub1(); unsub2(); unsub3(); };
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
            <div className="grid grid-cols-3 gap-4">{[1, 2, 3].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
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
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" className="gap-2" onClick={() => { resetStockForm(); setAddOpen(true); }}>
                        <TrendingUp className="h-4 w-4" /> Add Stock
                    </Button>
                    <Button variant="ghost" size="sm" className="gap-2" onClick={() => { resetStockForm(); setAdjustOpen(true); }}>
                        <TrendingDown className="h-4 w-4" /> Adjust
                    </Button>
                </div>
            </motion.div>

            <div className="p-4 md:p-6 space-y-6">
                {/* Stock Cards */}
                <div className="grid grid-cols-3 gap-4">
                    {[
                        { label: 'Total Stock', value: material.totalStock, unit: material.unit, color: 'text-foreground' },
                        { label: 'Reserved', value: material.reservedStock, unit: material.unit, color: 'text-blue-600' },
                        { label: 'Available', value: material.availableStock, unit: material.unit, color: material.availableStock <= 0 ? 'text-red-600' : material.availableStock <= material.reorderLevel ? 'text-amber-600' : 'text-emerald-600' },
                    ].map(card => (
                        <Card key={card.label} className="border-border/50">
                            <CardContent className="p-4">
                                <p className="text-xs text-muted-foreground">{card.label}</p>
                                <p className={cn('text-xl font-bold mt-1 font-mono', card.color)}>
                                    {card.value.toLocaleString()}
                                </p>
                                <p className="text-xs text-muted-foreground">{card.unit}</p>
                            </CardContent>
                        </Card>
                    ))}
                </div>

                {/* Stock health bar */}
                <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>Available stock</span>
                        <span className="font-mono">{stockPct}%</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <motion.div className={cn('h-full rounded-full', healthColor)}
                            initial={{ width: 0 }} animate={{ width: `${stockPct}%` }} transition={{ duration: 0.6, ease: 'easeOut' }} />
                    </div>
                    {material.availableStock <= material.reorderLevel && (
                        <p className="text-xs text-amber-600">Below reorder level ({material.reorderLevel} {material.unit})</p>
                    )}
                </div>

                <Tabs defaultValue="transactions">
                    <TabsList>
                        <TabsTrigger value="transactions">Transaction Log ({transactions.length})</TabsTrigger>
                        <TabsTrigger value="reservations">Active Reservations ({reservations.length})</TabsTrigger>
                    </TabsList>

                    {/* Transactions */}
                    <TabsContent value="transactions" className="mt-4">
                        {transactions.length === 0 ? (
                            <div className="text-center py-12 text-muted-foreground text-sm">No transactions yet</div>
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
                                            <motion.tr key={tx.id}
                                                initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { delay: i * 0.02 } }}
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
                                                    {tx.stockBefore !== null ? tx.stockBefore : '—'}
                                                </TableCell>
                                                <TableCell className="text-right font-mono text-sm text-muted-foreground">
                                                    {tx.stockAfter !== null ? tx.stockAfter : '—'}
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
                    </TabsContent>

                    {/* Active Reservations */}
                    <TabsContent value="reservations" className="mt-4">
                        {reservations.length === 0 ? (
                            <div className="text-center py-12 text-muted-foreground text-sm">No active reservations</div>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Lot #</TableHead>
                                        <TableHead>Order</TableHead>
                                        <TableHead>Stage</TableHead>
                                        <TableHead className="text-right">Required</TableHead>
                                        <TableHead className="text-right">Consumed</TableHead>
                                        <TableHead>Status</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {reservations.map(r => (
                                        <TableRow key={r.id} className="border-b hover:bg-muted/30 transition-colors">
                                            <TableCell className="font-mono font-bold text-sm">#{r.lotNumber}</TableCell>
                                            <TableCell className="font-mono text-xs text-muted-foreground">{r.orderNumber}</TableCell>
                                            <TableCell><Badge variant="outline" className="text-xs">{r.consumedAtStage}</Badge></TableCell>
                                            <TableCell className="text-right font-mono text-sm">{r.quantityRequired} {r.materialUnit}</TableCell>
                                            <TableCell className="text-right font-mono text-sm">{r.quantityConsumed} {r.materialUnit}</TableCell>
                                            <TableCell><Badge variant="default" className="text-xs">{r.status}</Badge></TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    );
}