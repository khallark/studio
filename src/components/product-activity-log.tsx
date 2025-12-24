// components/product-activity-log.tsx
'use client';

import React, { useEffect, useState } from 'react';
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import {
    History,
    Plus,
    Pencil,
    Trash2,
    ArrowRight,
    User,
    Clock,
    Package,
    RefreshCw,
    ChevronDown,
    ChevronUp,
    FileText,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { User as FirebaseUser } from 'firebase/auth';

// ============================================================
// TYPES
// ============================================================

interface ChangeLogEntry {
    field: string;
    fieldLabel: string;
    oldValue: any;
    newValue: any;
}

interface ProductLog {
    id: string;
    action: 'created' | 'updated' | 'deleted';
    changes: ChangeLogEntry[];
    performedBy: string;
    performedByEmail?: string;
    performedAt: string;
}

interface ProductActivityLogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    businessId: string;
    sku: string;
    productName: string;
    user: FirebaseUser | null | undefined;
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

const formatValue = (value: any, field: string): string => {
    if (value === null || value === undefined) return '—';
    if (field === 'weight') return `${value}g`;
    if (field === 'price') return `₹${value}`;
    if (field === 'stock') return `${value} units`;
    return String(value);
};

const formatDate = (isoString: string): string => {
    const date = new Date(isoString);
    return date.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    });
};

const formatTime = (isoString: string): string => {
    const date = new Date(isoString);
    return date.toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
    });
};

const getRelativeTime = (isoString: string): string => {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return formatDate(isoString);
};

const getActionIcon = (action: string) => {
    switch (action) {
        case 'created':
            return <Plus className="h-4 w-4" />;
        case 'updated':
            return <Pencil className="h-4 w-4" />;
        case 'deleted':
            return <Trash2 className="h-4 w-4" />;
        default:
            return <FileText className="h-4 w-4" />;
    }
};

const getActionColor = (action: string) => {
    switch (action) {
        case 'created':
            return 'bg-emerald-500/10 text-emerald-600 border-emerald-200';
        case 'updated':
            return 'bg-blue-500/10 text-blue-600 border-blue-200';
        case 'deleted':
            return 'bg-red-500/10 text-red-600 border-red-200';
        default:
            return 'bg-gray-500/10 text-gray-600 border-gray-200';
    }
};

const getActionLabel = (action: string) => {
    switch (action) {
        case 'created':
            return 'Created';
        case 'updated':
            return 'Updated';
        case 'deleted':
            return 'Deleted';
        default:
            return action;
    }
};

// ============================================================
// SUB-COMPONENTS
// ============================================================

function LogEntrySkeleton() {
    return (
        <div className="flex gap-4 pb-8">
            <div className="flex flex-col items-center">
                <Skeleton className="h-10 w-10 rounded-full" />
                <Skeleton className="w-0.5 flex-1 mt-2" />
            </div>
            <div className="flex-1 space-y-2 pt-1">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-16 w-full rounded-lg mt-2" />
            </div>
        </div>
    );
}

function ChangeItem({ change }: { change: ChangeLogEntry }) {
    const isNewValue = change.oldValue === null;
    const isRemoved = change.newValue === null;

    return (
        <div className="flex items-start gap-3 py-2 px-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
            <span className="text-xs font-medium text-muted-foreground min-w-[100px] pt-0.5">
                {change.fieldLabel}
            </span>
            <div className="flex items-center gap-2 flex-1 flex-wrap">
                {!isNewValue && (
                    <span className={cn(
                        "text-sm px-2 py-0.5 rounded",
                        isRemoved ? "bg-red-100 text-red-700 line-through" : "bg-muted text-muted-foreground"
                    )}>
                        {formatValue(change.oldValue, change.field)}
                    </span>
                )}
                {!isNewValue && !isRemoved && (
                    <ArrowRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                )}
                {!isRemoved && (
                    <span className={cn(
                        "text-sm px-2 py-0.5 rounded font-medium",
                        isNewValue ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"
                    )}>
                        {formatValue(change.newValue, change.field)}
                    </span>
                )}
            </div>
        </div>
    );
}

function LogEntry({ log, isLast }: { log: ProductLog; isLast: boolean }) {
    const [expanded, setExpanded] = useState(true);
    const hasMultipleChanges = log.changes.length > 3;

    return (
        <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3 }}
            className="flex gap-4"
        >
            {/* Timeline */}
            <div className="flex flex-col items-center">
                <div className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-full border-2 transition-all",
                    getActionColor(log.action)
                )}>
                    {getActionIcon(log.action)}
                </div>
                {!isLast && (
                    <div className="w-0.5 flex-1 bg-gradient-to-b from-border to-transparent mt-2" />
                )}
            </div>

            {/* Content */}
            <div className={cn("flex-1 pb-8", isLast && "pb-0")}>
                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                    <div>
                        <div className="flex items-center gap-2">
                            <Badge variant="secondary" className={cn("font-medium", getActionColor(log.action))}>
                                {getActionLabel(log.action)}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                                {log.changes.length} {log.changes.length === 1 ? 'change' : 'changes'}
                            </span>
                        </div>
                        <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                                <User className="h-3 w-3" />
                                {log.performedByEmail || log.performedBy.slice(0, 8) + '...'}
                            </span>
                            <span className="flex items-center gap-1" title={`${formatDate(log.performedAt)} at ${formatTime(log.performedAt)}`}>
                                <Clock className="h-3 w-3" />
                                {getRelativeTime(log.performedAt)}
                            </span>
                        </div>
                    </div>

                    {hasMultipleChanges && (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2"
                            onClick={() => setExpanded(!expanded)}
                        >
                            {expanded ? (
                                <ChevronUp className="h-3 w-3" />
                            ) : (
                                <ChevronDown className="h-3 w-3" />
                            )}
                        </Button>
                    )}
                </div>

                {/* Changes */}
                <AnimatePresence mode="wait">
                    {expanded && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.2 }}
                            className="mt-3 space-y-1"
                        >
                            {log.changes.map((change, idx) => (
                                <ChangeItem key={`${change.field}-${idx}`} change={change} />
                            ))}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </motion.div>
    );
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export function ProductActivityLog({
    open,
    onOpenChange,
    businessId,
    sku,
    productName,
    user,
}: ProductActivityLogProps) {
    const { toast } = useToast();
    const [logs, setLogs] = useState<ProductLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const fetchLogs = async (showRefreshState = false) => {
        if (!user || !businessId || !sku) return;

        if (showRefreshState) {
            setRefreshing(true);
        } else {
            setLoading(true);
        }

        try {
            const idToken = await user.getIdToken();
            const response = await fetch('/api/business/products/logs', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${idToken}`,
                },
                body: JSON.stringify({ businessId, sku }),
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.message || 'Failed to fetch logs');
            }

            setLogs(result.logs || []);
        } catch (error) {
            console.error('Error fetching logs:', error);
            toast({
                title: 'Error',
                description: 'Failed to load activity history.',
                variant: 'destructive',
            });
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => {
        if (open && businessId && sku) {
            fetchLogs();
        }
    }, [open, businessId, sku]);

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent className="w-full sm:max-w-lg">
                <SheetHeader className="pb-4 border-b">
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 ring-1 ring-primary/20">
                            <History className="h-5 w-5 text-primary" />
                        </div>
                        <div className="flex-1">
                            <SheetTitle className="text-lg">Activity History</SheetTitle>
                            <SheetDescription className="flex items-center gap-1.5 mt-0.5">
                                <Package className="h-3 w-3" />
                                {productName}
                                <span className="text-muted-foreground/50">•</span>
                                <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{sku}</code>
                            </SheetDescription>
                        </div>
                        <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => fetchLogs(true)}
                            disabled={refreshing}
                        >
                            <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
                        </Button>
                    </div>
                </SheetHeader>

                <ScrollArea className="h-[calc(100vh-140px)] pr-4 -mr-4">
                    <div className="py-6">
                        {loading ? (
                            <div className="space-y-2">
                                <LogEntrySkeleton />
                                <LogEntrySkeleton />
                                <LogEntrySkeleton />
                            </div>
                        ) : logs.length === 0 ? (
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="flex flex-col items-center justify-center py-12 text-center"
                            >
                                <div className="p-4 rounded-full bg-muted">
                                    <History className="h-8 w-8 text-muted-foreground" />
                                </div>
                                <h3 className="mt-4 font-medium">No activity yet</h3>
                                <p className="mt-1 text-sm text-muted-foreground max-w-[200px]">
                                    Changes to this product will appear here.
                                </p>
                            </motion.div>
                        ) : (
                            <div className="space-y-0">
                                {logs.map((log, index) => (
                                    <LogEntry
                                        key={log.id}
                                        log={log}
                                        isLast={index === logs.length - 1}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                </ScrollArea>

                {logs.length > 0 && (
                    <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-background via-background to-transparent">
                        <p className="text-xs text-center text-muted-foreground">
                            Showing {logs.length} {logs.length === 1 ? 'entry' : 'entries'}
                        </p>
                    </div>
                )}
            </SheetContent>
        </Sheet>
    );
}