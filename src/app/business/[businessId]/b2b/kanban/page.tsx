'use client';

// /business/[businessId]/b2b/kanban/page.tsx

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useBusinessContext } from '../../layout';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { Lot, LotStatus, StageName } from '@/types/b2b';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
    Dialog, DialogContent, DialogHeader,
    DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import {
    AlertTriangle, Loader2, ChevronRight, Search, X,
    CheckCircle2, PauseCircle, LayoutGrid, Filter,
} from 'lucide-react';

// ─────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────

// Ordered list of stages for column ordering
const STAGE_ORDER: StageName[] = [
    'DESIGN', 'FRAMING', 'SAMPLING', 'CUTTING',
    'PRINTING', 'EMBROIDERY', 'STITCHING',
    'WASHING', 'FINISHING', 'PACKING',
];

const STAGE_COLORS: Record<StageName, string> = {
    DESIGN:    'bg-violet-500/10 text-violet-700 border-violet-200',
    FRAMING:   'bg-blue-500/10 text-blue-700 border-blue-200',
    SAMPLING:  'bg-cyan-500/10 text-cyan-700 border-cyan-200',
    CUTTING:   'bg-amber-500/10 text-amber-700 border-amber-200',
    PRINTING:  'bg-orange-500/10 text-orange-700 border-orange-200',
    EMBROIDERY:'bg-pink-500/10 text-pink-700 border-pink-200',
    STITCHING: 'bg-rose-500/10 text-rose-700 border-rose-200',
    WASHING:   'bg-teal-500/10 text-teal-700 border-teal-200',
    FINISHING: 'bg-emerald-500/10 text-emerald-700 border-emerald-200',
    PACKING:   'bg-green-500/10 text-green-700 border-green-200',
};

// ─────────────────────────────────────────────
// LOT CARD
// ─────────────────────────────────────────────

interface LotCardProps {
    lot: Lot;
    onAdvance: (lot: Lot) => void;
    onBlock: (lot: Lot) => void;
    onClick: (lot: Lot) => void;
}

function LotCard({ lot, onAdvance, onBlock, onClick }: LotCardProps) {
    const currentStage = lot.stages.find(s => s.status === 'IN_PROGRESS' || s.status === 'BLOCKED');
    const isBlocked = currentStage?.status === 'BLOCKED';
    const isLastStage = lot.currentSequence === lot.totalStages;

    return (
        <motion.div
            layout
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            whileHover={{ y: -2 }}
            className={cn(
                'rounded-xl border bg-card p-3 shadow-sm cursor-pointer transition-all',
                isBlocked && 'border-amber-300 bg-amber-50/50 dark:bg-amber-950/20',
                lot.isDelayed && !isBlocked && 'border-red-200 bg-red-50/30 dark:bg-red-950/10',
            )}
            onClick={() => onClick(lot)}
        >
            {/* Header */}
            <div className="flex items-start justify-between gap-2 mb-2">
                <div className="min-w-0">
                    <p className="font-mono font-bold text-sm">#{lot.lotNumber}</p>
                    <p className="text-xs text-muted-foreground truncate">{lot.productName}</p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                    {isBlocked && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-400 text-amber-700 bg-amber-50">
                            BLOCKED
                        </Badge>
                    )}
                    {lot.isDelayed && (
                        <span className="flex items-center gap-0.5 text-[10px] text-red-600 font-medium">
                            <AlertTriangle className="h-3 w-3" />
                            {lot.delayDays}d late
                        </span>
                    )}
                </div>
            </div>

            {/* Details */}
            <div className="flex flex-wrap gap-1 mb-3">
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{lot.color}</Badge>
                {lot.size && <Badge variant="outline" className="text-[10px] px-1.5 py-0">{lot.size}</Badge>}
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono">{lot.quantity} pcs</Badge>
            </div>

            {/* Stage progress */}
            <div className="flex gap-0.5 mb-3">
                {lot.stages.map((s, i) => (
                    <div
                        key={i}
                        className={cn(
                            'h-1 flex-1 rounded-full transition-colors',
                            s.status === 'COMPLETED'   ? 'bg-emerald-500' :
                            s.status === 'IN_PROGRESS' ? 'bg-primary' :
                            s.status === 'BLOCKED'     ? 'bg-amber-400' :
                            'bg-muted'
                        )}
                    />
                ))}
            </div>

            {/* Buyer */}
            <p className="text-[10px] text-muted-foreground truncate mb-3">{lot.buyerName} · {lot.orderNumber}</p>

            {/* Actions */}
            <div className="flex gap-1.5" onClick={e => e.stopPropagation()}>
                <Button
                    variant={isBlocked ? 'outline' : 'secondary'}
                    size="sm"
                    className="flex-1 h-7 text-xs gap-1"
                    onClick={() => onBlock(lot)}
                >
                    <PauseCircle className="h-3 w-3" />
                    {isBlocked ? 'Unblock' : 'Block'}
                </Button>
                {!isLastStage ? (
                    <Button
                        size="sm"
                        className="flex-1 h-7 text-xs gap-1"
                        onClick={() => onAdvance(lot)}
                        disabled={isBlocked}
                    >
                        <ChevronRight className="h-3 w-3" />
                        Advance
                    </Button>
                ) : (
                    <Button
                        size="sm"
                        className="flex-1 h-7 text-xs gap-1 bg-emerald-600 hover:bg-emerald-700"
                        onClick={() => onAdvance(lot)}
                        disabled={isBlocked}
                    >
                        <CheckCircle2 className="h-3 w-3" />
                        Complete
                    </Button>
                )}
            </div>
        </motion.div>
    );
}

// ─────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────

export default function KanbanPage() {
    const router = useRouter();
    const { businessId, user, isAuthorized, loading: authLoading } = useBusinessContext();

    const [lots, setLots]         = useState<Lot[]>([]);
    const [loading, setLoading]   = useState(true);
    const [search, setSearch]     = useState('');

    // Advance dialog
    const [advanceLot, setAdvanceLot]   = useState<Lot | null>(null);
    const [advanceNote, setAdvanceNote] = useState('');
    const [isAdvancing, setIsAdvancing] = useState(false);

    // Block dialog
    const [blockLot, setBlockLot]     = useState<Lot | null>(null);
    const [blockReason, setBlockReason] = useState('');
    const [isBlocking, setIsBlocking] = useState(false);

    // ── Firestore listener ──────────────────────────────────────────────────
    useEffect(() => {
        if (!isAuthorized || !businessId) return;

        const q = query(
            collection(db, 'users', businessId, 'lots'),
            where('status', '==', 'ACTIVE')
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

    // ── Grouped lots ─────────────────────────────────────────────────────────
    const groupedLots = useMemo(() => {
        const filtered = lots.filter(l =>
            !search ||
            l.lotNumber.includes(search) ||
            l.productName.toLowerCase().includes(search.toLowerCase()) ||
            l.buyerName.toLowerCase().includes(search.toLowerCase()) ||
            l.orderNumber.toLowerCase().includes(search.toLowerCase())
        );

        const groups: Partial<Record<StageName, Lot[]>> = {};
        for (const lot of filtered) {
            const stage = lot.currentStage;
            if (!groups[stage]) groups[stage] = [];
            groups[stage]!.push(lot);
        }
        return groups;
    }, [lots, search]);

    const activeColumns = STAGE_ORDER.filter(s => groupedLots[s]?.length);
    const totalActive = lots.length;
    const totalDelayed = lots.filter(l => l.isDelayed).length;
    const totalBlocked = lots.filter(l => l.stages.some(s => s.status === 'BLOCKED')).length;

    // ── Advance stage ────────────────────────────────────────────────────────
    const handleAdvance = async () => {
        if (!advanceLot || !user) return;
        setIsAdvancing(true);
        try {
            const token = await user.getIdToken();
            const res = await fetch('/api/business/b2b/advance-lot-stage', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({
                    businessId,
                    lotId: advanceLot.id,
                    completedBy: user.displayName || user.email || 'Unknown',
                    note: advanceNote.trim() || undefined,
                }),
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.error || 'Failed');
            toast({ title: 'Stage Advanced', description: `Lot #${advanceLot.lotNumber} moved forward.` });
            setAdvanceLot(null);
            setAdvanceNote('');
        } catch (err) {
            toast({ title: 'Error', description: (err as Error).message, variant: 'destructive' });
        } finally {
            setIsAdvancing(false);
        }
    };

    // ── Block/Unblock ─────────────────────────────────────────────────────────
    const handleBlock = async () => {
        if (!blockLot || !user) return;
        const currentStage = blockLot.stages.find(s => s.status === 'IN_PROGRESS' || s.status === 'BLOCKED');
        const isCurrentlyBlocked = currentStage?.status === 'BLOCKED';

        setIsBlocking(true);
        try {
            const token = await user.getIdToken();
            const res = await fetch('/api/business/b2b/set-lot-stage-blocked', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({
                    businessId,
                    lotId: blockLot.id,
                    blocked: !isCurrentlyBlocked,
                    reason: blockReason.trim() || undefined,
                }),
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.error || 'Failed');
            toast({ title: isCurrentlyBlocked ? 'Lot Unblocked' : 'Lot Blocked' });
            setBlockLot(null);
            setBlockReason('');
        } catch (err) {
            toast({ title: 'Error', description: (err as Error).message, variant: 'destructive' });
        } finally {
            setIsBlocking(false);
        }
    };

    const isBlockedLot = (lot: Lot) => lot.stages.some(s => s.status === 'BLOCKED');

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
                            <LayoutGrid className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold">Kanban Board</h1>
                            <p className="text-xs text-muted-foreground">Live production tracking</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1.5">
                                <span className="h-2 w-2 rounded-full bg-primary" />
                                {totalActive} active
                            </span>
                            {totalDelayed > 0 && (
                                <span className="flex items-center gap-1.5 text-red-600">
                                    <AlertTriangle className="h-3 w-3" />
                                    {totalDelayed} delayed
                                </span>
                            )}
                            {totalBlocked > 0 && (
                                <span className="flex items-center gap-1.5 text-amber-600">
                                    <PauseCircle className="h-3 w-3" />
                                    {totalBlocked} blocked
                                </span>
                            )}
                        </div>
                    </div>
                </div>
                <div className="relative max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search lots, products, buyers..."
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

            {/* Kanban Columns */}
            {loading ? (
                <div className="flex items-center justify-center flex-1">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
            ) : activeColumns.length === 0 ? (
                <div className="flex flex-col items-center justify-center flex-1 text-center p-8">
                    <LayoutGrid className="h-12 w-12 text-muted-foreground/30 mb-3" />
                    <h3 className="font-medium text-muted-foreground">
                        {search ? 'No lots match your search' : 'No active lots in production'}
                    </h3>
                    <p className="text-sm text-muted-foreground/70 mt-1">
                        Create and confirm an order to see lots here
                    </p>
                </div>
            ) : (
                <ScrollArea className="flex-1">
                    <div className="flex gap-4 p-4 md:p-6 h-full min-h-0" style={{ minWidth: `${activeColumns.length * 280}px` }}>
                        {activeColumns.map(stage => {
                            const stageLots = groupedLots[stage] || [];
                            return (
                                <div key={stage} className="flex-shrink-0 w-64 flex flex-col">
                                    {/* Column Header */}
                                    <div className={cn(
                                        'flex items-center justify-between px-3 py-2 rounded-xl mb-3 border text-xs font-semibold',
                                        STAGE_COLORS[stage]
                                    )}>
                                        <span>{stage}</span>
                                        <span className="font-mono font-bold">{stageLots.length}</span>
                                    </div>

                                    {/* Lot Cards */}
                                    <div className="space-y-3 flex-1">
                                        <AnimatePresence>
                                            {stageLots.map(lot => (
                                                <LotCard
                                                    key={lot.id}
                                                    lot={lot}
                                                    onAdvance={l => { setAdvanceLot(l); setAdvanceNote(''); }}
                                                    onBlock={l => { setBlockLot(l); setBlockReason(''); }}
                                                    onClick={l => router.push(`/business/${businessId}/b2b/lots/${l.id}`)}
                                                />
                                            ))}
                                        </AnimatePresence>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    <ScrollBar orientation="horizontal" />
                </ScrollArea>
            )}

            {/* Advance Stage Dialog */}
            <Dialog open={!!advanceLot} onOpenChange={open => !open && setAdvanceLot(null)}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>
                            {advanceLot?.currentSequence === advanceLot?.totalStages
                                ? 'Complete Final Stage'
                                : 'Advance to Next Stage'}
                        </DialogTitle>
                    </DialogHeader>
                    {advanceLot && (
                        <div className="space-y-4 py-2">
                            <div className="p-3 rounded-lg bg-muted/50 text-sm space-y-1">
                                <p><span className="text-muted-foreground">Lot:</span> <span className="font-mono font-semibold">#{advanceLot.lotNumber}</span></p>
                                <p><span className="text-muted-foreground">Current Stage:</span> <span className="font-medium">{advanceLot.currentStage}</span></p>
                                {advanceLot.currentSequence < advanceLot.totalStages && (
                                    <p>
                                        <span className="text-muted-foreground">Next Stage:</span>{' '}
                                        <span className="font-medium">{advanceLot.stages[advanceLot.currentSequence]?.stage}</span>
                                    </p>
                                )}
                            </div>
                            <div className="space-y-2">
                                <Label className="text-xs">Note (optional)</Label>
                                <Textarea
                                    placeholder="Any notes for this stage completion..."
                                    value={advanceNote}
                                    onChange={e => setAdvanceNote(e.target.value)}
                                    rows={2}
                                />
                            </div>
                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setAdvanceLot(null)}>Cancel</Button>
                        <Button onClick={handleAdvance} disabled={isAdvancing} className="gap-2">
                            {isAdvancing && <Loader2 className="h-4 w-4 animate-spin" />}
                            {advanceLot?.currentSequence === advanceLot?.totalStages ? 'Mark Complete' : 'Advance Stage'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Block/Unblock Dialog */}
            <Dialog open={!!blockLot} onOpenChange={open => !open && setBlockLot(null)}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>
                            {blockLot && isBlockedLot(blockLot) ? 'Unblock Lot' : 'Block Lot'}
                        </DialogTitle>
                    </DialogHeader>
                    {blockLot && (
                        <div className="space-y-4 py-2">
                            <div className="p-3 rounded-lg bg-muted/50 text-sm">
                                <p><span className="text-muted-foreground">Lot:</span> <span className="font-mono font-semibold">#{blockLot.lotNumber}</span></p>
                                <p><span className="text-muted-foreground">Stage:</span> <span className="font-medium">{blockLot.currentStage}</span></p>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-xs">{isBlockedLot(blockLot) ? 'Reason for unblocking' : 'Reason for blocking'} (optional)</Label>
                                <Input
                                    placeholder="e.g. Machine breakdown, waiting for material..."
                                    value={blockReason}
                                    onChange={e => setBlockReason(e.target.value)}
                                />
                            </div>
                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setBlockLot(null)}>Cancel</Button>
                        <Button
                            onClick={handleBlock}
                            disabled={isBlocking}
                            variant={blockLot && isBlockedLot(blockLot) ? 'default' : 'outline'}
                            className="gap-2"
                        >
                            {isBlocking && <Loader2 className="h-4 w-4 animate-spin" />}
                            {blockLot && isBlockedLot(blockLot) ? 'Unblock' : 'Block'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}