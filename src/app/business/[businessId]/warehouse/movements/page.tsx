// /business/[businessId]/warehouse/movements/page.tsx
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import {
    ArrowDownToLine,
    ArrowUpFromLine,
    ArrowLeftRight,
    Settings2,
    Package,
    Search,
    RefreshCw,
    Loader2,
    Filter,
    ChevronLeft,
    ChevronRight,
    MapPin,
    ArrowRight,
    Calendar,
    X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardDescription,
} from '@/components/ui/card';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { useBusinessContext } from '../../layout';

// ============================================================
// TYPES
// ============================================================

interface LocationData {
    shelfId: string | null;
    shelfName: string | null;
    rackId: string | null;
    rackName: string | null;
    zoneId: string | null;
    zoneName: string | null;
    warehouseId: string | null;
    warehouseName: string | null;
    path: string | null;
}

interface MovementData {
    id: string;
    productId: string;
    productSKU: string;
    type: 'inbound' | 'outbound' | 'transfer' | 'adjustment';
    from: LocationData;
    to: LocationData;
    quantity: number;
    reason: string;
    reference: string;
    timestamp: string;
    userId: string;
    userName: string;
}

// ============================================================
// HELPERS
// ============================================================

const movementTypeConfig = {
    inbound: {
        label: 'Inbound',
        icon: ArrowDownToLine,
        color: 'text-emerald-600',
        bg: 'bg-emerald-500/10',
        badgeClass: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20',
    },
    outbound: {
        label: 'Outbound',
        icon: ArrowUpFromLine,
        color: 'text-rose-600',
        bg: 'bg-rose-500/10',
        badgeClass: 'bg-rose-500/10 text-rose-700 border-rose-500/20',
    },
    transfer: {
        label: 'Transfer',
        icon: ArrowLeftRight,
        color: 'text-blue-600',
        bg: 'bg-blue-500/10',
        badgeClass: 'bg-blue-500/10 text-blue-700 border-blue-500/20',
    },
    adjustment: {
        label: 'Adjustment',
        icon: Settings2,
        color: 'text-amber-600',
        bg: 'bg-amber-500/10',
        badgeClass: 'bg-amber-500/10 text-amber-700 border-amber-500/20',
    },
};

function formatLocation(location: LocationData): string {
    if (!location.shelfId) return '—';
    return location.path || `${location.zoneName} > ${location.rackName} > ${location.shelfName}`;
}

// ============================================================
// MAIN PAGE
// ============================================================

export default function MovementsPage() {
    const { businessId, user } = useBusinessContext();
    const { toast } = useToast();

    const [movements, setMovements] = useState<MovementData[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [typeFilter, setTypeFilter] = useState<string>('all');
    const [hasMore, setHasMore] = useState(false);
    const [lastId, setLastId] = useState<string | null>(null);
    const [isLoadingMore, setIsLoadingMore] = useState(false);

    const fetchMovements = useCallback(async (loadMore = false) => {
        if (loadMore) {
            setIsLoadingMore(true);
        } else {
            setIsLoading(true);
        }

        try {
            const params = new URLSearchParams({ businessId, limit: '50' });
            if (typeFilter !== 'all') params.append('type', typeFilter);
            if (searchQuery) params.append('productSKU', searchQuery);
            if (loadMore && lastId) params.append('startAfter', lastId);

            const idToken = await user?.getIdToken();
            const res = await fetch(`/api/business/warehouse/list-movements?${params}`, {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${idToken}`,
                }
            });
            if (!res.ok) throw new Error('Failed to fetch movements');

            const data = await res.json();

            if (loadMore) {
                setMovements((prev) => [...prev, ...(data.movements || [])]);
            } else {
                setMovements(data.movements || []);
            }
            setHasMore(data.hasMore);
            setLastId(data.lastId);
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to load movements.', variant: 'destructive' });
        } finally {
            setIsLoading(false);
            setIsLoadingMore(false);
        }
    }, [businessId, typeFilter, searchQuery, lastId, toast]);

    useEffect(() => {
        fetchMovements();
    }, [typeFilter]);

    const handleSearch = () => {
        setLastId(null);
        fetchMovements();
    };

    const handleClearSearch = () => {
        setSearchQuery('');
        setLastId(null);
        setTimeout(() => fetchMovements(), 0);
    };

    // Stats
    const stats = movements.reduce(
        (acc, m) => {
            acc[m.type] = (acc[m.type] || 0) + 1;
            return acc;
        },
        {} as Record<string, number>
    );

    return (
        <div className="min-h-full p-6 space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Stock Movements</h1>
                    <p className="text-muted-foreground">Track all inventory movements across your warehouses</p>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {(['inbound', 'outbound', 'transfer', 'adjustment'] as const).map((type) => {
                    const config = movementTypeConfig[type];
                    const Icon = config.icon;
                    return (
                        <Card key={type} className={cn('cursor-pointer transition-all', typeFilter === type && 'ring-2 ring-primary')} onClick={() => setTypeFilter(typeFilter === type ? 'all' : type)}>
                            <CardContent className="p-4">
                                <div className="flex items-center gap-3">
                                    <div className={cn('p-2 rounded-lg', config.bg)}>
                                        <Icon className={cn('h-5 w-5', config.color)} />
                                    </div>
                                    <div>
                                        <p className="text-2xl font-bold">{stats[type] || 0}</p>
                                        <p className="text-xs text-muted-foreground">{config.label}</p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    );
                })}
            </div>

            {/* Filters & Table */}
            <Card>
                <CardHeader className="border-b">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-primary/10">
                                <ArrowLeftRight className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                                <CardTitle>Movement History</CardTitle>
                                <CardDescription>All stock movements with details</CardDescription>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Search by SKU..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                                    className="pl-9 w-[180px]"
                                />
                                {searchQuery && (
                                    <button onClick={handleClearSearch} className="absolute right-3 top-1/2 -translate-y-1/2">
                                        <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                                    </button>
                                )}
                            </div>
                            <Select value={typeFilter} onValueChange={setTypeFilter}>
                                <SelectTrigger className="w-[140px]">
                                    <Filter className="h-4 w-4 mr-2" />
                                    <SelectValue placeholder="All Types" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Types</SelectItem>
                                    <SelectItem value="inbound">Inbound</SelectItem>
                                    <SelectItem value="outbound">Outbound</SelectItem>
                                    <SelectItem value="transfer">Transfer</SelectItem>
                                    <SelectItem value="adjustment">Adjustment</SelectItem>
                                </SelectContent>
                            </Select>
                            <Button variant="outline" size="icon" onClick={() => { setLastId(null); fetchMovements(); }} disabled={isLoading}>
                                <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
                            </Button>
                        </div>
                    </div>
                </CardHeader>

                <CardContent className="p-0">
                    {isLoading ? (
                        <div className="p-4 space-y-3">
                            {[1, 2, 3, 4, 5].map((i) => (
                                <div key={i} className="flex items-center gap-4 p-3">
                                    <Skeleton className="h-10 w-10 rounded-lg" />
                                    <div className="flex-1 space-y-2">
                                        <Skeleton className="h-4 w-32" />
                                        <Skeleton className="h-3 w-48" />
                                    </div>
                                    <Skeleton className="h-6 w-20" />
                                </div>
                            ))}
                        </div>
                    ) : movements.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 px-4">
                            <div className="p-4 rounded-full bg-muted mb-4">
                                <ArrowLeftRight className="h-10 w-10 text-muted-foreground" />
                            </div>
                            <h3 className="text-lg font-semibold mb-1">No movements found</h3>
                            <p className="text-muted-foreground text-center">
                                {searchQuery || typeFilter !== 'all' ? 'Try different filters' : 'Stock movements will appear here'}
                            </p>
                        </div>
                    ) : (
                        <>
                            <div className="overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="w-[100px]">Type</TableHead>
                                            <TableHead>Product</TableHead>
                                            <TableHead>From</TableHead>
                                            <TableHead></TableHead>
                                            <TableHead>To</TableHead>
                                            <TableHead className="text-right">Quantity</TableHead>
                                            <TableHead>Reason</TableHead>
                                            <TableHead>Time</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {movements.map((movement) => {
                                            const config = movementTypeConfig[movement.type];
                                            const Icon = config.icon;

                                            return (
                                                <TableRow key={movement.id}>
                                                    <TableCell>
                                                        <Badge variant="outline" className={config.badgeClass}>
                                                            <Icon className="h-3 w-3 mr-1" />
                                                            {config.label}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="flex items-center gap-2">
                                                            <div className="p-1.5 rounded-md bg-violet-500/10">
                                                                <Package className="h-4 w-4 text-violet-600" />
                                                            </div>
                                                            <code className="text-sm font-medium">{movement.productSKU}</code>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="flex items-center gap-1.5 text-sm text-muted-foreground max-w-[200px]">
                                                            <MapPin className="h-3.5 w-3.5 shrink-0" />
                                                            <span className="truncate">{formatLocation(movement.from)}</span>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>
                                                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="flex items-center gap-1.5 text-sm max-w-[200px]">
                                                            <MapPin className="h-3.5 w-3.5 shrink-0 text-primary" />
                                                            <span className="truncate">{formatLocation(movement.to)}</span>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <span className={cn(
                                                            'font-mono font-semibold',
                                                            movement.type === 'inbound' && 'text-emerald-600',
                                                            movement.type === 'outbound' && 'text-rose-600',
                                                            movement.type === 'adjustment' && (movement.quantity > 0 ? 'text-emerald-600' : 'text-rose-600')
                                                        )}>
                                                            {movement.type === 'inbound' || movement.quantity > 0 ? '+' : ''}
                                                            {movement.quantity}
                                                        </span>
                                                    </TableCell>
                                                    <TableCell>
                                                        <span className="text-sm text-muted-foreground truncate max-w-[150px] block">
                                                            {movement.reason || '—'}
                                                        </span>
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                                                            <Calendar className="h-3.5 w-3.5" />
                                                            {movement.timestamp ? format(new Date(movement.timestamp), 'MMM d, HH:mm') : '—'}
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                            </div>

                            {hasMore && (
                                <div className="p-4 border-t flex justify-center">
                                    <Button variant="outline" onClick={() => fetchMovements(true)} disabled={isLoadingMore}>
                                        {isLoadingMore ? (
                                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                        ) : (
                                            <ChevronRight className="h-4 w-4 mr-2" />
                                        )}
                                        Load More
                                    </Button>
                                </div>
                            )}
                        </>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}