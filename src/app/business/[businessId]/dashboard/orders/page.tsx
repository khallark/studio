// /business/[businessId]/dashboard/orders/page.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
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
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
    SheetFooter,
} from '@/components/ui/sheet';
import {
    Download,
    MoreHorizontal,
    Loader2,
    Clock,
    X,
    Store,
    Filter,
    ChevronDown,
    Search,
    RefreshCw,
    FileSpreadsheet,
    ChevronLeft,
    ChevronRight,
    Package,
    MoreVertical,
    CalendarDays,
    Truck,
    BoxIcon,
    ShoppingBag,
    Shirt,
    AlignLeft,
    Video,
    ExternalLink,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import { AssignAwbDialog } from '@/components/assign-awb-dialog';
import { useProcessingQueue } from '@/contexts/processing-queue-context';
import { GenerateAwbDialog } from '@/components/generate-awb-dialog';
import { Input } from '@/components/ui/input';
import { format } from 'date-fns';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { AwbBulkSelectionDialog } from '@/components/awb-bulk-selection-dialog';
import { BookReturnDialog } from '@/components/book-return-dialog';
import { StartQcDialog } from '@/components/start-qc-dialog';
import { AvailabilityDialog } from '@/components/availability-dialog';
import { GeneratePODialog } from '@/components/generate-po-dialog';
import { RefundDialog } from '@/components/refund-dialog';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';

// ============================================================
// HOOKS & TYPES
// ============================================================
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
    useDownloadSlips,
    useDownloadExcel,
    useDownloadProductsExcel,
    useUpdateShippedStatuses,
    useDownloadManifest,
} from '@/hooks/use-order-mutations';
import { Order, CustomStatus } from '@/types/order';
import { useDebounce } from 'use-debounce';
import { toast } from '@/hooks/use-toast';
import { useBusinessContext } from '../../layout';
import { TaxReportDialog } from '@/components/tax-report-dialog';
import { PerformPickupDialog } from '@/components/perform-pickup-dialog';
import { useQueryClient } from '@tanstack/react-query';
import { SHARED_STORE_IDS, SUPER_ADMIN_ID } from '@/lib/shared-constants';
import { StartPackagingDialog } from '@/components/start-packaging-dialog';

// ============================================================
// STATUS TABS CONFIGURATION
// ============================================================

const STATUS_TABS: { value: CustomStatus | 'All Orders'; label: string; shortLabel: string }[] = [
    { value: 'All Orders', label: 'All Orders', shortLabel: 'All' },
    { value: 'New', label: 'New', shortLabel: 'New' },
    { value: 'Confirmed', label: 'Confirmed', shortLabel: 'Conf' },
    { value: 'Ready To Dispatch', label: 'Ready To Dispatch', shortLabel: 'RTD' },
    { value: 'Dispatched', label: 'Dispatched', shortLabel: 'Disp' },
    { value: 'In Transit', label: 'In Transit', shortLabel: 'Transit' },
    { value: 'Out For Delivery', label: 'Out For Delivery', shortLabel: 'OFD' },
    { value: 'Delivered', label: 'Delivered', shortLabel: 'Deliv' },
    { value: 'RTO In Transit', label: 'RTO In Transit', shortLabel: 'RTO-T' },
    { value: 'RTO Delivered', label: 'RTO Delivered', shortLabel: 'RTO-D' },
    { value: 'DTO Requested', label: 'DTO Requested', shortLabel: 'DTO-R' },
    { value: 'DTO Booked', label: 'DTO Booked', shortLabel: 'DTO-B' },
    { value: 'DTO In Transit', label: 'DTO In Transit', shortLabel: 'DTO-T' },
    { value: 'DTO Delivered', label: 'DTO Delivered', shortLabel: 'DTO-D' },
    { value: 'Pending Refunds', label: 'Pending Refunds', shortLabel: 'Refunds' },
    { value: 'DTO Refunded', label: 'DTO Refunded', shortLabel: 'Refunded' },
    { value: 'Lost', label: 'Lost', shortLabel: 'Lost' },
    { value: 'Closed', label: 'Closed', shortLabel: 'Closed' },
    { value: 'RTO Closed', label: 'RTO Closed', shortLabel: 'RTO-C' },
    { value: 'Cancellation Requested', label: 'Cancellation Requested', shortLabel: 'Cancel-R' },
    { value: 'Cancelled', label: 'Cancelled', shortLabel: 'Cancel' },
];

const MAX_STATUS_FILTER_SELECTIONS = 10;

const ORDER_STATUS_FILTER_TABS = STATUS_TABS.filter(
    (tab) => tab.value !== 'All Orders'
);

type SearchMode = 'forwardAwb' | 'orderNumber' | 'reverseAwb' | 'general';

type TabFilterState = {
    dateRange: { from?: Date; to?: Date } | undefined;
    courierFilter: 'all' | 'Blue Dart' | 'Delhivery' | 'Shiprocket' | 'Xpressbees';
    availabilityFilter: 'all' | 'eligible' | 'not eligible' | 'picked up' | 'unmapped' | 'available' | 'unavailable' | 'pending';
    rtoInTransitFilter: 'all' | 're-attempt' | 'refused';
    packedFilter: 'all' | 'packed' | 'unpacked';
    paymentTypeFilter: 'all' | 'prepaid' | 'cod';
    stateFilter: string;
    statusFilter: CustomStatus[];
    selectedStores: string[];
};

const getDefaultTabFilters = (): TabFilterState => ({
    dateRange: undefined,
    courierFilter: 'all',
    availabilityFilter: 'all',
    rtoInTransitFilter: 'all',
    packedFilter: 'all',
    paymentTypeFilter: 'all',
    stateFilter: 'all',
    statusFilter: [],
    selectedStores: [],
});

// ============================================================
// MOBILE ORDER CARD COMPONENT
// ============================================================

interface MobileOrderCardProps {
    businessId: string;
    order: Order;
    isSelected: boolean;
    onSelect: () => void;
    onView: () => void;
    renderActionItems: (order: Order) => React.ReactNode;
    activeTab: CustomStatus | 'All Orders';
    getStatusBadgeVariant: (status: CustomStatus | string | null) => "default" | "secondary" | "destructive" | "outline" | "success";
    getPaymentBadgeVariant: (status: string | null) => string;
}

function MobileOrderCard({
    businessId,
    order,
    isSelected,
    onSelect,
    onView,
    renderActionItems,
    activeTab,
    getStatusBadgeVariant,
    getPaymentBadgeVariant,
}: MobileOrderCardProps) {
    const customerName =
        (order.raw.shipping_address?.name ??
            order.raw.billing_address?.name ??
            order.raw.customer?.name ??
            `${order.raw.shipping_address?.first_name || ''} ${order.raw.shipping_address?.last_name || ''}`.trim()) ||
        `${order.raw.customer?.first_name || ''} ${order.raw.customer?.last_name || ''}`.trim() ||
        order.email ||
        'Unknown';

    return (
        <div
            className={cn(
                'border rounded-xl p-3 bg-card transition-all',
                isSelected && 'ring-2 ring-primary border-primary'
            )}
        >
            {/* Header Row */}
            <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-2 min-w-0">
                    <Checkbox
                        checked={isSelected}
                        onCheckedChange={onSelect}
                        onClick={(e) => e.stopPropagation()}
                        className="shrink-0"
                    />
                    <div className="min-w-0" onClick={onView}>
                        <p className="font-semibold text-sm truncate">{order.name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                            {order.storeId.split('.')[0]}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                    {activeTab === 'All Orders' && (
                        <Badge
                            variant={getStatusBadgeVariant(order.customStatus)}
                            className="text-[10px] px-1.5 py-0.5"
                        >
                            {order.customStatus}
                        </Badge>
                    )}
                    {activeTab !== 'All Orders' && (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-7 w-7">
                                    <MoreVertical className="h-4 w-4" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                <DropdownMenuItem onClick={onView}>View Details</DropdownMenuItem>
                                <DropdownMenuSeparator />
                                {renderActionItems(order)}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    )}
                </div>
            </div>

            {/* Content */}
            <div onClick={onView} className="cursor-pointer">
                <div className="flex items-center justify-between text-xs mb-2">
                    <span className="text-muted-foreground truncate max-w-[60%]">{customerName}</span>
                    <div className="flex flex-row items-center justify-center text-xs gap-3">
                        <span className="font-mono font-medium">
                            {new Intl.NumberFormat('en-IN', { style: 'currency', currency: order.currency }).format(Number(order.raw.total_price))}
                        </span>
                        <span className="font-mono font-medium">
                            {new Intl.NumberFormat('en-IN', { style: 'currency', currency: order.currency }).format(Number(order.raw.total_outstanding))}
                        </span>
                    </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        <CalendarDays className="h-3 w-3 mr-1" />
                        {new Date(order.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                    </Badge>
                    <Badge
                        variant={getPaymentBadgeVariant(order.financialStatus) as any}
                        className="text-[10px] px-1.5 py-0 capitalize"
                    >
                        {order.financialStatus?.replace('_', ' ') || 'N/A'}
                    </Badge>
                    {order.awb && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono">
                            <Truck className="h-3 w-3 mr-1" />
                            {order.awb.slice(-6)}
                        </Badge>
                    )}
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        <BoxIcon className="h-3 w-3 mr-1" />
                        {order.raw?.line_items?.reduce(
                            (sum, item) => sum + Number(item.quantity || 0),
                            0
                        ) || 0}
                    </Badge>
                </div>
            </div>
        </div>
    );
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export default function BusinessOrdersPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const queryClient = useQueryClient();

    const {
        isAuthorized,
        stores,
        vendorName,
        loading: authLoading,
        user,
        memberRole,
        businessId,
    } = useBusinessContext();

    const { processAwbAssignments } = useProcessingQueue();

    // ============================================================
    // UI STATE
    // ============================================================
    const [activeTab, setActiveTab] = useState<CustomStatus | 'All Orders'>(() => {
        const tabParam = searchParams.get('activeTab');
        const validTabs = STATUS_TABS.map(t => t.value);
        return validTabs.includes(tabParam as any) ? (tabParam as CustomStatus | 'All Orders') : 'All Orders';
    });

    const [currentPage, setCurrentPage] = useState(1);
    const [pageCursors, setPageCursors] = useState<Record<number, any>>({ 1: undefined });
    const [selectedOrders, setSelectedOrders] = useState<string[]>([]);
    const [selectedOrdersMap, setSelectedOrdersMap] = useState<Record<string, string>>({});
    const [selectedOrdersDataMap, setSelectedOrdersDataMap] = useState<Record<string, Order>>({});
    const [rowsPerPage, setRowsPerPage] = useState(10);
    const [viewingOrder, setViewingOrder] = useState<Order | null>(null);
    const [isFiltersOpen, setIsFiltersOpen] = useState(false);
    const [statusFilterSearch, setStatusFilterSearch] = useState('');

    // Filter state
    const [searchQuery, setSearchQuery] = useState('');
    const [searchMode, setSearchMode] = useState<SearchMode>('orderNumber');
    const [debouncedSearchQuery] = useDebounce(searchQuery, 400);

    const [filtersByTab, setFiltersByTab] = useState<
        Record<CustomStatus | 'All Orders', TabFilterState>
    >(() => {
        return STATUS_TABS.reduce((acc, tab) => {
            acc[tab.value] = getDefaultTabFilters();
            return acc;
        }, {} as Record<CustomStatus | 'All Orders', TabFilterState>);
    });

    const currentFilters = filtersByTab[activeTab];

    const updateCurrentTabFilters = (updates: Partial<TabFilterState>) => {
        setFiltersByTab(prev => ({
            ...prev,
            [activeTab]: {
                ...prev[activeTab],
                ...updates,
            },
        }));
    };

    const clearCurrentTabFilters = () => {
        setFiltersByTab(prev => ({
            ...prev,
            [activeTab]: getDefaultTabFilters(),
        }));

        setCurrentPage(1);
        setPageCursors({ 1: undefined });
        clearAllSelections();
    };

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
    const [isTaxReportDialogOpen, setIsTaxReportDialogOpen] = useState(false);
    const [orderForQc, setOrderForQc] = useState<Order | null>(null);
    const [isAvailabilityDialogOpen, setIsAvailabilityDialogOpen] = useState(false);
    const [isGeneratePODialogOpen, setIsGeneratePODialogOpen] = useState(false);
    const [isRefundDialogOpen, setIsRefundDialogOpen] = useState(false);
    const [orderForRefund, setOrderForRefund] = useState<Order | null>(null);
    const [isPerformPickupDialogOpen, setIsPerformPickupDialogOpen] = useState(false);
    const [orderForPickup, setOrderForPickup] = useState<Order | null>(null);
    const [isStartPackagingOpen, setIsStartPackagingOpen] = useState(false);

    // ============================================================
    // DATA FETCHING
    // ============================================================

    const {
        data: ordersData,
        isLoading,
        isFetching,
        refetch: refetchOrders
    } = useOrders(
        businessId,
        stores,
        vendorName,
        activeTab,
        currentPage,
        rowsPerPage,
        {
            searchQuery: debouncedSearchQuery,
            searchMode,
            dateRange: currentFilters.dateRange?.from
                ? { from: currentFilters.dateRange.from, to: currentFilters.dateRange.to }
                : undefined,
            courierFilter: currentFilters.courierFilter === 'all' ? undefined : currentFilters.courierFilter,
            availabilityFilter: currentFilters.availabilityFilter,
            rtoInTransitFilter: currentFilters.rtoInTransitFilter,
            storeFilter: currentFilters.selectedStores.length > 0 ? currentFilters.selectedStores : undefined,
            statusFilter: currentFilters.statusFilter.length > 0 ? currentFilters.statusFilter : undefined,
            stateFilter: currentFilters.stateFilter === 'all' ? undefined : currentFilters.stateFilter,
            packedFilter: currentFilters.packedFilter,
            paymentTypeFilter: currentFilters.paymentTypeFilter,
        },
        pageCursors[currentPage]
    );

    const orders = ordersData?.orders || [];
    const availableProvinces = ordersData?.availableProvinces || [];

    const { data: statusCounts } = useOrderCounts(businessId, vendorName, stores);
    const { data: availabilityCounts } = useAvailabilityCounts(businessId, activeTab, stores, vendorName);
    const { data: rtoInTransitCounts } = useRtoInTransitCounts(businessId, stores, vendorName);
    const { data: unusedAwbsCount = 0 } = useAwbCount(businessId);

    // ============================================================
    // MUTATIONS
    // ============================================================

    const getOrderStoreId = (orderId: string): string | null => {
        // Check map first (works cross-page), fall back to current page
        return selectedOrdersMap[orderId] || orders.find(o => o.id === orderId)?.storeId || null;
    };

    const updateStatus = useUpdateOrderStatus(businessId, user);
    const revertStatus = useRevertOrderStatus(businessId, user);
    const dispatchOrders = useDispatchOrders(businessId, user);
    const bulkUpdate = useBulkUpdateStatus(businessId, user);
    const splitOrder = useOrderSplit(businessId, user);
    const bookReturn = useReturnBooking(businessId, user);
    const downloadSlips = useDownloadSlips(businessId, user);
    const downloadManifest = useDownloadManifest(businessId, user);
    const downloadExcel = useDownloadExcel(businessId, user);
    const downloadProductsExcel = useDownloadProductsExcel(businessId, user);
    const updateShippedStatuses = useUpdateShippedStatuses(businessId, user);

    // Loading states
    const isAnyOperationInProgress =
        updateShippedStatuses.isPending ||
        dispatchOrders.isPending ||
        bulkUpdate.isPending ||
        bookReturn.isPending ||
        downloadSlips.isPending ||
        downloadExcel.isPending ||
        downloadProductsExcel.isPending ||
        downloadManifest.isPending;

    const isAnyOrderSelected = selectedOrders.length > 0;
    const isDisabled = !isAnyOrderSelected;
    const isSharedStoreAdmin = businessId === SUPER_ADMIN_ID;

    const hasSharedStoreOrder = selectedOrders.some(orderId => {
        const storeId = selectedOrdersMap[orderId];
        return SHARED_STORE_IDS.includes(String(storeId));
    });

    const isDispatching = dispatchOrders.isPending;
    const isBulkUpdating = bulkUpdate.isPending;
    const isBookingReturn = bookReturn.isPending;
    const isDownloadingSlips = downloadSlips.isPending;
    const isDownloadingManifest = downloadManifest.isPending;
    const isDownloadingExcel = downloadExcel.isPending;
    const isDownloadingProducts = downloadProductsExcel.isPending;

    // ============================================================
    // HANDLERS
    // ============================================================

    const handleTabChange = (value: string) => {
        const typedValue = value as CustomStatus | 'All Orders';
        setActiveTab(typedValue);
        const current = new URLSearchParams(Array.from(searchParams.entries()));
        current.set('activeTab', value);
        router.push(`/business/${businessId}/dashboard/orders?${current.toString()}`, { scroll: false });
    };

    const handleUpdateStatus = (orderId: string, status: CustomStatus) => {
        const storeId = getOrderStoreId(orderId);
        if (!storeId) return;
        updateStatus.mutate({ orderId, status, storeId });
    };

    const handleRevertStatus = (orderId: string, revertTo: 'Confirmed' | 'Delivered') => {
        const storeId = getOrderStoreId(orderId);
        if (!storeId) return;
        revertStatus.mutate({ orderId, revertTo, storeId });
    };

    const handleDispatch = (orderIds: string[]) => {
        const ordersByStore = new Map<string, string[]>();
        orderIds.forEach(orderId => {
            const storeId = selectedOrdersMap[orderId];
            if (storeId) {
                if (!ordersByStore.has(storeId)) {
                    ordersByStore.set(storeId, []);
                }
                ordersByStore.get(storeId)!.push(orderId);
            }
        });

        let completedStores = 0;
        const totalStores = ordersByStore.size;

        ordersByStore.forEach((storeOrderIds, storeId) => {
            dispatchOrders.mutate({ orderIds: storeOrderIds, storeId }, {
                onSuccess: () => {
                    completedStores++;
                    if (completedStores === totalStores) {
                        clearAllSelections()
                    }
                }
            });
        });
    };

    const handleBulkUpdateStatus = (status: CustomStatus) => {
        if (status === 'Dispatched') {
            handleDispatch(selectedOrders);
            return;
        }

        if (status === 'DTO Requested') {
            const ordersByStore = new Map<string, string[]>();

            selectedOrders.forEach(orderId => {
                const storeId = selectedOrdersMap[orderId];

                if (storeId) {
                    if (!ordersByStore.has(storeId)) {
                        ordersByStore.set(storeId, []);
                    }

                    ordersByStore.get(storeId)!.push(orderId);
                }
            });

            let completedStores = 0;
            const totalStores = ordersByStore.size;

            ordersByStore.forEach((storeOrderIds, storeId) => {
                bookReturn.mutate({ orderIds: storeOrderIds, storeId }, {
                    onSuccess: () => {
                        completedStores++;
                        if (completedStores === totalStores) {
                            clearAllSelections();
                        }
                    }
                });
            });

            return;
        }

        const ordersByStore = new Map<string, string[]>();
        selectedOrders.forEach(orderId => {
            const storeId = selectedOrdersMap[orderId];
            if (storeId) {
                if (!ordersByStore.has(storeId)) {
                    ordersByStore.set(storeId, []);
                }
                ordersByStore.get(storeId)!.push(orderId);
            }
        });

        let completedStores = 0;
        const totalStores = ordersByStore.size;

        ordersByStore.forEach((storeOrderIds, storeId) => {
            bulkUpdate.mutate({ orderIds: storeOrderIds, status, storeId }, {
                onSuccess: () => {
                    completedStores++;
                    if (completedStores === totalStores) {
                        clearAllSelections()
                    }
                }
            });
        });
    };

    const handleDownloadSlips = () => {
        if (selectedOrders.length === 0) return;
        const ordersByStore = new Map<string, string[]>();
        selectedOrders.forEach(orderId => {
            const storeId = selectedOrdersMap[orderId];
            if (storeId) {
                if (!ordersByStore.has(storeId)) ordersByStore.set(storeId, []);
                ordersByStore.get(storeId)!.push(orderId);
            }
        });

        if (ordersByStore.size === 0) return;

        let completedStores = 0;
        const totalStores = ordersByStore.size;

        ordersByStore.forEach((storeOrderIds, storeId) => {
            downloadSlips.mutate({ orderIds: storeOrderIds, storeId }, {
                onSuccess: () => {
                    completedStores++;
                    if (completedStores === totalStores) {
                        clearAllSelections()
                    }
                }
            });
        });
    };

    const handleDownloadManifest = () => {
        if (selectedOrders.length === 0) return;
        const ordersByStore = new Map<string, string[]>();
        selectedOrders.forEach(orderId => {
            const storeId = selectedOrdersMap[orderId];
            if (storeId) {
                if (!ordersByStore.has(storeId)) ordersByStore.set(storeId, []);
                ordersByStore.get(storeId)!.push(orderId);
            }
        });
        if (ordersByStore.size === 0) return;

        let completedStores = 0;
        const totalStores = ordersByStore.size;

        ordersByStore.forEach((storeOrderIds, storeId) => {
            downloadManifest.mutate({ orderIds: storeOrderIds, storeId }, {
                onSuccess: () => {
                    completedStores++;
                    if (completedStores === totalStores) clearAllSelections();
                }
            });
        });
    };

    const handleDownloadExcel = () => {
        if (selectedOrders.length === 0) return;
        const ordersByStore = new Map<string, string[]>();
        selectedOrders.forEach(orderId => {
            const storeId = selectedOrdersMap[orderId];
            if (storeId) {
                if (!ordersByStore.has(storeId)) {
                    ordersByStore.set(storeId, []);
                }
                ordersByStore.get(storeId)!.push(orderId);
            }
        });

        let completedStores = 0;
        const totalStores = ordersByStore.size;

        ordersByStore.forEach((storeOrderIds, storeId) => {
            downloadExcel.mutate({ orderIds: storeOrderIds, storeId }, {
                onSuccess: () => {
                    completedStores++;
                    if (completedStores === totalStores) {
                        clearAllSelections()
                    }
                }
            });
        });
    };

    const handleDownloadProductsExcel = () => {
        if (selectedOrders.length === 0) return;
        const ordersByStore = new Map<string, string[]>();
        selectedOrders.forEach(orderId => {
            const storeId = selectedOrdersMap[orderId];
            if (storeId) {
                if (!ordersByStore.has(storeId)) {
                    ordersByStore.set(storeId, []);
                }
                ordersByStore.get(storeId)!.push(orderId);
            }
        });

        let completedStores = 0;
        const totalStores = ordersByStore.size;

        ordersByStore.forEach((storeOrderIds, storeId) => {
            downloadProductsExcel.mutate({ orderIds: storeOrderIds, storeId }, {
                onSuccess: () => {
                    completedStores++;
                    if (completedStores === totalStores) {
                        clearAllSelections()
                    }
                }
            });
        });
    };

    const handleAssignAwbClick = () => {
        const ordersToProcess = selectedOrders
            .map(orderId => selectedOrdersDataMap[orderId])
            .filter((order): order is Order => Boolean(order));

        if (ordersToProcess.length === 0) {
            toast({
                title: 'No Orders Found',
                description: 'Selected order details are not available. Please reselect the orders.',
                variant: 'destructive',
            });
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
            orders.filter(o => o.customStatus === customStatus && o.awb).map(o => [o.awb!, o])
        );
        const foundOrders = awbs.reduce((acc, awb) => {
            if (statusAwbMap.has(awb)) acc.push(statusAwbMap.get(awb)!);
            return acc;
        }, [] as Order[]);

        if (foundOrders.length > 0) {
            setSelectedOrders(prev => Array.from(new Set([...prev, ...foundOrders.map(o => o.id)])));
            setSelectedOrdersMap(prev => {
                const next = { ...prev };
                foundOrders.forEach(o => { next[o.id] = o.storeId; });
                return next;
            });
            setSelectedOrdersDataMap(prev => {
                const next = { ...prev };
                foundOrders.forEach(o => {
                    next[o.id] = o;
                });
                return next;
            });
        }
    };

    const validateSingleStore = (orderIds: string[]) => {
        const storeIds = new Set(
            orderIds
                .map(orderId => selectedOrdersMap[orderId])
                .filter(Boolean)
        );

        return {
            valid: storeIds.size === 1,
            storeId: storeIds.size === 1 ? Array.from(storeIds)[0] : null,
            storeCount: storeIds.size,
        };
    };

    const handleGeneratePOClick = () => {
        if (selectedOrders.length === 0) {
            toast({ title: "No Orders Selected", description: "Please select orders to generate a purchase order.", variant: "destructive" });
            return;
        }
        const validation = validateSingleStore(selectedOrders);
        if (!validation.valid) {
            toast({ title: "Multiple Stores Selected", description: `Purchase orders must be generated for one store at a time.`, variant: "destructive" });
            return;
        }
        setIsGeneratePODialogOpen(true);
    };

    const handleRTOClose = () => {
        const ordersByStore = new Map<string, string[]>();
        selectedOrders.forEach(orderId => {
            const storeId = selectedOrdersMap[orderId];
            if (storeId) {
                if (!ordersByStore.has(storeId)) ordersByStore.set(storeId, []);
                ordersByStore.get(storeId)!.push(orderId);
            }
        });

        let completedStores = 0;
        const totalStores = ordersByStore.size;

        ordersByStore.forEach((storeOrderIds, storeId) => {
            bulkUpdate.mutate(
                { orderIds: storeOrderIds, status: 'RTO Closed', storeId },
                {
                    onSuccess: () => {
                        completedStores++;
                        if (completedStores === totalStores) clearAllSelections();
                    }
                }
            );
        });
    };

    // ============================================================
    // EFFECTS
    // ============================================================

    useEffect(() => {
        document.title = "Orders - Business Dashboard";
    }, []);

    useEffect(() => {
        const savedRowsPerPage = localStorage.getItem('rowsPerPage');
        if (savedRowsPerPage) setRowsPerPage(Number(savedRowsPerPage));
    }, []);

    // Reset page, selection, and packed filter on any filter/tab change
    useEffect(() => {
        setCurrentPage(1);
        setPageCursors({ 1: undefined });
        clearAllSelections();
    }, [
        activeTab,
        debouncedSearchQuery,
        searchMode,
        currentFilters.dateRange,
        currentFilters.courierFilter,
        currentFilters.availabilityFilter,
        currentFilters.rtoInTransitFilter,
        currentFilters.selectedStores,
        currentFilters.stateFilter,
        currentFilters.packedFilter,
        currentFilters.paymentTypeFilter,
        currentFilters.statusFilter,
    ]);

    useEffect(() => {
        setCurrentPage(1);
        setPageCursors({ 1: undefined });
    }, [rowsPerPage]);

    useEffect(() => {
        const tabParam = searchParams.get('activeTab');
        const validTabs = STATUS_TABS.map(t => t.value);
        const newTab = validTabs.includes(tabParam as any) ? (tabParam as CustomStatus | 'All Orders') : 'All Orders';
        if (newTab !== activeTab) setActiveTab(newTab);
    }, [searchParams]);

    // ============================================================
    // PAGINATION & SELECTION
    // ============================================================

    const hasMore = !!ordersData?.hasMore;

    const handleNextPage = () => {
        if (!hasMore || !ordersData?.nextCursor) return;

        setPageCursors(prev => ({
            ...prev,
            [currentPage + 1]: ordersData.nextCursor,
        }));

        setCurrentPage(prev => prev + 1);
    };

    const handlePreviousPage = () => {
        if (currentPage <= 1) return;
        setCurrentPage(prev => prev - 1);
    };
    const handleSetRowsPerPage = (value: string) => {
        setRowsPerPage(Number(value));
        setCurrentPage(1);
        setPageCursors({ 1: undefined });
        localStorage.setItem('rowsPerPage', value);
    };

    const handleSelectOrder = (orderId: string) => {
        const isCurrentlySelected = selectedOrders.includes(orderId);
        if (isCurrentlySelected) {
            setSelectedOrders(prev => prev.filter(id => id !== orderId));
            setSelectedOrdersMap(prev => {
                const next = { ...prev };
                delete next[orderId];
                return next;
            });
            setSelectedOrdersDataMap(prev => {
                const next = { ...prev };
                delete next[orderId];
                return next;
            });
        } else {
            const order = orders.find(o => o.id === orderId);
            if (!order) return;
            setSelectedOrders(prev => [...prev, orderId]);
            setSelectedOrdersMap(prev => ({
                ...prev,
                [orderId]: order.storeId,
            }));
            setSelectedOrdersDataMap(prev => ({
                ...prev,
                [orderId]: order,
            }));
        }
    };

    // Add this new handler near your other handlers:
    const handlePageCheckbox = (isChecked: boolean) => {
        const currentPageIds = orders.map(o => o.id);
        if (isChecked) {
            setSelectedOrders(prev =>
                Array.from(new Set([...prev, ...currentPageIds]))
            );
            setSelectedOrdersMap(prev => {
                const next = { ...prev };
                orders.forEach(o => {
                    next[o.id] = o.storeId;
                });
                return next;
            });
            setSelectedOrdersDataMap(prev => {
                const next = { ...prev };
                orders.forEach(o => {
                    next[o.id] = o;
                });
                return next;
            });
        } else {
            setSelectedOrders(prev =>
                prev.filter(id => !currentPageIds.includes(id))
            );
            setSelectedOrdersMap(prev => {
                const next = { ...prev };
                currentPageIds.forEach(id => delete next[id]);
                return next;
            });
            setSelectedOrdersDataMap(prev => {
                const next = { ...prev };
                currentPageIds.forEach(id => delete next[id]);
                return next;
            });
        }
    };

    const handleToggleStatusFilter = (status: CustomStatus, checked: boolean) => {
        if (checked) {
            if (currentFilters.statusFilter.includes(status)) return;

            if (currentFilters.statusFilter.length >= MAX_STATUS_FILTER_SELECTIONS) {
                toast({
                    title: 'Status limit reached',
                    description: `You can select up to ${MAX_STATUS_FILTER_SELECTIONS} statuses at a time.`,
                    variant: 'destructive',
                });
                return;
            }

            updateCurrentTabFilters({
                statusFilter: [...currentFilters.statusFilter, status],
            });

            return;
        }

        updateCurrentTabFilters({
            statusFilter: currentFilters.statusFilter.filter((s) => s !== status),
        });
    };

    const handleToggleAllVisibleStatuses = (checked: boolean) => {
        if (!checked) {
            updateCurrentTabFilters({
                statusFilter: currentFilters.statusFilter.filter(
                    (status) => !visibleStatusValues.includes(status)
                ),
            });
            return;
        }

        const alreadySelected = currentFilters.statusFilter;
        const remainingSlots = MAX_STATUS_FILTER_SELECTIONS - alreadySelected.length;

        if (remainingSlots <= 0) {
            toast({
                title: 'Status limit reached',
                description: `You can select up to ${MAX_STATUS_FILTER_SELECTIONS} statuses at a time.`,
                variant: 'destructive',
            });
            return;
        }

        const statusesToAdd = visibleStatusValues
            .filter((status) => !alreadySelected.includes(status))
            .slice(0, remainingSlots);

        const nextStatuses = [...alreadySelected, ...statusesToAdd];

        updateCurrentTabFilters({
            statusFilter: nextStatuses,
        });

        const unselectedVisibleCount = visibleStatusValues.filter(
            (status) => !alreadySelected.includes(status)
        ).length;

        if (unselectedVisibleCount > statusesToAdd.length) {
            toast({
                title: 'Only first 10 statuses selected',
                description: `Status filter supports up to ${MAX_STATUS_FILTER_SELECTIONS} statuses. Selected the first available statuses in the current order.`,
            });
        }
    };

    const clearStatusFilterSearch = () => {
        setStatusFilterSearch('');
    };

    const clearAllSelections = () => {
        setSelectedOrders([]);
        setSelectedOrdersMap({});
        setSelectedOrdersDataMap({});

    };

    const areAllOnPageSelected = orders.length > 0 && orders.every(o => selectedOrders.includes(o.id));

    // ============================================================
    // BADGE VARIANTS
    // ============================================================

    const getPaymentBadgeVariant = (status: string | null) => {
        switch (status?.toLowerCase()) {
            case 'paid': return 'default';
            case 'pending': return 'secondary';
            case 'refunded':
            case 'partially_refunded': return 'outline';
            case 'voided': return 'destructive';
            default: return 'secondary';
        }
    };

    const getFulfillmentBadgeVariant = (status: string | null) => {
        switch (status?.toLowerCase()) {
            case 'fulfilled': return 'default';
            case 'unfulfilled':
            case 'partial': return 'secondary';
            case 'restocked': return 'outline';
            default: return 'destructive';
        }
    };

    const getStatusBadgeVariant = (status: CustomStatus | string | null): "default" | "secondary" | "destructive" | "outline" | "success" => {
        switch (status) {
            case 'New':
            case 'Confirmed':
            case 'Ready To Dispatch':
            case 'Pending Refunds': return 'secondary';
            case 'Dispatched':
            case 'In Transit':
            case 'Out For Delivery':
            case 'RTO In Transit':
            case 'DTO Requested':
            case 'Cancellation Requested':
            case 'DTO Booked':
            case 'DTO In Transit': return 'default';
            case 'Delivered':
            case 'RTO Delivered':
            case 'DTO Delivered':
            case 'DTO Refunded': return 'success';
            case 'Lost':
            case 'Cancelled': return 'destructive';
            case 'Closed':
            case 'RTO Closed': return 'outline';
            default: return 'secondary';
        }
    };

    // ============================================================
    // RENDER ACTION ITEMS
    // ============================================================

    const renderActionItems = (order: Order) => {
        if (activeTab === 'All Orders') {
            return <DropdownMenuItem disabled>No actions available in All Orders</DropdownMenuItem>;
        }

        switch (order.customStatus) {
            case 'Cancelled':
                return <DropdownMenuItem disabled>Order Cancelled</DropdownMenuItem>;
            case 'New':
                return (
                    <>
                        <DropdownMenuItem onClick={() => handleUpdateStatus(order.id, 'Confirmed')}>Confirm</DropdownMenuItem>
                        {(businessId === SUPER_ADMIN_ID || SHARED_STORE_IDS.includes(order.storeId)) &&
                            <DropdownMenuItem onClick={() => splitOrder.mutate({ orderId: order.id, storeId: order.storeId })}>Split Order</DropdownMenuItem>
                        }
                    </>
                );
            case 'Confirmed':
                return (
                    <>
                        {(businessId === SUPER_ADMIN_ID || !SHARED_STORE_IDS.includes(order.storeId)) &&
                            <DropdownMenuItem
                                onClick={() => {
                                    setSelectedOrders([order.id]);
                                    setSelectedOrdersMap({ [order.id]: order.storeId });
                                    setSelectedOrdersDataMap({ [order.id]: order });

                                    if (1 > unusedAwbsCount) {
                                        setIsLowAwbAlertOpen(true);
                                    } else {
                                        setOrdersForAwb([order]);
                                        setIsAwbDialogOpen(true);
                                    }
                                }}
                            >
                                Assign AWB
                            </DropdownMenuItem>
                        }
                        {(businessId === SUPER_ADMIN_ID || !SHARED_STORE_IDS.includes(order.storeId)) &&
                            <DropdownMenuItem onClick={() => splitOrder.mutate({ orderId: order.id, storeId: order.storeId })}>Split Order</DropdownMenuItem>
                        }
                        {order.isEligibleForPickup && (
                            <DropdownMenuItem
                                onClick={() => {
                                    setOrderForPickup(order);
                                    setIsPerformPickupDialogOpen(true);
                                }}
                            >
                                Perform Pickup
                            </DropdownMenuItem>
                        )}
                    </>
                );
            case 'Ready To Dispatch':
                return (
                    <>
                        <DropdownMenuItem onClick={() => handleRevertStatus(order.id, 'Confirmed')}>Back to Confirmed</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDispatch([order.id])}>Dispatch</DropdownMenuItem>
                    </>
                );
            case 'Delivered':
                return <DropdownMenuItem onClick={() => { setOrderForReturn(order); setIsReturnDialogOpen(true); }}>Book Return</DropdownMenuItem>;
            case 'DTO Requested':
                return (
                    <>
                        <DropdownMenuItem onClick={() => { setOrderForReturn(order); setIsReturnDialogOpen(true); }}>Book Return</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleRevertStatus(order.id, 'Delivered')}>Back to Delivered</DropdownMenuItem>
                    </>
                );
            case 'DTO Booked':
                return (
                    <>
                        <DropdownMenuItem onClick={() => handleRevertStatus(order.id, 'Delivered')}>Back to Delivered</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleUpdateStatus(order.id, 'Closed')}>Close Order</DropdownMenuItem>
                    </>
                );
            case 'DTO Delivered':
            case 'DTO In Transit':
                return <DropdownMenuItem onClick={() => { setOrderForQc(order); setIsQcDialogOpen(true); }}>Start QC</DropdownMenuItem>;
            case 'Pending Refunds':
                return <DropdownMenuItem onClick={() => { setOrderForRefund(order); setIsRefundDialogOpen(true); }}>Process Refund</DropdownMenuItem>;
            case 'RTO Delivered':
                return (
                    <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => bulkUpdate.mutate({ orderIds: [order.id], status: 'Lost', storeId: order.storeId })}
                    >
                        Mark as Lost
                    </DropdownMenuItem>
                );
            case 'RTO In Transit':
                return (
                    <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => bulkUpdate.mutate({ orderIds: [order.id], status: 'Lost', storeId: order.storeId })}
                    >
                        Mark as Lost
                    </DropdownMenuItem>
                );
            case 'Closed':
                return (
                    <DropdownMenuItem onClick={() => handleRevertStatus(order.id, 'Delivered')}>Undo Closed</DropdownMenuItem>
                );
            default:
                return null;
        }
    };

    const normalizedStatusFilterSearch = statusFilterSearch.trim().toLowerCase();

    const visibleStatusFilterOptions = ORDER_STATUS_FILTER_TABS.filter((tab) =>
        tab.label.toLowerCase().includes(normalizedStatusFilterSearch) ||
        tab.shortLabel.toLowerCase().includes(normalizedStatusFilterSearch) ||
        String(tab.value).toLowerCase().includes(normalizedStatusFilterSearch)
    );

    const visibleStatusValues = visibleStatusFilterOptions.map(
        (tab) => tab.value as CustomStatus
    );

    const selectedVisibleStatusCount = visibleStatusValues.filter((status) =>
        currentFilters.statusFilter.includes(status)
    ).length;

    const areAllVisibleStatusesSelected =
        visibleStatusValues.length > 0 &&
        selectedVisibleStatusCount === visibleStatusValues.length;

    const areSomeVisibleStatusesSelected =
        selectedVisibleStatusCount > 0 &&
        selectedVisibleStatusCount < visibleStatusValues.length;

    // ============================================================
    // ACTIVE FILTERS COUNT
    // ============================================================

    const activeFiltersCount = [
        currentFilters.selectedStores.length > 0,
        currentFilters.dateRange?.from,
        currentFilters.courierFilter !== 'all',
        currentFilters.availabilityFilter !== 'all',
        currentFilters.rtoInTransitFilter !== 'all',
        currentFilters.packedFilter !== 'all',
        currentFilters.paymentTypeFilter !== 'all',
        currentFilters.stateFilter !== 'all',
        currentFilters.statusFilter.length > 0,
    ].filter(Boolean).length;

    // ============================================================
    // AUTH CHECK
    // ============================================================

    if (authLoading) {
        return (
            <div className="flex items-center justify-center h-screen">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    if (!isAuthorized) {
        return (
            <div className="flex flex-col items-center justify-center h-screen gap-4">
                <ShoppingBag className="h-16 w-16 text-muted-foreground/50" />
                <h2 className="text-xl font-semibold">Unauthorized</h2>
                <p className="text-muted-foreground">You don't have access to this business.</p>
            </div>
        );
    }

    if (stores.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-screen gap-4">
                <Store className="h-16 w-16 text-muted-foreground/50" />
                <h2 className="text-xl font-semibold">No Stores Found</h2>
                <p className="text-muted-foreground">This business doesn't have any stores yet.</p>
            </div>
        );
    }

    // ============================================================
    // RENDER
    // ============================================================

    return (
        <>
            <div className="flex flex-col h-full bg-gradient-to-b from-muted/30 to-background">
                {/* Sync Indicator */}
                {isFetching && !isLoading && (
                    <div className="fixed bottom-20 md:bottom-4 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground px-4 py-2 rounded-full text-sm z-50 flex items-center gap-2 shadow-lg">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Syncing...
                    </div>
                )}

                {/* Header */}
                <div className="shrink-0 border-b bg-card/80 backdrop-blur-sm sticky top-0 z-20">
                    <div className="p-3 md:p-4">
                        {/* Title Row */}
                        <div className="flex items-center justify-between gap-2 mb-3">
                            <div className="min-w-0">
                                <h1 className="text-lg md:text-xl font-bold truncate">Orders</h1>
                                <p className="text-xs text-muted-foreground hidden sm:block">
                                    {currentFilters.selectedStores.length > 0
                                        ? `${currentFilters.selectedStores.length} of ${stores.length} stores`
                                        : `All ${stores.length} stores`}
                                </p>
                            </div>

                            {/* Mobile Actions */}
                            <div className="flex items-center gap-1">
                                <Button variant="ghost" size="icon" onClick={() => refetchOrders()} disabled={isFetching}>
                                    <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
                                </Button>
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" size="icon">
                                            <MoreVertical className="h-4 w-4" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                        {businessId === SUPER_ADMIN_ID && (
                                            <DropdownMenuItem onClick={() => setIsTaxReportDialogOpen(true)}>
                                                <FileSpreadsheet className="h-4 w-4 mr-2" />
                                                Tax Report
                                            </DropdownMenuItem>
                                        )}
                                        {activeTab === 'Confirmed' && (
                                            <DropdownMenuItem
                                                onClick={() => setIsAvailabilityDialogOpen(true)}
                                                disabled={isAnyOperationInProgress}
                                            >
                                                <Shirt className="h-4 w-4 mr-2" />
                                                Perform Items availability
                                            </DropdownMenuItem>
                                        )}
                                        {['Ready To Dispatch', 'RTO Delivered', 'RTO In Transit'].includes(activeTab) && (
                                            <DropdownMenuItem
                                                onClick={() => {
                                                    setIsAwbBulkSelectOpen(true);
                                                    setAwbBulkSelectStatus(activeTab);
                                                }}
                                                disabled={isAnyOperationInProgress}
                                            >
                                                <AlignLeft className="h-4 w-4 mr-2" />
                                                AWB Bulk Select
                                            </DropdownMenuItem>
                                        )}
                                        {activeTab === 'Ready To Dispatch' && (
                                            <DropdownMenuItem
                                                onClick={() => setIsStartPackagingOpen(true)}
                                                disabled={isAnyOperationInProgress}
                                            >
                                                <Package className="h-4 w-4 mr-2" />
                                                Start Packaging
                                            </DropdownMenuItem>
                                        )}
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>
                        </div>

                        {/* Search & Filters Row */}
                        <div className="flex items-center gap-2">
                            <div className="flex w-full flex-col gap-2 sm:flex-1 sm:flex-row sm:items-center">
                                <Select
                                    value={searchMode}
                                    onValueChange={(value) => {
                                        setSearchMode(value as SearchMode);
                                    }}
                                >
                                    <SelectTrigger className="h-9 w-full text-xs sm:w-[170px] sm:shrink-0">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="orderNumber">Order Number</SelectItem>
                                        <SelectItem value="forwardAwb">Forward AWB</SelectItem>
                                        <SelectItem value="reverseAwb">Reverse AWB</SelectItem>
                                        <SelectItem value="general">General Search</SelectItem>
                                    </SelectContent>
                                </Select>

                                <div className="relative flex-1">
                                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />

                                    <Input
                                        placeholder={
                                            searchMode === 'forwardAwb'
                                                ? 'Search forward AWB...'
                                                : searchMode === 'orderNumber'
                                                    ? 'Search order number...'
                                                    : searchMode === 'reverseAwb'
                                                        ? 'Search reverse AWB...'
                                                        : 'Search customer, vendor, status...'
                                        }
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="h-9 pl-9 pr-9 text-sm"
                                    />

                                    {searchQuery && (
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2"
                                            onClick={() => setSearchQuery('')}
                                        >
                                            <X className="h-3 w-3" />
                                        </Button>
                                    )}
                                </div>
                            </div>

                            {/* Filters Sheet Trigger */}
                            <Sheet open={isFiltersOpen} onOpenChange={setIsFiltersOpen}>
                                <SheetTrigger asChild>
                                    <Button variant="outline" size="sm" className="shrink-0 gap-2">
                                        <Filter className="h-4 w-4" />
                                        <span className="hidden sm:inline">Filters</span>
                                        {activeFiltersCount > 0 && (
                                            <Badge variant="secondary" className="h-5 w-5 p-0 justify-center text-xs">
                                                {activeFiltersCount}
                                            </Badge>
                                        )}
                                    </Button>
                                </SheetTrigger>
                                <SheetContent side="right" className="w-full sm:max-w-md flex flex-col p-0">
                                    <SheetHeader className="shrink-0 px-6 pt-6 pb-4">
                                        <SheetTitle>Filters</SheetTitle>
                                        <SheetDescription>
                                            Narrow down your orders
                                        </SheetDescription>
                                    </SheetHeader>

                                    <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
                                        {/* Payment Filter */}
                                        <div className="space-y-3">
                                            <Label className="text-sm font-medium">Payment Type</Label>
                                            <Select
                                                value={currentFilters.paymentTypeFilter}
                                                onValueChange={(v) => updateCurrentTabFilters({ paymentTypeFilter: v as TabFilterState['paymentTypeFilter'] })}
                                            >
                                                <SelectTrigger>
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="all">All</SelectItem>
                                                    <SelectItem value="prepaid">Prepaid</SelectItem>
                                                    <SelectItem value="cod">COD</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        {/* Order Status Filter */}
                                        {activeTab === 'All Orders' && (
                                            <div className="space-y-3">
                                                <div className="flex items-center justify-between gap-2">
                                                    <Label className="text-sm font-medium">Order Status</Label>

                                                    {currentFilters.statusFilter.length > 0 && (
                                                        <Badge variant="secondary" className="text-xs">
                                                            {currentFilters.statusFilter.length}/{MAX_STATUS_FILTER_SELECTIONS}
                                                        </Badge>
                                                    )}
                                                </div>

                                                <div className="relative">
                                                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                                    <Input
                                                        value={statusFilterSearch}
                                                        onChange={(e) => setStatusFilterSearch(e.target.value)}
                                                        placeholder="Search statuses..."
                                                        className="h-9 pl-9 pr-9 text-sm"
                                                    />

                                                    {statusFilterSearch && (
                                                        <Button
                                                            type="button"
                                                            variant="ghost"
                                                            size="icon"
                                                            className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2"
                                                            onClick={clearStatusFilterSearch}
                                                        >
                                                            <X className="h-3 w-3" />
                                                        </Button>
                                                    )}
                                                </div>

                                                <div className="rounded-lg border">
                                                    <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
                                                        <div className="flex items-center gap-2">
                                                            <Checkbox
                                                                checked={
                                                                    areAllVisibleStatusesSelected
                                                                        ? true
                                                                        : areSomeVisibleStatusesSelected
                                                                            ? 'indeterminate'
                                                                            : false
                                                                }
                                                                onCheckedChange={(checked) =>
                                                                    handleToggleAllVisibleStatuses(Boolean(checked))
                                                                }
                                                                disabled={visibleStatusValues.length === 0}
                                                            />

                                                            <span className="text-sm font-medium">
                                                                Select all visible
                                                            </span>
                                                        </div>

                                                        <Button
                                                            type="button"
                                                            variant="ghost"
                                                            size="sm"
                                                            className="h-7 px-2 text-xs"
                                                            onClick={() => updateCurrentTabFilters({ statusFilter: [] })}
                                                            disabled={currentFilters.statusFilter.length === 0}
                                                        >
                                                            Clear
                                                        </Button>
                                                    </div>

                                                    <div className="max-h-52 overflow-y-auto p-2">
                                                        {visibleStatusFilterOptions.length === 0 ? (
                                                            <div className="px-2 py-6 text-center text-sm text-muted-foreground">
                                                                No statuses found
                                                            </div>
                                                        ) : (
                                                            <div className="space-y-1">
                                                                {visibleStatusFilterOptions.map((tab) => {
                                                                    const status = tab.value as CustomStatus;
                                                                    const isChecked = currentFilters.statusFilter.includes(status);

                                                                    const isDisabled =
                                                                        !isChecked &&
                                                                        currentFilters.statusFilter.length >= MAX_STATUS_FILTER_SELECTIONS;

                                                                    return (
                                                                        <label
                                                                            key={tab.value}
                                                                            htmlFor={`status-${tab.value}`}
                                                                            className={cn(
                                                                                'flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted',
                                                                                isChecked && 'bg-muted/70',
                                                                                isDisabled && 'cursor-not-allowed opacity-50'
                                                                            )}
                                                                        >
                                                                            <Checkbox
                                                                                id={`status-${tab.value}`}
                                                                                checked={isChecked}
                                                                                disabled={isDisabled}
                                                                                onCheckedChange={(checked) =>
                                                                                    handleToggleStatusFilter(status, Boolean(checked))
                                                                                }
                                                                            />

                                                                            <span className="flex-1 truncate">
                                                                                {tab.label}
                                                                            </span>
                                                                        </label>
                                                                    );
                                                                })}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>

                                                {currentFilters.statusFilter.length >= MAX_STATUS_FILTER_SELECTIONS && (
                                                    <p className="text-xs text-muted-foreground">
                                                        Maximum {MAX_STATUS_FILTER_SELECTIONS} statuses can be selected at once.
                                                    </p>
                                                )}
                                            </div>
                                        )}
                                        {/* State Filter */}
                                        <div className="space-y-3">
                                            <Label className="text-sm font-medium">State</Label>

                                            <Select
                                                value={currentFilters.stateFilter}
                                                onValueChange={(value) => updateCurrentTabFilters({ stateFilter: value })}
                                            >
                                                <SelectTrigger>
                                                    <SelectValue placeholder="All States" />
                                                </SelectTrigger>

                                                <SelectContent>
                                                    <SelectItem value="all">All States</SelectItem>
                                                    {availableProvinces.map((province) => (
                                                        <SelectItem key={province} value={province}>
                                                            {province}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>

                                            {currentFilters.stateFilter !== 'all' && (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => updateCurrentTabFilters({ stateFilter: 'all' })}
                                                    className="w-full"
                                                >
                                                    Clear State Filter
                                                </Button>
                                            )}
                                        </div>

                                        {/* Store Filter */}
                                        <div className="space-y-3">
                                            <Label className="text-sm font-medium">Stores</Label>
                                            <div className="flex gap-2">
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => updateCurrentTabFilters({ selectedStores: [] })}
                                                    className="flex-1"
                                                >
                                                    Clear
                                                </Button>
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => updateCurrentTabFilters({ selectedStores: stores })}
                                                    className="flex-1"
                                                >
                                                    Select All
                                                </Button>
                                            </div>
                                            <div className="max-h-40 overflow-y-auto space-y-2 border rounded-lg p-2">
                                                {stores.map(storeId => (
                                                    <div key={storeId} className="flex items-center space-x-2">
                                                        <Checkbox
                                                            id={`store-${storeId}`}
                                                            checked={currentFilters.selectedStores.includes(storeId)}
                                                            onCheckedChange={(checked) => {
                                                                updateCurrentTabFilters({
                                                                    selectedStores: checked
                                                                        ? [...currentFilters.selectedStores, storeId]
                                                                        : currentFilters.selectedStores.filter(s => s !== storeId),
                                                                });
                                                            }}
                                                        />
                                                        <Label htmlFor={`store-${storeId}`} className="text-sm font-normal cursor-pointer truncate">
                                                            {storeId}
                                                        </Label>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Date Range */}
                                        <div className="space-y-3">
                                            <Label className="text-sm font-medium">Date Range</Label>
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="date"
                                                    className="flex-1 h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm"
                                                    value={currentFilters.dateRange?.from ? format(currentFilters.dateRange.from, 'yyyy-MM-dd') : ''}
                                                    onChange={(e) => {
                                                        const from = e.target.value ? new Date(e.target.value) : undefined;

                                                        updateCurrentTabFilters({
                                                            dateRange: from
                                                                ? { from, to: currentFilters.dateRange?.to }
                                                                : undefined,
                                                        });
                                                    }}
                                                />
                                                <span className="text-muted-foreground text-xs shrink-0">to</span>
                                                <input
                                                    type="date"
                                                    className="flex-1 h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm"
                                                    value={currentFilters.dateRange?.to ? format(currentFilters.dateRange.to, 'yyyy-MM-dd') : ''}
                                                    min={currentFilters.dateRange?.from ? format(currentFilters.dateRange.from, 'yyyy-MM-dd') : undefined}
                                                    onChange={(e) => {
                                                        const to = e.target.value ? new Date(e.target.value) : undefined;

                                                        updateCurrentTabFilters({
                                                            dateRange: currentFilters.dateRange?.from
                                                                ? { from: currentFilters.dateRange.from, to }
                                                                : undefined,
                                                        });
                                                    }}
                                                />
                                            </div>
                                            {currentFilters.dateRange && (
                                                <Button variant="ghost" size="sm" onClick={() => updateCurrentTabFilters({ dateRange: undefined })} className="w-full">
                                                    Clear Date Range
                                                </Button>
                                            )}
                                        </div>

                                        {/* Courier Filter */}
                                        {!['New', 'Confirmed', 'Cancelled'].includes(activeTab) && (
                                            <div className="space-y-3">
                                                <Label className="text-sm font-medium">Courier</Label>
                                                <Select value={currentFilters.courierFilter} onValueChange={(v) => updateCurrentTabFilters({ courierFilter: v as TabFilterState['courierFilter'] })}>
                                                    <SelectTrigger>
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="all">All Couriers</SelectItem>
                                                        <SelectItem value="Blue Dart">Blue Dart</SelectItem>
                                                        <SelectItem value="Delhivery">Delhivery</SelectItem>
                                                        <SelectItem value="Shiprocket">Shiprocket</SelectItem>
                                                        <SelectItem value="Xpressbees">Xpressbees</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        )}

                                        {/* Packed Filter */}
                                        {activeTab === 'Ready To Dispatch' && (
                                            <div className="space-y-3">
                                                <Label className="text-sm font-medium">Packed Status</Label>
                                                <Select value={currentFilters.packedFilter} onValueChange={(v) => updateCurrentTabFilters({ packedFilter: v as TabFilterState['packedFilter'] })}>
                                                    <SelectTrigger>
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="all">All Orders</SelectItem>
                                                        <SelectItem value="packed">Packed</SelectItem>
                                                        <SelectItem value="unpacked">Not Packed</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        )}

                                        {/* Availability Filter */}
                                        {activeTab === 'Confirmed' && (
                                            <div className="space-y-3">
                                                <Label className="text-sm font-medium">Availability</Label>
                                                <Select value={currentFilters.availabilityFilter} onValueChange={(v) => updateCurrentTabFilters({ availabilityFilter: v as TabFilterState['availabilityFilter'] })}>
                                                    <SelectTrigger>
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="all">All Items</SelectItem>
                                                        <SelectItem value="picked up">Picked up ({availabilityCounts?.pickedUp || 0})</SelectItem>
                                                        <SelectItem value="eligible">Pickup Eligible ({availabilityCounts?.eligible || 0})</SelectItem>
                                                        <SelectItem value="not eligible">Not Pickup eligible ({availabilityCounts?.notEligible || 0})</SelectItem>
                                                        <SelectItem value="unmapped">Unmapped ({availabilityCounts?.unmapped || 0})</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        )}

                                        {/* RTO Filter */}
                                        {activeTab === 'RTO In Transit' && (
                                            <div className="space-y-3">
                                                <Label className="text-sm font-medium">RTO Status</Label>
                                                <Select value={currentFilters.rtoInTransitFilter} onValueChange={(v) => updateCurrentTabFilters({ rtoInTransitFilter: v as TabFilterState['rtoInTransitFilter'] })}>
                                                    <SelectTrigger>
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="all">All</SelectItem>
                                                        <SelectItem value="re-attempt">Re-attempt ({rtoInTransitCounts?.reAttempt || 0})</SelectItem>
                                                        <SelectItem value="refused">Refused ({rtoInTransitCounts?.refused || 0})</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        )}
                                    </div>

                                    <SheetFooter className="shrink-0 border-t px-6 py-4">
                                        <Button
                                            type="button"
                                            variant="outline"
                                            className="w-full"
                                            onClick={clearCurrentTabFilters}
                                            disabled={activeFiltersCount === 0}
                                        >
                                            Clear All Filters
                                        </Button>
                                    </SheetFooter>
                                </SheetContent>
                            </Sheet>
                        </div>
                    </div>

                    {/* Status Tabs - Horizontal Scroll */}
                    <ScrollArea className="w-full">
                        <div className="flex px-3 pb-2 gap-1">
                            {STATUS_TABS.map((tab) => {
                                const count = statusCounts?.[tab.value] || 0;
                                const isActive = activeTab === tab.value;
                                return (
                                    <button
                                        key={tab.value}
                                        onClick={() => handleTabChange(tab.value)}
                                        className={cn(
                                            'shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap',
                                            isActive
                                                ? 'bg-primary text-primary-foreground shadow-sm'
                                                : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
                                        )}
                                    >
                                        <span className="hidden sm:inline">{tab.label}</span>
                                        <span className="sm:hidden">{tab.shortLabel}</span>
                                        <span className="ml-1 opacity-70">({count})</span>
                                    </button>
                                );
                            })}
                        </div>
                        <ScrollBar orientation="horizontal" className="h-1.5" />
                    </ScrollArea>
                </div>

                {/* Bulk Actions Bar */}
                {selectedOrders.length > 0 && (
                    <div className="shrink-0 border-b bg-primary/5">
                        {/* Selection row */}
                        <div className="px-3 py-2 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                                <Checkbox
                                    checked={areAllOnPageSelected}
                                    onCheckedChange={(checked) => handlePageCheckbox(!!checked)}
                                />
                                <span className="text-xs font-medium">
                                    {`${selectedOrders.length} selected`}
                                </span>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                        clearAllSelections()
                                    }}
                                    className="h-7 px-2 text-xs"
                                >
                                    Clear
                                </Button>
                            </div>

                            {/* Bulk Action Buttons */}
                            <div className="flex items-center gap-1">
                                {/* Download Actions Dropdown */}
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button size="sm" variant="outline" disabled={isAnyOperationInProgress}>
                                            <Download className="h-4 w-4 md:mr-1" />
                                            <span className="hidden md:inline">Download</span>
                                            <ChevronDown className="h-3 w-3 ml-1" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                        <DropdownMenuItem
                                            onClick={handleDownloadExcel}
                                            disabled={isDisabled || isDownloadingExcel || isAnyOperationInProgress}
                                        >
                                            {isDownloadingExcel && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                                            Download Excel
                                        </DropdownMenuItem>
                                        {!['All Orders', 'New', 'Confirmed', 'Cancellation Requested', 'Cancelled'].includes(activeTab) &&
                                            (<DropdownMenuItem
                                                onClick={handleDownloadSlips}
                                                disabled={isDisabled || isDownloadingSlips || isAnyOperationInProgress}
                                            >
                                                {isDownloadingSlips && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                                                Download Slips
                                            </DropdownMenuItem>
                                            )}
                                        {['Dispatched', 'Ready To Dispatch'].includes(activeTab) && (
                                            <DropdownMenuItem
                                                onClick={handleDownloadManifest}
                                                disabled={isDisabled || isDownloadingManifest || isAnyOperationInProgress}
                                            >
                                                {isDownloadingManifest && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                                                Download Manifest
                                            </DropdownMenuItem>
                                        )}
                                        {['Confirmed', 'Ready To Dispatch'].includes(activeTab) && (
                                            <DropdownMenuItem
                                                onClick={handleDownloadProductsExcel}
                                                disabled={isDisabled || isDownloadingProducts || isAnyOperationInProgress}
                                            >
                                                {isDownloadingProducts && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                                                Download Products
                                            </DropdownMenuItem>
                                        )}
                                    </DropdownMenuContent>
                                </DropdownMenu>

                                {/* Bulk Actions Dropdown */}
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button size="sm" variant="default">
                                            Actions
                                            <ChevronDown className="h-3 w-3 ml-1" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                        {activeTab === 'New' && (
                                            <DropdownMenuItem
                                                onClick={() => handleBulkUpdateStatus('Confirmed')}
                                                disabled={isDisabled || isBulkUpdating || isAnyOperationInProgress}
                                            >
                                                {isBulkUpdating && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                                                Confirm
                                            </DropdownMenuItem>
                                        )}
                                        {activeTab === 'Confirmed' && (
                                            <>
                                                <DropdownMenuItem
                                                    onClick={handleGeneratePOClick}
                                                    disabled={isDisabled || isAnyOperationInProgress}
                                                >
                                                    Generate PO
                                                </DropdownMenuItem>
                                                {(businessId === SUPER_ADMIN_ID || !selectedOrders.some(orderId => {
                                                    const storeId = selectedOrdersMap[orderId];
                                                    return SHARED_STORE_IDS.includes(String(storeId));
                                                })) && (
                                                        <DropdownMenuItem
                                                            onClick={handleAssignAwbClick}
                                                            disabled={isDisabled || (!isSharedStoreAdmin && hasSharedStoreOrder) || isAnyOperationInProgress}
                                                        >
                                                            Assign AWBs
                                                        </DropdownMenuItem>
                                                    )}
                                            </>
                                        )}
                                        {activeTab === 'Ready To Dispatch' && (
                                            <DropdownMenuItem
                                                onClick={() => handleBulkUpdateStatus('Dispatched')}
                                                disabled={isDisabled || isDispatching || isAnyOperationInProgress}
                                            >
                                                {isDispatching && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                                                Dispatch
                                            </DropdownMenuItem>
                                        )}
                                        {activeTab === 'Delivered' && (
                                            <DropdownMenuItem
                                                onClick={() => handleBulkUpdateStatus('Closed')}
                                                disabled={isDisabled || isBulkUpdating || isAnyOperationInProgress}
                                            >
                                                {isBulkUpdating && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                                                Close Orders
                                            </DropdownMenuItem>
                                        )}
                                        {activeTab === 'RTO In Transit' && (
                                            <DropdownMenuItem
                                                onClick={handleRTOClose}
                                                disabled={isDisabled || isBulkUpdating || isAnyOperationInProgress}
                                            >
                                                {isBulkUpdating && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                                                Mark RTO Closed
                                            </DropdownMenuItem>
                                        )}
                                        {activeTab === 'RTO Delivered' && (
                                            <DropdownMenuItem
                                                onClick={handleRTOClose}
                                                disabled={isDisabled || isBulkUpdating || isAnyOperationInProgress}
                                            >
                                                {isBulkUpdating && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                                                RTO Close
                                            </DropdownMenuItem>
                                        )}
                                        {activeTab === 'DTO Requested' && (
                                            <DropdownMenuItem
                                                onClick={() => handleBulkUpdateStatus('DTO Requested')}
                                                disabled={isDisabled || isBookingReturn || isAnyOperationInProgress}
                                            >
                                                {isBookingReturn && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                                                Book Returns
                                            </DropdownMenuItem>
                                        )}
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>
                        </div>

                        {/* ── Select-all-pages banner ── */}
                        {areAllOnPageSelected && hasMore && (
                            <div className="px-3 pb-2 flex items-center gap-2 text-xs border-t pt-2">
                                <span className="text-muted-foreground">
                                    All <strong>{orders.length}</strong> orders on this page are selected.
                                    More orders may exist on next pages.
                                </span>
                            </div>
                        )}
                    </div>
                )}

                {/* Content Area */}
                <div className="flex-1 overflow-hidden">
                    {isLoading ? (
                        <div className="p-4 space-y-3">
                            {Array.from({ length: 5 }).map((_, i) => (
                                <div key={i} className="border rounded-xl p-3 space-y-2">
                                    <div className="flex items-center gap-2">
                                        <Skeleton className="h-4 w-4" />
                                        <Skeleton className="h-4 w-24" />
                                        <Skeleton className="h-5 w-16 ml-auto" />
                                    </div>
                                    <Skeleton className="h-3 w-32" />
                                    <div className="flex gap-2">
                                        <Skeleton className="h-5 w-16" />
                                        <Skeleton className="h-5 w-12" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : orders.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full p-8">
                            <Package className="h-16 w-16 text-muted-foreground/30 mb-4" />
                            <h3 className="text-lg font-medium mb-1">No orders found</h3>
                            <p className="text-sm text-muted-foreground text-center">
                                {searchQuery ? 'Try adjusting your search or filters' : `No ${activeTab.toLowerCase()} orders yet`}
                            </p>
                        </div>
                    ) : (
                        <>
                            {/* Mobile View - Cards */}
                            <div className="md:hidden overflow-y-auto h-full p-3 space-y-2">
                                {orders.map((order) => (
                                    <MobileOrderCard
                                        businessId={businessId}
                                        key={order.id}
                                        order={order}
                                        isSelected={selectedOrders.includes(order.id)}
                                        onSelect={() => handleSelectOrder(order.id)}
                                        onView={() => setViewingOrder(order)}
                                        renderActionItems={renderActionItems}
                                        activeTab={activeTab}
                                        getStatusBadgeVariant={getStatusBadgeVariant}
                                        getPaymentBadgeVariant={getPaymentBadgeVariant}
                                    />
                                ))}
                            </div>

                            {/* Desktop View - Table */}
                            <div className="hidden md:block overflow-auto h-full">
                                <Table>
                                    <TableHeader className="sticky top-0 bg-card z-10">
                                        <TableRow>
                                            <TableHead className="w-12">
                                                <Checkbox
                                                    checked={areAllOnPageSelected}
                                                    onCheckedChange={(checked) => handlePageCheckbox(!!checked)}
                                                />
                                            </TableHead>
                                            <TableHead>Order</TableHead>
                                            <TableHead>Store</TableHead>
                                            <TableHead>Date</TableHead>
                                            {activeTab === 'All Orders' && <TableHead>Status</TableHead>}
                                            {!['All Orders', 'New', 'Confirmed', 'Cancellation Requested', 'Cancelled'].includes(activeTab) && (
                                                <TableHead>AWB</TableHead>
                                            )}
                                            {['DTO Booked', 'DTO In Transit', 'DTO Delivered', 'Pending Refunds', 'DTO Refunded'].includes(activeTab) && (
                                                <TableHead>Return AWB</TableHead>
                                            )}
                                            <TableHead>Customer</TableHead>
                                            <TableHead className="text-right">Total</TableHead>
                                            <TableHead>Outstanding</TableHead>
                                            <TableHead>Payment</TableHead>
                                            <TableHead>Fulfillment</TableHead>
                                            <TableHead className="text-center">Items</TableHead>
                                            {activeTab !== 'All Orders' && (
                                                <TableHead className="w-12"></TableHead>
                                            )}
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {orders.map((order) => {
                                            const customerName =
                                                (order.raw.shipping_address?.name ??
                                                    order.raw.billing_address?.name ??
                                                    `${order.raw.customer?.first_name || ''} ${order.raw.customer?.last_name || ''}`.trim()) ||
                                                order.email || '';

                                            return (
                                                <TableRow
                                                    key={order.id}
                                                    data-state={selectedOrders.includes(order.id) && "selected"}
                                                    onClick={() => setViewingOrder(order)}
                                                    className="cursor-pointer"
                                                >
                                                    <TableCell onClick={(e) => e.stopPropagation()}>
                                                        <Checkbox
                                                            checked={selectedOrders.includes(order.id)}
                                                            onCheckedChange={() => handleSelectOrder(order.id)}
                                                        />
                                                    </TableCell>
                                                    <TableCell className="font-medium">{order.name}</TableCell>
                                                    <TableCell className="text-muted-foreground text-xs">
                                                        {order.storeId.split('.')[0]}
                                                    </TableCell>
                                                    <TableCell className="text-sm">
                                                        {new Date(order.createdAt).toLocaleDateString()}
                                                    </TableCell>
                                                    {activeTab === 'All Orders' && (
                                                        <TableCell>
                                                            <Badge variant={getStatusBadgeVariant(order.customStatus)} className="text-xs">
                                                                {order.customStatus}
                                                            </Badge>
                                                        </TableCell>
                                                    )}
                                                    {!['All Orders', 'New', 'Confirmed', 'Cancellation Requested', 'Cancelled'].includes(activeTab) && (
                                                        <TableCell className="font-mono text-xs">{order.awb || '-'}</TableCell>
                                                    )}
                                                    {['DTO Booked', 'DTO In Transit', 'DTO Delivered', 'Pending Refunds', 'DTO Refunded'].includes(activeTab) && (
                                                        <TableCell className="font-mono text-xs">{order.awb_reverse || '-'}</TableCell>
                                                    )}
                                                    <TableCell className="max-w-[150px] truncate text-sm">{customerName}</TableCell>
                                                    <TableCell className="text-right font-mono text-sm">
                                                        {new Intl.NumberFormat('en-IN', { style: 'currency', currency: order.currency }).format(Number(order.raw.total_price))}
                                                    </TableCell>
                                                    <TableCell className="text-right text-xs md:text-sm font-mono">
                                                        {new Intl.NumberFormat('en-US', { style: 'currency', currency: order.currency }).format(Number(order.raw.total_outstanding) || 0)}
                                                    </TableCell>
                                                    <TableCell>
                                                        <Badge variant={getPaymentBadgeVariant(order.financialStatus) as any} className="text-xs capitalize">
                                                            {order.financialStatus?.replace('_', ' ') || 'N/A'}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell>
                                                        <Badge variant={getFulfillmentBadgeVariant(order.fulfillmentStatus) as any} className="text-xs capitalize">
                                                            {order.fulfillmentStatus || 'unfulfilled'}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="text-center text-sm">
                                                        {order.raw?.line_items?.reduce(
                                                            (sum, item) => sum + Number(item.quantity || 0),
                                                            0
                                                        ) || 0}
                                                    </TableCell>
                                                    <TableCell onClick={(e) => e.stopPropagation()}>
                                                        {activeTab !== 'All Orders' && (
                                                            <DropdownMenu>
                                                                <DropdownMenuTrigger asChild>
                                                                    <Button variant="ghost" size="icon" className="h-8 w-8">
                                                                        <MoreHorizontal className="h-4 w-4" />
                                                                    </Button>
                                                                </DropdownMenuTrigger>
                                                                <DropdownMenuContent align="end">
                                                                    <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                                                    {renderActionItems(order)}
                                                                </DropdownMenuContent>
                                                            </DropdownMenu>
                                                        )}
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                            </div>
                        </>
                    )}
                </div>

                {/* Pagination Footer */}
                <div className="shrink-0 border-t bg-card p-2 md:p-3">
                    <div className="flex items-center justify-between gap-2">
                        <p className="text-xs text-muted-foreground hidden sm:block">
                            {orders.length > 0
                                ? `Page ${currentPage} • Showing ${orders.length} order${orders.length === 1 ? '' : 's'}`
                                : 'No orders'}
                        </p>

                        <p className="text-xs text-muted-foreground sm:hidden">
                            Page {currentPage}
                        </p>

                        <div className="flex items-center gap-2">
                            <Select value={`${rowsPerPage}`} onValueChange={handleSetRowsPerPage}>
                                <SelectTrigger className="h-8 w-[70px] text-xs">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {[10, 20, 50].map((size) => (
                                        <SelectItem key={size} value={`${size}`}>{size}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>

                            <div className="flex gap-1">
                                <Button
                                    variant="outline"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={handlePreviousPage}
                                    disabled={currentPage === 1 || isFetching}
                                >
                                    <ChevronLeft className="h-4 w-4" />
                                </Button>
                                <div className="flex items-center px-2 text-xs font-medium">
                                    Page {currentPage}
                                </div>
                                <Button
                                    variant="outline"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={handleNextPage}
                                    disabled={!hasMore || isFetching}
                                >
                                    <ChevronRight className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* ============================================================ */}
            {/* DIALOGS */}
            {/* ============================================================ */}

            <AlertDialog open={isLowAwbAlertOpen} onOpenChange={setIsLowAwbAlertOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Not Enough AWBs</AlertDialogTitle>
                        <AlertDialogDescription>
                            You have selected {selectedOrders.length} orders but only have {unusedAwbsCount} unused AWBs available.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>OK</AlertDialogCancel>
                        <AlertDialogAction onClick={() => { setIsLowAwbAlertOpen(false); setIsFetchAwbDialogOpen(true); }}>
                            Fetch More AWBs
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <AwbBulkSelectionDialog
                isOpen={isAwbBulkSelectOpen}
                onClose={() => { setIsAwbBulkSelectOpen(false); setAwbBulkSelectStatus(''); }}
                onConfirm={handleBulkSelectByAwb}
                customStatus={awbBulkSelectStatus}
                orders={orders}
            />

            {ordersForAwb.length > 0 && (
                <AssignAwbDialog
                    isOpen={isAwbDialogOpen}
                    onClose={() => setIsAwbDialogOpen(false)}
                    orders={ordersForAwb}
                    onConfirm={(courier, pickupName, shippingMode) => {
                        processAwbAssignments(
                            ordersForAwb.map(o => ({
                                id: o.id,
                                name: o.name,
                                storeId: o.storeId,
                            })),
                            courier,
                            pickupName,
                            shippingMode
                        );

                        clearAllSelections();
                        setOrdersForAwb([]);
                    }}
                    businessId={businessId}
                />
            )}

            <GenerateAwbDialog
                isOpen={isFetchAwbDialogOpen}
                onClose={() => setIsFetchAwbDialogOpen(false)}
                businessId={businessId}
                user={user}
            />

            {orderForReturn && user && (
                <BookReturnDialog
                    isOpen={isReturnDialogOpen}
                    onClose={() => setIsReturnDialogOpen(false)}
                    order={orderForReturn}
                    businessId={businessId}
                    shopId={orderForReturn.storeId}
                    user={user}
                />
            )}

            {orderForQc && user && (
                <StartQcDialog
                    isOpen={isQcDialogOpen}
                    onClose={() => setIsQcDialogOpen(false)}
                    order={orderForQc}
                    shopId={orderForQc.storeId}
                    businessId={businessId}
                />
            )}

            {isAvailabilityDialogOpen && user && (
                <AvailabilityDialog
                    isOpen={isAvailabilityDialogOpen}
                    onClose={() => setIsAvailabilityDialogOpen(false)}
                    businessId={businessId}
                    user={user}
                    shopId={orders.filter(o => o.customStatus === 'Confirmed')[0]?.storeId || ''}
                    confirmedOrders={orders.filter(o => o.customStatus === 'Confirmed')}
                />
            )}

            {isGeneratePODialogOpen && user && (() => {
                const validation = validateSingleStore(selectedOrders);
                if (!validation.valid || !validation.storeId) return null;
                return (
                    <GeneratePODialog
                        isOpen={isGeneratePODialogOpen}
                        onClose={() => {
                            setIsGeneratePODialogOpen(false);
                            clearAllSelections()
                        }}
                        selectedOrders={
                            selectedOrders
                                .map(orderId => selectedOrdersDataMap[orderId])
                                .filter((order): order is Order => Boolean(order))
                        }
                        shopId={validation.storeId}
                        user={user}
                        businessId={businessId}
                    />
                );
            })()}

            {orderForRefund && (
                <RefundDialog
                    isOpen={isRefundDialogOpen}
                    onClose={() => { setIsRefundDialogOpen(false); setOrderForRefund(null); }}
                    order={orderForRefund}
                    businessId={businessId}
                    user={user}
                    onRefundSuccess={() => {
                        toast({ title: 'Refund Processed', description: 'The refund has been processed successfully.' });
                    }}
                />
            )}

            <TaxReportDialog
                isOpen={isTaxReportDialogOpen}
                onClose={() => setIsTaxReportDialogOpen(false)}
                stores={stores}
                user={user}
                businessId={businessId}
            />

            {orderForPickup && user && (
                <PerformPickupDialog
                    isOpen={isPerformPickupDialogOpen}
                    onClose={() => {
                        setIsPerformPickupDialogOpen(false);
                        setOrderForPickup(null);
                    }}
                    order={orderForPickup}
                    businessId={businessId}
                    user={user}
                    onSuccess={() => {
                        refetchOrders();
                        queryClient.invalidateQueries({ queryKey: ['availabilityCounts', businessId] });
                    }}
                />
            )}

            {isStartPackagingOpen && user && (
                <StartPackagingDialog
                    isOpen={isStartPackagingOpen}
                    onClose={() => setIsStartPackagingOpen(false)}
                    orders={orders.filter(o => o.customStatus === 'Ready To Dispatch')}
                    businessId={businessId}
                    user={user}
                />
            )}

            {/* Order Detail Dialog */}
            <Dialog open={!!viewingOrder} onOpenChange={(isOpen) => !isOpen && setViewingOrder(null)}>
                <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
                    {viewingOrder && (
                        <>
                            <DialogHeader className="shrink-0">
                                <DialogTitle className="flex items-center gap-2">
                                    <Package className="h-5 w-5" />
                                    {viewingOrder.name}
                                </DialogTitle>
                                <DialogDescription>
                                    {new Date(viewingOrder.createdAt).toLocaleString()} • {viewingOrder.storeId.split('.')[0]}
                                </DialogDescription>
                            </DialogHeader>

                            <div className="flex-1 overflow-y-auto">
                                <div className="grid md:grid-cols-2 gap-6 p-1">
                                    {/* Order Details */}
                                    <div className="space-y-4">
                                        <div>
                                            <h4 className="text-sm font-semibold mb-2">Status</h4>
                                            <div className="flex flex-wrap gap-2">
                                                <Badge variant={getStatusBadgeVariant(viewingOrder.customStatus)}>
                                                    {viewingOrder.customStatus}
                                                </Badge>
                                                <Badge variant={getPaymentBadgeVariant(viewingOrder.financialStatus) as any} className="capitalize">
                                                    {viewingOrder.financialStatus?.replace('_', ' ')}
                                                </Badge>
                                                <Badge variant={getFulfillmentBadgeVariant(viewingOrder.fulfillmentStatus) as any} className="capitalize">
                                                    {viewingOrder.fulfillmentStatus || 'unfulfilled'}
                                                </Badge>
                                            </div>
                                        </div>

                                        {viewingOrder.vendors && viewingOrder.vendors.length > 0 && (
                                            <div>
                                                <h4 className="font-semibold">Vendors</h4>
                                                <div className="flex flex-wrap gap-2 mt-1">
                                                    {viewingOrder.vendors.map((vendor: string, index: number) => (
                                                        <span
                                                            key={index}
                                                            className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium"
                                                        >
                                                            {vendor}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {(viewingOrder.awb || viewingOrder.courier) && (
                                            <div>
                                                <h4 className="text-sm font-semibold mb-2">Shipment</h4>
                                                <div className="text-sm space-y-1">
                                                    {viewingOrder.courier && <p>Courier: <b><u><i>{viewingOrder.courier}</i></u></b></p>}
                                                    {viewingOrder.awb && <p>AWB: <b><u><i>{viewingOrder.awb}</i></u></b></p>}
                                                    {viewingOrder.courierReverseProvider && <p>Return Courier: <b><u><i>{viewingOrder.courierReverseProvider}</i></u></b></p>}
                                                    {viewingOrder.awb_reverse && (
                                                        <p>Return: <b><u><i>{viewingOrder.awb_reverse}</i></u></b></p>
                                                    )}
                                                </div>
                                            </div>
                                        )}

                                        <div>
                                            <h4 className="text-sm font-semibold mb-2">Customer</h4>
                                            <div className="text-sm space-y-1">
                                                <p className="font-medium">
                                                    {
                                                        viewingOrder.raw.shipping_address?.name ||
                                                        viewingOrder.raw.billing_address?.name ||
                                                        viewingOrder.raw.default_address?.name ||
                                                        `${viewingOrder.raw.customer?.first_name || ''} ${viewingOrder.raw.customer?.last_name || ''}`.trim() ||
                                                        'Unknown'
                                                    }
                                                </p>
                                                <p className="text-muted-foreground">{viewingOrder.email}</p>
                                                {(
                                                    viewingOrder.raw.shipping_address ||
                                                    viewingOrder.raw.billing_address ||
                                                    viewingOrder.raw.default_address
                                                ) && (
                                                        <div className="text-muted-foreground mt-2">
                                                            <p>
                                                                {
                                                                    viewingOrder.raw.shipping_address?.address1 ||
                                                                    viewingOrder.raw.billing_address?.address1 ||
                                                                    viewingOrder.raw.default_address?.address1 ||
                                                                    "N/A"
                                                                }
                                                            </p>
                                                            {(
                                                                viewingOrder.raw.shipping_address?.address2 ||
                                                                viewingOrder.raw.billing_address?.address2 ||
                                                                viewingOrder.raw.default_address?.address2
                                                            ) && (
                                                                    <p>
                                                                        {
                                                                            viewingOrder.raw.shipping_address?.address2 ||
                                                                            viewingOrder.raw.billing_address?.address2 ||
                                                                            viewingOrder.raw.default_address?.address2 ||
                                                                            "N/A"
                                                                        }
                                                                    </p>
                                                                )}
                                                            <p>
                                                                {
                                                                    viewingOrder.raw.shipping_address?.city ||
                                                                    viewingOrder.raw.billing_address?.city ||
                                                                    viewingOrder.raw.default_address?.city ||
                                                                    "N/A"
                                                                }, {
                                                                    viewingOrder.raw.shipping_address?.province ||
                                                                    viewingOrder.raw.billing_address?.province ||
                                                                    viewingOrder.raw.default_address?.province ||
                                                                    "N/A"
                                                                } {
                                                                    viewingOrder.raw.shipping_address?.zip ||
                                                                    viewingOrder.raw.billing_address?.zip ||
                                                                    viewingOrder.raw.default_address?.zip ||
                                                                    "N/A"
                                                                }
                                                            </p>
                                                            {(
                                                                viewingOrder.raw.shipping_address?.phone ||
                                                                viewingOrder.raw.billing_address?.phone ||
                                                                viewingOrder.raw.default_address?.phone
                                                            ) && (
                                                                    <p>
                                                                        Phone: {
                                                                            viewingOrder.raw.shipping_address?.phone ||
                                                                            viewingOrder.raw.billing_address?.phone ||
                                                                            viewingOrder.raw.default_address?.phone ||
                                                                            "N/A"
                                                                        }
                                                                    </p>
                                                                )}
                                                        </div>
                                                    )}
                                            </div>
                                        </div>

                                        <div>
                                            <h4 className="text-sm font-semibold mb-2">Items ({viewingOrder.raw.line_items?.length || 0})</h4>
                                            <div className="space-y-2">
                                                {viewingOrder.raw.line_items?.map((item: any, i: number) => (
                                                    <div key={i} className="flex items-start justify-between text-sm p-2 rounded-lg bg-muted/50">
                                                        <div className="min-w-0 flex-1">
                                                            <p className="font-medium truncate">{item.name}</p>
                                                            <p className="text-xs text-muted-foreground">
                                                                SKU: {item.sku || 'N/A'} • Qty: {item.quantity}
                                                            </p>
                                                        </div>
                                                        <p className="font-mono shrink-0 ml-2">
                                                            {new Intl.NumberFormat('en-IN', { style: 'currency', currency: viewingOrder.currency }).format(item.price * item.quantity)}
                                                        </p>
                                                    </div>
                                                ))}
                                            </div>
                                            <div className="flex justify-between items-center mt-3 pt-3 border-t font-semibold">
                                                <span>Total</span>
                                                <span className="font-mono">
                                                    {new Intl.NumberFormat('en-IN', { style: 'currency', currency: viewingOrder.currency }).format(Number(viewingOrder.raw.total_price))}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Packing Videos */}
                                        {viewingOrder.packingVidUrls && viewingOrder.packingVidUrls.length > 0 && (
                                            <div>
                                                <h4 className="text-sm font-semibold mb-2">
                                                    Packing Videos ({viewingOrder.packingVidUrls.length})
                                                </h4>
                                                <div className="space-y-2">
                                                    {viewingOrder.packingVidUrls.map((entry: { packingVidUrl: string; packedAt: any }, i: number) => {
                                                        const packedDate = entry.packedAt?.toDate?.()
                                                            ? entry.packedAt.toDate().toLocaleString('en-IN', {
                                                                day: '2-digit',
                                                                month: 'short',
                                                                year: 'numeric',
                                                                hour: '2-digit',
                                                                minute: '2-digit',
                                                                hour12: true,
                                                            })
                                                            : 'Unknown time';

                                                        return (
                                                            <a
                                                                key={i}
                                                                href={entry.packingVidUrl}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="flex items-center justify-between gap-3 p-2 rounded-lg bg-muted/50 hover:bg-muted transition-colors group"
                                                            >
                                                                <div className="flex items-center gap-2 min-w-0">
                                                                    <Video className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-foreground transition-colors" />
                                                                    <div className="min-w-0">
                                                                        <p className="text-xs font-medium truncate">
                                                                            Packing Video {i + 1}
                                                                        </p>
                                                                        <p className="text-[10px] text-muted-foreground truncate">
                                                                            {packedDate}
                                                                        </p>
                                                                    </div>
                                                                </div>
                                                                <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground group-hover:text-foreground transition-colors" />
                                                            </a>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* History */}
                                    <div>
                                        <h4 className="text-sm font-semibold mb-2">History</h4>
                                        {viewingOrder.customStatusesLogs && viewingOrder.customStatusesLogs.length > 0 ? (
                                            <div className="space-y-3">
                                                {[...viewingOrder.customStatusesLogs]
                                                    .sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis())
                                                    .map((log, i) => (
                                                        <div key={i} className="flex items-start gap-3">
                                                            <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                                                                <Clock className="h-4 w-4 text-muted-foreground" />
                                                            </div>
                                                            <div className="min-w-0">
                                                                <p className="text-sm font-medium">{log.status}</p>
                                                                <p className="text-xs text-muted-foreground">
                                                                    {log.createdAt?.toDate().toLocaleString()}
                                                                </p>
                                                                {log.remarks && (
                                                                    <p className="text-xs text-muted-foreground mt-1">{log.remarks}</p>
                                                                )}
                                                            </div>
                                                        </div>
                                                    ))}
                                            </div>
                                        ) : (
                                            <p className="text-sm text-muted-foreground">No history available</p>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {viewingOrder.awb && viewingOrder.courier && (
                                <div className="shrink-0 pt-4 border-t flex justify-end">
                                    <Button asChild>
                                        <a
                                            href={
                                                viewingOrder.courier.toLowerCase() === 'delhivery'
                                                    ? `https://www.delhivery.com/track-v2/package/${viewingOrder.awb}`
                                                    : viewingOrder.courier.toLowerCase().includes('shiprocket')
                                                        ? `https://shiprocket.co/tracking/${viewingOrder.awb}`
                                                        : `https://www.xpressbees.com/shipment/tracking?awbNo=${viewingOrder.awb}`
                                            }
                                            target="_blank"
                                            rel="noopener noreferrer"
                                        >
                                            <Truck className="h-4 w-4 mr-2" />
                                            Track Forward Order
                                        </a>
                                    </Button>
                                </div>
                            )}
                        </>
                    )}
                </DialogContent>
            </Dialog>
        </>
    );
}