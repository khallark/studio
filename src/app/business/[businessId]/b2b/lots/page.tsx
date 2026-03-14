'use client';

// /business/[businessId]/b2b/lots/page.tsx

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useBusinessContext } from '../../layout';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { Lot, LotStatus } from '@/types/b2b';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
    Table, TableBody, TableCell, TableHead,
    TableHeader, TableRow,
} from '@/components/ui/table';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import {
    Select, SelectContent, SelectItem,
    SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
    Layers, Search, X, Loader2, AlertTriangle,
    ChevronLeft, ChevronRight,
} from 'lucide-react';

// ─────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────

const STATUS_TABS: { value: LotStatus | 'ALL'; label: string }[] = [
    { value: 'ALL',       label: 'All Lots'    },
    { value: 'ACTIVE',    label: 'Active'      },
    { value: 'COMPLETED', label: 'Completed'   },
    { value: 'CANCELLED', label: 'Cancelled'   },
    { value: 'ON_HOLD',   label: 'On Hold'     },
];

function getLotStatusVariant(s: LotStatus): 'default' | 'secondary' | 'destructive' | 'outline' | 'success' {
    switch (s) {
        case 'ACTIVE':    return 'default';
        case 'COMPLETED': return 'success';
        case 'CANCELLED': return 'destructive';
        case 'ON_HOLD':   return 'outline';
        default:          return 'secondary';
    }
}

const ROWS_PER_PAGE = 20;

const rowVariants = {
    hidden:  { opacity: 0, y: 8 },
    visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.03, duration: 0.2 } }),
};

// ─────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────

export default function LotsPage() {
    const router = useRouter();
    const { businessId, isAuthorized, loading: authLoading } = useBusinessContext();

    const [lots, setLots]       = useState<Lot[]>([]);
    const [loading, setLoading] = useState(true);

    const [activeTab, setActiveTab]         = useState<LotStatus | 'ALL'>('ALL');
    const [search, setSearch]               = useState('');
    const [stageFilter, setStageFilter]     = useState<string>('all');
    const [delayedOnly, setDelayedOnly]     = useState(false);
    const [currentPage, setCurrentPage]     = useState(1);

    // ── Firestore listener ──────────────────────────────────────────────────
    useEffect(() => {
        if (!isAuthorized || !businessId) return;

        const q = query(
            collection(db, 'users', businessId, 'lots'),
            orderBy('createdAt', 'desc')
        );
        const unsub = onSnapshot(q, snap => {
            setLots(snap.docs.map(d => ({ id: d.id, ...d.data() } as Lot)));
            setLoading(false);
        }, err => {
            console.error('lots snapshot error:', err);
            setLoading(false);
        });
        return () => unsub();
    }, [businessId, isAuthorized]);

    // Reset page on filter change
    useEffect(() => { setCurrentPage(1); }, [activeTab, search, stageFilter, delayedOnly]);

    // ── Derived data ────────────────────────────────────────────────────────
    const filtered = useMemo(() => lots.filter(l => {
        const matchTab     = activeTab === 'ALL' || l.status === activeTab;
        const matchSearch  = !search ||
            l.lotNumber.includes(search) ||
            l.productName.toLowerCase().includes(search.toLowerCase()) ||
            l.buyerName.toLowerCase().includes(search.toLowerCase()) ||
            l.orderNumber.toLowerCase().includes(search.toLowerCase()) ||
            l.color.toLowerCase().includes(search.toLowerCase());
        const matchStage   = stageFilter === 'all' || l.currentStage === stageFilter;
        const matchDelayed = !delayedOnly || l.isDelayed;
        return matchTab && matchSearch && matchStage && matchDelayed;
    }), [lots, activeTab, search, stageFilter, delayedOnly]);

    const tabCounts = lots.reduce<Record<string, number>>((acc, l) => {
        acc[l.status] = (acc[l.status] ?? 0) + 1;
        return acc;
    }, {});

    // Unique stages present across all lots
    const presentStages = useMemo(() => {
        const stages = new Set(lots.map(l => l.currentStage));
        return Array.from(stages).sort();
    }, [lots]);

    // Pagination
    const totalPages   = Math.ceil(filtered.length / ROWS_PER_PAGE);
    const paginated    = filtered.slice((currentPage - 1) * ROWS_PER_PAGE, currentPage * ROWS_PER_PAGE);

    if (authLoading) return (
        <div className="flex items-center justify-center h-64">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
    );
    if (!isAuthorized) return null;

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <motion.div
                initial={{ opacity: 0, y: -16 }}
                animate={{ opacity: 1, y: 0 }}
                className="shrink-0 flex items-center justify-between gap-4 p-4 md:p-6 border-b bg-gradient-to-r from-background to-muted/20"
            >
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-primary/10 ring-1 ring-primary/20">
                        <Layers className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold">All Lots</h1>
                        <p className="text-xs text-muted-foreground">{lots.length} total production batches</p>
                    </div>
                </div>

                {/* Delayed toggle */}
                <button
                    onClick={() => setDelayedOnly(d => !d)}
                    className={cn(
                        'flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border transition-all',
                        delayedOnly
                            ? 'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-700'
                            : 'bg-muted text-muted-foreground border-border hover:border-amber-300 hover:text-amber-600'
                    )}
                >
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {delayedOnly ? 'Showing delayed only' : 'Show delayed only'}
                </button>
            </motion.div>

            {/* Status Tabs */}
            <div className="shrink-0 border-b bg-card/60">
                <ScrollArea className="w-full">
                    <div className="flex px-4 pt-2 pb-0 gap-0.5">
                        {STATUS_TABS.map(tab => {
                            const count = tab.value === 'ALL' ? lots.length : (tabCounts[tab.value] ?? 0);
                            const isActive = activeTab === tab.value;
                            return (
                                <button
                                    key={tab.value}
                                    onClick={() => setActiveTab(tab.value)}
                                    className={cn(
                                        'px-3 py-2 text-xs font-medium border-b-2 transition-all whitespace-nowrap flex items-center gap-1.5',
                                        isActive
                                            ? 'border-primary text-primary'
                                            : 'border-transparent text-muted-foreground hover:text-foreground'
                                    )}
                                >
                                    {tab.label}
                                    <span className={cn(
                                        'text-[10px] px-1.5 py-0.5 rounded-full font-medium',
                                        isActive ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
                                    )}>{count}</span>
                                </button>
                            );
                        })}
                    </div>
                    <ScrollBar orientation="horizontal" className="h-1" />
                </ScrollArea>
            </div>

            {/* Search + Stage Filter */}
            <div className="shrink-0 p-4 border-b flex gap-3">
                <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search lot #, product, buyer, order..."
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
                <Select value={stageFilter} onValueChange={setStageFilter}>
                    <SelectTrigger className="w-40 h-9">
                        <SelectValue placeholder="All Stages" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Stages</SelectItem>
                        {presentStages.map(s => (
                            <SelectItem key={s} value={s}>{s}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-auto">
                {loading ? (
                    <div className="p-6 space-y-3">
                        {Array.from({ length: 8 }).map((_, i) => (
                            <div key={i} className="flex items-center gap-4">
                                <Skeleton className="h-5 w-16" />
                                <Skeleton className="h-5 w-32" />
                                <Skeleton className="h-5 w-24" />
                                <Skeleton className="h-5 w-20 ml-auto" />
                                <Skeleton className="h-6 w-16 rounded-full" />
                            </div>
                        ))}
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-center">
                        <Layers className="h-12 w-12 text-muted-foreground/30 mb-3" />
                        <h3 className="font-medium text-muted-foreground">No lots found</h3>
                        <p className="text-sm text-muted-foreground/70 mt-1">
                            {search || stageFilter !== 'all' || delayedOnly
                                ? 'Try adjusting your filters'
                                : 'Create and confirm an order to generate lots'}
                        </p>
                    </div>
                ) : (
                    <Table>
                        <TableHeader className="sticky top-0 bg-card z-10">
                            <TableRow>
                                <TableHead>Lot #</TableHead>
                                <TableHead>Product</TableHead>
                                <TableHead>Color / Size</TableHead>
                                <TableHead className="text-center">Qty</TableHead>
                                <TableHead>Buyer</TableHead>
                                <TableHead>Order</TableHead>
                                <TableHead>Current Stage</TableHead>
                                <TableHead>Progress</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Ship Date</TableHead>
                                <TableHead className="text-center">Delayed</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            <AnimatePresence mode="popLayout">
                                {paginated.map((lot, i) => {
                                    const completedStages = lot.stages.filter(s => s.status === 'COMPLETED').length;
                                    const pct = lot.totalStages > 0
                                        ? Math.round((completedStages / lot.totalStages) * 100)
                                        : 0;
                                    const isBlocked = lot.stages.some(s => s.status === 'BLOCKED');

                                    return (
                                        <motion.tr
                                            key={lot.id}
                                            custom={i}
                                            variants={rowVariants}
                                            initial="hidden"
                                            animate="visible"
                                            exit={{ opacity: 0 }}
                                            layout
                                            onClick={() => router.push(`/business/${businessId}/b2b/lots/${lot.id}`)}
                                            className="group cursor-pointer border-b hover:bg-muted/50 transition-colors"
                                        >
                                            <TableCell>
                                                <div className="flex items-center gap-1.5">
                                                    <span className="font-mono font-bold text-sm">#{lot.lotNumber}</span>
                                                    {isBlocked && (
                                                        <span className="h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0" title="Blocked" />
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <p className="font-medium text-sm">{lot.productName}</p>
                                                <p className="text-xs text-muted-foreground font-mono">{lot.productSku}</p>
                                            </TableCell>
                                            <TableCell className="text-sm">
                                                {lot.color}{lot.size && <span className="text-muted-foreground"> / {lot.size}</span>}
                                            </TableCell>
                                            <TableCell className="text-center font-mono text-sm font-medium">
                                                {lot.quantity.toLocaleString()}
                                            </TableCell>
                                            <TableCell className="text-sm">{lot.buyerName}</TableCell>
                                            <TableCell className="font-mono text-xs text-muted-foreground">{lot.orderNumber}</TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className="text-xs">{lot.currentStage}</Badge>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-2 min-w-20">
                                                    <div className="h-1.5 flex-1 bg-muted rounded-full overflow-hidden">
                                                        <div
                                                            className={cn(
                                                                'h-full rounded-full transition-all',
                                                                lot.status === 'COMPLETED' ? 'bg-emerald-500' : 'bg-primary'
                                                            )}
                                                            style={{ width: `${pct}%` }}
                                                        />
                                                    </div>
                                                    <span className="text-xs text-muted-foreground w-7 text-right">{pct}%</span>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant={getLotStatusVariant(lot.status)} className="text-xs">
                                                    {lot.status}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-xs text-muted-foreground">
                                                {lot.shipDate ? format(lot.shipDate.toDate(), 'dd MMM yyyy') : '—'}
                                            </TableCell>
                                            <TableCell className="text-center">
                                                {lot.isDelayed ? (
                                                    <span className="flex items-center justify-center gap-1 text-amber-600 text-xs font-medium">
                                                        <AlertTriangle className="h-3 w-3" />
                                                        {lot.delayDays}d
                                                    </span>
                                                ) : (
                                                    <span className="text-muted-foreground text-xs">—</span>
                                                )}
                                            </TableCell>
                                        </motion.tr>
                                    );
                                })}
                            </AnimatePresence>
                        </TableBody>
                    </Table>
                )}
            </div>

            {/* Pagination */}
            {filtered.length > ROWS_PER_PAGE && (
                <div className="shrink-0 border-t bg-card p-3 flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">
                        {(currentPage - 1) * ROWS_PER_PAGE + 1}–{Math.min(currentPage * ROWS_PER_PAGE, filtered.length)} of {filtered.length}
                    </p>
                    <div className="flex items-center gap-1">
                        <Button variant="outline" size="icon" className="h-8 w-8"
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <span className="text-xs font-medium px-2">{currentPage} / {totalPages}</span>
                        <Button variant="outline" size="icon" className="h-8 w-8"
                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages}>
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}