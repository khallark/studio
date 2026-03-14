'use client';

// /business/[businessId]/b2b/orders/[orderId]/page.tsx

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useBusinessContext } from '../../../layout';
import { db } from '@/lib/firebase';
import { doc, collection, onSnapshot, query, where, orderBy } from 'firebase/firestore';
import { Order, Lot, OrderStatus } from '@/types/b2b';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
    ArrowLeft, ClipboardList, AlertTriangle, Loader2,
    Package, CheckCircle2, Clock, Zap, XCircle, Calendar,
    MapPin, User, FileText,
} from 'lucide-react';

function getStatusVariant(s: OrderStatus): 'default' | 'secondary' | 'destructive' | 'outline' | 'success' {
    switch (s) {
        case 'DRAFT':         return 'secondary';
        case 'IN_PRODUCTION': return 'default';
        case 'COMPLETED':     return 'success';
        case 'CANCELLED':     return 'destructive';
        case 'CONFIRMED':     return 'outline';
        default:              return 'secondary';
    }
}

function getLotStatusVariant(s: string): 'default' | 'secondary' | 'destructive' | 'outline' | 'success' {
    switch (s) {
        case 'ACTIVE':     return 'default';
        case 'COMPLETED':  return 'success';
        case 'CANCELLED':  return 'destructive';
        case 'ON_HOLD':    return 'outline';
        default:           return 'secondary';
    }
}

export default function OrderDetailPage() {
    const params = useParams();
    const router = useRouter();
    const { businessId, user, isAuthorized, loading: authLoading } = useBusinessContext();
    const orderId = params.orderId as string;

    const [order, setOrder]   = useState<Order | null>(null);
    const [lots, setLots]     = useState<Lot[]>([]);
    const [loading, setLoading] = useState(true);

    const [cancelOpen, setCancelOpen]     = useState(false);
    const [cancelReason, setCancelReason] = useState('');
    const [isCancelling, setIsCancelling] = useState(false);
    const [isConfirming, setIsConfirming] = useState(false);

    useEffect(() => {
        if (!isAuthorized || !businessId || !orderId) return;

        const unsub1 = onSnapshot(doc(db, 'users', businessId, 'orders', orderId), snap => {
            if (snap.exists()) setOrder({ id: snap.id, ...snap.data() } as Order);
            setLoading(false);
        });
        const unsub2 = onSnapshot(
            query(collection(db, 'users', businessId, 'lots'), where('orderId', '==', orderId), orderBy('lotNumber')),
            snap => setLots(snap.docs.map(d => ({ id: d.id, ...d.data() } as Lot)))
        );
        return () => { unsub1(); unsub2(); };
    }, [businessId, isAuthorized, orderId]);

    const handleConfirm = async () => {
        if (!user || !order) return;
        setIsConfirming(true);
        try {
            const token = await user.getIdToken();
            const res = await fetch('/api/business/b2b/confirm-order', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ businessId, orderId, confirmedBy: user.displayName || user.email || 'Unknown' }),
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.error || result.message || 'Failed to confirm');
            toast({ title: 'Order Confirmed', description: 'Lots created and stock reserved.' });
        } catch (err) {
            toast({ title: 'Error', description: (err as Error).message, variant: 'destructive' });
        } finally {
            setIsConfirming(false);
        }
    };

    const handleCancel = async () => {
        if (!user || !order) return;
        setIsCancelling(true);
        try {
            const token = await user.getIdToken();
            const res = await fetch('/api/business/b2b/cancel-order', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ businessId, orderId, cancelledBy: user.displayName || user.email || 'Unknown', reason: cancelReason || 'Cancelled by user' }),
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.error || 'Failed');
            toast({ title: 'Order Cancelled' });
            setCancelOpen(false);
        } catch (err) {
            toast({ title: 'Error', description: (err as Error).message, variant: 'destructive' });
        } finally {
            setIsCancelling(false);
        }
    };

    if (authLoading || loading) return (
        <div className="p-6 space-y-4">
            <Skeleton className="h-8 w-48" />
            <div className="grid md:grid-cols-3 gap-4">
                {[1,2,3].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}
            </div>
            <Skeleton className="h-48 rounded-xl" />
        </div>
    );
    if (!isAuthorized || !order) return null;

    const progressPct = order.totalLots > 0 ? Math.round((order.lotsCompleted / order.totalLots) * 100) : 0;

    return (
        <div className="flex flex-col h-full overflow-y-auto">
            {/* Header */}
            <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-4 p-4 md:p-6 border-b bg-gradient-to-r from-background to-muted/20 sticky top-0 z-10 bg-background">
                <Button variant="ghost" size="icon" onClick={() => router.back()}>
                    <ArrowLeft className="h-4 w-4" />
                </Button>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3">
                        <h1 className="text-xl font-bold font-mono">{order.orderNumber}</h1>
                        <Badge variant={getStatusVariant(order.status)}>{order.status.replace('_', ' ')}</Badge>
                        {order.lotsDelayed > 0 && (
                            <Badge variant="outline" className="text-amber-600 border-amber-300 gap-1">
                                <AlertTriangle className="h-3 w-3" />{order.lotsDelayed} delayed
                            </Badge>
                        )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{order.buyerName}</p>
                </div>
                <div className="flex items-center gap-2">
                    {order.status === 'DRAFT' && (
                        <>
                            <Button variant="outline" size="sm" onClick={() => router.push(`/business/${businessId}/b2b/orders/${orderId}/edit`)}>
                                Edit Draft
                            </Button>
                            <Button size="sm" className="gap-2" onClick={handleConfirm} disabled={isConfirming}>
                                {isConfirming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                                Confirm Order
                            </Button>
                        </>
                    )}
                    {!['CANCELLED', 'COMPLETED'].includes(order.status) && (
                        <Button variant="outline" size="sm" className="text-destructive border-destructive/30 hover:bg-destructive/10" onClick={() => setCancelOpen(true)}>
                            <XCircle className="h-4 w-4 mr-1" />Cancel
                        </Button>
                    )}
                </div>
            </motion.div>

            <div className="p-4 md:p-6 space-y-6">
                {/* Summary cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[
                        { label: 'Total Lots',    value: order.totalLots,        icon: Package,      color: 'text-primary'    },
                        { label: 'Completed',     value: order.lotsCompleted,    icon: CheckCircle2, color: 'text-emerald-600' },
                        { label: 'In Production', value: order.lotsInProduction, icon: Clock,        color: 'text-blue-600'   },
                        { label: 'Total Qty',     value: order.totalQuantity.toLocaleString(), icon: Package, color: 'text-primary' },
                    ].map(stat => (
                        <Card key={stat.label} className="border-border/50">
                            <CardContent className="p-4">
                                <div className="flex items-center justify-between">
                                    <p className="text-xs text-muted-foreground">{stat.label}</p>
                                    <stat.icon className={cn('h-4 w-4', stat.color)} />
                                </div>
                                <p className={cn('text-2xl font-bold mt-1', stat.color)}>{stat.value}</p>
                            </CardContent>
                        </Card>
                    ))}
                </div>

                {/* Progress bar */}
                {order.status === 'IN_PRODUCTION' && (
                    <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>Production Progress</span>
                            <span className="font-mono font-medium">{progressPct}%</span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <motion.div
                                className="h-full bg-primary rounded-full"
                                initial={{ width: 0 }}
                                animate={{ width: `${progressPct}%` }}
                                transition={{ duration: 0.6, ease: 'easeOut' }}
                            />
                        </div>
                    </div>
                )}

                {/* Order info */}
                <div className="grid md:grid-cols-2 gap-6">
                    <Card>
                        <CardHeader className="pb-3"><CardTitle className="text-sm">Order Details</CardTitle></CardHeader>
                        <CardContent className="space-y-3 text-sm">
                            <div className="flex items-start gap-2">
                                <Calendar className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                                <div>
                                    <p className="text-xs text-muted-foreground">Ship Date</p>
                                    <p className="font-medium">{order.shipDate ? format(order.shipDate.toDate(), 'dd MMM yyyy') : '—'}</p>
                                </div>
                            </div>
                            <div className="flex items-start gap-2">
                                <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                                <div>
                                    <p className="text-xs text-muted-foreground">Delivery Address</p>
                                    <p className="font-medium">{order.deliveryAddress}</p>
                                </div>
                            </div>
                            <div className="flex items-start gap-2">
                                <User className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                                <div>
                                    <p className="text-xs text-muted-foreground">Created By</p>
                                    <p className="font-medium">{order.createdBy}</p>
                                </div>
                            </div>
                            {order.note && (
                                <div className="flex items-start gap-2">
                                    <FileText className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                                    <div>
                                        <p className="text-xs text-muted-foreground">Note</p>
                                        <p className="font-medium">{order.note}</p>
                                    </div>
                                </div>
                            )}
                            <div className="flex items-start gap-2">
                                <Clock className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                                <div>
                                    <p className="text-xs text-muted-foreground">Created At</p>
                                    <p className="font-medium">{order.createdAt ? format(order.createdAt.toDate(), 'dd MMM yyyy, HH:mm') : '—'}</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Draft Lots Preview */}
                    {order.status === 'DRAFT' && order.draftLots && order.draftLots.length > 0 && (
                        <Card>
                            <CardHeader className="pb-3"><CardTitle className="text-sm">Draft Lots ({order.draftLots.length})</CardTitle></CardHeader>
                            <CardContent className="space-y-2">
                                {order.draftLots.map((dl, i) => (
                                    <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-muted/50 text-sm">
                                        <div>
                                            <p className="font-medium">{dl.productName}</p>
                                            <p className="text-xs text-muted-foreground">{dl.color}{dl.size && ` · ${dl.size}`} · {dl.stages.length} stages</p>
                                        </div>
                                        <span className="font-mono font-bold">{dl.quantity.toLocaleString()} pcs</span>
                                    </div>
                                ))}
                            </CardContent>
                        </Card>
                    )}
                </div>

                {/* Lots Table */}
                {lots.length > 0 && (
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-sm">Lots ({lots.length})</CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Lot #</TableHead>
                                        <TableHead>Product</TableHead>
                                        <TableHead>Color / Size</TableHead>
                                        <TableHead className="text-center">Qty</TableHead>
                                        <TableHead>Current Stage</TableHead>
                                        <TableHead>Progress</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead className="text-center">Delayed</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {lots.map(lot => {
                                        const completedStages = lot.stages.filter(s => s.status === 'COMPLETED').length;
                                        const pct = lot.totalStages > 0 ? Math.round((completedStages / lot.totalStages) * 100) : 0;
                                        return (
                                            <TableRow key={lot.id} className="cursor-pointer hover:bg-muted/40"
                                                onClick={() => router.push(`/business/${businessId}/b2b/lots/${lot.id}`)}>
                                                <TableCell className="font-mono font-bold text-sm">#{lot.lotNumber}</TableCell>
                                                <TableCell>
                                                    <p className="font-medium text-sm">{lot.productName}</p>
                                                    <p className="text-xs text-muted-foreground font-mono">{lot.productSku}</p>
                                                </TableCell>
                                                <TableCell className="text-sm">{lot.color}{lot.size && ` / ${lot.size}`}</TableCell>
                                                <TableCell className="text-center font-mono text-sm">{lot.quantity.toLocaleString()}</TableCell>
                                                <TableCell><Badge variant="outline" className="text-xs">{lot.currentStage}</Badge></TableCell>
                                                <TableCell>
                                                    <div className="flex items-center gap-2 min-w-24">
                                                        <div className="h-1.5 flex-1 bg-muted rounded-full overflow-hidden">
                                                            <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                                                        </div>
                                                        <span className="text-xs text-muted-foreground w-8">{pct}%</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell><Badge variant={getLotStatusVariant(lot.status)} className="text-xs">{lot.status}</Badge></TableCell>
                                                <TableCell className="text-center">
                                                    {lot.isDelayed ? (
                                                        <span className="flex items-center justify-center gap-1 text-amber-600 text-xs">
                                                            <AlertTriangle className="h-3 w-3" />{lot.delayDays}d
                                                        </span>
                                                    ) : <span className="text-muted-foreground text-xs">—</span>}
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                )}
            </div>

            {/* Cancel Dialog */}
            <AlertDialog open={cancelOpen} onOpenChange={o => !o && setCancelOpen(false)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Cancel Order</AlertDialogTitle>
                        <AlertDialogDescription>Cancel <span className="font-semibold">{order.orderNumber}</span>? All active lots will be cancelled and reserved stock released.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <div className="px-6 pb-2">
                        <Input placeholder="Reason for cancellation (optional)" value={cancelReason} onChange={e => setCancelReason(e.target.value)} />
                    </div>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Keep Order</AlertDialogCancel>
                        <AlertDialogAction onClick={handleCancel} disabled={isCancelling} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                            {isCancelling && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Cancel Order
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}