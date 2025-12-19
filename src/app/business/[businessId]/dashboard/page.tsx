// /business/[businessId]/dashboard/page.tsx
'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useBusinessContext } from '../layout';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { CalendarIcon, RefreshCw, AlertCircle, ChevronRight, ChevronDown, Plus, Minus, Equal } from 'lucide-react';
import { format, startOfDay, endOfDay, subDays } from 'date-fns';
import { DateRange } from 'react-day-picker';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';

// ============================================================
// TYPES
// ============================================================

interface TableRowData {
    orderCount: number;
    itemCount: number;
    netSaleValue: number;
}

interface StatusBreakdown {
    [status: string]: TableRowData;
}

interface CategoryData extends TableRowData {
    breakdown: StatusBreakdown;
}

interface TableData {
    grossSales: TableRowData;
    cancellations: CategoryData;
    pendingDispatch: CategoryData;
    returns: CategoryData;
    inTransit: CategoryData;
    delivered: CategoryData;
}

interface FirestoreTableData {
    loading: boolean;
    lastUpdated?: { toDate: () => Date };
    startTime?: string;
    endTime?: string;
    stores?: string[];
    data?: TableData;
    error?: string | null;
}

type DateRangePreset = 'today' | 'last7days' | 'last30days' | 'custom';

// ============================================================
// CONSTANTS
// ============================================================

const QUERY_COOLDOWN_MS = 3000; // 3 seconds cooldown between queries

// Status labels for display
const STATUS_LABELS: Record<string, string> = {
    // Pending Dispatch
    "New": "New",
    "Confirmed": "Confirmed",
    "Ready To Dispatch": "Ready To Dispatch",
    // In Transit
    "Dispatched": "Dispatched",
    "In Transit": "In Transit",
    "Out For Delivery": "Out For Delivery",
    "DTO Requested": "DTO Requested",
    "DTO Booked": "DTO Booked",
    "DTO In Transit": "DTO In Transit",
    // Delivered
    "Closed": "Closed",
    "Delivered": "Delivered",
    // Cancellations
    "Cancellation Requested": "Cancellation Requested",
    "Cancelled": "Cancelled",
    // Returns
    "RTO Delivered": "RTO Delivered",
    "RTO Closed": "RTO Closed",
    "RTO In Transit": "RTO In Transit",
    "DTO Delivered": "DTO Delivered",
    "Pending Refund": "Pending Refund",
    "DTO Refunded": "DTO Refunded",
    "Lost": "Lost",
};

// Order of statuses within each category for display
const STATUS_ORDER: Record<string, string[]> = {
    pendingDispatch: ["New", "Confirmed", "Ready To Dispatch"],
    inTransit: ["Dispatched", "In Transit", "Out For Delivery", "DTO Requested", "DTO Booked", "DTO In Transit"],
    delivered: ["Closed", "Delivered"],
    cancellations: ["Cancellation Requested", "Cancelled"],
    returns: ["RTO Delivered", "RTO Closed", "RTO In Transit", "DTO Delivered", "Pending Refund", "DTO Refunded", "Lost"],
};

// ============================================================
// HELPER FUNCTIONS
// ============================================================

// Convert to IST ISO string
function toISTISOString(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');

    return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}+05:30`;
}

function getDateRangeFromPreset(preset: DateRangePreset): { start: Date; end: Date } {
    const now = new Date();

    switch (preset) {
        case 'today':
            return {
                start: startOfDay(now),
                end: endOfDay(now),
            };
        case 'last7days':
            return {
                start: startOfDay(subDays(now, 6)),
                end: endOfDay(now),
            };
        case 'last30days':
            return {
                start: startOfDay(subDays(now, 29)),
                end: endOfDay(now),
            };
        case 'custom':
        default:
            return {
                start: startOfDay(now),
                end: endOfDay(now),
            };
    }
}

function formatCurrency(value: number): string {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(value);
}

function formatNumber(value: number): string {
    return new Intl.NumberFormat('en-IN').format(value);
}

// Calculate Net Sales from data
function calculateNetSales(data: TableData): TableRowData {
    return {
        orderCount: data.grossSales.orderCount - data.cancellations.orderCount - data.returns.orderCount,
        itemCount: data.grossSales.itemCount - data.cancellations.itemCount - data.returns.itemCount,
        netSaleValue: Math.round((data.grossSales.netSaleValue - data.cancellations.netSaleValue - data.returns.netSaleValue) * 100) / 100,
    };
}

// ============================================================
// COMPONENTS
// ============================================================

const TableSkeleton = () => (
    <Table>
        <TableHeader>
            <TableRow>
                <TableHead className="w-[280px]">Particulars</TableHead>
                <TableHead className="text-right">Order Count</TableHead>
                <TableHead className="text-right">Item Count</TableHead>
                <TableHead className="text-right">Net Sale Value</TableHead>
            </TableRow>
        </TableHeader>
        <TableBody>
            {[...Array(7)].map((_, i) => (
                <TableRow key={i}>
                    <TableCell>
                        <Skeleton className="h-5 w-40" />
                    </TableCell>
                    <TableCell className="text-right">
                        <Skeleton className="h-5 w-16 ml-auto" />
                    </TableCell>
                    <TableCell className="text-right">
                        <Skeleton className="h-5 w-16 ml-auto" />
                    </TableCell>
                    <TableCell className="text-right">
                        <Skeleton className="h-5 w-24 ml-auto" />
                    </TableCell>
                </TableRow>
            ))}
        </TableBody>
    </Table>
);

// Expandable Row Component
interface ExpandableRowProps {
    label: string;
    data: TableRowData;
    icon?: React.ReactNode;
    indent?: number;
    isExpandable?: boolean;
    isExpanded?: boolean;
    onToggle?: () => void;
    className?: string;
}

const ExpandableRow = ({
    label,
    data,
    icon,
    indent = 0,
    isExpandable = false,
    isExpanded = false,
    onToggle,
    className = '',
}: ExpandableRowProps) => (
    <TableRow className={cn('transition-colors', className)}>
        <TableCell
            className={cn(
                'font-medium cursor-default',
                isExpandable && 'cursor-pointer hover:text-primary'
            )}
            onClick={isExpandable ? onToggle : undefined}
            style={{ paddingLeft: `${16 + indent * 24}px` }}
        >
            <div className="flex items-center gap-2">
                {icon && <span className="text-muted-foreground w-4 flex-shrink-0">{icon}</span>}
                {isExpandable && (
                    <span className="text-muted-foreground w-4 flex-shrink-0">
                        {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </span>
                )}
                <span>{label}</span>
            </div>
        </TableCell>
        <TableCell className="text-right font-mono">
            {formatNumber(data.orderCount)}
        </TableCell>
        <TableCell className="text-right font-mono">
            {formatNumber(data.itemCount)}
        </TableCell>
        <TableCell className="text-right font-mono">
            {formatCurrency(data.netSaleValue)}
        </TableCell>
    </TableRow>
);

// Status Breakdown Rows
interface StatusBreakdownRowsProps {
    breakdown: StatusBreakdown;
    statusOrder: string[];
    indent: number;
}

const StatusBreakdownRows = ({ breakdown, statusOrder, indent }: StatusBreakdownRowsProps) => (
    <>
        {statusOrder.map((status) => {
            const data = breakdown[status] || { orderCount: 0, itemCount: 0, netSaleValue: 0 };
            return (
                <TableRow key={status} className="text-muted-foreground text-sm bg-muted/30">
                    <TableCell
                        className="font-normal"
                        style={{ paddingLeft: `${16 + indent * 24}px` }}
                    >
                        <div className="flex items-center gap-2">
                            <span className="w-4" /> {/* Spacer for alignment */}
                            <span className="w-4" /> {/* Spacer for alignment */}
                            <span>{STATUS_LABELS[status] || status}</span>
                        </div>
                    </TableCell>
                    <TableCell className="text-right font-mono">
                        {formatNumber(data.orderCount)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                        {formatNumber(data.itemCount)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                        {formatCurrency(data.netSaleValue)}
                    </TableCell>
                </TableRow>
            );
        })}
    </>
);

// Main Data Table Component
const DataTable = ({ data }: { data: TableData }) => {
    // Expansion state
    const [isNetSalesExpanded, setIsNetSalesExpanded] = useState(false);
    const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({
        pendingDispatch: false,
        inTransit: false,
        delivered: false,
    });

    // Calculate Net Sales
    const netSales = calculateNetSales(data);

    const toggleCategory = (category: string) => {
        setExpandedCategories(prev => ({
            ...prev,
            [category]: !prev[category],
        }));
    };

    return (
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead className="w-[280px]">Particulars</TableHead>
                    <TableHead className="text-right">Order Count</TableHead>
                    <TableHead className="text-right">Item Count</TableHead>
                    <TableHead className="text-right">Net Sale Value</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {/* Gross Sales Row */}
                <ExpandableRow
                    label="Gross Sales"
                    data={data.grossSales}
                    icon={<Plus className="h-3 w-3 text-green-600" />}
                    className="font-semibold bg-green-50/50 dark:bg-green-950/20"
                />

                {/* Cancellations Row (subtracted) */}
                <ExpandableRow
                    label="Cancellations"
                    data={data.cancellations}
                    icon={<Minus className="h-3 w-3 text-red-600" />}
                    className="text-red-600 dark:text-red-400"
                />

                {/* Returns Row (subtracted) */}
                <ExpandableRow
                    label="Returns"
                    data={data.returns}
                    icon={<Minus className="h-3 w-3 text-red-600" />}
                    className="text-red-600 dark:text-red-400"
                />

                {/* Net Sales Row (calculated, expandable) */}
                <ExpandableRow
                    label="Net Sales"
                    data={netSales}
                    icon={<Equal className="h-3 w-3 text-blue-600" />}
                    isExpandable={true}
                    isExpanded={isNetSalesExpanded}
                    onToggle={() => setIsNetSalesExpanded(!isNetSalesExpanded)}
                    className="font-semibold bg-blue-50/50 dark:bg-blue-950/20 border-t-2 border-blue-200 dark:border-blue-800"
                />

                {/* Net Sales Breakdown (when expanded) */}
                {isNetSalesExpanded && (
                    <>
                        {/* Pending Dispatch */}
                        <ExpandableRow
                            label="Pending Dispatch"
                            data={data.pendingDispatch}
                            indent={1}
                            isExpandable={true}
                            isExpanded={expandedCategories.pendingDispatch}
                            onToggle={() => toggleCategory('pendingDispatch')}
                            className="bg-muted/20"
                        />
                        {expandedCategories.pendingDispatch && (
                            <StatusBreakdownRows
                                breakdown={data.pendingDispatch.breakdown}
                                statusOrder={STATUS_ORDER.pendingDispatch}
                                indent={2}
                            />
                        )}

                        {/* In-Transit */}
                        <ExpandableRow
                            label="In-Transit"
                            data={data.inTransit}
                            indent={1}
                            isExpandable={true}
                            isExpanded={expandedCategories.inTransit}
                            onToggle={() => toggleCategory('inTransit')}
                            className="bg-muted/20"
                        />
                        {expandedCategories.inTransit && (
                            <StatusBreakdownRows
                                breakdown={data.inTransit.breakdown}
                                statusOrder={STATUS_ORDER.inTransit}
                                indent={2}
                            />
                        )}

                        {/* Delivered */}
                        <ExpandableRow
                            label="Delivered"
                            data={data.delivered}
                            indent={1}
                            isExpandable={true}
                            isExpanded={expandedCategories.delivered}
                            onToggle={() => toggleCategory('delivered')}
                            className="bg-muted/20"
                        />
                        {expandedCategories.delivered && (
                            <StatusBreakdownRows
                                breakdown={data.delivered.breakdown}
                                statusOrder={STATUS_ORDER.delivered}
                                indent={2}
                            />
                        )}
                    </>
                )}
            </TableBody>
        </Table>
    );
};

// ============================================================
// MAIN COMPONENT
// ============================================================

export default function Dashboard() {
    const businessAuth = useBusinessContext();
    const { user } = businessAuth;

    // Date range state
    const [datePreset, setDatePreset] = useState<DateRangePreset>('today');
    const [customDateRange, setCustomDateRange] = useState<DateRange | undefined>();
    const [isCalendarOpen, setIsCalendarOpen] = useState(false);

    // Store selection state
    const [selectedStores, setSelectedStores] = useState<string>('all');

    // Table data state from Firestore
    const [tableDataState, setTableDataState] = useState<FirestoreTableData | null>(null);
    const [isInitialLoad, setIsInitialLoad] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);

    // Rate limiting state
    const [cooldownRemaining, setCooldownRemaining] = useState(0);
    const lastQueryTimeRef = useRef<number>(0);
    const cooldownIntervalRef = useRef<NodeJS.Timeout | null>(null);

    // ============================================================
    // COMPUTED VALUES
    // ============================================================

    const currentDateRange = datePreset === 'custom' && customDateRange?.from
        ? {
            start: startOfDay(customDateRange.from),
            end: endOfDay(customDateRange.to || customDateRange.from),
        }
        : getDateRangeFromPreset(datePreset);

    const storesToFetch = selectedStores === 'all'
        ? businessAuth.stores || []
        : [selectedStores];

    // ============================================================
    // RATE LIMITING
    // ============================================================

    const startCooldown = useCallback(() => {
        const remaining = Math.ceil(QUERY_COOLDOWN_MS / 1000);
        setCooldownRemaining(remaining);

        // Clear any existing interval
        if (cooldownIntervalRef.current) {
            clearInterval(cooldownIntervalRef.current);
        }

        // Start countdown
        cooldownIntervalRef.current = setInterval(() => {
            setCooldownRemaining(prev => {
                if (prev <= 1) {
                    if (cooldownIntervalRef.current) {
                        clearInterval(cooldownIntervalRef.current);
                        cooldownIntervalRef.current = null;
                    }
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
    }, []);

    const canQuery = useCallback(() => {
        const now = Date.now();
        const timeSinceLastQuery = now - lastQueryTimeRef.current;
        return timeSinceLastQuery >= QUERY_COOLDOWN_MS;
    }, []);

    // Cleanup interval on unmount
    useEffect(() => {
        return () => {
            if (cooldownIntervalRef.current) {
                clearInterval(cooldownIntervalRef.current);
            }
        };
    }, []);

    // ============================================================
    // API CALL
    // ============================================================

    const fetchTableData = useCallback(async (force = false) => {
        if (!businessAuth.businessId || storesToFetch.length === 0 || !user) {
            return;
        }

        // Check rate limiting (skip for initial load)
        if (!force && !canQuery()) {
            console.log('Query blocked by rate limiting');
            return;
        }

        // Update last query time and start cooldown
        lastQueryTimeRef.current = Date.now();
        startCooldown();
        setIsRefreshing(true);

        try {
            const token = await user.getIdToken();

            const response = await fetch('/api/business/table-data', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    businessId: businessAuth.businessId,
                    stores: storesToFetch,
                    startTime: toISTISOString(currentDateRange.start),
                    endTime: toISTISOString(currentDateRange.end),
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                console.error('Failed to initiate table data fetch:', errorData);
            }
        } catch (error) {
            console.error('Error calling table data API:', error);
        } finally {
            setIsRefreshing(false);
        }
    }, [businessAuth.businessId, storesToFetch, currentDateRange, user, canQuery, startCooldown]);

    // ============================================================
    // FIRESTORE LISTENER
    // ============================================================

    useEffect(() => {
        if (!businessAuth.businessId || !businessAuth.isAuthorized) {
            return;
        }

        const docRef = doc(db, 'users', businessAuth.businessId);

        const unsubscribe = onSnapshot(
            docRef,
            (snapshot) => {
                if (snapshot.exists()) {
                    const data = snapshot.data();
                    const tableData = data?.tableData as FirestoreTableData | undefined;

                    if (tableData) {
                        setTableDataState(tableData);
                    } else {
                        setTableDataState(null);
                    }
                } else {
                    setTableDataState(null);
                }
                setIsInitialLoad(false);
            },
            (error) => {
                console.error('Error listening to table data:', error);
                setIsInitialLoad(false);
            }
        );

        return () => unsubscribe();
    }, [businessAuth.businessId, businessAuth.isAuthorized]);

    // ============================================================
    // INITIAL DATA FETCH & DATE RANGE CHANGE
    // ============================================================

    useEffect(() => {
        if (businessAuth.isAuthorized && !businessAuth.loading && storesToFetch.length > 0) {
            // For initial load, force the query (bypass rate limiting)
            fetchTableData(true);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [datePreset, customDateRange, selectedStores, businessAuth.isAuthorized, businessAuth.loading]);

    // ============================================================
    // SET PAGE TITLE
    // ============================================================

    useEffect(() => {
        document.title = 'Dashboard';
    }, []);

    // ============================================================
    // 404 PAGE COMPONENT
    // ============================================================

    const NotFoundPage = () => (
        <div className="flex flex-col items-center justify-center h-screen">
            <div className="text-center space-y-4">
                <h1 className="text-6xl font-bold text-gray-300">404</h1>
                <h2 className="text-2xl font-semibold text-gray-700">Page Not Found</h2>
                <p className="text-gray-500 max-w-md">
                    {!businessAuth.isAuthorized && "You don't have access to this business."}
                </p>
            </div>
        </div>
    );

    // ============================================================
    // LOADING & AUTH CHECKS
    // ============================================================

    if (businessAuth.loading) {
        return (
            <div className="flex items-center justify-center h-screen">
                <div className="text-lg">Loading...</div>
            </div>
        );
    }

    if (!businessAuth.isAuthorized) {
        return <NotFoundPage />;
    }

    // ============================================================
    // HANDLERS
    // ============================================================

    const handleDatePresetChange = (value: string) => {
        setDatePreset(value as DateRangePreset);
        if (value !== 'custom') {
            setCustomDateRange(undefined);
        }
    };

    const handleCustomDateSelect = (range: DateRange | undefined) => {
        setCustomDateRange(range);
        if (range?.from) {
            setDatePreset('custom');
        }
    };

    const handleStoreChange = (value: string) => {
        setSelectedStores(value);
    };

    const handleRefresh = () => {
        if (canQuery()) {
            fetchTableData();
        }
    };

    // ============================================================
    // RENDER HELPERS
    // ============================================================

    const getDateRangeLabel = () => {
        if (datePreset === 'custom' && customDateRange?.from) {
            const from = format(customDateRange.from, 'dd MMM yyyy');
            const to = customDateRange.to
                ? format(customDateRange.to, 'dd MMM yyyy')
                : from;
            return `${from} - ${to}`;
        }

        switch (datePreset) {
            case 'today':
                return format(new Date(), 'dd MMM yyyy');
            case 'last7days':
                return `${format(subDays(new Date(), 6), 'dd MMM')} - ${format(new Date(), 'dd MMM yyyy')}`;
            case 'last30days':
                return `${format(subDays(new Date(), 29), 'dd MMM')} - ${format(new Date(), 'dd MMM yyyy')}`;
            default:
                return '';
        }
    };

    const isLoading = tableDataState?.loading || isInitialLoad || isRefreshing;
    const isRefreshDisabled = isLoading || cooldownRemaining > 0;

    // ============================================================
    // RENDER
    // ============================================================

    return (
        <main className="flex flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6">
            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
                    <p className="text-sm text-muted-foreground">
                        Order analytics for your business
                    </p>
                </div>

                {/* Filters */}
                <div className="flex flex-wrap items-center gap-3">
                    {/* Store Selector */}
                    <Select value={selectedStores} onValueChange={handleStoreChange}>
                        <SelectTrigger className="w-[180px]">
                            <SelectValue placeholder="Select store" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Stores</SelectItem>
                            {businessAuth.stores?.map((store) => (
                                <SelectItem key={store} value={store}>
                                    {store}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    {/* Date Range Selector */}
                    <Select value={datePreset} onValueChange={handleDatePresetChange}>
                        <SelectTrigger className="w-[140px]">
                            <SelectValue placeholder="Date range" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="today">Today</SelectItem>
                            <SelectItem value="last7days">Last 7 Days</SelectItem>
                            <SelectItem value="last30days">Last 30 Days</SelectItem>
                            <SelectItem value="custom">Custom</SelectItem>
                        </SelectContent>
                    </Select>

                    {/* Custom Date Picker */}
                    {datePreset === 'custom' && (
                        <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
                            <PopoverTrigger asChild>
                                <Button
                                    variant="outline"
                                    className={cn(
                                        'w-[240px] justify-start text-left font-normal',
                                        !customDateRange && 'text-muted-foreground'
                                    )}
                                >
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {customDateRange?.from ? (
                                        customDateRange.to ? (
                                            <>
                                                {format(customDateRange.from, 'dd MMM yyyy')} -{' '}
                                                {format(customDateRange.to, 'dd MMM yyyy')}
                                            </>
                                        ) : (
                                            format(customDateRange.from, 'dd MMM yyyy')
                                        )
                                    ) : (
                                        'Pick a date range'
                                    )}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="end">
                                <Calendar
                                    initialFocus
                                    mode="range"
                                    defaultMonth={customDateRange?.from}
                                    selected={customDateRange}
                                    onSelect={handleCustomDateSelect}
                                    numberOfMonths={2}
                                />
                            </PopoverContent>
                        </Popover>
                    )}

                    {/* Refresh Button with Cooldown */}
                    <Button
                        variant="outline"
                        size="icon"
                        onClick={handleRefresh}
                        disabled={isRefreshDisabled}
                        className="relative"
                        title={cooldownRemaining > 0 ? `Wait ${cooldownRemaining}s` : 'Refresh'}
                    >
                        <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
                        {cooldownRemaining > 0 && !isLoading && (
                            <span className="absolute -top-2 -right-2 bg-muted text-muted-foreground text-xs rounded-full h-5 w-5 flex items-center justify-center border">
                                {cooldownRemaining}
                            </span>
                        )}
                    </Button>
                </div>
            </div>

            {/* Date Range Display */}
            <div className="text-sm text-muted-foreground">
                Showing data for: <span className="font-medium">{getDateRangeLabel()}</span>
                {selectedStores !== 'all' && (
                    <span className="ml-2">
                        • Store: <span className="font-medium">{selectedStores}</span>
                    </span>
                )}
            </div>

            {/* Table Card */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                        <span>Order Summary</span>
                        {tableDataState?.lastUpdated && !isLoading && (
                            <span className="text-xs font-normal text-muted-foreground">
                                Last updated: {format(tableDataState.lastUpdated.toDate(), 'dd MMM yyyy, HH:mm')}
                            </span>
                        )}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {/* Error State */}
                    {tableDataState?.error && !isLoading && (
                        <div className="flex items-center gap-2 p-4 mb-4 text-sm text-red-600 bg-red-50 rounded-lg">
                            <AlertCircle className="h-4 w-4" />
                            <span>Error: {tableDataState.error}</span>
                            <Button
                                variant="outline"
                                size="sm"
                                className="ml-auto"
                                onClick={handleRefresh}
                                disabled={isRefreshDisabled}
                            >
                                {cooldownRemaining > 0 ? `Retry (${cooldownRemaining}s)` : 'Retry'}
                            </Button>
                        </div>
                    )}

                    {/* Loading State */}
                    {isLoading && <TableSkeleton />}

                    {/* Data Table */}
                    {!isLoading && tableDataState?.data && (
                        <DataTable data={tableDataState.data} />
                    )}

                    {/* No Data State */}
                    {!isLoading && !tableDataState?.data && !tableDataState?.error && (
                        <div className="flex flex-col items-center justify-center py-12 text-center">
                            <p className="text-muted-foreground mb-4">
                                No data available. Click refresh to load data.
                            </p>
                            <Button onClick={handleRefresh} disabled={isRefreshDisabled}>
                                <RefreshCw className="mr-2 h-4 w-4" />
                                {cooldownRemaining > 0 ? `Load Data (${cooldownRemaining}s)` : 'Load Data'}
                            </Button>
                        </div>
                    )}

                    {/* Legend */}
                    {!isLoading && tableDataState?.data && (
                        <div className="mt-6 pt-4 border-t">
                            <p className="text-xs text-muted-foreground">
                                Click on <span className="font-medium">Net Sales</span> to expand and view breakdown by status.
                                Each category can be further expanded to see individual order statuses.
                            </p>
                        </div>
                    )}
                </CardContent>
            </Card>
        </main>
    );
}