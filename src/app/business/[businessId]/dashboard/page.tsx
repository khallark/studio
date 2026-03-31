'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useBusinessContext } from '../layout';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { CalendarIcon, RefreshCw, AlertCircle, ChevronRight, ChevronDown, Plus, Minus, Equal, Download, Loader2, MoveRight } from 'lucide-react';
import { format, startOfDay, endOfDay, subDays } from 'date-fns';
import { DateRange } from 'react-day-picker';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from '@/hooks/use-toast';
import Link from 'next/link';

// ============================================================
// TYPES
// ============================================================

interface TableRowData { orderCount: number; itemCount: number; netSaleValue: number; }
interface StatusBreakdown { [status: string]: TableRowData; }
interface CategoryData extends TableRowData { breakdown: StatusBreakdown; }
interface TableData {
    grossSales: TableRowData; cancellations: CategoryData; pendingDispatch: CategoryData;
    returns: CategoryData; inTransit: CategoryData; delivered: CategoryData;
}
interface FirestoreTableData {
    loading: boolean; lastUpdated?: { toDate: () => Date };
    startTime?: string; endTime?: string; stores?: string[];
    data?: TableData; error?: string | null;
}
interface GrossProfitRow { type: string; qty: number; taxable: number; igst: number; cgst: number; sgst: number; net: number; }
interface FirestoreGrossProfitData {
    loading: boolean; lastUpdated?: { toDate: () => Date };
    startDate?: string; endDate?: string; rows?: GrossProfitRow[];
    downloadUrl?: string; error?: string | null;
}
interface RemittanceRow {
    date: string; orderDeliveredRangeStart: string; orderDeliveredRangeEnd: string;
    amount: number; orderCount: number; awbs: string[];
}
interface RemittanceTableData { rows: RemittanceRow[]; totalAmount: number; totalOrderCount: number; }
interface FirestoreRemittanceData {
    loading: boolean; lastUpdated?: { toDate: () => Date };
    startDate?: string; endDate?: string; data?: RemittanceTableData; error?: string | null;
}
interface FirestoreRemittanceRoot {
    blueDart?: FirestoreRemittanceData;
    delhivery?: FirestoreRemittanceData;
}

type DateRangePreset = 'today' | 'yesterday' | 'last7days' | 'last30days' | 'custom';
type RemittanceCourier = 'Blue Dart' | 'Delhivery';

// ============================================================
// CONSTANTS
// ============================================================

const QUERY_COOLDOWN_MS = 3000;
const SNAPSHOT_FUNCTION_URL = 'https://asia-south1-orderflow-jnig7.cloudfunctions.net/inventorySnapshotOfADate';

const STATUS_LABELS: Record<string, string> = {
    "New": "New", "Confirmed": "Confirmed", "Ready To Dispatch": "Ready To Dispatch",
    "Dispatched": "Dispatched", "In Transit": "In Transit", "Out For Delivery": "Out For Delivery",
    "RTO In Transit": "RTO In Transit", "DTO Requested": "DTO Requested", "DTO Booked": "DTO Booked",
    "DTO In Transit": "DTO In Transit", "Closed": "Closed", "Delivered": "Delivered",
    "Cancellation Requested": "Cancellation Requested", "Cancelled": "Cancelled",
    "RTO Delivered": "RTO Delivered", "RTO Closed": "RTO Closed", "DTO Delivered": "DTO Delivered",
    "Pending Refund": "Pending Refund", "DTO Refunded": "DTO Refunded", "Lost": "Lost",
};
const STATUS_ORDER: Record<string, string[]> = {
    pendingDispatch: ["New", "Confirmed", "Ready To Dispatch"],
    inTransit: ["Dispatched", "In Transit", "Out For Delivery", "RTO In Transit", "DTO Requested", "DTO Booked", "DTO In Transit"],
    delivered: ["Closed", "Delivered"],
    cancellations: ["Cancellation Requested", "Cancelled"],
    returns: ["RTO Delivered", "RTO Closed", "DTO Delivered", "Pending Refund", "DTO Refunded", "Lost"],
};
const COURIER_FS_KEY: Record<RemittanceCourier, 'blueDart' | 'delhivery'> = {
    'Blue Dart': 'blueDart',
    'Delhivery': 'delhivery',
};

// ============================================================
// GROSS PROFIT ROW CLASSIFICATION
// ============================================================
const HIGHLIGHT_ROWS = new Set(['Gross Profit']);
const NEGATIVE_ROWS = new Set(['Sale Return', 'Purchase', 'Opening Stock']);
const isLostRow = (type: string) => type.startsWith('Lost (');

// ============================================================
// HELPERS
// ============================================================

function toISTISOString(date: Date): string {
    const y = date.getFullYear(), mo = String(date.getMonth() + 1).padStart(2, '0'),
        d = String(date.getDate()).padStart(2, '0'), h = String(date.getHours()).padStart(2, '0'),
        mi = String(date.getMinutes()).padStart(2, '0'), s = String(date.getSeconds()).padStart(2, '0');
    return `${y}-${mo}-${d}T${h}:${mi}:${s}+05:30`;
}
function getDateRangeFromPreset(preset: DateRangePreset) {
    const now = new Date();
    switch (preset) {
        case 'today': return { start: startOfDay(now), end: endOfDay(now) };
        case 'yesterday': return { start: startOfDay(subDays(now, 1)), end: endOfDay(subDays(now, 1)) };
        case 'last7days': return { start: startOfDay(subDays(now, 6)), end: endOfDay(now) };
        case 'last30days': return { start: startOfDay(subDays(now, 29)), end: endOfDay(now) };
        default: return { start: startOfDay(now), end: endOfDay(now) };
    }
}
function formatCurrency(v: number) {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
}
function formatNumber(v: number) { return new Intl.NumberFormat('en-IN').format(v); }
function calculateNetSales(data: TableData): TableRowData {
    return {
        orderCount: data.grossSales.orderCount - data.cancellations.orderCount - data.returns.orderCount,
        itemCount: data.grossSales.itemCount - data.cancellations.itemCount - data.returns.itemCount,
        netSaleValue: Math.round((data.grossSales.netSaleValue - data.cancellations.netSaleValue - data.returns.netSaleValue) * 100) / 100,
    };
}
function downloadAwbCsv(awbs: string[], remittanceDate: string, courier: string): void {
    const csv = ['AWB', ...awbs].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${courier.replace(' ', '-')}-AWBs_${remittanceDate}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
}
function subtractOneDay(dateStr: string): string {
    const d = new Date(`${dateStr}T00:00:00`);
    d.setDate(d.getDate() - 1);
    return d.toISOString().split('T')[0];
}

function useCooldown() {
    const [remaining, setRemaining] = useState(0);
    const lastRef = useRef<number>(0);
    const timerRef = useRef<NodeJS.Timeout | null>(null);
    const start = useCallback(() => {
        setRemaining(Math.ceil(QUERY_COOLDOWN_MS / 1000));
        if (timerRef.current) clearInterval(timerRef.current);
        timerRef.current = setInterval(() => {
            setRemaining(p => { if (p <= 1) { clearInterval(timerRef.current!); timerRef.current = null; return 0; } return p - 1; });
        }, 1000);
    }, []);
    const canQuery = useCallback(() => Date.now() - lastRef.current >= QUERY_COOLDOWN_MS, []);
    const markQueried = useCallback(() => { lastRef.current = Date.now(); }, []);
    useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);
    return { remaining, start, canQuery, markQueried };
}

// ============================================================
// ORDER SUMMARY COMPONENTS
// ============================================================

const TableSkeleton = () => (
    <Table><TableHeader><TableRow>
        <TableHead className="w-[280px]">Particulars</TableHead>
        <TableHead className="text-right">Order Count</TableHead>
        <TableHead className="text-right">Item Count</TableHead>
        <TableHead className="text-right">Net Sale Value</TableHead>
    </TableRow></TableHeader><TableBody>
            {[...Array(7)].map((_, i) => (
                <TableRow key={i}>
                    <TableCell><Skeleton className="h-5 w-40" /></TableCell>
                    <TableCell className="text-right"><Skeleton className="h-5 w-16 ml-auto" /></TableCell>
                    <TableCell className="text-right"><Skeleton className="h-5 w-16 ml-auto" /></TableCell>
                    <TableCell className="text-right"><Skeleton className="h-5 w-24 ml-auto" /></TableCell>
                </TableRow>
            ))}
        </TableBody></Table>
);

interface ExpandableRowProps {
    label: string; data: TableRowData; icon?: React.ReactNode; indent?: number;
    isExpandable?: boolean; isExpanded?: boolean; onToggle?: () => void; className?: string;
}
const ExpandableRow = ({ label, data, icon, indent = 0, isExpandable = false, isExpanded = false, onToggle, className = '' }: ExpandableRowProps) => (
    <TableRow className={cn('transition-colors', className)}>
        <TableCell className={cn('font-medium cursor-default', isExpandable && 'cursor-pointer hover:text-primary')} onClick={isExpandable ? onToggle : undefined} style={{ paddingLeft: `${16 + indent * 24}px` }}>
            <div className="flex items-center gap-2">
                {icon && <span className="text-muted-foreground w-4 flex-shrink-0">{icon}</span>}
                {isExpandable && <span className="text-muted-foreground w-4 flex-shrink-0">{isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</span>}
                <span>{label}</span>
            </div>
        </TableCell>
        <TableCell className="text-right font-mono">{formatNumber(data.orderCount)}</TableCell>
        <TableCell className="text-right font-mono">{formatNumber(data.itemCount)}</TableCell>
        <TableCell className="text-right font-mono">{formatCurrency(data.netSaleValue)}</TableCell>
    </TableRow>
);
const StatusBreakdownRows = ({ breakdown, statusOrder, indent }: { breakdown: StatusBreakdown; statusOrder: string[]; indent: number }) => (
    <>{statusOrder.map((status) => {
        const d = breakdown[status] || { orderCount: 0, itemCount: 0, netSaleValue: 0 };
        return (
            <TableRow key={status} className="text-muted-foreground text-sm bg-muted/30">
                <TableCell className="font-normal" style={{ paddingLeft: `${16 + indent * 24}px` }}>
                    <div className="flex items-center gap-2"><span className="w-4" /><span className="w-4" /><span>{STATUS_LABELS[status] || status}</span></div>
                </TableCell>
                <TableCell className="text-right font-mono">{formatNumber(d.orderCount)}</TableCell>
                <TableCell className="text-right font-mono">{formatNumber(d.itemCount)}</TableCell>
                <TableCell className="text-right font-mono">{formatCurrency(d.netSaleValue)}</TableCell>
            </TableRow>
        );
    })}</>
);
const DataTable = ({ data }: { data: TableData }) => {
    const [isNetSalesExpanded, setIsNetSalesExpanded] = useState(false);
    const [expanded, setExpanded] = useState<Record<string, boolean>>({ pendingDispatch: false, inTransit: false, delivered: false });
    const netSales = calculateNetSales(data);
    const toggleCat = (c: string) => setExpanded(p => ({ ...p, [c]: !p[c] }));
    return (
        <Table><TableHeader><TableRow>
            <TableHead className="w-[280px]">Particulars</TableHead>
            <TableHead className="text-right">Order Count</TableHead>
            <TableHead className="text-right">Item Count</TableHead>
            <TableHead className="text-right">Net Sale Value</TableHead>
        </TableRow></TableHeader><TableBody>
                <ExpandableRow label="Gross Sales" data={data.grossSales} icon={<Plus className="h-3 w-3 text-green-600" />} className="font-semibold bg-green-50/50 dark:bg-green-950/20" />
                <ExpandableRow label="Cancellations" data={data.cancellations} icon={<Minus className="h-3 w-3 text-red-600" />} className="text-red-600 dark:text-red-400" />
                <ExpandableRow label="Returns" data={data.returns} icon={<Minus className="h-3 w-3 text-red-600" />} className="text-red-600 dark:text-red-400" />
                <ExpandableRow label="Net Sales" data={netSales} icon={<Equal className="h-3 w-3 text-blue-600" />} isExpandable isExpanded={isNetSalesExpanded} onToggle={() => setIsNetSalesExpanded(!isNetSalesExpanded)} className="font-semibold bg-blue-50/50 dark:bg-blue-950/20 border-t-2 border-blue-200 dark:border-blue-800" />
                {isNetSalesExpanded && (<>
                    <ExpandableRow label="Pending Dispatch" data={data.pendingDispatch} indent={1} isExpandable isExpanded={expanded.pendingDispatch} onToggle={() => toggleCat('pendingDispatch')} className="bg-muted/20" />
                    {expanded.pendingDispatch && <StatusBreakdownRows breakdown={data.pendingDispatch.breakdown} statusOrder={STATUS_ORDER.pendingDispatch} indent={2} />}
                    <ExpandableRow label="In-Transit" data={data.inTransit} indent={1} isExpandable isExpanded={expanded.inTransit} onToggle={() => toggleCat('inTransit')} className="bg-muted/20" />
                    {expanded.inTransit && <StatusBreakdownRows breakdown={data.inTransit.breakdown} statusOrder={STATUS_ORDER.inTransit} indent={2} />}
                    <ExpandableRow label="Delivered" data={data.delivered} indent={1} isExpandable isExpanded={expanded.delivered} onToggle={() => toggleCat('delivered')} className="bg-muted/20" />
                    {expanded.delivered && <StatusBreakdownRows breakdown={data.delivered.breakdown} statusOrder={STATUS_ORDER.delivered} indent={2} />}
                </>)}
            </TableBody></Table>
    );
};

// ============================================================
// REMITTANCE TABLE COMPONENTS
// ============================================================

const RemittanceTableSkeleton = () => (
    <Table><TableHeader><TableRow>
        <TableHead>Date</TableHead><TableHead>Order Delivered Range</TableHead>
        <TableHead className="text-right">Amount</TableHead><TableHead className="text-right">Orders</TableHead>
    </TableRow></TableHeader><TableBody>
            {[...Array(5)].map((_, i) => (
                <TableRow key={i}>
                    <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-44" /></TableCell>
                    <TableCell className="text-right"><Skeleton className="h-5 w-24 ml-auto" /></TableCell>
                    <TableCell className="text-right"><Skeleton className="h-5 w-20 ml-auto" /></TableCell>
                </TableRow>
            ))}
        </TableBody></Table>
);

const RemittanceDataTable = ({ data, courier }: { data: RemittanceTableData; courier: RemittanceCourier }) => (
    <Table><TableHeader><TableRow>
        <TableHead>Date</TableHead><TableHead>Order Delivered Range</TableHead>
        <TableHead className="text-right">Amount</TableHead><TableHead className="text-right">Orders</TableHead>
    </TableRow></TableHeader><TableBody>
            {data.rows.map((row) => (
                <TableRow key={row.date}>
                    <TableCell className="font-medium font-mono">{row.date}</TableCell>
                    <TableCell className="font-mono text-muted-foreground">
                        {row.orderDeliveredRangeStart === row.orderDeliveredRangeEnd
                            ? row.orderDeliveredRangeStart
                            : `${row.orderDeliveredRangeStart} to ${row.orderDeliveredRangeEnd}`}
                    </TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(row.amount)}</TableCell>
                    <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                            <span className="font-mono">{formatNumber(row.orderCount)}</span>
                            {row.awbs?.length > 0 && (
                                <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-foreground"
                                    title={`Download ${row.awbs.length} AWBs for ${row.date}`}
                                    onClick={() => downloadAwbCsv(row.awbs, row.date, courier)}>
                                    <Download className="h-3.5 w-3.5" />
                                </Button>
                            )}
                        </div>
                    </TableCell>
                </TableRow>
            ))}
            <TableRow className="font-semibold bg-muted/40 border-t-2">
                <TableCell>Total</TableCell><TableCell />
                <TableCell className="text-right font-mono">{formatCurrency(data.totalAmount)}</TableCell>
                <TableCell className="text-right font-mono">{formatNumber(data.totalOrderCount)}</TableCell>
            </TableRow>
        </TableBody></Table>
);

// ============================================================
// MAIN COMPONENT
// ============================================================

export default function Dashboard() {
    const businessAuth = useBusinessContext();
    const { user } = businessAuth;

    // ── Order Summary ────────────────────────────────────────────────────────
    const [datePreset, setDatePreset] = useState<DateRangePreset>('today');
    const [customDateRange, setCustomDateRange] = useState<DateRange | undefined>();
    const [isCalendarOpen, setIsCalendarOpen] = useState(false);
    const [selectedStores, setSelectedStores] = useState<string>('all');
    const [tableDataState, setTableDataState] = useState<FirestoreTableData | null>(null);
    const [isInitialLoad, setIsInitialLoad] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const orderCooldown = useCooldown();

    // ── Gross Profit ─────────────────────────────────────────────────────────
    const [grossProfitData, setGrossProfitData] = useState<FirestoreGrossProfitData | null>(null);
    const [gpDatePreset, setGpDatePreset] = useState<DateRangePreset>('today');
    const [gpCustomDateRange, setGpCustomDateRange] = useState<DateRange | undefined>();
    const [gpIsCalendarOpen, setGpIsCalendarOpen] = useState(false);
    const [isGpSubmitting, setIsGpSubmitting] = useState(false);
    const [gpSubmitError, setGpSubmitError] = useState<string | null>(null);
    const gpCooldown = useCooldown();

    // ── Gross Profit row download states ─────────────────────────────────────
    const [isTaxReportDownloading, setIsTaxReportDownloading] = useState(false);
    const [isPurchaseDownloading, setIsPurchaseDownloading] = useState(false);
    const [isOpeningStockDownloading, setIsOpeningStockDownloading] = useState(false);
    const [isClosingStockDownloading, setIsClosingStockDownloading] = useState(false);

    // ── Remittance ───────────────────────────────────────────────────────────
    const [remittanceRoot, setRemittanceRoot] = useState<FirestoreRemittanceRoot>({});
    const [remittanceCourier, setRemittanceCourier] = useState<RemittanceCourier>('Blue Dart');
    const [remittanceDateRange, setRemittanceDateRange] = useState<DateRange | undefined>();
    const [remittanceCalendarOpen, setRemittanceCalendarOpen] = useState(false);
    const [isRemittanceSubmitting, setIsRemittanceSubmitting] = useState(false);
    const [remittanceSubmitError, setRemittanceSubmitError] = useState<string | null>(null);
    const remittanceCooldown = useCooldown();

    // ── Computed ─────────────────────────────────────────────────────────────
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

    const remittanceStartDate = remittanceDateRange?.from ? format(remittanceDateRange.from, 'yyyy-MM-dd') : null;
    const remittanceEndDate = remittanceDateRange?.to ? format(remittanceDateRange.to, 'yyyy-MM-dd') : remittanceStartDate;

    const activeRemittanceData = remittanceRoot[COURIER_FS_KEY[remittanceCourier]] ?? null;

    // ── API calls ─────────────────────────────────────────────────────────────
    const fetchTableData = useCallback(async (force = false) => {
        if (!businessAuth.businessId || storesToFetch.length === 0 || !user) return;
        if (!force && !orderCooldown.canQuery()) return;
        orderCooldown.markQueried(); orderCooldown.start(); setIsRefreshing(true);
        try {
            const token = await user.getIdToken();
            await fetch('/api/business/table-data', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ businessId: businessAuth.businessId, stores: storesToFetch, startTime: toISTISOString(currentDateRange.start), endTime: toISTISOString(currentDateRange.end) }),
            });
        } catch (err) { console.error('Error calling table data API:', err); }
        finally { setIsRefreshing(false); }
    }, [businessAuth.businessId, storesToFetch, currentDateRange, user, orderCooldown]);

    const handleGenerateGrossProfit = useCallback(async (force = false) => {
        if (!user || !businessAuth.businessId) return;
        if (!force && !gpCooldown.canQuery()) return;
        gpCooldown.markQueried(); gpCooldown.start();
        setGpSubmitError(null); setIsGpSubmitting(true);
        try {
            const token = await user.getIdToken();
            const res = await fetch('/api/business/generate-gross-profit-report', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ businessId: businessAuth.businessId, startDate: gpStartDate, endDate: gpEndDate }),
            });
            if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error ?? `Status ${res.status}`); }
        } catch (err: unknown) { setGpSubmitError(err instanceof Error ? err.message : 'Something went wrong.'); }
        finally { setIsGpSubmitting(false); }
    }, [user, businessAuth.businessId, gpStartDate, gpEndDate, gpCooldown]);

    const handleGenerateRemittance = useCallback(async (force = false) => {
        if (!user || !businessAuth.businessId || !remittanceStartDate || !remittanceEndDate) return;
        if (!force && !remittanceCooldown.canQuery()) return;
        remittanceCooldown.markQueried(); remittanceCooldown.start();
        setRemittanceSubmitError(null); setIsRemittanceSubmitting(true);
        try {
            const token = await user.getIdToken();
            const res = await fetch('/api/business/generate-remittance-table', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ businessId: businessAuth.businessId, startDate: remittanceStartDate, endDate: remittanceEndDate, courier: remittanceCourier }),
            });
            if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error ?? `Status ${res.status}`); }
        } catch (err: unknown) { setRemittanceSubmitError(err instanceof Error ? err.message : 'Something went wrong.'); }
        finally { setIsRemittanceSubmitting(false); }
    }, [user, businessAuth.businessId, remittanceStartDate, remittanceEndDate, remittanceCourier, remittanceCooldown]);

    // ── Gross Profit row download handlers ────────────────────────────────────

    const handleTaxReportDownload = useCallback(async () => {
        if (!user || !businessAuth.businessId || !grossProfitData?.startDate || !grossProfitData?.endDate) return;
        const storeId = businessAuth.stores?.[0];
        if (!storeId) return;
        setIsTaxReportDownloading(true);
        try {
            const token = await user.getIdToken();
            const res = await fetch('/api/business/generate-tax-report', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({
                    businessId: businessAuth.businessId,
                    storeIds: [
                        "gj9ejg-cu.myshopify.com",
                        "nfkjgp-sv.myshopify.com"
                    ],
                    startDate: grossProfitData.startDate,
                    endDate: grossProfitData.endDate,
                }),
            });
            if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.message ?? `Status ${res.status}`); }
            toast({
                title: `Tax Report generation Started`,
                description: `Your tax report is queued for generation and will soon be available to download`,
                action: (
                    <Button variant="outline" size="sm" asChild>
                        <Link href={`/business/${businessAuth.businessId}/dashboard/reports/tax`}>
                            View Progress
                            <MoveRight className="ml-2 h-4 w-4" />
                        </Link>
                    </Button>
                )
            });
        } catch (err: unknown) {
            toast({ title: 'Error', description: err instanceof Error ? err.message : 'Something went wrong.', variant: 'destructive' });
        } finally {
            setIsTaxReportDownloading(false);
        }
    }, [user, businessAuth.businessId, businessAuth.stores, grossProfitData?.startDate, grossProfitData?.endDate]);

    const handlePurchaseDownload = useCallback(async () => {
        if (!businessAuth.businessId) return;
        setIsPurchaseDownloading(true);
        try {
            const res = await fetch('https://asia-south1-orderflow-jnig7.cloudfunctions.net/purchaseReport', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ businessId: businessAuth.businessId, startDate: gpStartDate, endDate: gpEndDate }),
            });
            if (!res.ok) throw new Error('Failed to generate purchase report');
            const { downloadUrl } = await res.json();
            const a = document.createElement('a');
            a.href = downloadUrl;
            a.download = `purchase-report_${gpStartDate}_to_${gpEndDate}.xlsx`;
            document.body.appendChild(a); a.click(); a.remove();
        } catch (err) {
            toast({ title: 'Error', description: 'Failed to download purchase report.', variant: 'destructive' });
        } finally {
            setIsPurchaseDownloading(false);
        }
    }, [businessAuth.businessId, gpStartDate, gpEndDate]);

    const handleOpeningStockDownload = useCallback(async () => {
        if (!businessAuth.businessId || !grossProfitData?.startDate) return;
        setIsOpeningStockDownloading(true);
        try {
            const openingDate = subtractOneDay(grossProfitData.startDate);
            const res = await fetch(SNAPSHOT_FUNCTION_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ businessId: businessAuth.businessId, date: openingDate }),
            });
            if (!res.ok) throw new Error(`Status ${res.status}`);
            const { downloadUrl } = await res.json();
            const a = document.createElement('a');
            a.href = downloadUrl;
            a.download = `opening-stock_${openingDate}.xlsx`;
            document.body.appendChild(a); a.click(); a.remove();
        } catch (err: unknown) {
            toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to download opening stock.', variant: 'destructive' });
        } finally {
            setIsOpeningStockDownloading(false);
        }
    }, [businessAuth.businessId, grossProfitData?.startDate]);

    const handleClosingStockDownload = useCallback(async () => {
        if (!businessAuth.businessId || !grossProfitData?.endDate) return;
        setIsClosingStockDownloading(true);
        try {
            const res = await fetch(SNAPSHOT_FUNCTION_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ businessId: businessAuth.businessId, date: grossProfitData.endDate }),
            });
            if (!res.ok) throw new Error(`Status ${res.status}`);
            const { downloadUrl } = await res.json();
            const a = document.createElement('a');
            a.href = downloadUrl;
            a.download = `closing-stock_${grossProfitData.endDate}.xlsx`;
            document.body.appendChild(a); a.click(); a.remove();
        } catch (err: unknown) {
            toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to download closing stock.', variant: 'destructive' });
        } finally {
            setIsClosingStockDownloading(false);
        }
    }, [businessAuth.businessId, grossProfitData?.endDate]);

    // ── Firestore listener ────────────────────────────────────────────────────
    useEffect(() => {
        if (!businessAuth.businessId || !businessAuth.isAuthorized) return;
        const docRef = doc(db, 'users', businessAuth.businessId);
        const unsub = onSnapshot(docRef, (snap) => {
            if (snap.exists()) {
                const d = snap.data();
                setTableDataState((d?.tableData as FirestoreTableData) ?? null);
                setGrossProfitData((d?.grossProfitData as FirestoreGrossProfitData) ?? null);
                setRemittanceRoot((d?.remittanceTable as FirestoreRemittanceRoot) ?? {});
            } else {
                setTableDataState(null); setGrossProfitData(null); setRemittanceRoot({});
            }
            setIsInitialLoad(false);
        }, (err) => { console.error('Snapshot error:', err); setIsInitialLoad(false); });
        return () => unsub();
    }, [businessAuth.businessId, businessAuth.isAuthorized]);

    // ── Trigger effects ───────────────────────────────────────────────────────
    useEffect(() => {
        if (datePreset === 'custom' && (!customDateRange?.from || !customDateRange?.to)) return;
        if (businessAuth.isAuthorized && !businessAuth.loading && storesToFetch.length > 0) fetchTableData(true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [datePreset, customDateRange, selectedStores, businessAuth.isAuthorized, businessAuth.loading]);

    useEffect(() => {
        if (gpDatePreset === 'custom' && (!gpCustomDateRange?.from || !gpCustomDateRange?.to)) return;
        if (businessAuth.isAuthorized && !businessAuth.loading && gpDatePreset === 'today') handleGenerateGrossProfit(true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [gpDatePreset, gpCustomDateRange, businessAuth.isAuthorized, businessAuth]);


    useEffect(() => {
        if (!remittanceDateRange?.from || !remittanceDateRange?.to) return;
        if (businessAuth.isAuthorized && !businessAuth.loading) handleGenerateRemittance(true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [remittanceDateRange, remittanceCourier, businessAuth.isAuthorized, businessAuth.loading]);

    useEffect(() => { document.title = 'Dashboard'; }, []);

    // ── Auth guard ────────────────────────────────────────────────────────────
    if (businessAuth.loading) return <div className="flex items-center justify-center h-screen"><div className="text-lg">Loading...</div></div>;
    if (!businessAuth.isAuthorized) return (
        <div className="flex flex-col items-center justify-center h-screen">
            <div className="text-center space-y-4">
                <h1 className="text-6xl font-bold text-gray-300">404</h1>
                <h2 className="text-2xl font-semibold text-gray-700">Page Not Found</h2>
                <p className="text-gray-500 max-w-md">You don&apos;t have access to this business.</p>
            </div>
        </div>
    );

    // ── Derived state ─────────────────────────────────────────────────────────
    const isRefreshDisabled = isLoading || orderCooldown.remaining > 0;
    const isRemittanceLoading = isRemittanceSubmitting || !!activeRemittanceData?.loading;
    const isRemittanceRefreshDisabled = isRemittanceLoading || remittanceCooldown.remaining > 0 || !remittanceStartDate;

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

    // ── Render ────────────────────────────────────────────────────────────────
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
                            {businessAuth.stores?.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                        </SelectContent>
                    </Select>
                    <Select value={datePreset} onValueChange={(v) => { setDatePreset(v as DateRangePreset); if (v !== 'custom') setCustomDateRange(undefined); }} disabled={isLoading}>
                        <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
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
                                    {customDateRange?.from ? (customDateRange.to ? <>{format(customDateRange.from, 'dd MMM yyyy')} - {format(customDateRange.to, 'dd MMM yyyy')}</> : format(customDateRange.from, 'dd MMM yyyy')) : 'Pick a date range'}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="end">
                                <Calendar initialFocus mode="range" defaultMonth={customDateRange?.from} selected={customDateRange} onSelect={(r) => { setCustomDateRange(r); if (r?.from) setDatePreset('custom'); }} numberOfMonths={2} />
                            </PopoverContent>
                        </Popover>
                    )}
                    <Button variant="outline" size="icon" onClick={() => { if (orderCooldown.canQuery()) fetchTableData(); }} disabled={isRefreshDisabled} className="relative">
                        <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
                        {orderCooldown.remaining > 0 && !isLoading && <span className="absolute -top-2 -right-2 bg-muted text-muted-foreground text-xs rounded-full h-5 w-5 flex items-center justify-center border">{orderCooldown.remaining}</span>}
                    </Button>
                </div>
            </div>

            <div className="text-sm text-muted-foreground">
                Showing data for: <span className="font-medium">{getDateRangeLabel()}</span>
                {selectedStores !== 'all' && <span className="ml-2">• Store: <span className="font-medium">{selectedStores}</span></span>}
            </div>

            {/* ── Order Summary ── */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                        <span>Order Summary</span>
                        {tableDataState?.lastUpdated && !isLoading && <span className="text-xs font-normal text-muted-foreground">Last updated: {format(tableDataState.lastUpdated.toDate(), 'dd MMM yyyy, HH:mm')}</span>}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {tableDataState?.error && !isLoading && (
                        <div className="flex items-center gap-2 p-4 mb-4 text-sm text-red-600 bg-red-50 rounded-lg">
                            <AlertCircle className="h-4 w-4" /><span>Error: {tableDataState.error}</span>
                            <Button variant="outline" size="sm" className="ml-auto" onClick={() => { if (orderCooldown.canQuery()) fetchTableData(); }} disabled={isRefreshDisabled}>{orderCooldown.remaining > 0 ? `Retry (${orderCooldown.remaining}s)` : 'Retry'}</Button>
                        </div>
                    )}
                    {isLoading && <TableSkeleton />}
                    {!isLoading && tableDataState?.data && <DataTable data={tableDataState.data} />}
                    {!isLoading && !tableDataState?.data && !tableDataState?.error && (
                        <div className="flex flex-col items-center justify-center py-12 text-center">
                            <p className="text-muted-foreground mb-4">No data available. Click refresh to load data.</p>
                            <Button onClick={() => fetchTableData()} disabled={isRefreshDisabled}><RefreshCw className="mr-2 h-4 w-4" />{orderCooldown.remaining > 0 ? `Load Data (${orderCooldown.remaining}s)` : 'Load Data'}</Button>
                        </div>
                    )}
                    {!isLoading && tableDataState?.data && <div className="mt-6 pt-4 border-t"><p className="text-xs text-muted-foreground">Click on <span className="font-medium">Net Sales</span> to expand and view breakdown by status.</p></div>}
                </CardContent>
            </Card>

            {/* ── Gross Profit ── */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                        <span>Gross Profit Report</span>
                        {grossProfitData?.lastUpdated && !grossProfitData.loading && <span className="text-xs font-normal text-muted-foreground">Last updated: {format(grossProfitData.lastUpdated.toDate(), 'dd MMM yyyy, HH:mm')}</span>}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-wrap items-center gap-3 mb-6">
                        <Select value={gpDatePreset} onValueChange={(v) => { setGpDatePreset(v as DateRangePreset); if (v !== 'custom') setGpCustomDateRange(undefined); }} disabled={isGpSubmitting || grossProfitData?.loading}>
                            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="today">Today</SelectItem><SelectItem value="yesterday">Yesterday</SelectItem>
                                <SelectItem value="last7days">Last 7 Days</SelectItem><SelectItem value="last30days">Last 30 Days</SelectItem>
                                <SelectItem value="custom">Custom</SelectItem>
                            </SelectContent>
                        </Select>
                        {gpDatePreset === 'custom' && (
                            <Popover open={gpIsCalendarOpen} onOpenChange={setGpIsCalendarOpen}>
                                <PopoverTrigger asChild>
                                    <Button variant="outline" disabled={isGpSubmitting || grossProfitData?.loading} className={cn('w-[240px] justify-start text-left font-normal', !gpCustomDateRange && 'text-muted-foreground')}>
                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                        {gpCustomDateRange?.from ? (gpCustomDateRange.to ? <>{format(gpCustomDateRange.from, 'dd MMM yyyy')} – {format(gpCustomDateRange.to, 'dd MMM yyyy')}</> : format(gpCustomDateRange.from, 'dd MMM yyyy')) : 'Pick a date range'}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                    <Calendar initialFocus mode="range" defaultMonth={gpCustomDateRange?.from} selected={gpCustomDateRange} onSelect={(r) => { setGpCustomDateRange(r); if (r?.from) setGpDatePreset('custom'); }} numberOfMonths={2} />
                                </PopoverContent>
                            </Popover>
                        )}
                        <Button variant="outline" size="icon" onClick={() => handleGenerateGrossProfit()} disabled={isGpSubmitting || !!grossProfitData?.loading || gpCooldown.remaining > 0} className="relative">
                            <RefreshCw className={cn('h-4 w-4', (isGpSubmitting || grossProfitData?.loading) && 'animate-spin')} />
                            {gpCooldown.remaining > 0 && !isGpSubmitting && !grossProfitData?.loading && <span className="absolute -top-2 -right-2 bg-muted text-muted-foreground text-xs rounded-full h-5 w-5 flex items-center justify-center border">{gpCooldown.remaining}</span>}
                        </Button>
                        {grossProfitData?.rows && !grossProfitData.loading && grossProfitData.downloadUrl && (
                            <Button variant="outline" onClick={() => { const a = document.createElement('a'); a.href = grossProfitData.downloadUrl!; a.download = `gross-profit-report_${grossProfitData.startDate}_${grossProfitData.endDate}.xlsx`; document.body.appendChild(a); a.click(); a.remove(); }}>
                                <Download className="mr-2 h-4 w-4" />Download Excel
                            </Button>
                        )}
                    </div>
                    {gpSubmitError && <div className="flex items-start gap-2 p-3 mb-4 text-sm text-red-600 bg-red-50 rounded-lg dark:bg-red-950/30 dark:text-red-400"><AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" /><span>{gpSubmitError}</span></div>}
                    {grossProfitData?.error && !grossProfitData.loading && <div className="flex items-start gap-2 p-3 mb-4 text-sm text-red-600 bg-red-50 rounded-lg dark:bg-red-950/30 dark:text-red-400"><AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" /><span>{grossProfitData.error}</span></div>}
                    {grossProfitData?.loading && (
                        <Table><TableHeader><TableRow><TableHead className="w-[200px]">Type</TableHead><TableHead className="text-right">Qty</TableHead><TableHead className="text-right">Taxable Amt</TableHead><TableHead className="text-right">IGST</TableHead><TableHead className="text-right">CGST</TableHead><TableHead className="text-right">SGST</TableHead><TableHead className="text-right">Net Amount</TableHead><TableHead className="w-10" /></TableRow></TableHeader>
                            <TableBody>{[...Array(7)].map((_, i) => (<TableRow key={i}><TableCell><Skeleton className="h-5 w-28" /></TableCell><TableCell className="text-right"><Skeleton className="h-5 w-12 ml-auto" /></TableCell><TableCell className="text-right"><Skeleton className="h-5 w-24 ml-auto" /></TableCell><TableCell className="text-right"><Skeleton className="h-5 w-20 ml-auto" /></TableCell><TableCell className="text-right"><Skeleton className="h-5 w-20 ml-auto" /></TableCell><TableCell className="text-right"><Skeleton className="h-5 w-20 ml-auto" /></TableCell><TableCell className="text-right"><Skeleton className="h-5 w-24 ml-auto" /></TableCell><TableCell /></TableRow>))}</TableBody>
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
                                        <TableHead className="w-[200px]">Type</TableHead>
                                        <TableHead className="text-right">Qty</TableHead>
                                        <TableHead className="text-right">Taxable Amt</TableHead>
                                        <TableHead className="text-right">IGST</TableHead>
                                        <TableHead className="text-right">CGST</TableHead>
                                        <TableHead className="text-right">SGST</TableHead>
                                        <TableHead className="text-right">Net Amount</TableHead>
                                        <TableHead className="w-10" />
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {grossProfitData.rows.map((row) => {
                                        const lost = isLostRow(row.type);
                                        const isSale = row.type === 'Sale';
                                        const isPurchase = row.type === 'Purchase';
                                        const isOpeningStock = row.type === 'Opening Stock';
                                        const isClosingStock = row.type === 'Closing Stock';

                                        return (
                                            <TableRow
                                                key={row.type}
                                                className={cn(
                                                    HIGHLIGHT_ROWS.has(row.type) && 'bg-green-50/60 dark:bg-green-950/20 font-semibold border-t-2 border-green-200 dark:border-green-800',
                                                    (NEGATIVE_ROWS.has(row.type) || lost) && 'text-red-600 dark:text-red-400',
                                                )}
                                            >
                                                <TableCell className="font-medium">{row.type}</TableCell>
                                                <TableCell className="text-right font-mono">
                                                    {lost ? '–' : formatNumber(row.qty)}
                                                </TableCell>
                                                <TableCell className="text-right font-mono">{formatCurrency(row.taxable)}</TableCell>
                                                <TableCell className="text-right font-mono">{formatCurrency(row.igst)}</TableCell>
                                                <TableCell className="text-right font-mono">{formatCurrency(row.cgst)}</TableCell>
                                                <TableCell className="text-right font-mono">{formatCurrency(row.sgst)}</TableCell>
                                                <TableCell className="text-right font-mono">{formatCurrency(row.net)}</TableCell>
                                                <TableCell>
                                                    {isSale && (
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                                            title="Download Tax Report (Sale + Sale Return) — will be sent on WhatsApp"
                                                            disabled={isTaxReportDownloading}
                                                            onClick={handleTaxReportDownload}
                                                        >
                                                            {isTaxReportDownloading
                                                                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                                : <Download className="h-3.5 w-3.5" />}
                                                        </Button>
                                                    )}
                                                    {isPurchase && (
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-6 w-6 shrink-0"
                                                            title="Download Purchase Report"
                                                            disabled={isPurchaseDownloading}
                                                            onClick={handlePurchaseDownload}>
                                                            {isPurchaseDownloading
                                                                ? <RefreshCw className="h-3 w-3 animate-spin" />
                                                                : <Download className="h-3 w-3" />}
                                                        </Button>
                                                    )}
                                                    {isOpeningStock && (
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                                            title="Download Opening Stock Excel"
                                                            disabled={isOpeningStockDownloading}
                                                            onClick={handleOpeningStockDownload}
                                                        >
                                                            {isOpeningStockDownloading
                                                                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                                : <Download className="h-3.5 w-3.5" />}
                                                        </Button>
                                                    )}
                                                    {isClosingStock && (
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                                            title="Download Closing Stock Excel"
                                                            disabled={isClosingStockDownloading}
                                                            onClick={handleClosingStockDownload}
                                                        >
                                                            {isClosingStockDownloading
                                                                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                                : <Download className="h-3.5 w-3.5" />}
                                                        </Button>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </>
                    )}
                    {!grossProfitData?.rows && !grossProfitData?.loading && !grossProfitData?.error && <div className="flex items-center justify-center py-12 text-center"><p className="text-muted-foreground">Select a date range to view the report.</p></div>}
                </CardContent>
            </Card>

            {/* ── Remittance ── */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                        <span>Remittance</span>
                        {activeRemittanceData?.lastUpdated && !activeRemittanceData.loading && (
                            <span className="text-xs font-normal text-muted-foreground">
                                Last updated: {format(activeRemittanceData.lastUpdated.toDate(), 'dd MMM yyyy, HH:mm')}
                            </span>
                        )}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-wrap items-center gap-3 mb-6">
                        <Select value={remittanceCourier} onValueChange={(v) => setRemittanceCourier(v as RemittanceCourier)} disabled={isRemittanceLoading}>
                            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="Blue Dart">Blue Dart</SelectItem>
                                <SelectItem value="Delhivery">Delhivery</SelectItem>
                            </SelectContent>
                        </Select>
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
                                <Calendar initialFocus mode="range" defaultMonth={remittanceDateRange?.from} selected={remittanceDateRange}
                                    onSelect={(r) => { setRemittanceDateRange(r); if (r?.from && r?.to) setRemittanceCalendarOpen(false); }}
                                    numberOfMonths={2} />
                            </PopoverContent>
                        </Popover>
                        <Button variant="outline" size="icon" onClick={() => handleGenerateRemittance()} disabled={isRemittanceRefreshDisabled} className="relative"
                            title={!remittanceStartDate ? 'Select a date range first' : remittanceCooldown.remaining > 0 ? `Wait ${remittanceCooldown.remaining}s` : 'Refresh'}>
                            <RefreshCw className={cn('h-4 w-4', isRemittanceLoading && 'animate-spin')} />
                            {remittanceCooldown.remaining > 0 && !isRemittanceLoading && <span className="absolute -top-2 -right-2 bg-muted text-muted-foreground text-xs rounded-full h-5 w-5 flex items-center justify-center border">{remittanceCooldown.remaining}</span>}
                        </Button>
                    </div>
                    {remittanceSubmitError && <div className="flex items-start gap-2 p-3 mb-4 text-sm text-red-600 bg-red-50 rounded-lg dark:bg-red-950/30 dark:text-red-400"><AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" /><span>{remittanceSubmitError}</span></div>}
                    {activeRemittanceData?.error && !activeRemittanceData.loading && <div className="flex items-start gap-2 p-3 mb-4 text-sm text-red-600 bg-red-50 rounded-lg dark:bg-red-950/30 dark:text-red-400"><AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" /><span>{activeRemittanceData.error}</span></div>}
                    {activeRemittanceData?.loading && <RemittanceTableSkeleton />}
                    {activeRemittanceData?.data && !activeRemittanceData.loading && (
                        <>
                            <div className="text-sm text-muted-foreground mb-3">
                                <span className="font-medium">{remittanceCourier}</span> remittance dates:{' '}
                                <span className="font-medium">{format(new Date(activeRemittanceData.startDate!), 'dd MMM yyyy')} – {format(new Date(activeRemittanceData.endDate!), 'dd MMM yyyy')}</span>
                                <span className="ml-2 text-xs text-muted-foreground">(click <Download className="inline h-3 w-3" /> on a row to download its AWBs)</span>
                            </div>
                            <RemittanceDataTable data={activeRemittanceData.data} courier={remittanceCourier} />
                        </>
                    )}
                    {!activeRemittanceData?.data && !activeRemittanceData?.loading && !activeRemittanceData?.error && (
                        <div className="flex items-center justify-center py-12 text-center">
                            <p className="text-muted-foreground">Select a courier and date range above to generate the remittance table.</p>
                        </div>
                    )}
                </CardContent>
            </Card>

        </main>
    );
}