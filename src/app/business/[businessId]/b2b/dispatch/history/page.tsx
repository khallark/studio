'use client';

// /business/[businessId]/b2b/dispatch/history/page.tsx

import React, { useState, useEffect, useMemo } from 'react';
import { useBusinessContext } from '../../../layout';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, query, where, orderBy } from 'firebase/firestore';
import { FinishedGood } from '@/types/b2b';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import {
    Table, TableBody, TableCell, TableHead,
    TableHeader, TableRow,
} from '@/components/ui/table';
import { Truck, Search, X, Loader2, CheckCircle2, Package } from 'lucide-react';

export default function DispatchHistoryPage() {
    const { businessId, isAuthorized, loading: authLoading } = useBusinessContext();

    const [items, setItems]     = useState<FinishedGood[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch]   = useState('');

    useEffect(() => {
        if (!isAuthorized || !businessId) return;
        const q = query(
            collection(db, 'users', businessId, 'finished_goods'),
            where('isDispatched', '==', true),
            orderBy('dispatchedAt', 'desc')
        );
        const unsub = onSnapshot(q, snap => {
            setItems(snap.docs.map(d => ({ id: d.id, ...d.data() } as FinishedGood)));
            setLoading(false);
        });
        return () => unsub();
    }, [businessId, isAuthorized]);

    const filtered = useMemo(() => {
        if (!search) return items;
        const q = search.toLowerCase();
        return items.filter(fg =>
            fg.lotNumber.includes(q) ||
            fg.productName.toLowerCase().includes(q) ||
            fg.buyerName.toLowerCase().includes(q) ||
            fg.orderNumber.toLowerCase().includes(q) ||
            (fg.awb && fg.awb.toLowerCase().includes(q)) ||
            (fg.courierName && fg.courierName.toLowerCase().includes(q))
        );
    }, [items, search]);

    const totalDispatched = items.length;
    const totalPieces = items.reduce((s, fg) => s + fg.quantity, 0);

    if (authLoading) return <div className="flex items-center justify-center h-64"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
    if (!isAuthorized) return null;

    return (
        <div className="flex flex-col h-full">
            <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }}
                className="shrink-0 p-4 md:p-6 border-b bg-gradient-to-r from-background to-muted/20">
                <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 rounded-xl bg-emerald-500/10 ring-1 ring-emerald-500/20">
                        <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold">Dispatch History</h1>
                        <p className="text-xs text-muted-foreground">All dispatched lots</p>
                    </div>
                </div>

                {/* Summary */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                    <Card className="border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/20">
                        <CardContent className="p-3 flex items-center gap-3">
                            <Truck className="h-8 w-8 text-emerald-600/60" />
                            <div>
                                <p className="text-xs text-muted-foreground">Total Dispatched</p>
                                <p className="text-xl font-bold text-emerald-600">{totalDispatched}</p>
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="border-primary/20 bg-primary/5">
                        <CardContent className="p-3 flex items-center gap-3">
                            <Package className="h-8 w-8 text-primary/60" />
                            <div>
                                <p className="text-xs text-muted-foreground">Total Pieces</p>
                                <p className="text-xl font-bold text-primary">{totalPieces.toLocaleString()}</p>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                <div className="relative max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Search lot, buyer, AWB..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9" />
                    {search && <Button variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7" onClick={() => setSearch('')}><X className="h-3 w-3" /></Button>}
                </div>
            </motion.div>

            <div className="flex-1 overflow-auto">
                {loading ? (
                    <div className="p-6 space-y-3">
                        {Array.from({ length: 5 }).map((_, i) => <div key={i} className="flex gap-4"><Skeleton className="h-5 w-20" /><Skeleton className="h-5 w-32" /><Skeleton className="h-5 w-28" /></div>)}
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-center">
                        <Truck className="h-12 w-12 text-muted-foreground/30 mb-3" />
                        <h3 className="font-medium text-muted-foreground">{search ? 'No results' : 'No dispatched lots yet'}</h3>
                    </div>
                ) : (
                    <Table>
                        <TableHeader className="sticky top-0 bg-card z-10">
                            <TableRow>
                                <TableHead>Lot #</TableHead>
                                <TableHead>Product</TableHead>
                                <TableHead>Buyer</TableHead>
                                <TableHead>Order</TableHead>
                                <TableHead className="text-center">Qty</TableHead>
                                <TableHead>Courier</TableHead>
                                <TableHead>AWB</TableHead>
                                <TableHead>Cartons</TableHead>
                                <TableHead>Weight</TableHead>
                                <TableHead>Dispatched</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            <AnimatePresence mode="popLayout">
                                {filtered.map((fg, i) => (
                                    <motion.tr key={fg.id}
                                        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0, transition: { delay: i * 0.03 } }}
                                        exit={{ opacity: 0 }} layout
                                        className="border-b hover:bg-muted/40 transition-colors">
                                        <TableCell className="font-mono font-bold text-sm">#{fg.lotNumber}</TableCell>
                                        <TableCell>
                                            <p className="font-medium text-sm">{fg.productName}</p>
                                            <div className="flex gap-1 mt-0.5">
                                                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{fg.color}</Badge>
                                                {fg.size && <Badge variant="outline" className="text-[10px] px-1.5 py-0">{fg.size}</Badge>}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-sm">{fg.buyerName}</TableCell>
                                        <TableCell className="font-mono text-xs text-muted-foreground">{fg.orderNumber}</TableCell>
                                        <TableCell className="text-center font-mono font-semibold text-sm">{fg.quantity.toLocaleString()}</TableCell>
                                        <TableCell className="text-sm">{fg.courierName || '—'}</TableCell>
                                        <TableCell className="font-mono text-xs">{fg.awb || '—'}</TableCell>
                                        <TableCell className="text-center text-sm text-muted-foreground">{fg.cartonCount ?? '—'}</TableCell>
                                        <TableCell className="text-sm text-muted-foreground">{fg.totalWeightKg ? `${fg.totalWeightKg} kg` : '—'}</TableCell>
                                        <TableCell className="text-xs text-muted-foreground">
                                            {fg.dispatchedAt ? format(fg.dispatchedAt.toDate(), 'dd MMM yyyy') : '—'}
                                        </TableCell>
                                    </motion.tr>
                                ))}
                            </AnimatePresence>
                        </TableBody>
                    </Table>
                )}
            </div>
        </div>
    );
}