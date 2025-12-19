// /business/[businessId]/dashboard/page.tsx
'use client';

import React, { useEffect, useState, useCallback } from 'react';
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
import { CalendarIcon, RefreshCw, AlertCircle } from 'lucide-react';
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

interface TableData {
    grossSales: TableRowData;
    cancellations: TableRowData;
    pendingDispatch: TableRowData;
    returns: TableRowData;
    inTransit: TableRowData;
    delivered: TableRowData;
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

const PARTICULARS_CONFIG = [
    { key: 'grossSales', label: 'Gross Sales' },
    { key: 'cancellations', label: 'Cancellations' },
    { key: 'pendingDispatch', label: 'Pending Dispatch' },
    { key: 'returns', label: 'Returns' },
    { key: 'inTransit', label: 'In-Transit' },
    { key: 'delivered', label: 'Delivered' },
] as const;

// ============================================================
// HELPER FUNCTIONS
// ============================================================

// Convert to IST ISO string
function toISTISOString(date: Date): string {
    // Create a new date adjusted for IST (UTC+5:30)
    const istOffset = 5.5 * 60 * 60 * 1000;
    const utcTime = date.getTime();
    const istTime = new Date(utcTime);
    
    // Format as ISO string with IST offset
    const year = istTime.getFullYear();
    const month = String(istTime.getMonth() + 1).padStart(2, '0');
    const day = String(istTime.getDate()).padStart(2, '0');
    const hours = String(istTime.getHours()).padStart(2, '0');
    const minutes = String(istTime.getMinutes()).padStart(2, '0');
    const seconds = String(istTime.getSeconds()).padStart(2, '0');
    
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

// ============================================================
// COMPONENTS
// ============================================================

const TableSkeleton = () => (
    <Table>
        <TableHeader>
            <TableRow>
                <TableHead className="w-[200px]">Particulars</TableHead>
                <TableHead className="text-right">Order Count</TableHead>
                <TableHead className="text-right">Item Count</TableHead>
                <TableHead className="text-right">Net Sale Value</TableHead>
            </TableRow>
        </TableHeader>
        <TableBody>
            {[...Array(6)].map((_, i) => (
                <TableRow key={i}>
                    <TableCell>
                        <Skeleton className="h-5 w-32" />
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

const DataTable = ({ data }: { data: TableData }) => (
    <Table>
        <TableHeader>
            <TableRow>
                <TableHead className="w-[200px]">Particulars</TableHead>
                <TableHead className="text-right">Order Count</TableHead>
                <TableHead className="text-right">Item Count</TableHead>
                <TableHead className="text-right">Net Sale Value</TableHead>
            </TableRow>
        </TableHeader>
        <TableBody>
            {PARTICULARS_CONFIG.map(({ key, label }) => (
                <TableRow key={key} className={key === 'grossSales' ? 'font-semibold bg-muted/50' : ''}>
                    <TableCell className="font-medium">{label}</TableCell>
                    <TableCell className="text-right">
                        {formatNumber(data[key].orderCount)}
                    </TableCell>
                    <TableCell className="text-right">
                        {formatNumber(data[key].itemCount)}
                    </TableCell>
                    <TableCell className="text-right">
                        {formatCurrency(data[key].netSaleValue)}
                    </TableCell>
                </TableRow>
            ))}
        </TableBody>
    </Table>
);

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
    // API CALL
    // ============================================================

    const fetchTableData = useCallback(async () => {
        if (!businessAuth.businessId || storesToFetch.length === 0 || !user) {
            return;
        }

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
    }, [businessAuth.businessId, storesToFetch, currentDateRange, user]);

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
            fetchTableData();
        }
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
        fetchTableData();
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

                    {/* Refresh Button */}
                    <Button
                        variant="outline"
                        size="icon"
                        onClick={handleRefresh}
                        disabled={isLoading}
                    >
                        <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
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
                            >
                                Retry
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
                            <Button onClick={handleRefresh}>
                                <RefreshCw className="mr-2 h-4 w-4" />
                                Load Data
                            </Button>
                        </div>
                    )}
                </CardContent>
            </Card>
        </main>
    );
}