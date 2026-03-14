'use client';

// /business/[businessId]/b2b/dispatch/page.tsx

import React, { useState, useEffect, useMemo } from 'react';
import { useBusinessContext } from '../../layout';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, query, where, orderBy } from 'firebase/firestore';
import { FinishedGood } from '@/types/b2b';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
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
    Truck, Package, Search, X, Loader2,
    CheckCircle2, Clock, BoxIcon,
} from 'lucide-react';

// ─────────────────────────────────────────────
// DISPATCH DIALOG
// ─────────────────────────────────────────────

interface DispatchDialogProps {
    open: boolean;
    onClose: () => void;
    finishedGood: FinishedGood | null;
    businessId: string;
    user: any;
}

function DispatchDialog({ open, onClose, finishedGood, businessId, user }: DispatchDialogProps) {
    const [courierName, setCourierName]     = useState('');
    const [awb, setAwb]                     = useState('');
    const [cartonCount, setCartonCount]     = useState('');
    const [totalWeightKg, setTotalWeightKg] = useState('');
    const [isSubmitting, setIsSubmitting]   = useState(false);

    useEffect(() => {
        if (open) { setCourierName(''); setAwb(''); setCartonCount(''); setTotalWeightKg(''); }
    }, [open]);

    const handleDispatch = async () => {
        if (!finishedGood || !user) return;
        if (!courierName.trim()) { toast({ title: 'Courier name required', variant: 'destructive' }); return; }
        if (!awb.trim())          { toast({ title: 'AWB required', variant: 'destructive' }); return; }

        setIsSubmitting(true);
        try {
            const token = await user.getIdToken();
            const payload: Record<string, unknown> = {
                businessId,
                finishedGoodId: finishedGood.id,
                courierName: courierName.trim(),
                awb: awb.trim(),
                dispatchedBy: user.displayName || user.email || 'Unknown',
            };
            if (cartonCount)     payload.cartonCount    = parseInt(cartonCount);
            if (totalWeightKg)   payload.totalWeightKg  = parseFloat(totalWeightKg);

            const res = await fetch('/api/business/b2b/dispatch-finished-good', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify(payload),
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.error || result.message || 'Failed to dispatch');
            toast({
                title: 'Dispatched!',
                description: `Lot #${finishedGood.lotNumber} dispatched via ${courierName} · AWB: ${awb}`,
            });
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
                    <DialogTitle className="flex items-center gap-2">
                        <Truck className="h-5 w-5 text-primary" />
                        Dispatch to Majime
                    </DialogTitle>
                    {finishedGood && (
                        <DialogDescription>
                            Lot #{finishedGood.lotNumber} · {finishedGood.productName} · {finishedGood.quantity} pcs
                        </DialogDescription>
                    )}
                </DialogHeader>

                <div className="space-y-4 py-2">
                    <div className="space-y-2">
                        <Label className="text-xs">Courier Name <span className="text-destructive">*</span></Label>
                        <Input
                            placeholder="e.g. Delhivery, Blue Dart"
                            value={courierName}
                            onChange={e => setCourierName(e.target.value)}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label className="text-xs">AWB Number <span className="text-destructive">*</span></Label>
                        <Input
                            placeholder="Enter AWB / tracking number"
                            value={awb}
                            onChange={e => setAwb(e.target.value)}
                            className="font-mono"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                            <Label className="text-xs">Carton Count</Label>
                            <Input
                                type="number" min="1" placeholder="e.g. 5"
                                value={cartonCount}
                                onChange={e => setCartonCount(e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs">Total Weight (kg)</Label>
                            <Input
                                type="number" min="0" step="0.1" placeholder="e.g. 12.5"
                                value={totalWeightKg}
                                onChange={e => setTotalWeightKg(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="p-3 rounded-lg bg-muted/50 text-xs text-muted-foreground">
                        After dispatch, Majime will take over tracking via the AWB number.
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button onClick={handleDispatch} disabled={isSubmitting} className="gap-2">
                        {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                        <Truck className="h-4 w-4" />
                        Dispatch
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// ─────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────

export default function DispatchPage() {
    const { businessId, user, isAuthorized, loading: authLoading } = useBusinessContext();

    const [items, setItems]       = useState<FinishedGood[]>([]);
    const [loading, setLoading]   = useState(true);
    const [search, setSearch]     = useState('');
    const [dispatchTarget, setDispatchTarget] = useState<FinishedGood | null>(null);

    // ── Firestore listener ──────────────────────────────────────────────────
    useEffect(() => {
        if (!isAuthorized || !businessId) return;

        const q = query(
            collection(db, 'users', businessId, 'finished_goods'),
            where('isDispatched', '==', false),
            orderBy('packedAt', 'desc')
        );
        const unsub = onSnapshot(q, snap => {
            setItems(snap.docs.map(d => ({ id: d.id, ...d.data() } as FinishedGood)));
            setLoading(false);
        }, err => {
            console.error('finished_goods snapshot error:', err);
            setLoading(false);
        });
        return () => unsub();
    }, [businessId, isAuthorized]);

    // ── Derived ─────────────────────────────────────────────────────────────
    const filtered = useMemo(() => {
        if (!search) return items;
        const q = search.toLowerCase();
        return items.filter(fg =>
            fg.lotNumber.includes(q) ||
            fg.productName.toLowerCase().includes(q) ||
            fg.buyerName.toLowerCase().includes(q) ||
            fg.orderNumber.toLowerCase().includes(q)
        );
    }, [items, search]);

    const totalPieces = items.reduce((s, fg) => s + fg.quantity, 0);

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
                            <Truck className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold">Dispatch Queue</h1>
                            <p className="text-xs text-muted-foreground">Packed & ready to ship to Majime</p>
                        </div>
                    </div>
                </div>

                {/* Summary cards */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                    <Card className="border-primary/20 bg-primary/5">
                        <CardContent className="p-3 flex items-center gap-3">
                            <Package className="h-8 w-8 text-primary/60" />
                            <div>
                                <p className="text-xs text-muted-foreground">Lots Ready</p>
                                <p className="text-xl font-bold text-primary">{items.length}</p>
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/20">
                        <CardContent className="p-3 flex items-center gap-3">
                            <BoxIcon className="h-8 w-8 text-emerald-600/60" />
                            <div>
                                <p className="text-xs text-muted-foreground">Total Pieces</p>
                                <p className="text-xl font-bold text-emerald-600">{totalPieces.toLocaleString()}</p>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Search */}
                <div className="relative max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search lot, product, buyer..."
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
                        {Array.from({ length: 4 }).map((_, i) => (
                            <div key={i} className="flex items-center gap-4">
                                <Skeleton className="h-5 w-20" />
                                <Skeleton className="h-5 w-32" />
                                <Skeleton className="h-5 w-24" />
                                <Skeleton className="h-9 w-24 ml-auto rounded-lg" />
                            </div>
                        ))}
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-center">
                        {items.length === 0 ? (
                            <>
                                <CheckCircle2 className="h-12 w-12 text-emerald-500/40 mb-3" />
                                <h3 className="font-medium text-muted-foreground">All caught up!</h3>
                                <p className="text-sm text-muted-foreground/70 mt-1">No lots waiting for dispatch</p>
                            </>
                        ) : (
                            <>
                                <Package className="h-12 w-12 text-muted-foreground/30 mb-3" />
                                <h3 className="font-medium text-muted-foreground">No results</h3>
                            </>
                        )}
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
                                <TableHead>Packed At</TableHead>
                                <TableHead className="text-right">Action</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            <AnimatePresence mode="popLayout">
                                {filtered.map((fg, i) => (
                                    <motion.tr
                                        key={fg.id}
                                        initial={{ opacity: 0, y: 8 }}
                                        animate={{ opacity: 1, y: 0, transition: { delay: i * 0.04 } }}
                                        exit={{ opacity: 0 }}
                                        layout
                                        className="group border-b hover:bg-muted/40 transition-colors"
                                    >
                                        <TableCell className="font-mono font-bold text-sm">#{fg.lotNumber}</TableCell>
                                        <TableCell>
                                            <div>
                                                <p className="font-medium text-sm">{fg.productName}</p>
                                                <div className="flex gap-1 mt-0.5">
                                                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{fg.color}</Badge>
                                                    {fg.size && <Badge variant="outline" className="text-[10px] px-1.5 py-0">{fg.size}</Badge>}
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-sm">{fg.buyerName}</TableCell>
                                        <TableCell className="font-mono text-xs text-muted-foreground">{fg.orderNumber}</TableCell>
                                        <TableCell className="text-center font-mono font-semibold text-sm">{fg.quantity.toLocaleString()}</TableCell>
                                        <TableCell className="text-sm text-muted-foreground">
                                            {fg.packedAt
                                                ? format(fg.packedAt.toDate(), 'dd MMM yyyy')
                                                : '—'}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <Button
                                                size="sm"
                                                className="gap-2 opacity-80 group-hover:opacity-100 transition-opacity"
                                                onClick={() => setDispatchTarget(fg)}
                                            >
                                                <Truck className="h-3.5 w-3.5" />
                                                Dispatch
                                            </Button>
                                        </TableCell>
                                    </motion.tr>
                                ))}
                            </AnimatePresence>
                        </TableBody>
                    </Table>
                )}
            </div>

            {/* Dispatch Dialog */}
            <DispatchDialog
                open={!!dispatchTarget}
                onClose={() => setDispatchTarget(null)}
                finishedGood={dispatchTarget}
                businessId={businessId}
                user={user}
            />
        </div>
    );
}