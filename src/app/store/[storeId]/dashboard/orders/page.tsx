// app/store/[storeId]/dashboard/orders/page.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
    Card,
    CardContent,
    CardFooter,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Download, MoreHorizontal, Loader2, ArrowUpDown, ScanBarcode, Clock, X } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import { AssignAwbDialog } from '@/components/assign-awb-dialog';
import { useProcessingQueue } from '@/contexts/processing-queue-context';
import { GenerateAwbDialog } from '@/components/generate-awb-dialog';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DateRange } from 'react-day-picker';
import { Calendar } from '@/components/ui/calendar';
import { format, addDays } from 'date-fns';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { AwbBulkSelectionDialog } from '@/components/awb-bulk-selection-dialog';
import { BookReturnDialog } from '@/components/book-return-dialog';
import { StartQcDialog } from '@/components/start-qc-dialog';
import { AvailabilityDialog } from '@/components/availability-dialog';
import { GeneratePODialog } from '@/components/generate-po-dialog';

// ============================================================
// HOOKS & TYPES (NEW!)
// ============================================================
import { useStoreAuthorization } from '@/hooks/use-store-authorization';
import { useOrders } from '@/hooks/use-orders';
import { useOrderCounts } from '@/hooks/use-order-counts';
import { useAvailabilityCounts } from '@/hooks/use-availability-counts';
import { useRtoInTransitCounts } from '@/hooks/use-rto-counts';
import { useAwbCount } from '@/hooks/use-awb-count';
import {
    useUpdateOrderStatus,
    useRevertOrderStatus,
    useDispatchOrders,
    useBulkUpdateStatus,
    useOrderSplit,
    useReturnBooking,
    useDeleteOrder,
    useDownloadSlips,
    useDownloadExcel,
    useDownloadProductsExcel,
    useUpdateShippedStatuses,
} from '@/hooks/use-order-mutations';
import { Order, CustomStatus, SortKey, SortDirection } from '@/types/order';

export default function OrdersPage() {
    const params = useParams();
    const nonPrefixedStoreId = params?.storeId as string;

    // ============================================================
    // AUTHORIZATION
    // ============================================================
    const {
        isAuthorized,
        memberRole,
        loading: authLoading,
        user,
        storeId
    } = useStoreAuthorization(nonPrefixedStoreId);

    const { processAwbAssignments } = useProcessingQueue();

    // ============================================================
    // UI STATE (Unchanged)
    // ============================================================
    const [activeTab, setActiveTab] = useState<CustomStatus | 'All Orders'>('All Orders');
    const [currentPage, setCurrentPage] = useState(1);
    const [selectedOrders, setSelectedOrders] = useState<string[]>([]);
    const [rowsPerPage, setRowsPerPage] = useState(10);
    const [viewingOrder, setViewingOrder] = useState<Order | null>(null);

    // Filter state
    const [searchQuery, setSearchQuery] = useState('');
    const [invertSearch, setInvertSearch] = useState(false);
    const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
    const [courierFilter, setCourierFilter] = useState<string>('all');
    const [availabilityFilter, setAvailabilityFilter] = useState<'all' | 'pending' | 'available' | 'unavailable'>('all');
    const [rtoInTransitFilter, setRtoInTransitFilter] = useState<'all' | 're-attempt' | 'refused' | 'no-reply'>('all');
    const [sortKey, setSortKey] = useState<SortKey>('createdAt');
    const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

    // Dialog state
    const [isAwbDialogOpen, setIsAwbDialogOpen] = useState(false);
    const [isFetchAwbDialogOpen, setIsFetchAwbDialogOpen] = useState(false);
    const [isLowAwbAlertOpen, setIsLowAwbAlertOpen] = useState(false);
    const [ordersForAwb, setOrdersForAwb] = useState<Order[]>([]);
    const [isAwbBulkSelectOpen, setIsAwbBulkSelectOpen] = useState(false);
    const [awbBulkSelectStatus, setAwbBulkSelectStatus] = useState('');
    const [isReturnDialogOpen, setIsReturnDialogOpen] = useState(false);
    const [orderForReturn, setOrderForReturn] = useState<Order | null>(null);
    const [isQcDialogOpen, setIsQcDialogOpen] = useState(false);
    const [orderForQc, setOrderForQc] = useState<Order | null>(null);
    const [isAvailabilityDialogOpen, setIsAvailabilityDialogOpen] = useState(false);
    const [isGeneratePODialogOpen, setIsGeneratePODialogOpen] = useState(false);

    // Item selection for availability
    const [itemSelection, setItemSelection] = useState<Record<string, Set<string | number>>>({});
    const [isUpdatingAvailability, setIsUpdatingAvailability] = useState<string | null>(null);

    // ============================================================
    // DATA FETCHING WITH TANSTACK QUERY (NEW!)
    // ============================================================

    // Fetch orders
    const {
        data: ordersData,
        isLoading,
        isFetching,
        refetch: refetchOrders
    } = useOrders(storeId, activeTab, currentPage, rowsPerPage, {
        searchQuery,
        invertSearch,
        dateRange,
        courierFilter,
        availabilityFilter,
        rtoInTransitFilter,
        sortKey,
        sortDirection,
    });

    const orders = ordersData?.orders || [];
    const totalFilteredCount = ordersData?.totalCount || 0;

    // Fetch counts
    const { data: statusCounts } = useOrderCounts(storeId);
    const { data: availabilityCounts } = useAvailabilityCounts(storeId);
    const { data: rtoInTransitCounts } = useRtoInTransitCounts(storeId);
    const { data: unusedAwbsCount = 0 } = useAwbCount(storeId);

    // ============================================================
    // MUTATIONS (NEW!)
    // ============================================================

    const updateStatus = useUpdateOrderStatus(storeId, user);
    const revertStatus = useRevertOrderStatus(storeId, user);
    const dispatchOrders = useDispatchOrders(storeId, user);
    const bulkUpdate = useBulkUpdateStatus(storeId, user);
    const splitOrder = useOrderSplit(storeId, user);
    const bookReturn = useReturnBooking(storeId, user);
    const deleteOrder = useDeleteOrder(storeId);
    const downloadSlips = useDownloadSlips(storeId, user);
    const downloadExcel = useDownloadExcel(storeId, user);
    const downloadProductsExcel = useDownloadProductsExcel(storeId, user);
    const updateShippedStatuses = useUpdateShippedStatuses(storeId, user);

    // ============================================================
    // MUTATION HANDLERS (Simplified!)
    // ============================================================

    const handleUpdateStatus = (orderId: string, status: CustomStatus) => {
        updateStatus.mutate({ orderId, status });
    };

    const handleRevertStatus = (orderId: string, revertTo: 'Confirmed' | 'Delivered') => {
        revertStatus.mutate({ orderId, revertTo });
    };

    const handleDispatch = (orderIds: string[]) => {
        dispatchOrders.mutate(orderIds, {
            onSuccess: () => setSelectedOrders([])
        });
    };

    const handleBulkUpdateStatus = (status: CustomStatus) => {
        if (status === 'Dispatched') {
            handleDispatch(selectedOrders);
            return;
        }

        if (status === 'DTO Requested') {
            bookReturn.mutate(selectedOrders, {
                onSuccess: () => setSelectedOrders([])
            });
            return;
        }

        bulkUpdate.mutate({ orderIds: selectedOrders, status }, {
            onSuccess: () => setSelectedOrders([])
        });
    };

    const handleOrderSplit = (orderId: string) => {
        splitOrder.mutate(orderId);
    };

    const handleDownloadSlips = () => {
        if (selectedOrders.length === 0) return;
        const orderIdsWithAwb = orders
            .filter(o => selectedOrders.includes(o.id) && o.awb)
            .map(o => o.id);

        if (orderIdsWithAwb.length === 0) {
            // Toast handled by mutation hook
            return;
        }

        downloadSlips.mutate(orderIdsWithAwb, {
            onSuccess: () => setSelectedOrders([])
        });
    };

    const handleDownloadExcel = () => {
        if (selectedOrders.length === 0) return;
        downloadExcel.mutate(selectedOrders, {
            onSuccess: () => setSelectedOrders([])
        });
    };

    const handleDownloadProductsExcel = () => {
        if (selectedOrders.length === 0) return;
        downloadProductsExcel.mutate(selectedOrders);
    };

    const handleUpdateShippedStatuses = () => {
        if (selectedOrders.length === 0) return;
        updateShippedStatuses.mutate(selectedOrders, {
            onSuccess: () => setSelectedOrders([])
        });
    };

    // ============================================================
    // AWB HANDLING
    // ============================================================

    const handleAssignAwbClick = () => {
        const ordersToProcess = orders.filter(o => selectedOrders.includes(o.id));
        if (ordersToProcess.length === 0) {
            // Show error toast
            return;
        }
        if (ordersToProcess.length > unusedAwbsCount) {
            setIsLowAwbAlertOpen(true);
        } else {
            setOrdersForAwb(ordersToProcess);
            setIsAwbDialogOpen(true);
        }
    };

    const handleBulkSelectByAwb = (awbs: string[], customStatus: string) => {
        if (!customStatus) return;

        const statusAwbMap = new Map(
            orders
                .filter(o => o.customStatus === customStatus && o.awb)
                .map(o => [o.awb!, o.id])
        );

        const foundOrderIds = awbs.reduce((acc, awb) => {
            if (statusAwbMap.has(awb)) {
                acc.add(statusAwbMap.get(awb)!);
            }
            return acc;
        }, new Set<string>());

        if (foundOrderIds.size > 0) {
            setSelectedOrders(prev => Array.from(new Set([...prev, ...Array.from(foundOrderIds)])));
        }
    };

    // ============================================================
    // AVAILABILITY HANDLING
    // ============================================================

    const handleItemCheck = (orderId: string, lineItemId: string | number) => {
        setItemSelection(prev => {
            const newSelection = { ...prev };
            if (!newSelection[orderId]) {
                newSelection[orderId] = new Set();
            }

            const orderItems = new Set(newSelection[orderId]);
            if (orderItems.has(lineItemId)) {
                orderItems.delete(lineItemId);
            } else {
                orderItems.add(lineItemId);
            }
            newSelection[orderId] = orderItems;
            return newSelection;
        });
    };

    const handleAvailabilityToggle = async (order: Order) => {
        if (!storeId || !user) return;

        const isCurrentlyAvailable = order.tags_confirmed?.includes('Available');
        const action = isCurrentlyAvailable ? 'remove' : 'add';

        setIsUpdatingAvailability(order.id);
        try {
            const idToken = await user.getIdToken();
            const response = await fetch('/api/shopify/orders/update-confirmed-orders-availability-tag', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`
                },
                body: JSON.stringify({
                    shop: storeId,
                    orderId: order.id,
                    tag: 'Available',
                    action,
                }),
            });

            const result = await response.json();
            if (!response.ok) throw new Error(result.details || 'Failed to update availability');

            // Refetch orders after update
            refetchOrders();

            setItemSelection(prev => {
                const newState = { ...prev };
                delete newState[order.id];
                return newState;
            });
        } catch (error) {
            console.error('Availability update error:', error);
        } finally {
            setIsUpdatingAvailability(null);
        }
    };

    // ============================================================
    // EFFECTS
    // ============================================================

    useEffect(() => {
        document.title = "Dashboard - Orders";
    }, []);

    useEffect(() => {
        const savedRowsPerPage = localStorage.getItem('rowsPerPage');
        if (savedRowsPerPage) {
            setRowsPerPage(Number(savedRowsPerPage));
        }
    }, []);

    useEffect(() => {
        setCurrentPage(1);
        setSelectedOrders([]);
    }, [activeTab, dateRange, courierFilter, availabilityFilter, rtoInTransitFilter]);

    useEffect(() => {
        setCurrentPage(1);
    }, [rowsPerPage]);

    // ============================================================
    // PAGINATION
    // ============================================================

    const totalPages = Math.ceil(totalFilteredCount / rowsPerPage);

    const handleNextPage = () => {
        if (currentPage < totalPages) setCurrentPage(currentPage + 1);
    };

    const handlePreviousPage = () => {
        if (currentPage > 1) setCurrentPage(currentPage - 1);
    };

    const handleSetRowsPerPage = (value: string) => {
        const numValue = Number(value);
        setRowsPerPage(numValue);
        setCurrentPage(1);
        localStorage.setItem('rowsPerPage', value);
    };

    // ============================================================
    // SELECTION
    // ============================================================

    const handleSelectOrder = (orderId: string) => {
        setSelectedOrders(prev =>
            prev.includes(orderId) ? prev.filter(id => id !== orderId) : [...prev, orderId]
        );
    };

    const handleSelectAll = (isChecked: boolean) => {
        const currentPageIds = orders.map(o => o.id);
        if (isChecked) {
            setSelectedOrders(prev => Array.from(new Set([...prev, ...currentPageIds])));
        } else {
            setSelectedOrders(prev => prev.filter(id => !currentPageIds.includes(id)));
        }
    };

    const areAllOnPageSelected = orders.length > 0 && orders.every(o => selectedOrders.includes(o.id));

    // ============================================================
    // SORTING
    // ============================================================

    const handleSort = (key: SortKey) => {
        if (sortKey === key) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            setSortKey(key);
            setSortDirection('asc');
        }
    };

    // ============================================================
    // BADGE VARIANTS
    // ============================================================

    const getFulfillmentBadgeVariant = (status: string | null) => {
        switch (status?.toLowerCase()) {
            case 'fulfilled':
                return 'default';
            case 'unfulfilled':
            case 'partial':
                return 'secondary';
            case 'restocked':
                return 'outline';
            default:
                return 'destructive';
        }
    };

    const getPaymentBadgeVariant = (status: string | null) => {
        switch (status?.toLowerCase()) {
            case 'paid':
                return 'default';
            case 'pending':
                return 'secondary';
            case 'refunded':
            case 'partially_refunded':
                return 'outline';
            case 'voided':
                return 'destructive';
            default:
                return 'secondary';
        }
    };

    const getStatusBadgeVariant = (status: CustomStatus | string | null): "default" | "secondary" | "destructive" | "outline" | "success" => {
        switch (status) {
            case 'New':
            case 'Confirmed':
            case 'Ready To Dispatch':
            case 'Pending Refunds':
                return 'secondary';
            case 'Dispatched':
            case 'In Transit':
            case 'Out For Delivery':
            case 'RTO In Transit':
            case 'DTO Requested':
            case 'Cancellation Requested':
            case 'DTO Booked':
            case 'DTO In Transit':
                return 'default';
            case 'Delivered':
            case 'RTO Delivered':
            case 'DTO Delivered':
                return 'success';
            case 'Lost':
            case 'Cancelled':
                return 'destructive';
            case 'Closed':
            case 'RTO Closed':
                return 'outline';
            default:
                return 'secondary';
        }
    };

    // ============================================================
    // ACTION ITEMS
    // ============================================================

    const renderActionItems = (order: Order) => {
        const isShopifyCancelled = !!order.raw?.cancelled_at;
        if (isShopifyCancelled) {
            return (
                <DropdownMenuItem disabled>Order Cancelled on Shopify</DropdownMenuItem>
            );
        }

        switch (order.customStatus) {
            case 'New':
                return (
                    <>
                        <DropdownMenuItem onClick={() => handleUpdateStatus(order.id, 'Confirmed')}>
                            Confirm
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleOrderSplit(order.id)}>
                            Split this order
                        </DropdownMenuItem>
                    </>
                );
            case 'Confirmed':
                return (
                    <>
                        <DropdownMenuItem onClick={(e) => {
                            e.stopPropagation();
                            setSelectedOrders([order.id]);
                            handleAssignAwbClick();
                        }}>
                            Assign AWB
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleOrderSplit(order.id)}>
                            Split this order
                        </DropdownMenuItem>
                    </>
                );
            case 'Ready To Dispatch':
                return (
                    <>
                        <DropdownMenuItem onClick={() => handleRevertStatus(order.id, 'Confirmed')}>
                            Back to Confirmed
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDispatch([order.id])}>
                            Dispatch
                        </DropdownMenuItem>
                    </>
                );
            case 'Dispatched':
            case 'In Transit':
            case 'RTO In Transit':
            case 'Out For Delivery':
            case 'DTO In Transit':
                return null;
            case 'Delivered':
            case 'DTO Requested':
                return (
                    <>
                        <DropdownMenuItem onClick={() => {
                            setOrderForReturn(order);
                            setIsReturnDialogOpen(true);
                        }}>
                            Book Return
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleRevertStatus(order.id, 'Delivered')}>
                            Back to Delivered
                        </DropdownMenuItem>
                    </>
                );
            case 'DTO Booked':
                return (
                    <>
                        <DropdownMenuItem onClick={() => handleRevertStatus(order.id, 'Delivered')}>
                            Back to Delivered
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleUpdateStatus(order.id, 'Closed')}>
                            Close Order
                        </DropdownMenuItem>
                    </>
                );
            case 'DTO Delivered':
                return (
                    <DropdownMenuItem onClick={() => {
                        setOrderForQc(order);
                        setIsQcDialogOpen(true);
                    }}>
                        Start QC
                    </DropdownMenuItem>
                );
            case 'RTO Delivered':
                return (
                    <DropdownMenuItem onClick={() => handleUpdateStatus(order.id, 'RTO Closed')}>
                        RTO Close Order
                    </DropdownMenuItem>
                );
            case 'Lost':
                return null;
            case 'Closed':
                return (
                    <DropdownMenuItem onClick={() => handleRevertStatus(order.id, 'Delivered')}>
                        Undo Closed
                    </DropdownMenuItem>
                );
            case 'RTO Closed':
            case 'Cancellation Requested':
            case 'Cancelled':
            default:
                return null;
        }
    };

    // ============================================================
    // BULK ACTION BUTTONS
    // ============================================================

    const shippedStatuses: (CustomStatus | 'All Orders')[] = [
        'Dispatched', 'In Transit', 'Out For Delivery', 'RTO In Transit', 'DTO Booked', 'DTO In Transit'
    ];

    const renderBulkActionButtons = () => {
        const isAnyOrderSelected = selectedOrders.length > 0;
        const isDisabled = !isAnyOrderSelected;
        const showUpdateShippedButton = shippedStatuses.includes(activeTab);

        // Check if any mutation is loading
        const isMutating =
            updateStatus.isPending ||
            bulkUpdate.isPending ||
            dispatchOrders.isPending ||
            downloadSlips.isPending ||
            downloadExcel.isPending ||
            downloadProductsExcel.isPending ||
            updateShippedStatuses.isPending;

        return (
            <div className="flex items-center gap-2 flex-wrap justify-end">
                {showUpdateShippedButton && (
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleUpdateShippedStatuses}
                        disabled={isDisabled || isMutating}
                    >
                        {updateShippedStatuses.isPending ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : null}
                        Update {selectedOrders.length > 0 ? `(${selectedOrders.length})` : ''} Shipped Statuses
                    </Button>
                )}

                {(() => {
                    switch (activeTab) {
                        case 'All Orders':
                            return (
                                <Button variant="outline" size="sm" disabled={isDisabled || isMutating} onClick={handleDownloadExcel}>
                                    {downloadExcel.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                                    {downloadExcel.isPending ? 'Downloading...' : `Download Excel ${selectedOrders.length > 0 ? `(${selectedOrders.length})` : ''}`}
                                </Button>
                            );
                        case 'New':
                            return (
                                <>
                                    <Button variant="outline" size="sm" disabled={isDisabled || isMutating} onClick={handleDownloadExcel}>
                                        {downloadExcel.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                                        {downloadExcel.isPending ? 'Downloading...' : `Download Excel ${selectedOrders.length > 0 ? `(${selectedOrders.length})` : ''}`}
                                    </Button>
                                    <Button variant="outline" size="sm" disabled={isDisabled || isMutating} onClick={() => handleBulkUpdateStatus('Confirmed')}>
                                        {bulkUpdate.isPending ? 'Confirming...' : 'Confirm'}
                                    </Button>
                                </>
                            );
                        case 'Confirmed':
                            return (
                                <>
                                    <Button variant="outline" size="sm" onClick={() => setIsAvailabilityDialogOpen(true)}>
                                        Perform Items availability
                                    </Button>
                                    <Button variant="outline" size="sm" disabled={isDisabled} onClick={() => setIsGeneratePODialogOpen(true)}>
                                        Generate Purchase Order
                                    </Button>
                                    <Button variant="outline" size="sm" disabled={isDisabled || isMutating} onClick={handleDownloadExcel}>
                                        {downloadExcel.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                                        {downloadExcel.isPending ? 'Downloading...' : `Download Excel ${selectedOrders.length > 0 ? `(${selectedOrders.length})` : ''}`}
                                    </Button>
                                    <Button variant="outline" size="sm" disabled={isDisabled || isMutating} onClick={handleDownloadProductsExcel}>
                                        {downloadProductsExcel.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                                        {downloadProductsExcel.isPending ? 'Downloading...' : `Download Products Excel ${selectedOrders.length > 0 ? `(${selectedOrders.length})` : ''}`}
                                    </Button>
                                    <Button variant="outline" size="sm" disabled={isDisabled} onClick={handleAssignAwbClick}>
                                        Assign AWBs
                                    </Button>
                                </>
                            );
                        case 'Ready To Dispatch':
                            return (
                                <>
                                    <Button variant="outline" size="sm" onClick={() => {
                                        setIsAwbBulkSelectOpen(true);
                                        setAwbBulkSelectStatus("Ready To Dispatch");
                                    }}>
                                        <ScanBarcode className="mr-2 h-4 w-4" />
                                        AWB Bulk Selection
                                    </Button>
                                    <Button variant="outline" size="sm" disabled={isDisabled} onClick={() => setIsGeneratePODialogOpen(true)}>
                                        Generate Purchase Order
                                    </Button>
                                    <Button variant="outline" size="sm" disabled={isDisabled || isMutating} onClick={handleDownloadExcel}>
                                        {downloadExcel.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                                        {downloadExcel.isPending ? 'Downloading...' : `Download Excel ${selectedOrders.length > 0 ? `(${selectedOrders.length})` : ''}`}
                                    </Button>
                                    <Button variant="outline" size="sm" disabled={isDisabled || isMutating} onClick={handleDownloadSlips}>
                                        {downloadSlips.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                                        {downloadSlips.isPending ? 'Downloading...' : `Download Slips ${selectedOrders.length > 0 ? `(${selectedOrders.length})` : ''}`}
                                    </Button>
                                    <Button variant="outline" size="sm" disabled={isDisabled || isMutating} onClick={() => handleBulkUpdateStatus('Dispatched')}>
                                        {dispatchOrders.isPending ? 'Dispatching...' : `Dispatch ${selectedOrders.length > 0 ? `(${selectedOrders.length})` : ''}`}
                                    </Button>
                                </>
                            );
                        case 'Delivered':
                            return (
                                <Button variant="outline" size="sm" disabled={isDisabled || isMutating} onClick={() => handleBulkUpdateStatus('Closed')}>
                                    {bulkUpdate.isPending ? 'Closing...' : `Close Orders ${selectedOrders.length > 0 ? `(${selectedOrders.length})` : ''}`}
                                </Button>
                            );
                        case 'RTO Delivered':
                            return (
                                <>
                                    <Button variant="outline" size="sm" onClick={() => {
                                        setIsAwbBulkSelectOpen(true);
                                        setAwbBulkSelectStatus("RTO Delivered");
                                    }}>
                                        <ScanBarcode className="mr-2 h-4 w-4" />
                                        AWB Bulk Selection
                                    </Button>
                                    <Button variant="outline" size="sm" disabled={isDisabled || isMutating} onClick={handleDownloadExcel}>
                                        {downloadExcel.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                                        {downloadExcel.isPending ? 'Downloading...' : `Download Excel ${selectedOrders.length > 0 ? `(${selectedOrders.length})` : ''}`}
                                    </Button>
                                    <Button variant="outline" size="sm" disabled={isDisabled || isMutating} onClick={() => handleBulkUpdateStatus('RTO Closed')}>
                                        {bulkUpdate.isPending ? 'RTO Closing...' : 'RTO Close'}
                                    </Button>
                                </>
                            );
                        case 'DTO Requested':
                            return (
                                <>
                                    <Button variant="outline" size="sm" disabled={isDisabled || isMutating} onClick={() => handleBulkUpdateStatus('DTO Requested')}>
                                        {bookReturn.isPending ? 'Booking returns...' : `Book ${selectedOrders.length > 0 ? `(${selectedOrders.length})` : ''} Returns`}
                                    </Button>
                                    <Button variant="outline" size="sm" disabled={isDisabled || isMutating} onClick={handleDownloadExcel}>
                                        {downloadExcel.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                                        {downloadExcel.isPending ? 'Downloading...' : `Download Excel ${selectedOrders.length > 0 ? `(${selectedOrders.length})` : ''}`}
                                    </Button>
                                </>
                            );
                        case 'Cancelled':
                            return null;
                        case 'Dispatched':
                        case 'In Transit':
                        case 'Out For Delivery':
                        case 'RTO In Transit':
                        case 'DTO Booked':
                        case 'DTO In Transit':
                        case 'DTO Delivered':
                        case 'Pending Refunds':
                        case 'Lost':
                        case 'Closed':
                        case 'RTO Closed':
                        case 'Cancellation Requested':
                            return (
                                <Button variant="outline" size="sm" disabled={isDisabled || isMutating} onClick={handleDownloadExcel}>
                                    {downloadExcel.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                                    {downloadExcel.isPending ? 'Downloading...' : `Download Excel ${selectedOrders.length > 0 ? `(${selectedOrders.length})` : ''}`}
                                </Button>
                            );
                        default:
                    }
                })()}
            </div>
        );
    };

    // ============================================================
    // LOADING & AUTH CHECKS
    // ============================================================

    // if (authLoading) {
    //     return (
    //         <div className="flex items-center justify-center h-screen">
    //             <div className="text-lg">Loading...</div>
    //         </div>
    //     );
    // }

    if (!isAuthorized) {
        return null;
    }

    // ============================================================
    // RENDER
    // ============================================================

    return (
        <>
            <main className="flex flex-col h-full">
                {/* Background sync indicator */}
                {isFetching && !isLoading && (
                    <div className="fixed top-4 right-4 bg-blue-500 text-white px-3 py-1 rounded-md text-sm z-50 flex items-center gap-2">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Syncing...
                    </div>
                )}

                <div className="flex flex-col flex-1 min-h-0">
                    <CardHeader className="border-b p-4 md:p-6 shrink-0">
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                            <div>
                                <CardTitle>Your Orders</CardTitle>
                            </div>
                            <div className="flex items-center gap-2 flex-wrap justify-end">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => refetchOrders()}
                                    disabled={isFetching}
                                >
                                    {isFetching ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            Refreshing...
                                        </>
                                    ) : (
                                        'Refresh'
                                    )}
                                </Button>
                                {renderBulkActionButtons()}
                            </div>
                        </div>
                        <div className="mt-4 flex flex-col md:flex-row items-center gap-4">
                            <div className="flex items-center gap-2 flex-1 md:flex-none">
                                <Input
                                    placeholder="Search by order, customer, AWB..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full md:w-80"
                                />
                                <div className="flex items-center space-x-2">
                                    <Switch id="invert-search" checked={invertSearch} onCheckedChange={setInvertSearch} />
                                    <Label htmlFor="invert-search">Invert</Label>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Button
                                            id="date"
                                            variant={"outline"}
                                            className={cn(
                                                "w-[240px] justify-start text-left font-normal",
                                                !dateRange && "text-muted-foreground"
                                            )}
                                        >
                                            <Clock className="mr-2 h-4 w-4" />
                                            {dateRange?.from ? (
                                                dateRange.to ? (
                                                    <>
                                                        {format(dateRange.from, "LLL dd, y")} -{" "}
                                                        {format(dateRange.to, "LLL dd, y")}
                                                    </>
                                                ) : (
                                                    format(dateRange.from, "LLL dd, y")
                                                )
                                            ) : (
                                                <span>Pick a date range</span>
                                            )}
                                        </Button>
                                    </PopoverTrigger>
                                    {dateRange && (
                                        <Button variant="ghost" size="icon" onClick={() => setDateRange(undefined)} className="h-9 w-9">
                                            <X className="h-4 w-4" />
                                        </Button>
                                    )}
                                    <PopoverContent className="w-auto p-0" align="start">
                                        <Calendar
                                            initialFocus
                                            mode="range"
                                            defaultMonth={dateRange?.from}
                                            selected={dateRange}
                                            onSelect={setDateRange}
                                            numberOfMonths={2}
                                        />
                                    </PopoverContent>
                                </Popover>
                            </div>
                            {!['New', 'Confirmed', 'Cancelled'].includes(activeTab) && (
                                <Select value={courierFilter} onValueChange={setCourierFilter}>
                                    <SelectTrigger className="w-full md:w-[180px]">
                                        <SelectValue placeholder="Filter by courier..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All Couriers</SelectItem>
                                        <SelectItem value="Delhivery">Delhivery</SelectItem>
                                        <SelectItem value="Shiprocket">Shiprocket</SelectItem>
                                        <SelectItem value="Xpressbees">Xpressbees</SelectItem>
                                    </SelectContent>
                                </Select>
                            )}
                            {activeTab === 'Confirmed' && (
                                <Select value={availabilityFilter} onValueChange={(value) => setAvailabilityFilter(value as any)}>
                                    <SelectTrigger className="w-full md:w-[180px]">
                                        <SelectValue placeholder="Filter by availability..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">
                                            All Items ({(availabilityCounts?.pending || 0) + (availabilityCounts?.available || 0) + (availabilityCounts?.unavailable || 0)})
                                        </SelectItem>
                                        <SelectItem value="pending">Pending ({availabilityCounts?.pending || 0})</SelectItem>
                                        <SelectItem value="available">Available ({availabilityCounts?.available || 0})</SelectItem>
                                        <SelectItem value="unavailable">Unavailable ({availabilityCounts?.unavailable || 0})</SelectItem>
                                    </SelectContent>
                                </Select>
                            )}
                            {activeTab === 'RTO In Transit' && (
                                <Select value={rtoInTransitFilter} onValueChange={(value) => setRtoInTransitFilter(value as any)}>
                                    <SelectTrigger className="w-full md:w-[180px]">
                                        <SelectValue placeholder="Filter by status..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">
                                            All ({(rtoInTransitCounts?.reAttempt || 0) + (rtoInTransitCounts?.refused || 0) + (rtoInTransitCounts?.noReply || 0)})
                                        </SelectItem>
                                        <SelectItem value="re-attempt">Re-attempt ({rtoInTransitCounts?.reAttempt || 0})</SelectItem>
                                        <SelectItem value="refused">Refused ({rtoInTransitCounts?.refused || 0})</SelectItem>
                                        <SelectItem value="no-reply">No Reply ({rtoInTransitCounts?.noReply || 0})</SelectItem>
                                    </SelectContent>
                                </Select>
                            )}
                        </div>
                    </CardHeader>

                    <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as CustomStatus | 'All Orders')} className="flex flex-col flex-1 min-h-0">
                        <div className="border-b border-gray-200 shrink-0 bg-white shadow-sm">
                            <div className="overflow-x-auto px-2 sm:px-4 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100">
                                <TabsList className="inline-flex h-auto rounded-none bg-transparent p-0 gap-0 min-w-max">
                                    <TabsTrigger value="All Orders" className="outline-none flex-shrink-0 whitespace-nowrap rounded-none border-b-2 border-transparent bg-transparent px-3 sm:px-4 py-3 text-sm font-semibold text-gray-500 shadow-none transition-all duration-200 ease-in-out hover:text-gray-700 hover:bg-gray-50 data-[state=active]:border-primary data-[state=active]:bg-primary/10 data-[state=active]:shadow-none">
                                        All ({statusCounts?.['All Orders'] || 0})
                                    </TabsTrigger>
                                    <TabsTrigger value="New" className="outline-none flex-shrink-0 whitespace-nowrap rounded-none border-b-2 border-transparent bg-transparent px-3 sm:px-4 py-3 text-sm font-semibold text-gray-500 shadow-none transition-all duration-200 ease-in-out hover:text-gray-700 hover:bg-gray-50 data-[state=active]:border-primary data-[state=active]:bg-primary/10 data-[state=active]:shadow-none">
                                        New ({statusCounts?.['New'] || 0})
                                    </TabsTrigger>
                                    <TabsTrigger value="Confirmed" className="outline-none flex-shrink-0 whitespace-nowrap rounded-none border-b-2 border-transparent bg-transparent px-3 sm:px-4 py-3 text-sm font-semibold text-gray-500 shadow-none transition-all duration-200 ease-in-out hover:text-gray-700 hover:bg-gray-50 data-[state=active]:border-primary data-[state=active]:bg-primary/10 data-[state=active]:shadow-none">
                                        Confirmed ({statusCounts?.['Confirmed'] || 0})
                                    </TabsTrigger>
                                    <TabsTrigger value="Ready To Dispatch" className="outline-none flex-shrink-0 whitespace-nowrap rounded-none border-b-2 border-transparent bg-transparent px-3 sm:px-4 py-3 text-sm font-semibold text-gray-500 shadow-none transition-all duration-200 ease-in-out hover:text-gray-700 hover:bg-gray-50 data-[state=active]:border-primary data-[state=active]:bg-primary/10 data-[state=active]:shadow-none">
                                        Ready To Dispatch ({statusCounts?.['Ready To Dispatch'] || 0})
                                    </TabsTrigger>
                                    <TabsTrigger value="Dispatched" className="outline-none flex-shrink-0 whitespace-nowrap rounded-none border-b-2 border-transparent bg-transparent px-3 sm:px-4 py-3 text-sm font-semibold text-gray-500 shadow-none transition-all duration-200 ease-in-out hover:text-gray-700 hover:bg-gray-50 data-[state=active]:border-primary data-[state=active]:bg-primary/10 data-[state=active]:shadow-none">
                                        Dispatched ({statusCounts?.['Dispatched'] || 0})
                                    </TabsTrigger>
                                    <TabsTrigger value="In Transit" className="outline-none flex-shrink-0 whitespace-nowrap rounded-none border-b-2 border-transparent bg-transparent px-3 sm:px-4 py-3 text-sm font-semibold text-gray-500 shadow-none transition-all duration-200 ease-in-out hover:text-gray-700 hover:bg-gray-50 data-[state=active]:border-primary data-[state=active]:bg-primary/10 data-[state=active]:shadow-none">
                                        In Transit ({statusCounts?.['In Transit'] || 0})
                                    </TabsTrigger>
                                    <TabsTrigger value="Out For Delivery" className="outline-none flex-shrink-0 whitespace-nowrap rounded-none border-b-2 border-transparent bg-transparent px-3 sm:px-4 py-3 text-sm font-semibold text-gray-500 shadow-none transition-all duration-200 ease-in-out hover:text-gray-700 hover:bg-gray-50 data-[state=active]:border-primary data-[state=active]:bg-primary/10 data-[state=active]:shadow-none">
                                        Out For Delivery ({statusCounts?.['Out For Delivery'] || 0})
                                    </TabsTrigger>
                                    <TabsTrigger value="Delivered" className="outline-none flex-shrink-0 whitespace-nowrap rounded-none border-b-2 border-transparent bg-transparent px-3 sm:px-4 py-3 text-sm font-semibold text-gray-500 shadow-none transition-all duration-200 ease-in-out hover:text-gray-700 hover:bg-gray-50 data-[state=active]:border-primary data-[state=active]:bg-primary/10 data-[state=active]:shadow-none">
                                        Delivered ({statusCounts?.['Delivered'] || 0})
                                    </TabsTrigger>
                                    <TabsTrigger value="RTO In Transit" className="outline-none flex-shrink-0 whitespace-nowrap rounded-none border-b-2 border-transparent bg-transparent px-3 sm:px-4 py-3 text-sm font-semibold text-gray-500 shadow-none transition-all duration-200 ease-in-out hover:text-gray-700 hover:bg-gray-50 data-[state=active]:border-primary data-[state=active]:bg-primary/10 data-[state=active]:shadow-none">
                                        RTO In Transit ({statusCounts?.['RTO In Transit'] || 0})
                                    </TabsTrigger>
                                    <TabsTrigger value="RTO Delivered" className="outline-none flex-shrink-0 whitespace-nowrap rounded-none border-b-2 border-transparent bg-transparent px-3 sm:px-4 py-3 text-sm font-semibold text-gray-500 shadow-none transition-all duration-200 ease-in-out hover:text-gray-700 hover:bg-gray-50 data-[state=active]:border-primary data-[state=active]:bg-primary/10 data-[state=active]:shadow-none">
                                        RTO Delivered ({statusCounts?.['RTO Delivered'] || 0})
                                    </TabsTrigger>
                                    <TabsTrigger value="DTO Requested" className="outline-none flex-shrink-0 whitespace-nowrap rounded-none border-b-2 border-transparent bg-transparent px-3 sm:px-4 py-3 text-sm font-semibold text-gray-500 shadow-none transition-all duration-200 ease-in-out hover:text-gray-700 hover:bg-gray-50 data-[state=active]:border-primary data-[state=active]:bg-primary/10 data-[state=active]:shadow-none">
                                        DTO Requested ({statusCounts?.['DTO Requested'] || 0})
                                    </TabsTrigger>
                                    <TabsTrigger value="DTO Booked" className="outline-none flex-shrink-0 whitespace-nowrap rounded-none border-b-2 border-transparent bg-transparent px-3 sm:px-4 py-3 text-sm font-semibold text-gray-500 shadow-none transition-all duration-200 ease-in-out hover:text-gray-700 hover:bg-gray-50 data-[state=active]:border-primary data-[state=active]:bg-primary/10 data-[state=active]:shadow-none">
                                        DTO Booked ({statusCounts?.['DTO Booked'] || 0})
                                    </TabsTrigger>
                                    <TabsTrigger value="DTO In Transit" className="outline-none flex-shrink-0 whitespace-nowrap rounded-none border-b-2 border-transparent bg-transparent px-3 sm:px-4 py-3 text-sm font-semibold text-gray-500 shadow-none transition-all duration-200 ease-in-out hover:text-gray-700 hover:bg-gray-50 data-[state=active]:border-primary data-[state=active]:bg-primary/10 data-[state=active]:shadow-none">
                                        DTO In Transit ({statusCounts?.['DTO In Transit'] || 0})
                                    </TabsTrigger>
                                    <TabsTrigger value="DTO Delivered" className="outline-none flex-shrink-0 whitespace-nowrap rounded-none border-b-2 border-transparent bg-transparent px-3 sm:px-4 py-3 text-sm font-semibold text-gray-500 shadow-none transition-all duration-200 ease-in-out hover:text-gray-700 hover:bg-gray-50 data-[state=active]:border-primary data-[state=active]:bg-primary/10 data-[state=active]:shadow-none">
                                        DTO Delivered ({statusCounts?.['DTO Delivered'] || 0})
                                    </TabsTrigger>
                                    <TabsTrigger value="Pending Refunds" className="outline-none flex-shrink-0 whitespace-nowrap rounded-none border-b-2 border-transparent bg-transparent px-3 sm:px-4 py-3 text-sm font-semibold text-gray-500 shadow-none transition-all duration-200 ease-in-out hover:text-gray-700 hover:bg-gray-50 data-[state=active]:border-primary data-[state=active]:bg-primary/10 data-[state=active]:shadow-none">
                                        Pending Refunds ({statusCounts?.['Pending Refunds'] || 0})
                                    </TabsTrigger>
                                    <TabsTrigger value="Lost" className="outline-none flex-shrink-0 whitespace-nowrap rounded-none border-b-2 border-transparent bg-transparent px-3 sm:px-4 py-3 text-sm font-semibold text-gray-500 shadow-none transition-all duration-200 ease-in-out hover:text-gray-700 hover:bg-gray-50 data-[state=active]:border-primary data-[state=active]:bg-primary/10 data-[state=active]:shadow-none">
                                        Lost ({statusCounts?.['Lost'] || 0})
                                    </TabsTrigger>
                                    <TabsTrigger value="Closed" className="outline-none flex-shrink-0 whitespace-nowrap rounded-none border-b-2 border-transparent bg-transparent px-3 sm:px-4 py-3 text-sm font-semibold text-gray-500 shadow-none transition-all duration-200 ease-in-out hover:text-gray-700 hover:bg-gray-50 data-[state=active]:border-primary data-[state=active]:bg-primary/10 data-[state=active]:shadow-none">
                                        Closed ({statusCounts?.['Closed'] || 0})
                                    </TabsTrigger>
                                    <TabsTrigger value="RTO Closed" className="outline-none flex-shrink-0 whitespace-nowrap rounded-none border-b-2 border-transparent bg-transparent px-3 sm:px-4 py-3 text-sm font-semibold text-gray-500 shadow-none transition-all duration-200 ease-in-out hover:text-gray-700 hover:bg-gray-50 data-[state=active]:border-primary data-[state=active]:bg-primary/10 data-[state=active]:shadow-none">
                                        RTO Closed ({statusCounts?.['RTO Closed'] || 0})
                                    </TabsTrigger>
                                    <TabsTrigger value="Cancellation Requested" className="outline-none flex-shrink-0 whitespace-nowrap rounded-none border-b-2 border-transparent bg-transparent px-3 sm:px-4 py-3 text-sm font-semibold text-gray-500 shadow-none transition-all duration-200 ease-in-out hover:text-gray-700 hover:bg-gray-50 data-[state=active]:border-primary data-[state=active]:bg-primary/10 data-[state=active]:shadow-none">
                                        Cancellation Requested ({statusCounts?.['Cancellation Requested'] || 0})
                                    </TabsTrigger>
                                    <TabsTrigger value="Cancelled" className="outline-none flex-shrink-0 whitespace-nowrap rounded-none border-b-2 border-transparent bg-transparent px-3 sm:px-4 py-3 text-sm font-semibold text-gray-500 shadow-none transition-all duration-200 ease-in-out hover:text-gray-700 hover:bg-gray-50 data-[state=active]:border-primary data-[state=active]:bg-primary/10 data-[state=active]:shadow-none">
                                        Cancelled ({statusCounts?.['Cancelled'] || 0})
                                    </TabsTrigger>
                                </TabsList>
                            </div>
                        </div>

                        <div className="relative flex-1 overflow-y-auto">
                            <Table>
                                <TableHeader className="sticky top-0 bg-card z-10">
                                    <TableRow>
                                        <TableHead className="w-[50px] px-5">
                                            <Checkbox
                                                checked={areAllOnPageSelected}
                                                onCheckedChange={(checked) => handleSelectAll(!!checked)}
                                                aria-label="Select all"
                                            />
                                        </TableHead>
                                        <TableHead>
                                            <Button variant="ghost" onClick={() => handleSort('name')} className="px-1">
                                                Order ID
                                                <ArrowUpDown className="ml-2 h-4 w-4" />
                                            </Button>
                                        </TableHead>
                                        <TableHead>Date</TableHead>
                                        {activeTab === 'All Orders' && (
                                            <TableHead className="font-medium text-muted-foreground">Current Status</TableHead>
                                        )}
                                        {!['All Orders', 'New', 'Confirmed', 'Cancelled'].includes(activeTab) && (
                                            <TableHead className="font-medium text-muted-foreground">AWB</TableHead>
                                        )}
                                        {['DTO Booked', 'DTO In Transit', 'DTO Delivered', 'Pending Refunds'].includes(activeTab) && (
                                            <TableHead className="font-medium text-muted-foreground">Return AWB</TableHead>
                                        )}
                                        <TableHead className="font-medium text-muted-foreground">Customer</TableHead>
                                        <TableHead className="text-right font-medium text-muted-foreground">Total</TableHead>
                                        <TableHead className="text-right font-medium text-muted-foreground">Outstanding</TableHead>
                                        <TableHead className="font-medium text-muted-foreground">Payment Status</TableHead>
                                        <TableHead className="font-medium text-muted-foreground">Fulfillment Status</TableHead>
                                        <TableHead className="font-medium text-muted-foreground">Items</TableHead>
                                        <TableHead>
                                            <span className="sr-only">Actions</span>
                                        </TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {authLoading || isLoading ? (
                                        Array.from({ length: rowsPerPage }).map((_, i) => (
                                            <TableRow key={i}>
                                                <TableCell className="py-2 px-5"><Skeleton className="h-5 w-5" /></TableCell>
                                                <TableCell className="py-2"><Skeleton className="h-5 w-20" /></TableCell>
                                                <TableCell className="py-2"><Skeleton className="h-5 w-24" /></TableCell>
                                                {activeTab === 'All Orders' && <TableCell className="py-2"><Skeleton className="h-5 w-24" /></TableCell>}
                                                {!['All Orders', 'New', 'Confirmed', 'Cancelled'].includes(activeTab) && (
                                                    <TableCell className="py-2"><Skeleton className="h-5 w-24" /></TableCell>
                                                )}
                                                {['DTO Booked', 'DTO In Transit', 'DTO Delivered', 'Pending Refunds'].includes(activeTab) && (
                                                    <TableCell className="py-2"><Skeleton className="h-5 w-24" /></TableCell>
                                                )}
                                                <TableCell className="py-2"><Skeleton className="h-5 w-32" /></TableCell>
                                                <TableCell className="text-right py-2"><Skeleton className="h-5 w-16 ml-auto" /></TableCell>
                                                <TableCell className="text-right py-2"><Skeleton className="h-5 w-16 ml-auto" /></TableCell>
                                                <TableCell className="py-2"><Skeleton className="h-6 w-24" /></TableCell>
                                                <TableCell className="py-2"><Skeleton className="h-6 w-24" /></TableCell>
                                                <TableCell className="py-2"><Skeleton className="h-5 w-10" /></TableCell>
                                                <TableCell className="py-2"><Skeleton className="h-8 w-8 ml-auto" /></TableCell>
                                            </TableRow>
                                        ))
                                    ) : orders.length > 0 ? (
                                        orders.map((order) => {
                                            const customerName =
                                                (
                                                    order.raw.shipping_address?.name ??
                                                    order.raw.billing_address?.name ??
                                                    order.raw.customer?.name
                                                ) ||
                                                `${order.raw.shipping_address?.first_name || ''} ${order.raw.shipping_address?.last_name || ''}`.trim() ||
                                                `${order.raw.billing_address?.first_name || ''} ${order.raw.billing_address?.last_name || ''}`.trim() ||
                                                `${order.raw.customer?.first_name || ''} ${order.raw.customer?.last_name || ''}`.trim() ||
                                                "";

                                            return (
                                                <TableRow
                                                    key={order.id}
                                                    data-state={selectedOrders.includes(order.id) && "selected"}
                                                    onClick={() => setViewingOrder(order)}
                                                    className="cursor-pointer"
                                                >
                                                    <TableCell onClick={(e) => e.stopPropagation()} className="py-2 px-5">
                                                        <Checkbox
                                                            checked={selectedOrders.includes(order.id)}
                                                            onCheckedChange={() => handleSelectOrder(order.id)}
                                                            aria-label={`Select order ${order.name}`}
                                                        />
                                                    </TableCell>
                                                    <TableCell className="font-medium text-sm md:text-base py-2">{order.name}</TableCell>
                                                    <TableCell className="text-xs md:text-sm py-2">{new Date(order.createdAt).toLocaleDateString()}</TableCell>
                                                    {activeTab === 'All Orders' && (
                                                        <TableCell className="py-2">
                                                            <Badge variant={getStatusBadgeVariant(order.customStatus)} className="capitalize text-xs">
                                                                {order.customStatus}
                                                            </Badge>
                                                        </TableCell>
                                                    )}
                                                    {!['All Orders', 'New', 'Confirmed', 'Cancelled'].includes(activeTab) && (
                                                        <TableCell className="text-xs md:text-sm py-2">{order.awb || 'N/A'}</TableCell>
                                                    )}
                                                    {activeTab.includes('DTO') && activeTab !== 'DTO Requested' && (
                                                        <TableCell className="text-xs md:text-sm py-2">{order.awb_reverse || 'N/A'}</TableCell>
                                                    )}
                                                    <TableCell className="text-xs md:text-sm">{customerName || order.email}</TableCell>
                                                    <TableCell className="text-right text-xs md:text-sm font-mono">
                                                        {new Intl.NumberFormat('en-US', { style: 'currency', currency: order.currency }).format(order.totalPrice)}
                                                    </TableCell>
                                                    <TableCell className="text-right text-xs md:text-sm font-mono">
                                                        {new Intl.NumberFormat('en-US', { style: 'currency', currency: order.currency }).format(Number(order.raw.total_outstanding) || 0)}
                                                    </TableCell>
                                                    <TableCell className="py-2">
                                                        <Badge variant={getPaymentBadgeVariant(order.financialStatus)} className="capitalize text-xs">
                                                            {order.financialStatus?.replace('_', ' ') || 'N/A'}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="py-2">
                                                        <Badge variant={getFulfillmentBadgeVariant(order.fulfillmentStatus)} className="capitalize text-xs">
                                                            {order.fulfillmentStatus || 'unfulfilled'}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="text-xs md:text-sm" onClick={(e) => e.stopPropagation()}>
                                                        {activeTab === 'Confirmed' ? (
                                                            <Popover>
                                                                <PopoverTrigger asChild>
                                                                    <Button variant="outline" size="sm" className="h-8">
                                                                        {order.raw?.line_items?.length || 0} items
                                                                    </Button>
                                                                </PopoverTrigger>
                                                                <PopoverContent className="w-80">
                                                                    <div className="grid gap-4">
                                                                        <div className="space-y-2">
                                                                            <h4 className="font-medium leading-none">Items for Order {order.name}</h4>
                                                                            <p className="text-sm text-muted-foreground">Select items to make available.</p>
                                                                        </div>
                                                                        <div className="grid gap-2">
                                                                            {order.raw.line_items.map((item: any) => (
                                                                                <div key={item.id} className="flex items-center space-x-2 p-2 rounded-md hover:bg-muted">
                                                                                    <Checkbox
                                                                                        id={`item-${order.id}-${item.id}`}
                                                                                        checked={itemSelection[order.id]?.has(item.id)}
                                                                                        onCheckedChange={() => handleItemCheck(order.id, item.id)}
                                                                                    />
                                                                                    <Label htmlFor={`item-${order.id}-${item.id}`} className="flex-1 text-sm font-normal">
                                                                                        {item.title} (Qty: {item.quantity})
                                                                                    </Label>
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    </div>
                                                                </PopoverContent>
                                                            </Popover>
                                                        ) : (
                                                            order.raw?.line_items?.length || 0
                                                        )}
                                                    </TableCell>
                                                    <TableCell onClick={(e) => e.stopPropagation()} className="py-2">
                                                        <DropdownMenu>
                                                            <DropdownMenuTrigger asChild>
                                                                <Button aria-haspopup="true" size="icon" variant="ghost">
                                                                    <MoreHorizontal className="h-4 w-4" />
                                                                    <span className="sr-only">Toggle menu</span>
                                                                </Button>
                                                            </DropdownMenuTrigger>
                                                            <DropdownMenuContent align="end">
                                                                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                                                {renderActionItems(order)}
                                                            </DropdownMenuContent>
                                                        </DropdownMenu>
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })
                                    ) : (
                                        <TableRow>
                                            <TableCell colSpan={12} className="text-center h-24">
                                                {storeId ? `No ${typeof activeTab === 'string' ? activeTab.toLowerCase() : ''} orders found.` : 'Please connect a store to see your orders.'}
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </Tabs>

                    <CardFooter className="p-4 border-t shrink-0">
                        <div className="flex items-center justify-between w-full">
                            <div className="text-xs text-muted-foreground">
                                {selectedOrders.length > 0
                                    ? `${selectedOrders.length} of ${totalFilteredCount} order(s) selected.`
                                    : `Showing ${orders.length > 0 ? ((currentPage - 1) * rowsPerPage) + 1 : 0}-${Math.min(currentPage * rowsPerPage, totalFilteredCount)} of ${totalFilteredCount} orders`
                                }
                            </div>
                            <div className="flex items-center gap-4">
                                <div className="flex items-center gap-2">
                                    <span className="text-xs text-muted-foreground">Rows per page</span>
                                    <Select value={`${rowsPerPage}`} onValueChange={handleSetRowsPerPage}>
                                        <SelectTrigger className="h-8 w-[70px]">
                                            <SelectValue placeholder={rowsPerPage} />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {[10, 20, 30, 40, 50, 100, 200, 500, 1000].map((pageSize) => (
                                                <SelectItem key={pageSize} value={`${pageSize}`}>
                                                    {pageSize}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="flex gap-2">
                                    <Button variant="outline" size="sm" onClick={handlePreviousPage} disabled={currentPage === 1}>
                                        Previous
                                    </Button>
                                    <Button variant="outline" size="sm" onClick={handleNextPage} disabled={currentPage === totalPages || totalPages === 0}>
                                        Next
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </CardFooter>
                </div>
            </main>

            {/* Dialogs */}
            <AlertDialog open={isLowAwbAlertOpen} onOpenChange={setIsLowAwbAlertOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Not Enough AWBs</AlertDialogTitle>
                        <AlertDialogDescription>
                            You have selected {selectedOrders.length} orders but only have {unusedAwbsCount} unused AWBs available. Please fetch more to proceed.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>OK</AlertDialogCancel>
                        <AlertDialogAction onClick={() => {
                            setIsLowAwbAlertOpen(false);
                            setIsFetchAwbDialogOpen(true);
                        }}>
                            Fetch More AWBs
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <AwbBulkSelectionDialog
                isOpen={isAwbBulkSelectOpen}
                onClose={() => {
                    setIsAwbBulkSelectOpen(false);
                    setAwbBulkSelectStatus('');
                }}
                onConfirm={handleBulkSelectByAwb}
                customStatus={awbBulkSelectStatus}
            />

            <AssignAwbDialog
                isOpen={isAwbDialogOpen}
                onClose={() => setIsAwbDialogOpen(false)}
                orders={ordersForAwb}
                onConfirm={(courier, pickupName, shippingMode) => {
                    const ordersToProcess = orders.filter(o => selectedOrders.includes(o.id));
                    processAwbAssignments(ordersToProcess.map(o => ({ id: o.id, name: o.name })), courier, pickupName, shippingMode);
                    setSelectedOrders([]);
                }}
                shopId={storeId}
            />

            <GenerateAwbDialog
                isOpen={isFetchAwbDialogOpen}
                onClose={() => setIsFetchAwbDialogOpen(false)}
            />

            {orderForReturn && storeId && user && (
                <BookReturnDialog
                    isOpen={isReturnDialogOpen}
                    onClose={() => setIsReturnDialogOpen(false)}
                    order={orderForReturn}
                    shopId={storeId}
                    user={user}
                />
            )}

            {orderForQc && storeId && user && (
                <StartQcDialog
                    isOpen={isQcDialogOpen}
                    onClose={() => setIsQcDialogOpen(false)}
                    order={orderForQc}
                    shopId={storeId}
                    user={user}
                />
            )}

            {isAvailabilityDialogOpen && storeId && user && (
                <AvailabilityDialog
                    isOpen={isAvailabilityDialogOpen}
                    onClose={() => setIsAvailabilityDialogOpen(false)}
                    user={user}
                    shopId={storeId}
                    confirmedOrders={orders.filter(o => o.customStatus === 'Confirmed')}
                />
            )}

            {isGeneratePODialogOpen && storeId && user && (
                <GeneratePODialog
                    isOpen={isGeneratePODialogOpen}
                    onClose={() => setIsGeneratePODialogOpen(false)}
                    selectedOrders={orders.filter(o => selectedOrders.includes(o.id))}
                    shopId={storeId}
                    user={user}
                />
            )}

            <Dialog open={!!viewingOrder} onOpenChange={(isOpen) => !isOpen && setViewingOrder(null)}>
                <DialogContent className="max-w-4xl">
                    {viewingOrder && (
                        <>
                            <DialogHeader>
                                <DialogTitle>Order {viewingOrder.name}</DialogTitle>
                                <DialogDescription>
                                    Details and history for order placed on {new Date(viewingOrder.createdAt).toLocaleString()}.
                                </DialogDescription>
                            </DialogHeader>
                            <div className="grid md:grid-cols-2 gap-8 max-h-[70vh] overflow-y-auto p-1">
                                {/* Left side: Order Details */}
                                <div className="space-y-6">
                                    <h3 className="font-semibold text-lg">Order Details</h3>
                                    <div className="space-y-4">
                                        {(viewingOrder.awb || viewingOrder.courier || viewingOrder.awb_reverse) && (
                                            <div>
                                                <h4 className="font-semibold">Shipment Details</h4>
                                                <p className="text-sm text-muted-foreground">
                                                    {viewingOrder.courier && `Courier: ${viewingOrder.courier}`}
                                                </p>
                                                <p className="text-sm text-muted-foreground font-mono">
                                                    {viewingOrder.awb && `AWB: ${viewingOrder.awb}`}
                                                </p>
                                                {viewingOrder.awb_reverse && (
                                                    <p className="text-sm text-muted-foreground font-mono">
                                                        Return AWB: {viewingOrder.awb_reverse}
                                                        <br />
                                                        Return Courier: {viewingOrder.courier_reverse}
                                                    </p>
                                                )}
                                            </div>
                                        )}
                                        <div>
                                            <h4 className="font-semibold">Customer</h4>
                                            <p className="text-sm text-muted-foreground">
                                                {
                                                    (
                                                        viewingOrder.raw.shipping_address?.name ??
                                                        viewingOrder.raw.billing_address?.name ??
                                                        viewingOrder.raw.customer?.name
                                                    ) ||
                                                    `${viewingOrder.raw.shipping_address?.first_name || ''} ${viewingOrder.raw.shipping_address?.last_name || ''}`.trim() ||
                                                    `${viewingOrder.raw.billing_address?.first_name || ''} ${viewingOrder.raw.billing_address?.last_name || ''}`.trim() ||
                                                    `${viewingOrder.raw.customer?.first_name || ''} ${viewingOrder.raw.customer?.last_name || ''}`.trim() ||
                                                    viewingOrder.email ||
                                                    "Not provided"
                                                }
                                            </p>
                                            <p className="text-sm text-muted-foreground">{viewingOrder.email}</p>
                                        </div>
                                        <div>
                                            <h4 className="font-semibold">Shipping Address</h4>
                                            {viewingOrder.raw.shipping_address ? (
                                                <div className="text-sm text-muted-foreground">
                                                    <p>{viewingOrder.raw.shipping_address.address1}{viewingOrder.raw.shipping_address.address2}</p>
                                                    <p>{viewingOrder.raw.shipping_address.city}, {viewingOrder.raw.shipping_address.province} {viewingOrder.raw.shipping_address.zip}</p>
                                                    <p>{viewingOrder.raw.shipping_address.country}</p>
                                                    {viewingOrder.raw.shipping_address.phone && <p>Phone: {viewingOrder.raw.shipping_address.phone}</p>}
                                                </div>
                                            ) : (
                                                <p className="text-sm text-muted-foreground">No shipping address provided.</p>
                                            )}
                                        </div>
                                    </div>
                                    <Separator />
                                    <div>
                                        <h4 className="font-semibold mb-2">Items</h4>
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead>Product</TableHead>
                                                    <TableHead>SKU</TableHead>
                                                    <TableHead className="text-center">Qty</TableHead>
                                                    <TableHead className="text-right">Total</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {viewingOrder.raw.line_items.map((item: any, index: number) => (
                                                    <TableRow key={index}>
                                                        <TableCell className="font-medium">{item.name}</TableCell>
                                                        <TableCell>{item.sku || 'N/A'}</TableCell>
                                                        <TableCell className="text-center">{item.quantity}</TableCell>
                                                        <TableCell className="text-right font-mono">{new Intl.NumberFormat('en-US', { style: 'currency', currency: viewingOrder.currency }).format(item.price * item.quantity)}</TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </div>
                                    <Separator />
                                    <div className="flex justify-end items-center gap-4 text-lg font-bold">
                                        <span>Total:</span>
                                        <span className="font-mono">{new Intl.NumberFormat('en-US', { style: 'currency', currency: viewingOrder.currency }).format(viewingOrder.totalPrice)}</span>
                                    </div>
                                </div>

                                {/* Right side: Logs */}
                                <div className="space-y-6">
                                    <h3 className="font-semibold text-lg">History</h3>
                                    <div className="relative h-full">
                                        <div className="absolute inset-0 overflow-y-auto pr-4">
                                            <div className="space-y-6">
                                                {(viewingOrder.customStatusesLogs && viewingOrder.customStatusesLogs.length > 0) ? (
                                                    [...viewingOrder.customStatusesLogs].sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis()).map((log, index) => (
                                                        <div key={index} className="flex items-start gap-4">
                                                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted flex-shrink-0">
                                                                <Clock className='h-5 w-5' />
                                                            </div>
                                                            <div className="flex-1">
                                                                <div className="flex items-baseline gap-2">
                                                                    <p className="font-semibold text-sm">{log.status}</p>
                                                                    <p className="text-xs text-muted-foreground">on {log.createdAt?.toDate().toLocaleString()}</p>
                                                                </div>
                                                                <p className="text-sm text-muted-foreground mt-1">
                                                                    {log.remarks}
                                                                </p>
                                                            </div>
                                                        </div>
                                                    ))
                                                ) : (
                                                    <div className="text-center text-muted-foreground py-12">
                                                        <p>No logs were found for this order.</p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            {viewingOrder.courier && (viewingOrder.awb) && (
                                <div className="flex justify-end pt-4 border-t">
                                    <a
                                        href={(() => {
                                            const awb = viewingOrder.awb;
                                            if (viewingOrder.courier.toLowerCase() === 'delhivery') {
                                                return `https://www.delhivery.com/track-v2/package/${awb}`;
                                            } else if (viewingOrder.courier.toLowerCase().includes('shiprocket')) {
                                                return `https://shiprocket.co/tracking/${awb}`;
                                            } else if (viewingOrder.courier.toLowerCase().includes('xpressbees')) {
                                                return `https://www.xpressbees.com/shipment/tracking?awbNo=${awb}`;
                                            }
                                            return '#';
                                        })()}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2"
                                    >
                                        Track Forward Order
                                    </a>
                                </div>
                            )}
                        </>
                    )}
                </DialogContent>
            </Dialog>
        </>
    );
}