// /business/[businessId]/warehouse/logs/page.tsx
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import {
    History,
    MapPin,
    Grid3X3,
    Layers,
    Package,
    Search,
    RefreshCw,
    Loader2,
    Filter,
    Plus,
    Pencil,
    Trash2,
    RotateCcw,
    ArrowRight,
    MoveRight,
    Calendar,
    User,
    X,
    ChevronDown,
    ChevronUp,
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
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { useToast } from '@/hooks/use-toast';
import { useBusinessContext } from '../../layout';

// ============================================================
// TYPES
// ============================================================

interface LogEntry {
    id: string;
    entityType: 'zone' | 'rack' | 'shelf' | 'placement';
    entityId: string;
    entityName: string;
    type: string;
    changes?: Record<string, { from: any; to: any }>;
    note?: string;
    timestamp: string;
    userId: string;
    fromLocation?: { id: string; name: string };
    toLocation?: { id: string; name: string };
    quantity?: number;
    quantityBefore?: number;
    quantityAfter?: number;
}

// ============================================================
// HELPERS
// ============================================================

const entityConfig = {
    zone: { icon: MapPin, color: 'text-emerald-600', bg: 'bg-emerald-500/10', label: 'Zone' },
    rack: { icon: Grid3X3, color: 'text-amber-600', bg: 'bg-amber-500/10', label: 'Rack' },
    shelf: { icon: Layers, color: 'text-purple-600', bg: 'bg-purple-500/10', label: 'Shelf' },
    placement: { icon: Package, color: 'text-violet-600', bg: 'bg-violet-500/10', label: 'Placement' },
};

const actionConfig: Record<string, { icon: React.ElementType; color: string; label: string }> = {
    created: { icon: Plus, color: 'text-emerald-600', label: 'Created' },
    updated: { icon: Pencil, color: 'text-blue-600', label: 'Updated' },
    deleted: { icon: Trash2, color: 'text-rose-600', label: 'Deleted' },
    restored: { icon: RotateCcw, color: 'text-amber-600', label: 'Restored' },
    moved: { icon: MoveRight, color: 'text-purple-600', label: 'Moved' },
    added: { icon: Plus, color: 'text-emerald-600', label: 'Added' },
    removed: { icon: Trash2, color: 'text-rose-600', label: 'Removed' },
    quantity_adjusted: { icon: Pencil, color: 'text-blue-600', label: 'Adjusted' },
};

function formatChanges(changes: Record<string, { from: any; to: any }>): string[] {
    return Object.entries(changes).map(([field, { from, to }]) => {
        const fromStr = from === undefined || from === null || from === '' ? '(empty)' : String(from);
        const toStr = to === undefined || to === null || to === '' ? '(empty)' : String(to);
        return `${field}: ${fromStr} → ${toStr}`;
    });
}

// ============================================================
// LOG ITEM COMPONENT
// ============================================================

function LogItem({ log }: { log: LogEntry }) {
    const [isOpen, setIsOpen] = useState(false);
    const entity = entityConfig[log.entityType] || entityConfig.zone;
    const action = actionConfig[log.type] ?? { icon: History, color: 'text-muted-foreground', label: log.type || 'Unknown' };
    const EntityIcon = entity?.icon || MapPin;
    const ActionIcon = action?.icon || History;

    const hasDetails = log.changes || log.fromLocation || log.toLocation || log.quantity !== undefined;

    const entityColor = entity?.color || 'text-muted-foreground';
    const entityBg = entity?.bg || 'bg-muted';
    const entityLabel = entity?.label || log.entityType || 'Item';
    const actionColor = action?.color || 'text-muted-foreground';
    const actionLabel = action?.label || log.type || 'Action';

    return (
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
            <div className={cn(
                'border rounded-lg transition-all',
                isOpen && 'ring-1 ring-primary/20'
            )}>
                <CollapsibleTrigger asChild>
                    <button className="w-full p-4 flex items-start gap-4 text-left hover:bg-muted/50 transition-colors">
                        {/* Entity Icon */}
                        <div className={cn('p-2 rounded-lg shrink-0', entityBg)}>
                            <EntityIcon className={cn('h-5 w-5', entityColor)} />
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium">{log.entityName}</span>
                                <Badge variant="secondary" className="text-xs">
                                    {entityLabel}
                                </Badge>
                                <Badge variant="outline" className={cn('text-xs', actionColor)}>
                                    <ActionIcon className="h-3 w-3 mr-1" />
                                    {actionLabel}
                                </Badge>
                            </div>

                            {/* Quick summary */}
                            <div className="mt-1 text-sm text-muted-foreground">
                                {log.type === 'moved' && log.fromLocation && log.toLocation && (
                                    <span>Moved from {log.fromLocation.name} to {log.toLocation.name}</span>
                                )}
                                {log.type === 'quantity_adjusted' && log.quantityBefore !== undefined && (
                                    <span>Quantity: {log.quantityBefore} → {log.quantityAfter}</span>
                                )}
                                {log.type === 'added' && log.quantity !== undefined && (
                                    <span>Added {log.quantity} units</span>
                                )}
                                {log.changes && Object.keys(log.changes).length > 0 && (
                                    <span>{Object.keys(log.changes).length} field(s) changed</span>
                                )}
                                {log.note && <span>{log.note}</span>}
                            </div>
                        </div>

                        {/* Timestamp */}
                        <div className="flex items-center gap-4 shrink-0">
                            <div className="text-right text-sm text-muted-foreground">
                                <div className="flex items-center gap-1">
                                    <Calendar className="h-3.5 w-3.5" />
                                    {log.timestamp ? format(new Date(log.timestamp), 'MMM d, yyyy') : '—'}
                                </div>
                                <div className="text-xs">
                                    {log.timestamp ? format(new Date(log.timestamp), 'HH:mm:ss') : ''}
                                </div>
                            </div>

                            {hasDetails && (
                                <div className="text-muted-foreground">
                                    {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                </div>
                            )}
                        </div>
                    </button>
                </CollapsibleTrigger>

                {hasDetails && (
                    <CollapsibleContent>
                        <div className="px-4 pb-4 pt-0 border-t bg-muted/30">
                            <div className="pt-4 space-y-3">
                                {/* Move details */}
                                {log.fromLocation && log.toLocation && (
                                    <div className="flex items-center gap-3 text-sm">
                                        <Badge variant="outline">{log.fromLocation.name}</Badge>
                                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                                        <Badge variant="outline" className="border-primary text-primary">
                                            {log.toLocation.name}
                                        </Badge>
                                    </div>
                                )}

                                {/* Quantity details */}
                                {log.quantityBefore !== undefined && log.quantityAfter !== undefined && (
                                    <div className="flex items-center gap-3 text-sm">
                                        <span className="text-muted-foreground">Quantity:</span>
                                        <code className="bg-muted px-2 py-0.5 rounded">{log.quantityBefore}</code>
                                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                                        <code className="bg-primary/10 text-primary px-2 py-0.5 rounded">{log.quantityAfter}</code>
                                        <span className={cn(
                                            'font-medium',
                                            (log.quantityAfter - log.quantityBefore) > 0 ? 'text-emerald-600' : 'text-rose-600'
                                        )}>
                                            ({(log.quantityAfter - log.quantityBefore) > 0 ? '+' : ''}{log.quantityAfter - log.quantityBefore})
                                        </span>
                                    </div>
                                )}

                                {/* Field changes */}
                                {log.changes && Object.keys(log.changes).length > 0 && (
                                    <div className="space-y-1">
                                        <span className="text-sm text-muted-foreground">Changes:</span>
                                        <div className="space-y-1">
                                            {formatChanges(log.changes).map((change, i) => (
                                                <div key={i} className="text-sm font-mono bg-muted px-3 py-1.5 rounded">
                                                    {change}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* User */}
                                <div className="flex items-center gap-2 text-sm text-muted-foreground pt-2 border-t">
                                    <User className="h-3.5 w-3.5" />
                                    <span>User ID: {log.userId}</span>
                                </div>
                            </div>
                        </div>
                    </CollapsibleContent>
                )}
            </div>
        </Collapsible>
    );
}

// ============================================================
// MAIN PAGE
// ============================================================

export default function LogsPage() {
    const { businessId, user } = useBusinessContext();
    const { toast } = useToast();

    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [entityFilter, setEntityFilter] = useState<string>('all');

    const fetchLogs = useCallback(async () => {
        setIsLoading(true);
        try {
            const params = new URLSearchParams({ businessId, limit: '100' });
            if (entityFilter !== 'all') params.append('entityType', entityFilter);

            const idToken = await user?.getIdToken();
            const res = await fetch(`/api/business/warehouse/list-logs?${params}`, {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${idToken}`,
                }
            });
            if (!res.ok) throw new Error('Failed to fetch logs');

            const data = await res.json();
            setLogs(data.logs || []);
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to load activity logs.', variant: 'destructive' });
        } finally {
            setIsLoading(false);
        }
    }, [businessId, entityFilter, toast]);

    useEffect(() => {
        fetchLogs();
    }, [entityFilter]);

    // Group logs by date
    const groupedLogs = logs.reduce((groups, log) => {
        const date = log.timestamp ? format(new Date(log.timestamp), 'yyyy-MM-dd') : 'unknown';
        if (!groups[date]) groups[date] = [];
        groups[date].push(log);
        return groups;
    }, {} as Record<string, LogEntry[]>);

    const sortedDates = Object.keys(groupedLogs).sort((a, b) => b.localeCompare(a));

    return (
        <div className="min-h-full p-6 space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Activity Logs</h1>
                    <p className="text-muted-foreground">Complete audit trail of all warehouse changes</p>
                </div>
            </div>

            {/* Filters */}
            <Card>
                <CardHeader className="border-b">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-primary/10">
                                <History className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                                <CardTitle>Recent Activity</CardTitle>
                                <CardDescription>Changes to zones, racks, shelves, and placements</CardDescription>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <Select value={entityFilter} onValueChange={setEntityFilter}>
                                <SelectTrigger className="w-[140px]">
                                    <Filter className="h-4 w-4 mr-2" />
                                    <SelectValue placeholder="All Entities" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Entities</SelectItem>
                                    <SelectItem value="zone">Zones</SelectItem>
                                    <SelectItem value="rack">Racks</SelectItem>
                                    <SelectItem value="shelf">Shelves</SelectItem>
                                </SelectContent>
                            </Select>
                            <Button variant="outline" size="icon" onClick={fetchLogs} disabled={isLoading}>
                                <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
                            </Button>
                        </div>
                    </div>
                </CardHeader>

                <CardContent className="p-4">
                    {isLoading ? (
                        <div className="space-y-4">
                            {[1, 2, 3, 4, 5].map((i) => (
                                <div key={i} className="border rounded-lg p-4">
                                    <div className="flex items-center gap-4">
                                        <Skeleton className="h-10 w-10 rounded-lg" />
                                        <div className="flex-1 space-y-2">
                                            <Skeleton className="h-4 w-48" />
                                            <Skeleton className="h-3 w-32" />
                                        </div>
                                        <Skeleton className="h-4 w-24" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : logs.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 px-4">
                            <div className="p-4 rounded-full bg-muted mb-4">
                                <History className="h-10 w-10 text-muted-foreground" />
                            </div>
                            <h3 className="text-lg font-semibold mb-1">No activity logs</h3>
                            <p className="text-muted-foreground text-center">
                                Changes to warehouse entities will appear here
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {sortedDates.map((date) => (
                                <div key={date}>
                                    <div className="flex items-center gap-3 mb-3">
                                        <div className="h-px flex-1 bg-border" />
                                        <span className="text-sm font-medium text-muted-foreground px-2">
                                            {date === format(new Date(), 'yyyy-MM-dd')
                                                ? 'Today'
                                                : date === format(new Date(Date.now() - 86400000), 'yyyy-MM-dd')
                                                    ? 'Yesterday'
                                                    : format(new Date(date), 'EEEE, MMMM d, yyyy')}
                                        </span>
                                        <div className="h-px flex-1 bg-border" />
                                    </div>
                                    <div className="space-y-3">
                                        {groupedLogs[date].map((log) => (
                                            <LogItem key={`${log.entityType}-${log.entityId}-${log.id}`} log={log} />
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}