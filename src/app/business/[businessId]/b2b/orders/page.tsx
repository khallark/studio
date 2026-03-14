'use client';

// /business/[businessId]/b2b/orders/page.tsx

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useBusinessContext } from '../../layout';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { Order, OrderStatus } from '@/types/b2b';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';

import {
    Table, TableBody, TableCell, TableHead,
    TableHeader, TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem,
    DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel,
    AlertDialogContent, AlertDialogDescription,
    AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
    Plus, Search, MoreHorizontal, ClipboardList,
    Package, AlertTriangle, Loader2, RefreshCw, X,
} from 'lucide-react';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';

// ─────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────

const STATUS_TABS: { value: OrderStatus | 'ALL'; label: string }[] = [
    { value: 'ALL',           label: 'All Orders'    },
    { value: 'DRAFT',         label: 'Draft'         },
    { value: 'IN_PRODUCTION', label: 'In Production' },
    { value: 'COMPLETED',     label: 'Completed'     },
    { value: 'CANCELLED',     label: 'Cancelled'     },
];

function getStatusVariant(status: OrderStatus): 'default' | 'secondary' | 'destructive' | 'outline' | 'success' {
    switch (status) {
        case 'DRAFT':         return 'secondary';
        case 'IN_PRODUCTION': return 'default';
        case 'COMPLETED':     return 'success';
        case 'CANCELLED':     return 'destructive';
        case 'CONFIRMED':     return 'outline';
        default:              return 'secondary';
    }
}

const rowVariants = {
    hidden:  { opacity: 0, y: 10 },
    visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.04, duration: 0.25 } }),
    exit:    { opacity: 0, x: -10, transition: { duration: 0.15 } },
};

// ─────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────

export default function B2BOrdersPage() {
    const router = useRouter();
    const { businessId, user, isAuthorized, loading: authLoading } = useBusinessContext();

    const [orders, setOrders]         = useState<Order[]>([]);
    const [loading, setLoading]       = useState(true);
    const [activeTab, setActiveTab]   = useState<OrderStatus | 'ALL'>('ALL');
    const [search, setSearch]         = useState('');
    const [cancelTarget, setCancelTarget] = useState<Order | null>(null);
    const [cancelReason, setCancelReason] = useState('');
    const [isCancelling, setIsCancelling] = useState(false);

    // ── Firestore listener ──────────────────────────────────────────────────
    useEffect(() => {
        if (!isAuthorized || !businessId) return;

        const q = query(
            collection(db, 'users', businessId, 'orders'),
            orderBy('createdAt', 'desc')
        );

        const unsub = onSnapshot(q, (snap) => {
            setOrders(snap.docs.map(d => ({ id: d.id, ...d.data() } as Order)));
            setLoading(false);
        }, (err) => {
            console.error('orders snapshot error:', err);
            setLoading(false);
        });

        return () => unsub();
    }, [businessId, isAuthorized]);

    // ── Derived data ────────────────────────────────────────────────────────
    const filtered = orders.filter(o => {
        const matchTab    = activeTab === 'ALL' || o.status === activeTab;
        const matchSearch = !search ||
            o.orderNumber.toLowerCase().includes(search.toLowerCase()) ||
            o.buyerName.toLowerCase().includes(search.toLowerCase());
        return matchTab && matchSearch;
    });

    const tabCounts = orders.reduce<Record<string, number>>((acc, o) => {
        acc[o.status] = (acc[o.status] ?? 0) + 1;
        return acc;
    }, {});

    // ── Cancel order ────────────────────────────────────────────────────────
    const handleCancelOrder = async () => {
        if (!cancelTarget || !user) return;
        setIsCancelling(true);
        try {
            const token = await user.getIdToken();
            const res = await fetch('/api/business/b2b/cancel-order', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({
                    businessId,
                    orderId: cancelTarget.id,
                    cancelledBy: user.displayName || user.email || 'Unknown',
                    reason: cancelReason || 'Cancelled by user',
                }),
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.error || 'Failed to cancel order');
            toast({ title: 'Order Cancelled', description: `${cancelTarget.orderNumber} has been cancelled.` });
            setCancelTarget(null);
            setCancelReason('');
        } catch (err) {
            toast({ title: 'Error', description: (err as Error).message, variant: 'destructive' });
        } finally {
            setIsCancelling(false);
        }
    };

    // ── Auth guard ──────────────────────────────────────────────────────────
    if (authLoading) return (
        <div className="flex items-center justify-center h-64">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
    );
    if (!isAuthorized) return null;

    // ── Render ──────────────────────────────────────────────────────────────
    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <motion.div
                initial={{ opacity: 0, y: -16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35 }}
                className="flex items-center justify-between gap-4 p-4 md:p-6 border-b bg-gradient-to-r from-background to-muted/20"
            >
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-primary/10 ring-1 ring-primary/20">
                        <ClipboardList className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold">Orders</h1>
                        <p className="text-xs text-muted-foreground">{orders.length} total orders</p>
                    </div>
                </div>
                <Button
                    onClick={() => router.push(`/business/${businessId}/b2b/orders/create`)}
                    className="gap-2 shadow-sm shadow-primary/20"
                >
                    <Plus className="h-4 w-4" />
                    New Order
                </Button>
            </motion.div>

            {/* Status Tabs */}
            <div className="shrink-0 border-b bg-card/60">
                <ScrollArea className="w-full">
                    <div className="flex px-4 pt-2 pb-0 gap-0.5">
                        {STATUS_TABS.map(tab => {
                            const count = tab.value === 'ALL' ? orders.length : (tabCounts[tab.value] ?? 0);
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

            {/* Search */}
            <div className="shrink-0 p-4 border-b">
                <div className="relative max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search by order # or buyer..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="pl-9 h-9"
                    />
                    {search && (
                        <Button variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                            onClick={() => setSearch('')}>
                            <X className="h-3 w-3" />
                        </Button>
                    )}
                </div>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-auto">
                {loading ? (
                    <div className="p-6 space-y-3">
                        {Array.from({ length: 6 }).map((_, i) => (
                            <div key={i} className="flex items-center gap-4">
                                <Skeleton className="h-5 w-28" />
                                <Skeleton className="h-5 w-36" />
                                <Skeleton className="h-5 w-24 ml-auto" />
                                <Skeleton className="h-6 w-20 rounded-full" />
                            </div>
                        ))}
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-center">
                        <Package className="h-12 w-12 text-muted-foreground/30 mb-3" />
                        <h3 className="font-medium text-muted-foreground">No orders found</h3>
                        <p className="text-sm text-muted-foreground/70 mt-1">
                            {search ? 'Try a different search' : 'Create your first order to get started'}
                        </p>
                        {!search && (
                            <Button className="mt-4 gap-2" onClick={() => router.push(`/business/${businessId}/b2b/orders/create`)}>
                                <Plus className="h-4 w-4" /> New Order
                            </Button>
                        )}
                    </div>
                ) : (
                    <Table>
                        <TableHeader className="sticky top-0 bg-card z-10">
                            <TableRow>
                                <TableHead>Order #</TableHead>
                                <TableHead>Buyer</TableHead>
                                <TableHead>Ship Date</TableHead>
                                <TableHead className="text-center">Total Lots</TableHead>
                                <TableHead className="text-center">Completed</TableHead>
                                <TableHead className="text-center">Delayed</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Created</TableHead>
                                <TableHead className="w-10" />
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            <AnimatePresence mode="popLayout">
                                {filtered.map((order, i) => (
                                    <motion.tr
                                        key={order.id}
                                        custom={i}
                                        variants={rowVariants}
                                        initial="hidden"
                                        animate="visible"
                                        exit="exit"
                                        layout
                                        onClick={() => router.push(`/business/${businessId}/b2b/orders/${order.id}`)}
                                        className="group cursor-pointer border-b hover:bg-muted/50 transition-colors"
                                    >
                                        <TableCell className="font-mono font-semibold text-sm">
                                            {order.orderNumber}
                                        </TableCell>
                                        <TableCell>
                                            <div>
                                                <p className="font-medium text-sm">{order.buyerName}</p>
                                                <p className="text-xs text-muted-foreground">{order.buyerContact}</p>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-sm">
                                            {order.shipDate
                                                ? format(order.shipDate.toDate(), 'dd MMM yyyy')
                                                : '—'}
                                        </TableCell>
                                        <TableCell className="text-center font-mono text-sm">{order.totalLots}</TableCell>
                                        <TableCell className="text-center">
                                            <span className={cn(
                                                'font-mono text-sm font-medium',
                                                order.lotsCompleted === order.totalLots && order.totalLots > 0
                                                    ? 'text-emerald-600'
                                                    : 'text-muted-foreground'
                                            )}>
                                                {order.lotsCompleted}/{order.totalLots}
                                            </span>
                                        </TableCell>
                                        <TableCell className="text-center">
                                            {order.lotsDelayed > 0 ? (
                                                <span className="flex items-center justify-center gap-1 text-amber-600 font-medium text-sm">
                                                    <AlertTriangle className="h-3.5 w-3.5" />
                                                    {order.lotsDelayed}
                                                </span>
                                            ) : (
                                                <span className="text-muted-foreground text-sm">—</span>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant={getStatusVariant(order.status)} className="text-xs">
                                                {order.status.replace('_', ' ')}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-sm text-muted-foreground">
                                            {order.createdAt
                                                ? format(order.createdAt.toDate(), 'dd MMM')
                                                : '—'}
                                        </TableCell>
                                        <TableCell onClick={e => e.stopPropagation()}>
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <MoreHorizontal className="h-4 w-4" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                                    <DropdownMenuItem onClick={() => router.push(`/business/${businessId}/b2b/orders/${order.id}`)}>
                                                        View Detail
                                                    </DropdownMenuItem>
                                                    {order.status === 'DRAFT' && (
                                                        <DropdownMenuItem onClick={() => router.push(`/business/${businessId}/b2b/orders/${order.id}/confirm`)}>
                                                            Confirm Order
                                                        </DropdownMenuItem>
                                                    )}
                                                    <DropdownMenuSeparator />
                                                    {!['CANCELLED', 'COMPLETED'].includes(order.status) && (
                                                        <DropdownMenuItem
                                                            className="text-destructive focus:text-destructive"
                                                            onClick={() => setCancelTarget(order)}
                                                        >
                                                            Cancel Order
                                                        </DropdownMenuItem>
                                                    )}
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </TableCell>
                                    </motion.tr>
                                ))}
                            </AnimatePresence>
                        </TableBody>
                    </Table>
                )}
            </div>

            {/* Cancel Confirmation */}
            <AlertDialog open={!!cancelTarget} onOpenChange={open => !open && setCancelTarget(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Cancel Order</AlertDialogTitle>
                        <AlertDialogDescription>
                            Cancel <span className="font-semibold">{cancelTarget?.orderNumber}</span>?
                            All active lots will be cancelled and reserved stock released.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <div className="px-6 pb-2">
                        <Input
                            placeholder="Reason for cancellation (optional)"
                            value={cancelReason}
                            onChange={e => setCancelReason(e.target.value)}
                        />
                    </div>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Keep Order</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleCancelOrder}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            disabled={isCancelling}
                        >
                            {isCancelling && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                            Cancel Order
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}