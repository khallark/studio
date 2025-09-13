
'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Download, MoreHorizontal, Trash2, Bot, User, MoveRight, Calendar as CalendarIcon, X } from 'lucide-react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '@/lib/firebase';
import { collection, doc, getDoc, onSnapshot, query, orderBy, Timestamp } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AssignAwbDialog } from '@/components/assign-awb-dialog';
import { useProcessingQueue } from '@/contexts/processing-queue-context';
import Link from 'next/link';
import { GenerateAwbDialog } from '@/components/generate-awb-dialog';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DateRange } from 'react-day-picker';
import { Calendar } from '@/components/ui/calendar';
import { format, addDays } from 'date-fns';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

type CustomStatus = 'New' | 'Confirmed' | 'Ready To Dispatch' | 'Dispatched' | 'Cancelled';

interface OrderLog {
  type: 'USER_ACTION' | 'WEBHOOK';
  action: string;
  timestamp: Timestamp;
  details: any;
  user?: { displayName: string };
}

interface Order {
  id: string; // Firestore document ID
  name: string;
  createdAt: string;
  email: string;
  totalPrice: number;
  currency: string;
  financialStatus: string;
  fulfillmentStatus: string;
  customStatus: CustomStatus;
  awb?: string;
  courier?: 'Delhivery' | 'Shiprocket';
  isDeleted?: boolean; // Tombstone flag
  logs?: OrderLog[];
  raw: {
    cancelled_at: string | null;
    customer?: {
      first_name?: string;
      last_name?: string;
    };
    line_items: any[];
    shipping_address?: {
        address1: string;
        address2: string;
        city: string;
        zip: string;
        province: string;
        country: string;
    }
  }
}

interface UserData {
  activeAccountId: string | null;
}

export default function OrdersPage() {
  const [user, userLoading] = useAuthState(auth);
  const { toast } = useToast();
  const { processAwbAssignments } = useProcessingQueue();
  
  const [orders, setOrders] = useState<Order[]>([]);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);
  const [isDownloadingExcel, setIsDownloadingExcel] = useState(false);
  const [viewingOrder, setViewingOrder] = useState<Order | null>(null);
  const [unusedAwbsCount, setUnusedAwbsCount] = useState(0);

  const [activeTab, setActiveTab] = useState<CustomStatus>('New');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedOrders, setSelectedOrders] = useState<string[]>([]);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  
  const [isAwbDialogOpen, setIsAwbDialogOpen] = useState(false);
  const [isFetchAwbDialogOpen, setIsFetchAwbDialogOpen] = useState(false);
  const [isLowAwbAlertOpen, setIsLowAwbAlertOpen] = useState(false);
  const [ordersForAwb, setOrdersForAwb] = useState<Order[]>([]);
  const [isDownloadingSlips, setIsDownloadingSlips] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [courierFilter, setCourierFilter] = useState<string>('all');


  useEffect(() => {
    const fetchUserData = async () => {
      if (user) {
        const userRef = doc(db, 'users', user.uid);
        const userDoc = await getDoc(userRef);
        if (userDoc.exists()) {
          setUserData(userDoc.data() as UserData);
        } else {
          setLoading(false);
        }
      }
    };
    if (!userLoading) {
      fetchUserData();
    }
  }, [user, userLoading]);

  useEffect(() => {
    if (userData?.activeAccountId) {
      setLoading(true);
      const ordersRef = collection(db, 'accounts', userData.activeAccountId, 'orders');
      const q = query(ordersRef, orderBy('createdAt', 'desc'));

      const unsubscribe = onSnapshot(q, (snapshot) => {
        const fetchedOrders = snapshot.docs
          .map(doc => ({ id: doc.id, ...doc.data() } as Order))
          .filter(order => order.isDeleted !== true);
          
        setOrders(fetchedOrders);
        setLoading(false);
      }, (error) => {
        console.error("Error fetching orders:", error);
        toast({
          title: "Error fetching orders",
          description: "Could not connect to the database. Please try again.",
          variant: "destructive",
        });
        setLoading(false);
      });

      // Listen for AWB count
      const awbsRef = collection(db, 'accounts', userData.activeAccountId, 'unused_awbs');
      const unsubscribeAwbs = onSnapshot(awbsRef, (snapshot) => {
          setUnusedAwbsCount(snapshot.size);
      });


      return () => {
        unsubscribe();
        unsubscribeAwbs();
      };
    } else if (!userLoading && userData) {
        setLoading(false);
    }
  }, [userData, toast, userLoading]);
  
  const handleAssignAwbClick = () => {
      const ordersToProcess = orders.filter(o => selectedOrders.includes(o.id));
      if (ordersToProcess.length === 0) {
        toast({ title: 'No orders selected', description: 'Please select orders from the "Confirmed" tab to assign AWBs.', variant: 'destructive'});
        return;
      }
      if (ordersToProcess.length > unusedAwbsCount) {
          setIsLowAwbAlertOpen(true);
      } else {
          setOrdersForAwb(ordersToProcess);
          setIsAwbDialogOpen(true);
      }
  };

  const handleBackfill = useCallback(async () => {
    if (!userData?.activeAccountId || !user) {
      toast({
        title: "No active store",
        description: "Please connect a Shopify store first.",
        variant: "destructive",
      });
      return;
    }
    setIsSyncing(true);
    toast({
      title: "Starting Order Sync",
      description: "Fetching all your orders from Shopify. This might take a few minutes...",
    });

    try {
      const idToken = await user.getIdToken();
      const response = await fetch('/api/shopify/backfill', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({ shop: userData.activeAccountId }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.details || 'Failed to start backfill');
      }

      toast({
        title: "Sync Complete",
        description: result.message,
      });

    } catch (error) {
      console.error('Backfill error:', error);
      toast({
        title: 'Sync Failed',
        description: error instanceof Error ? error.message : 'An unknown error occurred.',
        variant: 'destructive',
      });
    } finally {
      setIsSyncing(false);
    }
  }, [userData, toast, user]);

  const handleUpdateStatus = useCallback(async (orderId: string, status: CustomStatus) => {
    if (!userData?.activeAccountId || !user) return;
    try {
      const idToken = await user.getIdToken();
      const response = await fetch('/api/shopify/orders/update-status', {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({ shop: userData.activeAccountId, orderId, status }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.details || 'Failed to update status');
      toast({ title: 'Status Updated', description: `Order status changed to ${status}.` });
    } catch (error) {
      console.error('Status update error:', error);
      toast({
        title: 'Update Failed',
        description: error instanceof Error ? error.message : 'An unknown error occurred.',
        variant: 'destructive',
      });
    }
  }, [userData, toast, user]);

  const handleBulkUpdateStatus = useCallback(async (status: CustomStatus) => {
    if (!userData?.activeAccountId || !user || selectedOrders.length === 0) return;
    
    setIsBulkUpdating(true);
    try {
        const idToken = await user.getIdToken();
        const response = await fetch('/api/shopify/orders/bulk-update-status', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${idToken}`
            },
            body: JSON.stringify({
                shop: userData.activeAccountId,
                orderIds: selectedOrders,
                status,
            }),
        });

        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.details || `Failed to update ${selectedOrders.length} orders.`);
        }

        toast({
            title: 'Bulk Update Successful',
            description: result.message,
        });

        setSelectedOrders([]); // Clear selection after successful update

    } catch (error) {
        console.error('Bulk update error:', error);
        toast({
            title: 'Bulk Update Failed',
            description: error instanceof Error ? error.message : 'An unknown error occurred.',
            variant: 'destructive',
        });
    } finally {
        setIsBulkUpdating(false);
    }
}, [userData, user, selectedOrders, toast]);


  const handleDeleteOrder = useCallback(async (orderId: string) => {
    if (!userData?.activeAccountId) return;
    try {
      const response = await fetch('/api/shopify/orders/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shop: userData.activeAccountId, orderId }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.details || 'Failed to delete order');
      toast({ title: 'Order Deletion Initiated', description: `Order will be removed shortly.` });
    } catch (error) {
      console.error('Delete order error:', error);
      toast({
        title: 'Delete Failed',
        description: error instanceof Error ? error.message : 'An unknown error occurred.',
        variant: 'destructive',
      });
    }
  }, [userData, toast]);
  
  const statusCounts = useMemo(() => {
    const initialCounts: Record<CustomStatus, number> = {
      New: 0,
      Confirmed: 0,
      'Ready To Dispatch': 0,
      Dispatched: 0,
      Cancelled: 0,
    };
    return orders.reduce((acc, order) => {
      if (order.isDeleted) return acc;
      // If Shopify says it's cancelled, it's cancelled. This takes precedence.
      if (order.raw?.cancelled_at) {
        acc['Cancelled']++;
      } else {
        const status = order.customStatus || 'New';
        if (acc[status] !== undefined) {
          acc[status]++;
        }
      }
      return acc;
    }, initialCounts);
  }, [orders]);
  
  const filteredOrders = useMemo(() => {
    let filtered = orders;

    // Filter by status tab first
    filtered = filtered.filter(order => {
        if (order.isDeleted) return false;
        
        const isShopifyCancelled = !!order.raw?.cancelled_at;

        if (activeTab === 'Cancelled') {
            return isShopifyCancelled;
        }

        // Exclude Shopify-cancelled orders from all other tabs
        if (isShopifyCancelled) {
            return false;
        }
        
        return (order.customStatus || 'New') === activeTab;
    });

    // Then, filter by search query
    if (searchQuery) {
        const lowercasedQuery = searchQuery.toLowerCase();
        filtered = filtered.filter(order => {
            const customerName = `${order.raw.customer?.first_name || ''} ${order.raw.customer?.last_name || ''}`.trim().toLowerCase();
            return (
                order.name.toLowerCase().includes(lowercasedQuery) ||
                customerName.includes(lowercasedQuery) ||
                (order.awb && order.awb.toLowerCase().includes(lowercasedQuery))
            );
        });
    }
    
    // Then, filter by date range
    if (dateRange?.from && dateRange?.to) {
        filtered = filtered.filter(order => {
            const orderDate = new Date(order.createdAt);
            // Add a day to the 'to' date to make the range inclusive
            return orderDate >= dateRange.from! && orderDate < addDays(dateRange.to!, 1);
        });
    }

    // Finally, filter by courier if on the 'Ready To Dispatch' tab
    if (activeTab === 'Ready To Dispatch' && courierFilter !== 'all') {
        filtered = filtered.filter(order => order.courier === courierFilter);
    }


    return filtered;
}, [orders, activeTab, searchQuery, dateRange, courierFilter]);


  const indexOfLastOrder = currentPage * rowsPerPage;
  const indexOfFirstOrder = indexOfLastOrder - rowsPerPage;
  const currentOrders = filteredOrders.slice(indexOfFirstOrder, indexOfLastOrder);
  const totalPages = Math.ceil(filteredOrders.length / rowsPerPage);

  useEffect(() => {
    setCurrentPage(1);
    setSelectedOrders([]);
  }, [activeTab, searchQuery, dateRange, rowsPerPage, courierFilter]);

  const handleNextPage = () => {
    if (currentPage < totalPages) setCurrentPage(currentPage + 1);
  };
  const handlePreviousPage = () => {
    if (currentPage > 1) setCurrentPage(currentPage - 1);
  };
  
  const getFulfillmentBadgeVariant = (status: string | null) => {
    switch(status?.toLowerCase()) {
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
  }

  const getPaymentBadgeVariant = (status: string | null) => {
    switch(status?.toLowerCase()) {
        case 'paid':
            return 'default';
        case 'pending':
            return 'secondary';
        case 'refunded':
        case 'partially_refunded':
            return 'outline';
        case 'voided':
            return 'destructive'
        default:
            return 'secondary';
    }
  }

  const handleDownloadSlips = useCallback(async () => {
    if (!userData?.activeAccountId || !user || selectedOrders.length === 0) return;

    setIsDownloadingSlips(true);
    toast({ title: "Generating Slips", description: "Your download will begin automatically. Please wait." });

    try {
      const ordersToDownload = orders.filter(o => selectedOrders.includes(o.id) && o.awb);
      // stringify + dedupe
      const awbs = Array.from(new Set(ordersToDownload.map(o => String(o.awb))));
      if (awbs.length === 0) {
        toast({ title: "No AWBs found", description: "None of the selected orders have an AWB assigned.", variant: "destructive" });
        return;
      }

      const idToken = await user.getIdToken();
      const filename = `slips-${new Date().toISOString().split("T")[0]}.pdf`;

      const response = await fetch("/api/shopify/courier/slips-merge", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          shop: userData.activeAccountId,
          awbs,
          filename,
          outsize: 'A4',
        }),
      });

      if (!response.ok) {
        // try JSON, fall back to text
        let msg = "Failed to download slips";
        try {
          const err = await response.json();
          msg = err?.details || err?.error || msg;
        } catch {
          msg = await response.text().catch(() => msg);
        }
        throw new Error(msg);
      }

      // Optional: read headers about skipped slips
      const missing = response.headers.get("x-missing-awbs");
      const invalid = response.headers.get("x-invalid-awbs");
      if (missing || invalid) {
        toast({
          title: "Some slips were skipped",
          description: `${missing ? `${missing} missing` : ""}${missing && invalid ? ", " : ""}${invalid ? `${invalid} invalid` : ""}`,
        });
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      setSelectedOrders([]);
    } catch (error) {
      console.error("Download slips error:", error);
      toast({
        title: "Download Failed",
        description: error instanceof Error ? error.message : "An unknown error occurred.",
        variant: "destructive",
      });
    } finally {
      setIsDownloadingSlips(false);
    }
  }, [userData, user, selectedOrders, orders, toast]);

    const handleDownloadExcel = useCallback(async (exportType?: 'confirmed') => {
        if (!userData?.activeAccountId || !user || selectedOrders.length === 0) return;

        setIsDownloadingExcel(true);
        toast({ title: "Generating Excel File", description: "Your download will begin automatically. Please wait." });

        try {
        const idToken = await user.getIdToken();
        const response = await fetch('/api/shopify/orders/export', {
            method: 'POST',
            headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}`
            },
            body: JSON.stringify({
            shop: userData.activeAccountId,
            orderIds: selectedOrders,
            exportType: exportType
            }),
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.details || 'Failed to generate Excel file.');
        }

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `orders-export-${new Date().toISOString().split('T')[0]}.xlsx`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);

        setSelectedOrders([]);

        } catch (error) {
        console.error('Excel export error:', error);
        toast({
            title: 'Export Failed',
            description: error instanceof Error ? error.message : 'An unknown error occurred.',
            variant: 'destructive',
        });
        } finally {
        setIsDownloadingExcel(false);
        }
    }, [userData, user, selectedOrders, toast]);


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
            <DropdownMenuItem onClick={() => handleUpdateStatus(order.id, 'Cancelled')} className="text-destructive">
              Cancel
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
            <DropdownMenuItem onClick={() => handleUpdateStatus(order.id, 'Cancelled')} className="text-destructive">
              Cancel
            </DropdownMenuItem>
          </>
        );
      case 'Ready To Dispatch':
        return (
          <>
             <DropdownMenuItem onClick={() => handleUpdateStatus(order.id, 'Dispatched')}>
              Dispatch
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleUpdateStatus(order.id, 'Cancelled')} className="text-destructive">
              Cancel
            </DropdownMenuItem>
          </>
        );
      case 'Dispatched':
        return (
           <DropdownMenuItem onClick={() => handleUpdateStatus(order.id, 'Cancelled')} className="text-destructive">
              Cancel
            </DropdownMenuItem>
        );
      case 'Cancelled':
        return (
          <>
            <DropdownMenuItem onClick={() => handleDeleteOrder(order.id)} className="text-destructive">
              <Trash2 className="mr-2 h-4 w-4" />
              Delete Order
            </DropdownMenuItem>
          </>
        );
      default:
        return null;
    }
  }
  
  const handleSelectOrder = (orderId: string) => {
    setSelectedOrders(prev => 
      prev.includes(orderId) ? prev.filter(id => id !== orderId) : [...prev, orderId]
    );
  };
  
  const handleSelectAll = (isChecked: boolean) => {
    if (isChecked) {
      setSelectedOrders(currentOrders.map(o => o.id));
    } else {
      setSelectedOrders([]);
    }
  };

  const renderBulkActionButtons = () => {
    const isAnyOrderSelected = selectedOrders.length > 0;
    const isDisabled = !isAnyOrderSelected || isBulkUpdating;
  
    switch (activeTab) {
      case 'New':
        return (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={isDisabled || isDownloadingExcel} onClick={() => handleDownloadExcel()}>
              <Download className="mr-2 h-4 w-4" />
              {isDownloadingExcel ? 'Downloading...' : `Download Excel (${selectedOrders.length})`}
            </Button>
            <Button variant="outline" size="sm" disabled={isDisabled} onClick={() => handleBulkUpdateStatus('Confirmed')}>
                {isBulkUpdating ? 'Confirming...' : 'Confirm'}
            </Button>
            <Button variant="destructive" size="sm" disabled={isDisabled} onClick={() => handleBulkUpdateStatus('Cancelled')}>
                {isBulkUpdating ? 'Cancelling...' : 'Cancel'}
            </Button>
          </div>
        );
      case 'Confirmed':
        return (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={isDisabled || isDownloadingExcel} onClick={() => handleDownloadExcel('confirmed')}>
              <Download className="mr-2 h-4 w-4" />
              {isDownloadingExcel ? 'Downloading...' : `Download Excel (${selectedOrders.length})`}
            </Button>
            <Button variant="outline" size="sm" disabled={isDisabled} onClick={handleAssignAwbClick}>
                Assign AWBs
            </Button>
            <Button variant="destructive" size="sm" disabled={isDisabled} onClick={() => handleBulkUpdateStatus('Cancelled')}>
                {isBulkUpdating ? 'Cancelling...' : 'Cancel'}
            </Button>
          </div>
        );
      case 'Ready To Dispatch':
         return (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={isDownloadingSlips || isDisabled} onClick={handleDownloadSlips}>
              <Download className="mr-2 h-4 w-4" />
              {isDownloadingSlips ? 'Downloading...' : `Download Slips for ${selectedOrders.length} Order(s)`}
            </Button>
            <Button variant="outline" size="sm" disabled={isDisabled} onClick={() => handleBulkUpdateStatus('Dispatched')}>
                {isBulkUpdating ? 'Dispatching...' : 'Dispatch'}
            </Button>
            <Button variant="destructive" size="sm" disabled={isDisabled} onClick={() => handleBulkUpdateStatus('Cancelled')}>
                {isBulkUpdating ? 'Cancelling...' : 'Cancel'}
            </Button>
          </div>
        );
      case 'Dispatched':
        return (
          <div className="flex gap-2">
             <Button variant="destructive" size="sm" disabled={isDisabled} onClick={() => handleBulkUpdateStatus('Cancelled')}>
                {isBulkUpdating ? 'Cancelling...' : 'Cancel'}
            </Button>
          </div>
        );
      case 'Cancelled':
      default:
        return null;
    }
  };


  return (
    <>
    <main className="flex flex-1 flex-col h-full">
      <div className="flex-1 flex flex-col overflow-hidden">
         <Card className="flex flex-col h-full border-0 rounded-none">
            <CardHeader className="border-b p-4 md:p-6 shrink-0">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div>
                        <CardTitle>Your Orders</CardTitle>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap justify-end">
                        {renderBulkActionButtons()}
                        <Button onClick={handleBackfill} disabled={isSyncing || !userData?.activeAccountId} size="sm" variant="outline">
                            <Download className="mr-2 h-4 w-4" />
                            {isSyncing ? 'Syncing...' : 'Sync Orders'}
                        </Button>
                        <Button asChild size="sm">
                            <Link href="/dashboard/orders/awb-processing">
                                Go to AWB Processing
                                <MoveRight className="ml-2 h-4 w-4" />
                            </Link>
                        </Button>
                    </div>
                </div>
                 <div className="mt-4 flex flex-col md:flex-row items-center gap-2">
                    <Input
                        placeholder="Search by order, customer, AWB..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="max-w-xs"
                    />
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button
                                id="date"
                                variant={"outline"}
                                className={cn(
                                "w-[300px] justify-start text-left font-normal",
                                !dateRange && "text-muted-foreground"
                                )}
                            >
                                <CalendarIcon className="mr-2 h-4 w-4" />
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
                                <span>Pick a date</span>
                                )}
                            </Button>
                        </PopoverTrigger>
                        {dateRange && (
                           <Button variant="ghost" size="sm" onClick={() => setDateRange(undefined)} className="ml-2">
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
                    {activeTab === 'Ready To Dispatch' && (
                        <Select value={courierFilter} onValueChange={setCourierFilter}>
                            <SelectTrigger className="w-full md:w-[180px]">
                                <SelectValue placeholder="Filter by courier..." />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Couriers</SelectItem>
                                <SelectItem value="Delhivery">Delhivery</SelectItem>
                                <SelectItem value="Shiprocket">Shiprocket</SelectItem>
                            </SelectContent>
                        </Select>
                    )}
                </div>
            </CardHeader>
            <div className="flex-1 flex flex-col p-0 overflow-hidden">
            <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as CustomStatus)} className="flex flex-col h-full">
                <TabsList className="grid w-full grid-cols-2 sm:grid-cols-3 md:grid-cols-5 h-auto rounded-none border-b p-2 shrink-0">
                <TabsTrigger value="New">New ({statusCounts['New'] || 0})</TabsTrigger>
                <TabsTrigger value="Confirmed">Confirmed ({statusCounts['Confirmed'] || 0})</TabsTrigger>
                <TabsTrigger value="Ready To Dispatch">Ready To Dispatch ({statusCounts['Ready To Dispatch'] || 0})</TabsTrigger>
                <TabsTrigger value="Dispatched">Dispatched ({statusCounts['Dispatched'] || 0})</TabsTrigger>
                <TabsTrigger value="Cancelled">Cancelled ({statusCounts['Cancelled'] || 0})</TabsTrigger>
                </TabsList>
                <div className="flex-1 overflow-y-auto">
                <Table>
                    <TableHeader>
                    <TableRow>
                        <TableHead className="w-[50px]">
                        <Checkbox
                            checked={currentOrders.length > 0 && selectedOrders.length === currentOrders.length}
                            onCheckedChange={(checked) => handleSelectAll(!!checked)}
                            aria-label="Select all"
                        />
                        </TableHead>
                        <TableHead>Order ID</TableHead>
                        <TableHead>AWB</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead>Payment Status</TableHead>
                        <TableHead>Fulfillment Status</TableHead>
                        <TableHead>Items</TableHead>
                        <TableHead>
                        <span className="sr-only">Actions</span>
                        </TableHead>
                    </TableRow>
                    </TableHeader>
                    <TableBody>
                    {loading ? (
                        Array.from({ length: 5 }).map((_, i) => (
                        <TableRow key={i}>
                            <TableCell><Skeleton className="h-5 w-5" /></TableCell>
                            <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                            <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                            <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                            <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                            <TableCell className="text-right"><Skeleton className="h-5 w-16 ml-auto" /></TableCell>
                            <TableCell><Skeleton className="h-6 w-24" /></TableCell>
                            <TableCell><Skeleton className="h-6 w-24" /></TableCell>
                            <TableCell><Skeleton className="h-5 w-10" /></TableCell>
                            <TableCell><Skeleton className="h-8 w-8 ml-auto" /></TableCell>
                        </TableRow>
                        ))
                    ) : currentOrders.length > 0 ? (
                        currentOrders.map((order) => {
                        const customerName = `${order.raw.customer?.first_name || ''} ${order.raw.customer?.last_name || ''}`.trim();
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
                                aria-label={`Select order ${order.name}`}
                                />
                            </TableCell>
                            <TableCell className="font-medium">{order.name}</TableCell>
                            <TableCell>{order.awb || 'N/A'}</TableCell>
                            <TableCell>{new Date(order.createdAt).toLocaleDateString()}</TableCell>
                            <TableCell>{customerName || order.email}</TableCell>
                            <TableCell className="text-right">
                                {new Intl.NumberFormat('en-US', { style: 'currency', currency: order.currency }).format(order.totalPrice)}
                            </TableCell>
                            <TableCell>
                                <Badge variant={getPaymentBadgeVariant(order.financialStatus)} className="capitalize">
                                {order.financialStatus?.replace('_', ' ') || 'N/A'}
                                </Badge>
                            </TableCell>
                            <TableCell>
                                <Badge variant={getFulfillmentBadgeVariant(order.fulfillmentStatus)} className="capitalize">
                                {order.fulfillmentStatus || 'unfulfilled'}
                                </Badge>
                            </TableCell>
                            <TableCell>
                                {order.raw?.line_items?.length || 0}
                            </TableCell>
                            <TableCell onClick={(e) => e.stopPropagation()}>
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
                        )
                        })
                    ) : (
                        <TableRow>
                        <TableCell colSpan={10} className="text-center h-24">
                            {userData?.activeAccountId ? `No ${activeTab.toLowerCase()} orders found.` : 'Please connect a store to see your orders.'}
                        </TableCell>
                        </TableRow>
                    )}
                    </TableBody>
                </Table>
                </div>
            </Tabs>
            </div>
            <CardFooter className="p-4 border-t shrink-0">
                <div className="flex items-center justify-between w-full">
                    <div className="text-xs text-muted-foreground">
                        {selectedOrders.length > 0
                        ? `${selectedOrders.length} of ${filteredOrders.length} order(s) selected.`
                        : `Showing ${filteredOrders.length > 0 ? indexOfFirstOrder + 1 : 0}-${Math.min(indexOfLastOrder, filteredOrders.length)} of ${filteredOrders.length} orders`
                    }
                    </div>
                        <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">Rows per page</span>
                            <Select
                                value={`${rowsPerPage}`}
                                onValueChange={(value) => {
                                    setRowsPerPage(Number(value));
                                    setCurrentPage(1);
                                }}
                                >
                                <SelectTrigger className="h-8 w-[70px]">
                                    <SelectValue placeholder={rowsPerPage} />
                                </SelectTrigger>
                                <SelectContent>
                                    {[10, 20, 30, 40, 50, 100, 200].map((pageSize) => (
                                    <SelectItem key={pageSize} value={`${pageSize}`}>
                                        {pageSize}
                                    </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="flex gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handlePreviousPage}
                            disabled={currentPage === 1}
                        >
                            Previous
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleNextPage}
                            disabled={currentPage === totalPages || totalPages === 0}
                        >
                            Next
                        </Button>
                        </div>
                    </div>
                </div>
            </CardFooter>
        </Card>
      </div>
    </main>

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

    <AssignAwbDialog
        isOpen={isAwbDialogOpen}
        onClose={() => setIsAwbDialogOpen(false)}
        orders={ordersForAwb}
        onConfirm={(pickupName, shippingMode) => {
            const ordersToProcess = orders.filter(o => selectedOrders.includes(o.id));
            processAwbAssignments(ordersToProcess.map(o => ({id: o.id, name: o.name})), pickupName, shippingMode);
            setSelectedOrders([]);
        }}
        shopId={userData?.activeAccountId || ''}
     />
     
     <GenerateAwbDialog 
        isOpen={isFetchAwbDialogOpen}
        onClose={() => setIsFetchAwbDialogOpen(false)}
      />

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
                     {viewingOrder.customStatus === 'Ready To Dispatch' && viewingOrder.awb && (
                        <div>
                            <h4 className="font-semibold">AWB Number</h4>
                            <p className="text-sm text-muted-foreground font-mono">{viewingOrder.awb}</p>
                        </div>
                    )}
                    <div>
                        <h4 className="font-semibold">Customer</h4>
                        <p className="text-sm text-muted-foreground">{`${viewingOrder.raw.customer?.first_name || ''} ${viewingOrder.raw.customer?.last_name || ''}`.trim()}</p>
                        <p className="text-sm text-muted-foreground">{viewingOrder.email}</p>
                    </div>
                    <div>
                        <h4 className="font-semibold">Shipping Address</h4>
                        {viewingOrder.raw.shipping_address ? (
                            <div className="text-sm text-muted-foreground">
                                <p>{viewingOrder.raw.shipping_address.address1}{viewingOrder.raw.shipping_address.address2}</p>
                                <p>{viewingOrder.raw.shipping_address.city}, {viewingOrder.raw.shipping_address.province} {viewingOrder.raw.shipping_address.zip}</p>
                                <p>{viewingOrder.raw.shipping_address.country}</p>
                            </div>
                        ): (
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
                                    <TableCell className="font-medium">{item.title}</TableCell>
                                    <TableCell>{item.sku || 'N/A'}</TableCell>
                                    <TableCell className="text-center">{item.quantity}</TableCell>
                                    <TableCell className="text-right">{new Intl.NumberFormat('en-US', { style: 'currency', currency: viewingOrder.currency }).format(item.price * item.quantity)}</TableCell>
                                </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                     <Separator />
                     <div className="flex justify-end items-center gap-4 text-lg font-bold">
                        <span>Total:</span>
                        <span>{new Intl.NumberFormat('en-US', { style: 'currency', currency: viewingOrder.currency }).format(viewingOrder.totalPrice)}</span>
                     </div>
                </div>

                {/* Right side: Logs */}
                <div className="space-y-6">
                    <h3 className="font-semibold text-lg">History</h3>
                    <ScrollArea className="h-full">
                        <div className="space-y-6 pr-4">
                        {(viewingOrder.logs && viewingOrder.logs.length > 0) ? (
                            [...viewingOrder.logs].sort((a, b) => b.timestamp.toMillis() - a.timestamp.toMillis()).map((log, index) => (
                            <div key={index} className="flex items-start gap-4">
                                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted flex-shrink-0">
                                    {log.type === 'WEBHOOK' ? <Bot className="h-5 w-5" /> : <User className="h-5 w-5" />}
                                </div>
                                <div className="flex-1">
                                <p className="font-semibold text-sm">
                                    {log.action.replace(/_/g, ' ')}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                    {log.type === 'USER_ACTION' ? 
                                    `${log.user?.displayName || 'A user'} changed status from ${log.details.oldStatus} to ${log.details.newStatus}` :
                                    `Webhook received with topic: ${log.details.topic}`
                                    }
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">{log.timestamp?.toDate().toLocaleString()}</p>
                                </div>
                            </div>
                            ))
                        ) : (
                            <div className="text-center text-muted-foreground py-12">
                            <p>No history found for this order.</p>
                            </div>
                        )}
                        </div>
                    </ScrollArea>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

    