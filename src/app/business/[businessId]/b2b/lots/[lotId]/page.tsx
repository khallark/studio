'use client';

// /business/[businessId]/b2b/lots/[lotId]/page.tsx

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useBusinessContext } from '../../../layout';
import { db } from '@/lib/firebase';
import { doc, collection, onSnapshot, query, where, orderBy } from 'firebase/firestore';
import { Lot, LotStageHistory } from '@/types/b2b';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
    Table, TableBody, TableCell, TableHead,
    TableHeader, TableRow,
} from '@/components/ui/table';
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel,
    AlertDialogContent, AlertDialogDescription,
    AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
    Dialog, DialogContent, DialogHeader,
    DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
    ArrowLeft, CheckCircle2, AlertTriangle,
    PauseCircle, ChevronRight, Loader2, XCircle,
    Boxes, History, Calendar,
} from 'lucide-react';

const STATUS_COLORS: Record<string, string> = {
    COMPLETED: 'bg-emerald-500',
    IN_PROGRESS: 'bg-primary',
    BLOCKED: 'bg-amber-400',
    PENDING: 'bg-muted',
};

const STATUS_TEXT_COLORS: Record<string, string> = {
    COMPLETED: 'text-emerald-600',
    IN_PROGRESS: 'text-primary',
    BLOCKED: 'text-amber-600',
    PENDING: 'text-muted-foreground',
};

export default function LotDetailPage() {
    const params = useParams();
    const router = useRouter();
    const { businessId, user, isAuthorized, loading: authLoading } = useBusinessContext();
    const lotId = params.lotId as string;

    const [lot, setLot] = useState<Lot | null>(null);
    const [history, setHistory] = useState<LotStageHistory[]>([]);
    const [loading, setLoading] = useState(true);

    const [advanceOpen, setAdvanceOpen] = useState(false);
    const [advanceNote, setAdvanceNote] = useState('');
    const [isAdvancing, setIsAdvancing] = useState(false);

    const [blockOpen, setBlockOpen] = useState(false);
    const [blockReason, setBlockReason] = useState('');
    const [isBlocking, setIsBlocking] = useState(false);

    const [cancelOpen, setCancelOpen] = useState(false);
    const [cancelReason, setCancelReason] = useState('');
    const [isCancelling, setIsCancelling] = useState(false);

    useEffect(() => {
        if (!isAuthorized || !businessId || !lotId) return;

        const u1 = onSnapshot(doc(db, 'users', businessId, 'lots', lotId), snap => {
            if (snap.exists()) setLot({ id: snap.id, ...snap.data() } as Lot);
            setLoading(false);
        });
        const u2 = onSnapshot(
            query(collection(db, 'users', businessId, 'lot_stage_history'), where('lotId', '==', lotId), orderBy('movedAt', 'desc')),
            snap => setHistory(snap.docs.map(d => ({ id: d.id, ...d.data() } as LotStageHistory)))
        );
        return () => { u1(); u2(); };
    }, [businessId, isAuthorized, lotId]);

    const isBlockedLot = lot?.stages.some(s => s.status === 'BLOCKED') ?? false;
    const isLastStage = lot ? lot.currentSequence === lot.totalStages : false;
    const totalMaterials = lot ? lot.bomSnapshot.reduce((s, st) => s + st.materials.length, 0) : 0;

    const handleAdvance = async () => {
        if (!lot || !user) return;
        setIsAdvancing(true);
        try {
            const token = await user.getIdToken();
            const res = await fetch('/api/business/b2b/advance-lot-stage', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ businessId, lotId, completedBy: user.displayName || user.email || 'Unknown', note: advanceNote.trim() || undefined }),
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.error || 'Failed');
            toast({ title: 'Stage Advanced' });
            setAdvanceOpen(false);
            setAdvanceNote('');
        } catch (err) {
            toast({ title: 'Error', description: (err as Error).message, variant: 'destructive' });
        } finally {
            setIsAdvancing(false);
        }
    };

    const handleBlock = async () => {
        if (!lot || !user) return;
        setIsBlocking(true);
        try {
            const token = await user.getIdToken();
            const res = await fetch('/api/business/b2b/set-lot-stage-blocked', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ businessId, lotId, blocked: !isBlockedLot, reason: blockReason.trim() || undefined }),
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.error || 'Failed');
            toast({ title: isBlockedLot ? 'Lot Unblocked' : 'Lot Blocked' });
            setBlockOpen(false);
            setBlockReason('');
        } catch (err) {
            toast({ title: 'Error', description: (err as Error).message, variant: 'destructive' });
        } finally {
            setIsBlocking(false);
        }
    };

    const handleCancel = async () => {
        if (!lot || !user) return;
        setIsCancelling(true);
        try {
            const token = await user.getIdToken();
            const res = await fetch('/api/business/b2b/cancel-lot', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ businessId, lotId, cancelledBy: user.displayName || user.email || 'Unknown', reason: cancelReason || 'Cancelled by user' }),
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.error || 'Failed');
            toast({ title: 'Lot Cancelled' });
            setCancelOpen(false);
            router.back();
        } catch (err) {
            toast({ title: 'Error', description: (err as Error).message, variant: 'destructive' });
        } finally {
            setIsCancelling(false);
        }
    };

    if (authLoading || loading) return (
        <div className="p-6 space-y-4">
            <Skeleton className="h-8 w-40" />
            <Skeleton className="h-48 rounded-xl" />
            <Skeleton className="h-64 rounded-xl" />
        </div>
    );
    if (!isAuthorized || !lot) return null;

    return (
        <div className="flex flex-col h-full overflow-y-auto">
            {/* Header */}
            <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-4 p-4 md:p-6 border-b bg-gradient-to-r from-background to-muted/20 sticky top-0 z-10 bg-background">
                <Button variant="ghost" size="icon" onClick={() => router.back()}><ArrowLeft className="h-4 w-4" /></Button>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 flex-wrap">
                        <h1 className="text-xl font-bold font-mono">Lot #{lot.lotNumber}</h1>
                        <Badge variant={lot.status === 'ACTIVE' ? 'default' : lot.status === 'COMPLETED' ? 'success' : 'destructive'}>
                            {lot.status}
                        </Badge>
                        {lot.isDelayed && (
                            <Badge variant="outline" className="text-amber-600 border-amber-300 gap-1">
                                <AlertTriangle className="h-3 w-3" />{lot.delayDays}d late
                            </Badge>
                        )}
                        {isBlockedLot && <Badge variant="outline" className="text-amber-600 border-amber-300">BLOCKED</Badge>}
                        {lot.bomId && <Badge variant="outline" className="text-xs text-blue-600 border-blue-200">Predefined BOM</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{lot.productName} · {lot.buyerName} · {lot.orderNumber}</p>
                </div>
                {lot.status === 'ACTIVE' && (
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => { setBlockReason(''); setBlockOpen(true); }}>
                            <PauseCircle className="h-4 w-4 mr-1" />
                            {isBlockedLot ? 'Unblock' : 'Block'}
                        </Button>
                        <Button size="sm" className={cn('gap-2', isLastStage && 'bg-emerald-600 hover:bg-emerald-700')}
                            onClick={() => { setAdvanceNote(''); setAdvanceOpen(true); }} disabled={isBlockedLot}>
                            {isLastStage ? <CheckCircle2 className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            {isLastStage ? 'Complete' : 'Advance Stage'}
                        </Button>
                        <Button variant="outline" size="sm" className="text-destructive border-destructive/30 hover:bg-destructive/10"
                            onClick={() => { setCancelReason(''); setCancelOpen(true); }}>
                            <XCircle className="h-4 w-4 mr-1" />Cancel
                        </Button>
                    </div>
                )}
            </motion.div>

            <div className="p-4 md:p-6 space-y-6">
                {/* Info cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[
                        { label: 'Product', value: lot.productName, sub: lot.productSku },
                        { label: 'Color / Size', value: lot.color, sub: lot.size || '—' },
                        { label: 'Quantity', value: `${lot.quantity.toLocaleString()} pcs`, sub: null },
                        { label: 'Ship Date', value: lot.shipDate ? format(lot.shipDate.toDate(), 'dd MMM yyyy') : '—', sub: null },
                    ].map(card => (
                        <Card key={card.label} className="border-border/50">
                            <CardContent className="p-4">
                                <p className="text-xs text-muted-foreground">{card.label}</p>
                                <p className="font-semibold text-sm mt-1 truncate">{card.value}</p>
                                {card.sub && <p className="text-xs text-muted-foreground font-mono">{card.sub}</p>}
                            </CardContent>
                        </Card>
                    ))}
                </div>

                <Tabs defaultValue="stages">
                    <TabsList>
                        <TabsTrigger value="stages">Stage Pipeline</TabsTrigger>
                        <TabsTrigger value="materials">
                            Materials {totalMaterials > 0 ? `(${totalMaterials})` : ''}
                        </TabsTrigger>
                        <TabsTrigger value="history">History ({history.length})</TabsTrigger>
                    </TabsList>

                    {/* Stages Tab */}
                    <TabsContent value="stages" className="mt-4">
                        <div className="space-y-2">
                            {lot.stages.map((stage, i) => (
                                <motion.div key={i}
                                    initial={{ opacity: 0, x: -8 }}
                                    animate={{ opacity: 1, x: 0, transition: { delay: i * 0.05 } }}
                                    className={cn(
                                        'flex items-center gap-4 p-4 rounded-xl border transition-all',
                                        stage.status === 'IN_PROGRESS' && 'border-primary/30 bg-primary/5',
                                        stage.status === 'BLOCKED' && 'border-amber-300 bg-amber-50/50 dark:bg-amber-950/20',
                                        stage.status === 'COMPLETED' && 'border-emerald-200/50 bg-emerald-50/30 dark:bg-emerald-950/10',
                                        stage.status === 'PENDING' && 'border-border/50 bg-muted/20',
                                    )}>
                                    <div className={cn('h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0', STATUS_COLORS[stage.status])}>
                                        {stage.status === 'COMPLETED' ? <CheckCircle2 className="h-4 w-4" /> : stage.sequence}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <p className={cn('font-semibold text-sm', STATUS_TEXT_COLORS[stage.status])}>{stage.stage}</p>
                                            {stage.isOutsourced && <Badge variant="outline" className="text-xs">Outsourced</Badge>}
                                            {stage.status === 'IN_PROGRESS' && <Badge variant="default" className="text-xs">Current</Badge>}
                                        </div>
                                        <div className="flex gap-4 mt-1 text-xs text-muted-foreground">
                                            <span className="flex items-center gap-1">
                                                <Calendar className="h-3 w-3" />
                                                Planned: {format(stage.plannedDate.toDate(), 'dd MMM yyyy')}
                                            </span>
                                            {stage.actualDate && (
                                                <span className="flex items-center gap-1 text-emerald-600">
                                                    <CheckCircle2 className="h-3 w-3" />
                                                    Done: {format(stage.actualDate.toDate(), 'dd MMM yyyy')}
                                                </span>
                                            )}
                                        </div>
                                        {stage.completedBy && <p className="text-xs text-muted-foreground mt-0.5">By: {stage.completedBy}</p>}
                                        {stage.note && <p className="text-xs text-muted-foreground italic mt-0.5">"{stage.note}"</p>}
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    </TabsContent>

                    {/* Materials Tab — shows BOM snapshot */}
                    <TabsContent value="materials" className="mt-4">
                        {lot.bomSnapshot.length === 0 ? (
                            <div className="text-center py-12 text-muted-foreground text-sm">
                                No material tracking for this lot.
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {lot.bomSnapshot.map((stage, si) => (
                                    <div key={si} className="border rounded-xl overflow-hidden">
                                        <div className="px-4 py-2 bg-muted/50 border-b">
                                            <Badge variant="outline" className="text-xs font-mono">{stage.stage}</Badge>
                                        </div>
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead>Material</TableHead>
                                                    <TableHead className="text-right">Qty / Piece</TableHead>
                                                    <TableHead className="text-right">Wastage %</TableHead>
                                                    <TableHead className="text-right">Total Required</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {stage.materials.map((m, mi) => (
                                                    <TableRow key={mi}>
                                                        <TableCell>
                                                            <div className="flex items-center gap-2">
                                                                <Boxes className="h-4 w-4 text-muted-foreground" />
                                                                <span className="text-sm font-medium">{m.materialName}</span>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="text-right font-mono text-sm">
                                                            {m.quantityPerPiece} <span className="text-xs text-muted-foreground">{m.materialUnit}</span>
                                                        </TableCell>
                                                        <TableCell className="text-right font-mono text-sm text-muted-foreground">
                                                            {m.wastagePercent}%
                                                        </TableCell>
                                                        <TableCell className="text-right font-mono text-sm font-semibold">
                                                            {m.totalQuantity} <span className="text-xs text-muted-foreground font-normal">{m.materialUnit}</span>
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </div>
                                ))}
                            </div>
                        )}
                    </TabsContent>

                    {/* History Tab */}
                    <TabsContent value="history" className="mt-4">
                        {history.length === 0 ? (
                            <div className="text-center py-12 text-muted-foreground text-sm">No stage history yet</div>
                        ) : (
                            <div className="space-y-3">
                                {history.map((h, i) => (
                                    <motion.div key={h.id}
                                        initial={{ opacity: 0, x: -8 }}
                                        animate={{ opacity: 1, x: 0, transition: { delay: i * 0.04 } }}
                                        className="flex items-start gap-3 p-3 rounded-lg border bg-muted/20">
                                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                            <History className="h-4 w-4 text-primary" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium">{h.fromStage} → {h.toStage}</p>
                                            <p className="text-xs text-muted-foreground">
                                                {h.movedAt ? format(h.movedAt.toDate(), 'dd MMM yyyy, HH:mm') : '—'}
                                                {h.movedBy && ` · By ${h.movedBy}`}
                                            </p>
                                            {h.note && <p className="text-xs text-muted-foreground italic mt-0.5">"{h.note}"</p>}
                                        </div>
                                    </motion.div>
                                ))}
                            </div>
                        )}
                    </TabsContent>
                </Tabs>
            </div>

            {/* Advance Dialog */}
            <Dialog open={advanceOpen} onOpenChange={o => !o && setAdvanceOpen(false)}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>{isLastStage ? 'Complete Final Stage' : 'Advance to Next Stage'}</DialogTitle>
                    </DialogHeader>
                    {lot && (
                        <div className="space-y-4 py-2">
                            <div className="p-3 rounded-lg bg-muted/50 text-sm space-y-1">
                                <p><span className="text-muted-foreground">Completing:</span> <span className="font-medium">{lot.currentStage}</span></p>
                                {!isLastStage && <p><span className="text-muted-foreground">Moving to:</span> <span className="font-medium">{lot.stages[lot.currentSequence]?.stage}</span></p>}
                            </div>
                            <div className="space-y-2">
                                <Label className="text-xs">Note (optional)</Label>
                                <Textarea placeholder="Any notes for this stage..." value={advanceNote} onChange={e => setAdvanceNote(e.target.value)} rows={2} />
                            </div>
                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setAdvanceOpen(false)}>Cancel</Button>
                        <Button onClick={handleAdvance} disabled={isAdvancing} className={cn('gap-2', isLastStage && 'bg-emerald-600 hover:bg-emerald-700')}>
                            {isAdvancing && <Loader2 className="h-4 w-4 animate-spin" />}
                            {isLastStage ? 'Mark Complete' : 'Advance Stage'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Block Dialog */}
            <Dialog open={blockOpen} onOpenChange={o => !o && setBlockOpen(false)}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader><DialogTitle>{isBlockedLot ? 'Unblock Lot' : 'Block Lot'}</DialogTitle></DialogHeader>
                    <div className="space-y-4 py-2">
                        <div className="p-3 rounded-lg bg-muted/50 text-sm">
                            <p><span className="text-muted-foreground">Stage:</span> <span className="font-medium">{lot.currentStage}</span></p>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs">{isBlockedLot ? 'Reason for unblocking' : 'Reason for blocking'} (optional)</Label>
                            <Input placeholder="e.g. Machine breakdown, waiting for material..." value={blockReason} onChange={e => setBlockReason(e.target.value)} />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setBlockOpen(false)}>Cancel</Button>
                        <Button onClick={handleBlock} disabled={isBlocking} className="gap-2">
                            {isBlocking && <Loader2 className="h-4 w-4 animate-spin" />}
                            {isBlockedLot ? 'Unblock' : 'Block'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Cancel Dialog */}
            <AlertDialog open={cancelOpen} onOpenChange={o => !o && setCancelOpen(false)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Cancel Lot</AlertDialogTitle>
                        <AlertDialogDescription>Cancel Lot #{lot.lotNumber}?</AlertDialogDescription>
                    </AlertDialogHeader>
                    <div className="px-6 pb-2">
                        <Input placeholder="Reason (optional)" value={cancelReason} onChange={e => setCancelReason(e.target.value)} />
                    </div>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Keep Lot</AlertDialogCancel>
                        <AlertDialogAction onClick={handleCancel} disabled={isCancelling} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                            {isCancelling && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Cancel Lot
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}