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
import { CalendarIcon, RefreshCw, AlertCircle, ChevronRight, ChevronDown, Plus, Minus, Equal, Download } from 'lucide-react';
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

interface GrossProfitRow {
    type: string;
    qty: number;
    taxable: number;
    igst: number;
    cgst: number;
    sgst: number;
    net: number;
}

interface FirestoreGrossProfitData {
    loading: boolean;
    lastUpdated?: { toDate: () => Date };
    startDate?: string;
    endDate?: string;
    rows?: GrossProfitRow[];
    downloadUrl?: string;
    error?: string | null;
}

interface RemittanceRow {
    date: string;                     // DD-MM-YYYY
    orderDeliveredRangeStart: string; // DD-MM-YYYY
    orderDeliveredRangeEnd: string;   // DD-MM-YYYY
    amount: number;
    orderCount: number;
}

interface RemittanceTableData {
    rows: RemittanceRow[];
    totalAmount: number;
    totalOrderCount: number;
}

interface FirestoreRemittanceData {
    loading: boolean;
    lastUpdated?: { toDate: () => Date };
    startDate?: string;
    endDate?: string;
    data?: RemittanceTableData;
    error?: string | null;
}

type DateRangePreset = 'today' | 'yesterday' | 'last7days' | 'last30days' | 'custom';

// ============================================================
// CONSTANTS
// ============================================================

const QUERY_COOLDOWN_MS = 3000;

const STATUS_LABELS: Record<string, string> = {
    "New": "New",
    "Confirmed": "Confirmed",
    "Ready To Dispatch": "Ready To Dispatch",
    "Dispatched": "Dispatched",
    "In Transit": "In Transit",
    "Out For Delivery": "Out For Delivery",
    "RTO In Transit": "RTO In Transit",
    "DTO Requested": "DTO Requested",
    "DTO Booked": "DTO Booked",
    "DTO In Transit": "DTO In Transit",
    "Closed": "Closed",
    "Delivered": "Delivered",
    "Cancellation Requested": "Cancellation Requested",
    "Cancelled": "Cancelled",
    "RTO Delivered": "RTO Delivered",
    "RTO Closed": "RTO Closed",
    "DTO Delivered": "DTO Delivered",
    "Pending Refund": "Pending Refund",
    "DTO Refunded": "DTO Refunded",
    "Lost": "Lost",
};

const STATUS_ORDER: Record<string, string[]> = {
    pendingDispatch: ["New", "Confirmed", "Ready To Dispatch"],
    inTransit: ["Dispatched", "In Transit", "Out For Delivery", "RTO In Transit", "DTO Requested", "DTO Booked", "DTO In Transit"],
    delivered: ["Closed", "Delivered"],
    cancellations: ["Cancellation Requested", "Cancelled"],
    returns: ["RTO Delivered", "RTO Closed", "DTO Delivered", "Pending Refund", "DTO Refunded", "Lost"],
};

// ============================================================
// HELPER FUNCTIONS
// ============================================================

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
            return { start: startOfDay(now), end: endOfDay(now) };
        case 'yesterday':
            return { start: startOfDay(subDays(now, 1)), end: endOfDay(subDays(now, 1)) };
        case 'last7days':
            return { start: startOfDay(subDays(now, 6)), end: endOfDay(now) };
        case 'last30days':
            return { start: startOfDay(subDays(now, 29)), end: endOfDay(now) };
        case 'custom':
        default:
            return { start: startOfDay(now), end: endOfDay(now) };
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

function calculateNetSales(data: TableData): TableRowData {
    return {
        orderCount: data.grossSales.orderCount - data.cancellations.orderCount - data.returns.orderCount,
        itemCount: data.grossSales.itemCount - data.cancellations.itemCount - data.returns.itemCount,
        netSaleValue: Math.round((data.grossSales.netSaleValue - data.cancellations.netSaleValue - data.returns.netSaleValue) * 100) / 100,
    };
}

// Make a cooldown hook to avoid repeating the pattern three times
function useCooldown() {
    const [remaining, setRemaining] = useState(0);
    const lastQueryTimeRef = useRef<number>(0);
    const intervalRef = useRef<NodeJS.Timeout | null>(null);

    const start = useCallback(() => {
        setRemaining(Math.ceil(QUERY_COOLDOWN_MS / 1000));
        if (intervalRef.current) clearInterval(intervalRef.current);
        intervalRef.current = setInterval(() => {
            setRemaining((prev) => {
                if (prev <= 1) {
                    clearInterval(intervalRef.current!);
                    intervalRef.current = null;
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
    }, []);

    const canQuery = useCallback(() => {
        return Date.now() - lastQueryTimeRef.current >= QUERY_COOLDOWN_MS;
    }, []);

    const markQueried = useCallback(() => {
        lastQueryTimeRef.current = Date.now();
    }, []);

    useEffect(() => () => { if (intervalRef.current) clearInterval(intervalRef.current); }, []);

    return { remaining, start, canQuery, markQueried };
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
                    <TableCell><Skeleton className="h-5 w-40" /></TableCell>
                    <TableCell className="text-right"><Skeleton className="h-5 w-16 ml-auto" /></TableCell>
                    <TableCell className="text-right"><Skeleton className="h-5 w-16 ml-auto" /></TableCell>
                    <TableCell className="text-right"><Skeleton className="h-5 w-24 ml-auto" /></TableCell>
                </TableRow>
            ))}
        </TableBody>
    </Table>
);

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
    label, data, icon, indent = 0,
    isExpandable = false, isExpanded = false, onToggle, className = '',
}: ExpandableRowProps) => (
    <TableRow className={cn('transition-colors', className)}>
        <TableCell
            className={cn('font-medium cursor-default', isExpandable && 'cursor-pointer hover:text-primary')}
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
        <TableCell className="text-right font-mono">{formatNumber(data.orderCount)}</TableCell>
        <TableCell className="text-right font-mono">{formatNumber(data.itemCount)}</TableCell>
        <TableCell className="text-right font-mono">{formatCurrency(data.netSaleValue)}</TableCell>
    </TableRow>
);

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
                    <TableCell className="font-normal" style={{ paddingLeft: `${16 + indent * 24}px` }}>
                        <div className="flex items-center gap-2">
                            <span className="w-4" />
                            <span className="w-4" />
                            <span>{STATUS_LABELS[status] || status}</span>
                        </div>
                    </TableCell>
                    <TableCell className="text-right font-mono">{formatNumber(data.orderCount)}</TableCell>
                    <TableCell className="text-right font-mono">{formatNumber(data.itemCount)}</TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(data.netSaleValue)}</TableCell>
                </TableRow>
            );
        })}
    </>
);

const DataTable = ({ data }: { data: TableData }) => {
    const [isNetSalesExpanded, setIsNetSalesExpanded] = useState(false);
    const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({
        pendingDispatch: false,
        inTransit: false,
        delivered: false,
    });

    const netSales = calculateNetSales(data);
    const toggleCategory = (category: string) =>
        setExpandedCategories((prev) => ({ ...prev, [category]: !prev[category] }));

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
                <ExpandableRow label="Gross Sales" data={data.grossSales} icon={<Plus className="h-3 w-3 text-green-600" />} className="font-semibold bg-green-50/50 dark:bg-green-950/20" />
                <ExpandableRow label="Cancellations" data={data.cancellations} icon={<Minus className="h-3 w-3 text-red-600" />} className="text-red-600 dark:text-red-400" />
                <ExpandableRow label="Returns" data={data.returns} icon={<Minus className="h-3 w-3 text-red-600" />} className="text-red-600 dark:text-red-400" />
                <ExpandableRow
                    label="Net Sales" data={netSales} icon={<Equal className="h-3 w-3 text-blue-600" />}
                    isExpandable isExpanded={isNetSalesExpanded} onToggle={() => setIsNetSalesExpanded(!isNetSalesExpanded)}
                    className="font-semibold bg-blue-50/50 dark:bg-blue-950/20 border-t-2 border-blue-200 dark:border-blue-800"
                />
                {isNetSalesExpanded && (
                    <>
                        <ExpandableRow label="Pending Dispatch" data={data.pendingDispatch} indent={1} isExpandable isExpanded={expandedCategories.pendingDispatch} onToggle={() => toggleCategory('pendingDispatch')} className="bg-muted/20" />
                        {expandedCategories.pendingDispatch && <StatusBreakdownRows breakdown={data.pendingDispatch.breakdown} statusOrder={STATUS_ORDER.pendingDispatch} indent={2} />}

                        <ExpandableRow label="In-Transit" data={data.inTransit} indent={1} isExpandable isExpanded={expandedCategories.inTransit} onToggle={() => toggleCategory('inTransit')} className="bg-muted/20" />
                        {expandedCategories.inTransit && <StatusBreakdownRows breakdown={data.inTransit.breakdown} statusOrder={STATUS_ORDER.inTransit} indent={2} />}

                        <ExpandableRow label="Delivered" data={data.delivered} indent={1} isExpandable isExpanded={expandedCategories.delivered} onToggle={() => toggleCategory('delivered')} className="bg-muted/20" />
                        {expandedCategories.delivered && <StatusBreakdownRows breakdown={data.delivered.breakdown} statusOrder={STATUS_ORDER.delivered} indent={2} />}
                    </>
                )}
            </TableBody>
        </Table>
    );
};

// ============================================================
// REMITTANCE TABLE COMPONENT
// ============================================================

const RemittanceTableSkeleton = () => (
    <Table>
        <TableHeader>
            <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Order Delivered Range</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Orders</TableHead>
            </TableRow>
        </TableHeader>
        <TableBody>
            {[...Array(5)].map((_, i) => (
                <TableRow key={i}>
                    <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-44" /></TableCell>
                    <TableCell className="text-right"><Skeleton className="h-5 w-24 ml-auto" /></TableCell>
                    <TableCell className="text-right"><Skeleton className="h-5 w-12 ml-auto" /></TableCell>
                </TableRow>
            ))}
        </TableBody>
    </Table>
);

const RemittanceDataTable = ({ data }: { data: RemittanceTableData }) => (
    <Table>
        <TableHeader>
            <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Order Delivered Range</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Orders</TableHead>
            </TableRow>
        </TableHeader>
        <TableBody>
            {data.rows.map((row) => (
                <TableRow key={row.date}>
                    <TableCell className="font-medium font-mono">{row.date}</TableCell>
                    <TableCell className="font-mono text-muted-foreground">
                        {row.orderDeliveredRangeStart} to {row.orderDeliveredRangeEnd}
                    </TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(row.amount)}</TableCell>
                    <TableCell className="text-right font-mono">{formatNumber(row.orderCount)}</TableCell>
                </TableRow>
            ))}
            {/* Totals row */}
            <TableRow className="font-semibold bg-muted/40 border-t-2">
                <TableCell>Total</TableCell>
                <TableCell />
                <TableCell className="text-right font-mono">{formatCurrency(data.totalAmount)}</TableCell>
                <TableCell className="text-right font-mono">{formatNumber(data.totalOrderCount)}</TableCell>
            </TableRow>
        </TableBody>
    </Table>
);

// ============================================================
// GROSS PROFIT CONSTANTS
// ============================================================

const HIGHLIGHT_ROWS = new Set(['Gross Profit']);
const NEGATIVE_ROWS = new Set(['Sale Return', 'Purchase', 'Opening Stock']);

// ============================================================
// MAIN COMPONENT
// ============================================================

export default function Dashboard() {
    const businessAuth = useBusinessContext();
    const { user } = businessAuth;

    // ── Order Summary state ──────────────────────────────────────────────
    const [datePreset, setDatePreset] = useState<DateRangePreset>('today');
    const [customDateRange, setCustomDateRange] = useState<DateRange | undefined>();
    const [isCalendarOpen, setIsCalendarOpen] = useState(false);
    const [selectedStores, setSelectedStores] = useState<string>('all');
    const [tableDataState, setTableDataState] = useState<FirestoreTableData | null>(null);
    const [isInitialLoad, setIsInitialLoad] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const orderCooldown = useCooldown();

    // ── Gross Profit state ───────────────────────────────────────────────
    const [grossProfitData, setGrossProfitData] = useState<FirestoreGrossProfitData | null>(null);
    const [gpDatePreset, setGpDatePreset] = useState<DateRangePreset>('today');
    const [gpCustomDateRange, setGpCustomDateRange] = useState<DateRange | undefined>();
    const [gpIsCalendarOpen, setGpIsCalendarOpen] = useState(false);
    const [isGpSubmitting, setIsGpSubmitting] = useState(false);
    const [gpSubmitError, setGpSubmitError] = useState<string | null>(null);
    const gpCooldown = useCooldown();

    // ── Blue Dart Remittance state ───────────────────────────────────────
    const [remittanceData, setRemittanceData] = useState<FirestoreRemittanceData | null>(null);
    const [remittanceDateRange, setRemittanceDateRange] = useState<DateRange | undefined>();
    const [remittanceCalendarOpen, setRemittanceCalendarOpen] = useState(false);
    const [isRemittanceSubmitting, setIsRemittanceSubmitting] = useState(false);
    const [remittanceSubmitError, setRemittanceSubmitError] = useState<string | null>(null);
    const remittanceCooldown = useCooldown();

    // ============================================================
    // COMPUTED VALUES
    // ============================================================

    const currentDateRange = datePreset === 'custom' && customDateRange?.from
        ? { start: startOfDay(customDateRange.from), end: endOfDay(customDateRange.to || customDateRange.from) }
        : getDateRangeFromPreset(datePreset);

    const gpCurrentDateRange = gpDatePreset === 'custom' && gpCustomDateRange?.from
        ? { start: startOfDay(gpCustomDateRange.from), end: endOfDay(gpCustomDateRange.to || gpCustomDateRange.from) }
        : getDateRangeFromPreset(gpDatePreset);

    const gpStartDate = format(gpCurrentDateRange.start, 'yyyy-MM-dd');
    const gpEndDate = format(gpCurrentDateRange.end, 'yyyy-MM-dd');

    const storesToFetch = selectedStores === 'all' ? businessAuth.stores || [] : [selectedStores];
    const isLoading = tableDataState?.loading || isInitialLoad || isRefreshing;

    // Remittance date strings (only valid when both ends of the range are chosen)
    const remittanceStartDate = remittanceDateRange?.from ? format(remittanceDateRange.from, 'yyyy-MM-dd') : null;
    const remittanceEndDate = remittanceDateRange?.to
        ? format(remittanceDateRange.to, 'yyyy-MM-dd')
        : remittanceStartDate;

    // ============================================================
    // API CALLS
    // ============================================================

    const fetchTableData = useCallback(async (force = false) => {
        if (!businessAuth.businessId || storesToFetch.length === 0 || !user) return;
        if (!force && !orderCooldown.canQuery()) return;

        orderCooldown.markQueried();
        orderCooldown.start();
        setIsRefreshing(true);
        try {
            const token = await user.getIdToken();
            const response = await fetch('/api/business/table-data', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({
                    businessId: businessAuth.businessId,
                    stores: storesToFetch,
                    startTime: toISTISOString(currentDateRange.start),
                    endTime: toISTISOString(currentDateRange.end),
                }),
            });
            if (!response.ok) console.error('Failed to initiate table data fetch:', await response.json());
        } catch (error) {
            console.error('Error calling table data API:', error);
        } finally {
            setIsRefreshing(false);
        }
    }, [businessAuth.businessId, storesToFetch, currentDateRange, user, orderCooldown]);

    const handleGenerateGrossProfit = useCallback(async (force = false) => {
        if (!user || !businessAuth.businessId) return;
        if (!force && !gpCooldown.canQuery()) return;

        gpCooldown.markQueried();
        gpCooldown.start();
        setGpSubmitError(null);
        setIsGpSubmitting(true);
        try {
            const token = await user.getIdToken();
            const response = await fetch('/api/business/generate-gross-profit-report', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ businessId: businessAuth.businessId, startDate: gpStartDate, endDate: gpEndDate }),
            });
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error ?? `Request failed with status ${response.status}`);
            }
        } catch (err: unknown) {
            setGpSubmitError(err instanceof Error ? err.message : 'Something went wrong.');
        } finally {
            setIsGpSubmitting(false);
        }
    }, [user, businessAuth.businessId, gpStartDate, gpEndDate, gpCooldown]);

    const handleGenerateRemittance = useCallback(async (force = false) => {
        if (!user || !businessAuth.businessId || !remittanceStartDate || !remittanceEndDate) return;
        if (!force && !remittanceCooldown.canQuery()) return;

        remittanceCooldown.markQueried();
        remittanceCooldown.start();
        setRemittanceSubmitError(null);
        setIsRemittanceSubmitting(true);
        try {
            const token = await user.getIdToken();
            const response = await fetch('/api/business/generate-blue-dart-remittance-table', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({
                    businessId: businessAuth.businessId,
                    startDate: remittanceStartDate,
                    endDate: remittanceEndDate,
                }),
            });
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error ?? `Request failed with status ${response.status}`);
            }
        } catch (err: unknown) {
            setRemittanceSubmitError(err instanceof Error ? err.message : 'Something went wrong.');
        } finally {
            setIsRemittanceSubmitting(false);
        }
    }, [user, businessAuth.businessId, remittanceStartDate, remittanceEndDate, remittanceCooldown]);

    // ============================================================
    // FIRESTORE LISTENER
    // ============================================================

    useEffect(() => {
        if (!businessAuth.businessId || !businessAuth.isAuthorized) return;

        const docRef = doc(db, 'users', businessAuth.businessId);
        const unsubscribe = onSnapshot(
            docRef,
            (snapshot) => {
                if (snapshot.exists()) {
                    const data = snapshot.data();
                    setTableDataState((data?.tableData as FirestoreTableData) ?? null);
                    setGrossProfitData((data?.grossProfitData as FirestoreGrossProfitData) ?? null);
                    setRemittanceData((data?.blueDartRemittanceTable as FirestoreRemittanceData) ?? null);
                } else {
                    setTableDataState(null);
                    setGrossProfitData(null);
                    setRemittanceData(null);
                }
                setIsInitialLoad(false);
            },
            (error) => {
                console.error('Error listening to dashboard data:', error);
                setIsInitialLoad(false);
            }
        );

        return () => unsubscribe();
    }, [businessAuth.businessId, businessAuth.isAuthorized]);

    // ============================================================
    // TRIGGER EFFECTS
    // ============================================================

    useEffect(() => {
        if (datePreset === 'custom' && (!customDateRange?.from || !customDateRange?.to)) return;
        if (businessAuth.isAuthorized && !businessAuth.loading && storesToFetch.length > 0) {
            fetchTableData(true);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [datePreset, customDateRange, selectedStores, businessAuth.isAuthorized, businessAuth.loading]);

    useEffect(() => {
        if (gpDatePreset === 'custom' && (!gpCustomDateRange?.from || !gpCustomDateRange?.to)) return;
        if (businessAuth.isAuthorized && !businessAuth.loading) {
            handleGenerateGrossProfit(true);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [gpDatePreset, gpCustomDateRange, businessAuth.isAuthorized, businessAuth.loading]);

    // Remittance: trigger only when a complete range is chosen
    useEffect(() => {
        if (!remittanceDateRange?.from || !remittanceDateRange?.to) return;
        if (businessAuth.isAuthorized && !businessAuth.loading) {
            handleGenerateRemittance(true);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [remittanceDateRange, businessAuth.isAuthorized, businessAuth.loading]);

    // ============================================================
    // PAGE TITLE
    // ============================================================

    useEffect(() => { document.title = 'Dashboard'; }, []);

    // ============================================================
    // AUTH / LOADING CHECKS
    // ============================================================

    if (businessAuth.loading) {
        return <div className="flex items-center justify-center h-screen"><div className="text-lg">Loading...</div></div>;
    }

    if (!businessAuth.isAuthorized) {
        return (
            <div className="flex flex-col items-center justify-center h-screen">
                <div className="text-center space-y-4">
                    <h1 className="text-6xl font-bold text-gray-300">404</h1>
                    <h2 className="text-2xl font-semibold text-gray-700">Page Not Found</h2>
                    <p className="text-gray-500 max-w-md">You don&apos;t have access to this business.</p>
                </div>
            </div>
        );
    }

    // ============================================================
    // HANDLERS
    // ============================================================

    const handleDatePresetChange = (value: string) => {
        setDatePreset(value as DateRangePreset);
        if (value !== 'custom') setCustomDateRange(undefined);
    };

    const handleCustomDateSelect = (range: DateRange | undefined) => {
        setCustomDateRange(range);
        if (range?.from) setDatePreset('custom');
    };

    const isRefreshDisabled = isLoading || orderCooldown.remaining > 0;

    const getDateRangeLabel = () => {
        if (datePreset === 'custom' && customDateRange?.from) {
            const from = format(customDateRange.from, 'dd MMM yyyy');
            const to = customDateRange.to ? format(customDateRange.to, 'dd MMM yyyy') : from;
            return `${from} - ${to}`;
        }
        switch (datePreset) {
            case 'today': return format(new Date(), 'dd MMM yyyy');
            case 'last7days': return `${format(subDays(new Date(), 6), 'dd MMM')} - ${format(new Date(), 'dd MMM yyyy')}`;
            case 'last30days': return `${format(subDays(new Date(), 29), 'dd MMM')} - ${format(new Date(), 'dd MMM yyyy')}`;
            default: return '';
        }
    };

    const isRemittanceLoading = isRemittanceSubmitting || !!remittanceData?.loading;
    const isRemittanceRefreshDisabled = isRemittanceLoading || remittanceCooldown.remaining > 0 || !remittanceStartDate;

    // ============================================================
    // RENDER
    // ============================================================

    return (
        <main className="flex flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6">
            {/* ── Header ── */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
                    <p className="text-sm text-muted-foreground">Order analytics for your business</p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    <Select value={selectedStores} onValueChange={setSelectedStores} disabled={isLoading}>
                        <SelectTrigger className="w-[180px]"><SelectValue placeholder="Select store" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Stores</SelectItem>
                            {businessAuth.stores?.map((store) => (
                                <SelectItem key={store} value={store}>{store}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    <Select value={datePreset} onValueChange={handleDatePresetChange} disabled={isLoading}>
                        <SelectTrigger className="w-[140px]"><SelectValue placeholder="Date range" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="today">Today</SelectItem>
                            <SelectItem value="yesterday">Yesterday</SelectItem>
                            <SelectItem value="last7days">Last 7 Days</SelectItem>
                            <SelectItem value="last30days">Last 30 Days</SelectItem>
                            <SelectItem value="custom">Custom</SelectItem>
                        </SelectContent>
                    </Select>

                    {datePreset === 'custom' && (
                        <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
                            <PopoverTrigger asChild>
                                <Button variant="outline" disabled={isLoading} className={cn('w-[240px] justify-start text-left font-normal', !customDateRange && 'text-muted-foreground')}>
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {customDateRange?.from
                                        ? customDateRange.to
                                            ? <>{format(customDateRange.from, 'dd MMM yyyy')} - {format(customDateRange.to, 'dd MMM yyyy')}</>
                                            : format(customDateRange.from, 'dd MMM yyyy')
                                        : 'Pick a date range'}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="end">
                                <Calendar initialFocus mode="range" defaultMonth={customDateRange?.from} selected={customDateRange} onSelect={handleCustomDateSelect} numberOfMonths={2} />
                            </PopoverContent>
                        </Popover>
                    )}

                    <Button variant="outline" size="icon" onClick={() => { if (orderCooldown.canQuery()) fetchTableData(); }} disabled={isRefreshDisabled} className="relative" title={orderCooldown.remaining > 0 ? `Wait ${orderCooldown.remaining}s` : 'Refresh'}>
                        <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
                        {orderCooldown.remaining > 0 && !isLoading && (
                            <span className="absolute -top-2 -right-2 bg-muted text-muted-foreground text-xs rounded-full h-5 w-5 flex items-center justify-center border">{orderCooldown.remaining}</span>
                        )}
                    </Button>
                </div>
            </div>

            <div className="text-sm text-muted-foreground">
                Showing data for: <span className="font-medium">{getDateRangeLabel()}</span>
                {selectedStores !== 'all' && <span className="ml-2">• Store: <span className="font-medium">{selectedStores}</span></span>}
            </div>

            {/* ── Order Summary Card ── */}
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
                    {tableDataState?.error && !isLoading && (
                        <div className="flex items-center gap-2 p-4 mb-4 text-sm text-red-600 bg-red-50 rounded-lg">
                            <AlertCircle className="h-4 w-4" />
                            <span>Error: {tableDataState.error}</span>
                            <Button variant="outline" size="sm" className="ml-auto" onClick={() => { if (orderCooldown.canQuery()) fetchTableData(); }} disabled={isRefreshDisabled}>
                                {orderCooldown.remaining > 0 ? `Retry (${orderCooldown.remaining}s)` : 'Retry'}
                            </Button>
                        </div>
                    )}
                    {isLoading && <TableSkeleton />}
                    {!isLoading && tableDataState?.data && <DataTable data={tableDataState.data} />}
                    {!isLoading && !tableDataState?.data && !tableDataState?.error && (
                        <div className="flex flex-col items-center justify-center py-12 text-center">
                            <p className="text-muted-foreground mb-4">No data available. Click refresh to load data.</p>
                            <Button onClick={() => fetchTableData()} disabled={isRefreshDisabled}>
                                <RefreshCw className="mr-2 h-4 w-4" />
                                {orderCooldown.remaining > 0 ? `Load Data (${orderCooldown.remaining}s)` : 'Load Data'}
                            </Button>
                        </div>
                    )}
                    {!isLoading && tableDataState?.data && (
                        <div className="mt-6 pt-4 border-t">
                            <p className="text-xs text-muted-foreground">
                                Click on <span className="font-medium">Net Sales</span> to expand and view breakdown by status.
                            </p>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* ── Gross Profit Card ── */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                        <span>Gross Profit Report</span>
                        {grossProfitData?.lastUpdated && !grossProfitData.loading && (
                            <span className="text-xs font-normal text-muted-foreground">
                                Last updated: {format(grossProfitData.lastUpdated.toDate(), 'dd MMM yyyy, HH:mm')}
                            </span>
                        )}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-wrap items-center gap-3 mb-6">
                        <Select value={gpDatePreset} onValueChange={(value) => { setGpDatePreset(value as DateRangePreset); if (value !== 'custom') setGpCustomDateRange(undefined); }} disabled={isGpSubmitting || grossProfitData?.loading}>
                            <SelectTrigger className="w-[140px]"><SelectValue placeholder="Date range" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="today">Today</SelectItem>
                                <SelectItem value="yesterday">Yesterday</SelectItem>
                                <SelectItem value="last7days">Last 7 Days</SelectItem>
                                <SelectItem value="last30days">Last 30 Days</SelectItem>
                                <SelectItem value="custom">Custom</SelectItem>
                            </SelectContent>
                        </Select>

                        {gpDatePreset === 'custom' && (
                            <Popover open={gpIsCalendarOpen} onOpenChange={setGpIsCalendarOpen}>
                                <PopoverTrigger asChild>
                                    <Button variant="outline" disabled={isGpSubmitting || grossProfitData?.loading} className={cn('w-[240px] justify-start text-left font-normal', !gpCustomDateRange && 'text-muted-foreground')}>
                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                        {gpCustomDateRange?.from
                                            ? gpCustomDateRange.to
                                                ? <>{format(gpCustomDateRange.from, 'dd MMM yyyy')} – {format(gpCustomDateRange.to, 'dd MMM yyyy')}</>
                                                : format(gpCustomDateRange.from, 'dd MMM yyyy')
                                            : 'Pick a date range'}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                    <Calendar initialFocus mode="range" defaultMonth={gpCustomDateRange?.from} selected={gpCustomDateRange} onSelect={(range) => { setGpCustomDateRange(range); if (range?.from) setGpDatePreset('custom'); }} numberOfMonths={2} />
                                </PopoverContent>
                            </Popover>
                        )}

                        <Button variant="outline" size="icon" onClick={() => handleGenerateGrossProfit()} disabled={isGpSubmitting || !!grossProfitData?.loading || gpCooldown.remaining > 0} className="relative" title={gpCooldown.remaining > 0 ? `Wait ${gpCooldown.remaining}s` : 'Refresh'}>
                            <RefreshCw className={cn('h-4 w-4', (isGpSubmitting || grossProfitData?.loading) && 'animate-spin')} />
                            {gpCooldown.remaining > 0 && !isGpSubmitting && !grossProfitData?.loading && (
                                <span className="absolute -top-2 -right-2 bg-muted text-muted-foreground text-xs rounded-full h-5 w-5 flex items-center justify-center border">{gpCooldown.remaining}</span>
                            )}
                        </Button>

                        {grossProfitData?.rows && !grossProfitData.loading && grossProfitData.downloadUrl && (
                            <Button variant="outline" onClick={() => {
                                const a = document.createElement('a');
                                a.href = grossProfitData.downloadUrl!;
                                a.download = `gross-profit-report_${grossProfitData.startDate}_${grossProfitData.endDate}.xlsx`;
                                document.body.appendChild(a);
                                a.click();
                                a.remove();
                            }}>
                                <Download className="mr-2 h-4 w-4" />Download Excel
                            </Button>
                        )}
                    </div>

                    {gpSubmitError && (
                        <div className="flex items-start gap-2 p-3 mb-4 text-sm text-red-600 bg-red-50 rounded-lg dark:bg-red-950/30 dark:text-red-400">
                            <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" /><span>{gpSubmitError}</span>
                        </div>
                    )}
                    {grossProfitData?.error && !grossProfitData.loading && (
                        <div className="flex items-start gap-2 p-3 mb-4 text-sm text-red-600 bg-red-50 rounded-lg dark:bg-red-950/30 dark:text-red-400">
                            <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" /><span>{grossProfitData.error}</span>
                        </div>
                    )}
                    {grossProfitData?.loading && (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[160px]">Type</TableHead>
                                    <TableHead className="text-right">Qty</TableHead>
                                    <TableHead className="text-right">Taxable Amt</TableHead>
                                    <TableHead className="text-right">IGST</TableHead>
                                    <TableHead className="text-right">CGST</TableHead>
                                    <TableHead className="text-right">SGST</TableHead>
                                    <TableHead className="text-right">Net Amount</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {[...Array(6)].map((_, i) => (
                                    <TableRow key={i}>
                                        <TableCell><Skeleton className="h-5 w-28" /></TableCell>
                                        <TableCell className="text-right"><Skeleton className="h-5 w-12 ml-auto" /></TableCell>
                                        <TableCell className="text-right"><Skeleton className="h-5 w-24 ml-auto" /></TableCell>
                                        <TableCell className="text-right"><Skeleton className="h-5 w-20 ml-auto" /></TableCell>
                                        <TableCell className="text-right"><Skeleton className="h-5 w-20 ml-auto" /></TableCell>
                                        <TableCell className="text-right"><Skeleton className="h-5 w-20 ml-auto" /></TableCell>
                                        <TableCell className="text-right"><Skeleton className="h-5 w-24 ml-auto" /></TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                    {grossProfitData?.rows && !grossProfitData.loading && (
                        <>
                            <div className="text-sm text-muted-foreground mb-3">
                                Showing data for: <span className="font-medium">{format(new Date(grossProfitData.startDate!), 'dd MMM yyyy')} – {format(new Date(grossProfitData.endDate!), 'dd MMM yyyy')}</span>
                            </div>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-[160px]">Type</TableHead>
                                        <TableHead className="text-right">Qty</TableHead>
                                        <TableHead className="text-right">Taxable Amt</TableHead>
                                        <TableHead className="text-right">IGST</TableHead>
                                        <TableHead className="text-right">CGST</TableHead>
                                        <TableHead className="text-right">SGST</TableHead>
                                        <TableHead className="text-right">Net Amount</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {grossProfitData.rows.map((row) => (
                                        <TableRow key={row.type} className={cn(HIGHLIGHT_ROWS.has(row.type) && 'bg-green-50/60 dark:bg-green-950/20 font-semibold border-t-2 border-green-200 dark:border-green-800', NEGATIVE_ROWS.has(row.type) && 'text-red-600 dark:text-red-400')}>
                                            <TableCell className="font-medium">{row.type}</TableCell>
                                            <TableCell className="text-right font-mono">{formatNumber(row.qty)}</TableCell>
                                            <TableCell className="text-right font-mono">{formatCurrency(row.taxable)}</TableCell>
                                            <TableCell className="text-right font-mono">{formatCurrency(row.igst)}</TableCell>
                                            <TableCell className="text-right font-mono">{formatCurrency(row.cgst)}</TableCell>
                                            <TableCell className="text-right font-mono">{formatCurrency(row.sgst)}</TableCell>
                                            <TableCell className="text-right font-mono">{formatCurrency(row.net)}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </>
                    )}
                    {!grossProfitData?.rows && !grossProfitData?.loading && !grossProfitData?.error && (
                        <div className="flex items-center justify-center py-12 text-center">
                            <p className="text-muted-foreground">Select a date range to view the report.</p>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* ── Blue Dart Remittance Card ── */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                        <span>Blue Dart Remittance</span>
                        {remittanceData?.lastUpdated && !remittanceData.loading && (
                            <span className="text-xs font-normal text-muted-foreground">
                                Last updated: {format(remittanceData.lastUpdated.toDate(), 'dd MMM yyyy, HH:mm')}
                            </span>
                        )}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {/* Controls */}
                    <div className="flex flex-wrap items-center gap-3 mb-6">
                        {/* Date range picker — always custom; user picks the full range */}
                        <Popover open={remittanceCalendarOpen} onOpenChange={setRemittanceCalendarOpen}>
                            <PopoverTrigger asChild>
                                <Button variant="outline" disabled={isRemittanceLoading} className={cn('w-[260px] justify-start text-left font-normal', !remittanceDateRange && 'text-muted-foreground')}>
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {remittanceDateRange?.from
                                        ? remittanceDateRange.to
                                            ? <>{format(remittanceDateRange.from, 'dd MMM yyyy')} – {format(remittanceDateRange.to, 'dd MMM yyyy')}</>
                                            : format(remittanceDateRange.from, 'dd MMM yyyy')
                                        : 'Pick remittance date range'}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                                <Calendar
                                    initialFocus
                                    mode="range"
                                    defaultMonth={remittanceDateRange?.from}
                                    selected={remittanceDateRange}
                                    onSelect={(range) => {
                                        setRemittanceDateRange(range);
                                        // Close only when both ends are set
                                        if (range?.from && range?.to) setRemittanceCalendarOpen(false);
                                    }}
                                    numberOfMonths={2}
                                />
                            </PopoverContent>
                        </Popover>

                        {/* Manual refresh */}
                        <Button
                            variant="outline"
                            size="icon"
                            onClick={() => handleGenerateRemittance()}
                            disabled={isRemittanceRefreshDisabled}
                            className="relative"
                            title={
                                !remittanceStartDate
                                    ? 'Select a date range first'
                                    : remittanceCooldown.remaining > 0
                                        ? `Wait ${remittanceCooldown.remaining}s`
                                        : 'Refresh'
                            }
                        >
                            <RefreshCw className={cn('h-4 w-4', isRemittanceLoading && 'animate-spin')} />
                            {remittanceCooldown.remaining > 0 && !isRemittanceLoading && (
                                <span className="absolute -top-2 -right-2 bg-muted text-muted-foreground text-xs rounded-full h-5 w-5 flex items-center justify-center border">
                                    {remittanceCooldown.remaining}
                                </span>
                            )}
                        </Button>
                    </div>

                    {/* Submit error */}
                    {remittanceSubmitError && (
                        <div className="flex items-start gap-2 p-3 mb-4 text-sm text-red-600 bg-red-50 rounded-lg dark:bg-red-950/30 dark:text-red-400">
                            <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" /><span>{remittanceSubmitError}</span>
                        </div>
                    )}

                    {/* Firestore error */}
                    {remittanceData?.error && !remittanceData.loading && (
                        <div className="flex items-start gap-2 p-3 mb-4 text-sm text-red-600 bg-red-50 rounded-lg dark:bg-red-950/30 dark:text-red-400">
                            <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" /><span>{remittanceData.error}</span>
                        </div>
                    )}

                    {/* Loading skeleton */}
                    {remittanceData?.loading && <RemittanceTableSkeleton />}

                    {/* Results table */}
                    {remittanceData?.data && !remittanceData.loading && (
                        <>
                            <div className="text-sm text-muted-foreground mb-3">
                                Showing remittance dates:{' '}
                                <span className="font-medium">
                                    {format(new Date(remittanceData.startDate!), 'dd MMM yyyy')} – {format(new Date(remittanceData.endDate!), 'dd MMM yyyy')}
                                </span>
                            </div>
                            <RemittanceDataTable data={remittanceData.data} />
                        </>
                    )}

                    {/* Empty state */}
                    {!remittanceData?.data && !remittanceData?.loading && !remittanceData?.error && (
                        <div className="flex items-center justify-center py-12 text-center">
                            <p className="text-muted-foreground">
                                Pick a date range above to generate the Blue Dart remittance table.
                            </p>
                        </div>
                    )}
                </CardContent>
            </Card>
        </main>
    );
}