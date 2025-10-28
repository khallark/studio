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
import { Badge, badgeVariants } from '@/components/ui/badge';
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
import { Download, MoreHorizontal, Trash2, Bot, User, MoveRight, Calendar as CalendarIcon, X, Loader2, ArrowUpDown, ScanBarcode, Clock } from 'lucide-react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '@/lib/firebase';
import { collection, doc, getDoc, onSnapshot, query, orderBy, Timestamp, where, getDocs } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
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
import { DocumentSnapshot } from 'firebase/firestore';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { AwbBulkSelectionDialog } from '@/components/awb-bulk-selection-dialog';
import { BookReturnDialog } from '@/components/book-return-dialog';
import { StartQcDialog } from '@/components/start-qc-dialog';
import { AvailabilityDialog } from '@/components/availability-dialog';
import { GeneratePODialog } from '@/components/generate-po-dialog'

type CustomStatus = 
  | 'New' 
  | 'Confirmed' 
  | 'Ready To Dispatch' 
  | 'Dispatched' 
  | 'In Transit'
  | 'Out For Delivery'
  | 'Delivered'
  | 'RTO In Transit'
  | 'RTO Delivered'
  | 'DTO Requested'
  | 'DTO Booked'
  | 'DTO In Transit'
  | 'DTO Delivered'
  | 'Pending Refunds'
  | 'Lost'
  | 'Closed'
  | 'RTO Closed'
  | 'Cancellation Requested'
  | 'Cancelled';


interface CustomStatusLog {
    status: string;
    createdAt: Timestamp;
    remarks: string;
}

interface Order {
  id: string; // Firestore document ID
  orderId: number;
  name: string;
  createdAt: string;
  email: string;
  totalPrice: number;
  currency: string;
  financialStatus: string;
  fulfillmentStatus: string;
  customStatus: CustomStatus;
  awb?: string;
  awb_reverse?: string;
  courier?: string;
  courierProvider?: string;
  courier_reverse?: string;
  isDeleted?: boolean; // Tombstone flag
  tags_confirmed?: string[];
  tags_rtoInTransit?: string[];
  customStatusesLogs?: CustomStatusLog[];
  booked_return_reason?: string;
  booked_return_images?: string[];
  returnItemsVariantIds?: (string | number)[];
  raw: {
    cancelled_at: string | null;
    customer?: {
      name?: string;
      first_name?: string;
      last_name?: string;
      phone?: string;
    };
    line_items: any[];
    contact_email?: string;
    billing_address?: {
        name?: string;
        first_name?: string;
        last_name?: string;
        phone?: string;
        address1: string;
        address2: string;
        city: string;
        province: string;
        zip: string;
        country: string;
    };
    shipping_address?: {
        name?: string;
        first_name?: string;
        last_name?: string;
        phone?: string;
        address1: string;
        address2: string;
        city: string;
        zip: string;
        province: string;
        country: string;
    },
    total_discounts?: number;
    total_outstanding?: string;
  }
}

interface UserData {
  activeAccountId: string | null;
}

type SortKey = 'name' | 'createdAt';
type SortDirection = 'asc' | 'desc';


export default function OrdersPage() {
  const [user, userLoading] = useAuthState(auth);
  const { toast } = useToast();
  const { processAwbAssignments } = useProcessingQueue();
  
  const [orders, setOrders] = useState<Order[]>([]);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);
  const [isDownloadingExcel, setIsDownloadingExcel] = useState(false);
  const [viewingOrder, setViewingOrder] = useState<Order | null>(null);
  const [unusedAwbsCount, setUnusedAwbsCount] = useState(0);

  const [activeTab, setActiveTab] = useState<CustomStatus | 'All Orders'>('All Orders');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedOrders, setSelectedOrders] = useState<string[]>([]);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  
  const [isAwbDialogOpen, setIsAwbDialogOpen] = useState(false);
  const [isFetchAwbDialogOpen, setIsFetchAwbDialogOpen] = useState(false);
  const [isLowAwbAlertOpen, setIsLowAwbAlertOpen] = useState(false);
  const [ordersForAwb, setOrdersForAwb] = useState<Order[]>([]);
  const [isDownloadingSlips, setIsDownloadingSlips] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [invertSearch, setInvertSearch] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [courierFilter, setCourierFilter] = useState<string>('all');
  const [availabilityFilter, setAvailabilityFilter] = useState<'all' | 'pending' | 'available' | 'unavailable'>('all');
  const [rtoInTransitFilter, setRtoInTransitFilter] = useState<'all' | 're-attempt' | 'refused' | 'no-reply'>('all');
  
  const [sortKey, setSortKey] = useState<SortKey>('createdAt');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  
  const [isAwbBulkSelectOpen, setIsAwbBulkSelectOpen] = useState(false);
  const [awbBulkSelectStatus, setAwbBulkSelectStatus] = useState('');
  
  const [isUpdatingShippedStatuses, setIsUpdatingShippedStatuses] = useState(false);

  const [isReturnDialogOpen, setIsReturnDialogOpen] = useState(false);
  const [orderForReturn, setOrderForReturn] = useState<Order | null>(null);
  
  const [isDownloadingProductsExcel, setIsDownloadingProductsExcel] = useState(false);

  const [isGeneratePODialogOpen, setIsGeneratePODialogOpen] = useState(false);
  
  // State for item availability checklist
  const [itemSelection, setItemSelection] = useState<Record<string, Set<string | number>>>({});
  const [isUpdatingAvailability, setIsUpdatingAvailability] = useState<string | null>(null);

  const [isQcDialogOpen, setIsQcDialogOpen] = useState(false);
  const [orderForQc, setOrderForQc] = useState<Order | null>(null);

  const [isAvailabilityDialogOpen, setIsAvailabilityDialogOpen] = useState(false);


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
        if (!userData?.activeAccountId || !user) return;
        
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
                    shop: userData.activeAccountId,
                    orderId: order.id,
                    tag: 'Available',
                    action,
                }),
            });

            const result = await response.json();
            if (!response.ok) throw new Error(result.details || 'Failed to update availability');

            toast({
                title: 'Availability Updated',
                description: `Order ${order.name} has been marked as ${action === 'add' ? 'Available' : 'Unavailable'}.`
            });
            // Reset checkbox state for this order after action
            setItemSelection(prev => {
                const newState = {...prev};
                delete newState[order.id];
                return newState;
            });
        } catch (error) {
            toast({
                title: 'Update Failed',
                description: error instanceof Error ? error.message : 'An unknown error occurred.',
                variant: 'destructive',
            });
        } finally {
            setIsUpdatingAvailability(null);
        }
    };

  useEffect(() => {
    document.title = "Dashboard - Orders";
  })

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
      
      // The base query doesn't need ordering here, as we'll sort client-side
      const q = query(ordersRef);

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

  const handleRevertStatus = useCallback(async (orderId: string, revertTo: 'Confirmed' | 'Delivered') => {
      if (!userData?.activeAccountId || !user) return;

      const endpoint = revertTo === 'Confirmed' ? '/api/shopify/orders/revert-to-confirmed' : '/api/shopify/orders/revert-to-delivered';
      const toastTitle = `Reverting to ${revertTo}`;
      
      try {
        const idToken = await user.getIdToken();
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${idToken}`
          },
          body: JSON.stringify({ shop: userData.activeAccountId, orderId }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.details || `Failed to revert status to ${revertTo}`);
        toast({ title: 'Status Reverted', description: `Order status changed back to ${revertTo}.` });
      } catch (error) {
        console.error('Status revert error:', error);
        toast({
          title: 'Revert Failed',
          description: error instanceof Error ? error.message : 'An unknown error occurred.',
          variant: 'destructive',
        });
      }
    }, [userData, toast, user]);

  
  const handleDispatch = useCallback(async (orderIds: string[]) => {
    if (!userData?.activeAccountId || !user || orderIds.length === 0) return;

    setIsBulkUpdating(true);
    try {
      const idToken = await user.getIdToken();
      const response = await fetch('/api/shopify/orders/dispatch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          shop: userData.activeAccountId,
          orderIds: orderIds,
        }),
      });

      const result = await response.json();
      if (!response.ok && response.status !== 207) {
        throw new Error(result.details || 'Failed to dispatch orders.');
      }
      
      toast({
        title: 'Dispatch Process Started',
        description: result.message,
      });
      
      if (result.errors && result.errors.length > 0) {
        // Optionally show another toast for errors
        toast({
          title: 'Some Dispatches Failed',
          description: `Check the console for details on ${result.errors.length} failed orders.`,
          variant: 'destructive',
        });
        console.error('Dispatch failures:', result.errors);
      }

      setSelectedOrders(prev => prev.filter(id => !orderIds.includes(id)));

    } catch (error) {
      console.error('Dispatch error:', error);
      toast({
        title: 'Dispatch Failed',
        description: error instanceof Error ? error.message : 'An unknown error occurred.',
        variant: 'destructive',
      });
    } finally {
      setIsBulkUpdating(false);
    }
  }, [userData, user, toast]);

  const handleOrderSplit = useCallback(async (orderId: string) => {
    if (!userData?.activeAccountId || !user || !orderId) return;

    setIsBulkUpdating(true);
    try {
      const idToken = await user.getIdToken();
      const response = await fetch('/api/shopify/orders/split-order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          shop: userData.activeAccountId,
          orderId,
        }),
      });

      const result = await response.json();
      if (!response.ok && response.status !== 207) {
        throw new Error(result.details || 'Failed to dispatch orders.');
      }
      
      toast({
        title: 'Order splitting Process Started',
        description: result.message,
      });
      
      if (result.errors && result.errors.length > 0) {
        // Optionally show another toast for errors
        toast({
          title: 'Order Splitting Failed',
          description: `Something wrong happened, check the function logs.`,
          variant: 'destructive',
        });
        console.error('Order Split failure:', result.error);
      }

    } catch (error) {
      console.error('Order split error:', error);
      toast({
        title: 'Order Splitting Failed',
        description: error instanceof Error ? error.message : 'An unknown error occurred.',
        variant: 'destructive',
      });
    } finally {
      setIsBulkUpdating(false);
    }
  }, [userData, user, toast]);

  const handleReturnBooking = useCallback(async (orderIds: string[]) => {
    if (!userData?.activeAccountId || !user || orderIds.length === 0) return;

    toast({
      title: 'Processing orders',
      description: 'Please wait...',
    });

    setIsBulkUpdating(true);
    try {
      const idToken = await user.getIdToken();
      const response = await fetch('/api/shopify/courier/bulk-book-return', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          shop: userData.activeAccountId,
          orderIds,
          pickupName: "Majime Productions 2",
          shippingMode: "Surface",
        }),
      });

      const result = await response.json();
      if (!response.ok && response.status !== 207) {
        throw new Error(result.details || 'Failed to book return for orders.');
      }
      
      toast({
        title: 'Return booking Process Started',
        description: result.message,
      });
      
      if (result.errors && result.errors.length > 0) {
        // Optionally show another toast for errors
        toast({
          title: 'Some Bookings Failed',
          description: `Check the console for details on ${result.errors.length} failed orders.`,
          variant: 'destructive',
        });
        console.error('Return Booking failures:', result.errors);
      }

      setSelectedOrders(prev => prev.filter(id => !orderIds.includes(id)));

    } catch (error) {
      console.error('Return Booking error:', error);
      toast({
        title: 'Return Booking Failed',
        description: error instanceof Error ? error.message : 'An unknown error occurred.',
        variant: 'destructive',
      });
    } finally {
      setIsBulkUpdating(false);
    }
  }, [userData, user, toast]);

  const handleBulkUpdateStatus = useCallback(async (status: CustomStatus) => {
    if (!userData?.activeAccountId || !user || selectedOrders.length === 0) return;

    if (status === 'Dispatched') {
      await handleDispatch(selectedOrders);
      return;
    }

    if(status === 'DTO Requested') {
      await handleReturnBooking(selectedOrders);
      return;
    }

    setIsBulkUpdating(true);
    const { dismiss } = toast({
      title: 'Bulk Update in Progress',
      description: `Updating ${selectedOrders.length} order(s) to "${status}". Please wait.`,
    });

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
        
        dismiss();
        toast({
            title: 'Bulk Update Successful',
            description: result.message,
        });

        setSelectedOrders([]);

    } catch (error) {
        dismiss();
        toast({
            title: 'Bulk Update Failed',
            description: error instanceof Error ? error.message : 'An unknown error occurred.',
            variant: 'destructive',
        });
    } finally {
        setIsBulkUpdating(false);
    }
}, [userData, user, selectedOrders, toast, handleDispatch, handleReturnBooking]);


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
    const initialCounts: Record<CustomStatus | 'All Orders', number> = {
      'All Orders': 0,
      'New': 0,
      'Confirmed': 0,
      'Ready To Dispatch': 0,
      'Dispatched': 0,
      'In Transit': 0,
      'Out For Delivery': 0,
      'Delivered': 0,
      'RTO In Transit': 0,
      'RTO Delivered': 0,
      'DTO Requested': 0,
      'DTO Booked': 0,
      'DTO In Transit': 0,
      'DTO Delivered': 0,
      'Pending Refunds': 0,
      'Lost': 0,
      'Closed': 0,
      'RTO Closed': 0,
      'Cancellation Requested': 0,
      'Cancelled': 0,
    };

    let allOrdersCount = 0;
    const counts = orders.reduce((acc, order) => {
      if (order.isDeleted) return acc;

      const isShopifyCancelled = !!order.raw?.cancelled_at;

      if (isShopifyCancelled) {
        acc['Cancelled'] = (acc['Cancelled'] || 0) + 1;
      } else {
        allOrdersCount++;
        const status = order.customStatus || 'New';
        if (acc[status] !== undefined) {
          acc[status] = (acc[status] || 0) + 1;
        }
      }
      return acc;
    }, initialCounts as Record<string, number>);

    counts['All Orders'] = allOrdersCount;
    return counts as Record<CustomStatus | 'All Orders', number>;
  }, [orders]);
  
  const filteredOrders = useMemo(() => {
    let filtered = orders.filter(order => !order.isDeleted);

    // Filter by status tab first
    if (activeTab === 'Cancelled') {
        filtered = filtered.filter(order => !!order.raw?.cancelled_at);
    } else {
        // Exclude Shopify-cancelled orders from all other tabs
        filtered = filtered.filter(order => !order.raw?.cancelled_at);

        if (activeTab !== 'All Orders') {
            filtered = filtered.filter(order => (order.customStatus || 'New') === activeTab);
        }
    }

    // Then, filter by search query
    if (searchQuery) {
        const lowercasedQuery = searchQuery.toLowerCase().trim();
        filtered = filtered.filter(order => {
          const customerName = 
            order.raw.shipping_address?.name ??
            order.raw.billing_address?.name ??
            order.raw.customer?.name ??
            `${order.raw.shipping_address?.first_name || ''} 
            ${order.raw.shipping_address?.last_name || ''}`.trim() ??
            `${order.raw.billing_address?.first_name || ''} 
            ${order.raw.billing_address?.last_name || ''}`.trim() ??
            `${order.raw.customer?.first_name || ''} 
            ${order.raw.customer?.last_name || ''}`.trim() ??
            order.email ??
            "";
          const match = (
            order.name.toLowerCase().includes(lowercasedQuery) ||
            (activeTab === "All Orders" && order.customStatus.toLowerCase().includes(lowercasedQuery)) ||
            customerName.toLowerCase().includes(lowercasedQuery) ||
            (order.awb && order.awb.toLowerCase().includes(lowercasedQuery)) ||
            (order.awb_reverse && order.awb_reverse.toLowerCase().includes(lowercasedQuery)) ||
            (String(order.orderId).toLowerCase().includes(lowercasedQuery))
          );
          return invertSearch ? !match : match;
        });
    }
    
    // Then, filter by date range
    if (dateRange?.from) {
        const toDate = dateRange.to ? addDays(dateRange.to, 1) : addDays(dateRange.from, 1);
        filtered = filtered.filter(order => {
            const orderDate = new Date(order.createdAt);
            return orderDate >= dateRange.from! && orderDate < toDate;
        });
    }

    // Then, filter by courier if on the 'Ready To Dispatch' tab
    if (!['New', 'Confirmed', 'Cancelled'].includes(activeTab) && courierFilter !== 'all') {
      if (courierFilter === 'Delhivery') { 
        filtered = filtered.filter(order => order.courier === courierFilter);
      } else if (courierFilter === 'Shiprocket') {
        filtered = filtered.filter(order => order.courierProvider === 'Shiprocket');
      } else if (courierFilter === 'Xpressbees') {
        filtered = filtered.filter(order => order.courierProvider === 'Xpressbees');
      }
    }
    
    // Filter by availability on 'Confirmed' tab
    if (activeTab === 'Confirmed' && availabilityFilter !== 'all') {
      if (availabilityFilter === 'available') {
        filtered = filtered.filter(order => order.tags_confirmed?.includes('Available'));
      } else if (availabilityFilter === 'unavailable') {
        filtered = filtered.filter(order => order.tags_confirmed?.includes('Unavailable'));
      } else {
        filtered = filtered.filter(order => !order.tags_confirmed || (Array.isArray(order.tags_confirmed) && order.tags_confirmed.length === 0) || order.tags_confirmed?.includes('Pending'));
      }
    }
    
    // Filter by RTO In Transit tags on 'RTO In Transit' tab
    if (activeTab === 'RTO In Transit' && rtoInTransitFilter !== 'all') {
      if (rtoInTransitFilter === 're-attempt') {
        filtered = filtered.filter(order => 
          order.tags_rtoInTransit?.length === 1 && order.tags_rtoInTransit[0] === 'Re-attempt'
        );
      } else if (rtoInTransitFilter === 'refused') {
        filtered = filtered.filter(order => 
          order.tags_rtoInTransit?.length === 1 && order.tags_rtoInTransit[0] === 'Refused'
        );
      } else if (rtoInTransitFilter === 'no-reply') {
        filtered = filtered.filter(order => 
          !order.tags_rtoInTransit || 
          order.tags_rtoInTransit.length === 0 ||
          (!order.tags_rtoInTransit.includes('Re-attempt') && !order.tags_rtoInTransit.includes('Refused'))
        );
      }
    }
    
    // Finally, apply sorting
    filtered.sort((a, b) => {
      let valA, valB;
      
      if (sortKey === 'createdAt') {
          valA = new Date(a.createdAt).getTime();
          valB = new Date(b.createdAt).getTime();
      } else { // 'name'
          valA = a.name;
          valB = b.name;
      }

      if (valA < valB) {
          return sortDirection === 'asc' ? -1 : 1;
      }
      if (valA > valB) {
          return sortDirection === 'asc' ? 1 : -1;
      }
      return 0;
    });


    return filtered;
  }, [orders, activeTab, searchQuery, dateRange, courierFilter, availabilityFilter, rtoInTransitFilter, invertSearch, sortKey, sortDirection]);

  useEffect(() => {
    setCurrentPage(1);
  }, [filteredOrders])

  const availabilityCounts = useMemo(() => {
    const confirmedOrders = orders.filter(order => !order.isDeleted && !order.raw?.cancelled_at && (order.customStatus || 'New') === 'Confirmed');
    
    const available = confirmedOrders.filter(order => order.tags_confirmed?.includes('Available')).length;
    const unavailable = confirmedOrders.filter(order => order.tags_confirmed?.includes('Unavailable')).length;
    const pending = confirmedOrders.filter(order => !order.tags_confirmed || (Array.isArray(order.tags_confirmed) && order.tags_confirmed.length === 0) || order.tags_confirmed?.includes('Pending')).length;

    return { pending, available, unavailable };
  }, [orders]);

  const rtoInTransitCounts = useMemo(() => {
    const rtoInTransitOrders = orders.filter(order => !order.isDeleted && !order.raw?.cancelled_at && (order.customStatus || 'New') === 'RTO In Transit');
    
    const reAttempt = rtoInTransitOrders.filter(order => 
      order.tags_rtoInTransit?.length === 1 && order.tags_rtoInTransit[0] === 'Re-attempt'
    ).length;
    
    const refused = rtoInTransitOrders.filter(order => 
      order.tags_rtoInTransit?.length === 1 && order.tags_rtoInTransit[0] === 'Refused'
    ).length;
    
    const noReply = rtoInTransitOrders.filter(order => 
      !order.tags_rtoInTransit || 
      order.tags_rtoInTransit.length === 0 ||
      (!order.tags_rtoInTransit.includes('Re-attempt') && !order.tags_rtoInTransit.includes('Refused'))
    ).length;

    return { reAttempt, refused, noReply };
  }, [orders]);


  const indexOfLastOrder = currentPage * rowsPerPage;
  const indexOfFirstOrder = indexOfLastOrder - rowsPerPage;
  const currentOrders = filteredOrders.slice(indexOfFirstOrder, indexOfLastOrder);
  const totalPages = Math.ceil(filteredOrders.length / rowsPerPage);

  // Initialize rowsPerPage from localStorage
  useEffect(() => {
    const savedRowsPerPage = localStorage.getItem('rowsPerPage');
    if (savedRowsPerPage) {
      setRowsPerPage(Number(savedRowsPerPage));
    }
  }, []);

  const handleSetRowsPerPage = (value: string) => {
    const numValue = Number(value);
    setRowsPerPage(numValue);
    setCurrentPage(1);
    localStorage.setItem('rowsPerPage', value);
  };


  useEffect(() => {
    setCurrentPage(1);
    // Do not clear selections on search query change
    // setSelectedOrders([]);
  }, [rowsPerPage]);

  useEffect(() => {
    setCurrentPage(1);
    setSelectedOrders([]);
  }, [activeTab, dateRange, courierFilter, availabilityFilter, rtoInTransitFilter]);

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
    }


  const handleDownloadSlips = useCallback(async () => {
    if (!userData?.activeAccountId || !user || selectedOrders.length === 0) return;

    setIsDownloadingSlips(true);
    toast({ title: "Generating Slips", description: "Your PDF will begin downloading shortly. This may take a moment." });

    try {
      const ordersToDownload = orders.filter(o => selectedOrders.includes(o.id) && o.awb);
      const orderIdsToDownload = ordersToDownload.map(o => o.id);

      if (orderIdsToDownload.length === 0) {
        toast({ title: "No AWBs found", description: "None of the selected orders have an AWB assigned.", variant: "destructive" });
        return;
      }

      const idToken = await user.getIdToken();
      const response = await fetch('/api/shopify/orders/download-slips', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          shop: userData.activeAccountId,
          orderIds: orderIdsToDownload,
        }),
      });

      if (!response.ok) {
        let msg = "Failed to download slips";
        try {
          const err = await response.json();
          msg = err?.details || err?.error || msg;
        } catch {
          msg = await response.text().catch(() => msg);
        }
        throw new Error(msg);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `shipping-slips-${Date.now()}.pdf`;
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

    const handleDownloadExcel = useCallback(async () => {
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

     const handleDownloadProductsExcel = useCallback(async () => {
        if (!userData?.activeAccountId || !user || selectedOrders.length === 0) return;

        setIsDownloadingProductsExcel(true);
        toast({ title: "Generating Products Excel", description: "Your file will download shortly." });

        try {
            const idToken = await user.getIdToken();
            const response = await fetch('/api/shopify/orders/export-products', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`,
                },
                body: JSON.stringify({
                    shop: userData.activeAccountId,
                    orderIds: selectedOrders,
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.details || 'Failed to generate file.');
            }

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `products-export-${new Date().toISOString().split('T')[0]}.xlsx`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);

        } catch (error) {
            console.error("Products Excel export error:", error);
            toast({
                title: 'Export Failed',
                description: error instanceof Error ? error.message : 'An unknown error occurred.',
                variant: 'destructive',
            });
        } finally {
            setIsDownloadingProductsExcel(false);
        }
    }, [userData, user, selectedOrders, toast]);

    
  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
        setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
        setSortKey(key);
        setSortDirection('asc');
    }
  };
  
    const handleUpdateShippedStatuses = useCallback(async () => {
    if (!userData?.activeAccountId || !user || selectedOrders.length === 0) return;

    setIsUpdatingShippedStatuses(true);
    const { dismiss } = toast({
      title: 'Updating...',
      description: `Requesting latest statuses for ${selectedOrders.length} selected order(s).`,
    });

    try {
      const idToken = await user.getIdToken();
      const response = await fetch('/api/shopify/courier/update-shipped-statuses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          shop: userData.activeAccountId,
          orderIds: selectedOrders,
        }),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Failed to start status update process.');
      }

      dismiss();
      toast({
        title: 'Status Update Started',
        description: 'The system will now fetch the latest tracking statuses in the background.',
      });
      setSelectedOrders([]);
    } catch (error) {
      console.error('Update Shipped Statuses error:', error);
      dismiss();
      toast({
        title: 'Update Failed',
        description: error instanceof Error ? error.message : 'An unknown error occurred.',
        variant: 'destructive',
      });
    } finally {
      setIsUpdatingShippedStatuses(false);
    }
  }, [userData, user, toast, selectedOrders]);


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
        return null;
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
  }
  
  const handleSelectOrder = (orderId: string) => {
    setSelectedOrders(prev => 
      prev.includes(orderId) ? prev.filter(id => id !== orderId) : [...prev, orderId]
    );
  };
  
    const handleSelectAll = (isChecked: boolean) => {
        const currentPageIds = currentOrders.map(o => o.id);
        if (isChecked) {
            // Add current page's orders to selection, avoiding duplicates
            setSelectedOrders(prev => Array.from(new Set([...prev, ...currentPageIds])));
        } else {
            // Remove current page's orders from selection
            setSelectedOrders(prev => prev.filter(id => !currentPageIds.includes(id)));
        }
    };
    
    const handleBulkSelectByAwb = (awbs: string[], customStatus: string) => {
      if(!customStatus) {
        toast({
            title: 'Internal Error',
            description: `Please correct it`
        });
        return;
      }
        const readyToDispatchAwbs = new Map(
            filteredOrders
                .filter(o => o.customStatus === customStatus && o.awb)
                .map(o => [o.awb!, o.id])
        );

        const foundOrderIds = awbs.reduce((acc, awb) => {
            if (readyToDispatchAwbs.has(awb)) {
                acc.add(readyToDispatchAwbs.get(awb)!);
            }
            return acc;
        }, new Set<string>());

        if (foundOrderIds.size > 0) {
            setSelectedOrders(prev => Array.from(new Set([...prev, ...Array.from(foundOrderIds)])));
            toast({
                title: 'Orders Selected',
                description: `${foundOrderIds.size} order(s) have been selected based on the scanned AWBs.`
            });
        } else {
            toast({
                title: 'No Orders Found',
                description: 'None of the scanned AWBs matched orders in the "Ready to Dispatch" list.',
                variant: 'destructive'
            });
        }
    };

    const areAllOnPageSelected = currentOrders.length > 0 && currentOrders.every(o => selectedOrders.includes(o.id));

  const shippedStatuses: (CustomStatus | 'All Orders')[] = [
    'Dispatched', 'In Transit', 'Out For Delivery', 'RTO In Transit', 'DTO Booked', 'DTO In Transit'
  ];

  const renderBulkActionButtons = () => {
    const isAnyOrderSelected = selectedOrders.length > 0;
    const isDisabled = !isAnyOrderSelected || isBulkUpdating;
    const showUpdateShippedButton = shippedStatuses.includes(activeTab);

    return (
      <div className="flex items-center gap-2 flex-wrap justify-end">
        {showUpdateShippedButton && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleUpdateShippedStatuses}
            disabled={isDisabled || isUpdatingShippedStatuses}
          >
            {isUpdatingShippedStatuses ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            Update {selectedOrders.length > 0 ? `(${selectedOrders.length})` : ''} Shipped Statuses
          </Button>
        )}

        {(() => {
          switch (activeTab) {
            case 'All Orders':
              return (
                <Button variant="outline" size="sm" disabled={isDisabled || isDownloadingExcel} onClick={handleDownloadExcel}>
                  {isDownloadingExcel ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                  {isDownloadingExcel ? 'Downloading...' : `Download Excel ${selectedOrders.length > 0 ? `(${selectedOrders.length})` : ''}`}
                </Button>
              );
            case 'New':
              return (
                <>
                  <Button variant="outline" size="sm" disabled={isDisabled || isDownloadingExcel} onClick={handleDownloadExcel}>
                    {isDownloadingExcel ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                    {isDownloadingExcel ? 'Downloading...' : `Download Excel ${selectedOrders.length > 0 ? `(${selectedOrders.length})` : ''}`}
                  </Button>
                  <Button variant="outline" size="sm" disabled={isDisabled} onClick={() => handleBulkUpdateStatus('Confirmed')}>
                      {isBulkUpdating ? 'Confirming...' : 'Confirm'}
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
                  <Button variant="outline" size="sm" disabled={isDisabled || isDownloadingExcel} onClick={handleDownloadExcel}>
                    {isDownloadingExcel ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                    {isDownloadingExcel ? 'Downloading...' : `Download Excel ${selectedOrders.length > 0 ? `(${selectedOrders.length})` : ''}`}
                  </Button>
                  <Button variant="outline" size="sm" disabled={isDisabled || isDownloadingProductsExcel} onClick={handleDownloadProductsExcel}>
                      {isDownloadingProductsExcel ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                      {isDownloadingProductsExcel ? 'Downloading...' : `Download Products Excel ${selectedOrders.length > 0 ? `(${selectedOrders.length})` : ''}`}
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
                  <Button variant="outline" size="sm" disabled={isDisabled || isDownloadingExcel} onClick={handleDownloadExcel}>
                    {isDownloadingExcel ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                    {isDownloadingExcel ? 'Downloading...' : `Download Excel ${selectedOrders.length > 0 ? `(${selectedOrders.length})` : ''}`}
                  </Button>
                  <Button variant="outline" size="sm" disabled={isDownloadingSlips || isDisabled} onClick={handleDownloadSlips}>
                    {isDownloadingSlips ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                    {isDownloadingSlips ? 'Downloading...' : `Download Slips ${selectedOrders.length > 0 ? `(${selectedOrders.length})` : ''}`}
                  </Button>
                  <Button variant="outline" size="sm" disabled={isDisabled} onClick={() => handleBulkUpdateStatus('Dispatched')}>
                      {isBulkUpdating ? 'Dispatching...' : `Dispatch ${selectedOrders.length > 0 ? `(${selectedOrders.length})` : ''}`}
                  </Button>
                </>
              );
            case 'Delivered':
                return (
                    <Button variant="outline" size="sm" disabled={isDisabled} onClick={() => handleBulkUpdateStatus('Closed')}>
                        {isBulkUpdating ? 'Closing...' : `Close Orders ${selectedOrders.length > 0 ? `(${selectedOrders.length})` : ''}`}
                    </Button>
                )
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
                <Button variant="outline" size="sm" disabled={isDisabled || isDownloadingExcel} onClick={handleDownloadExcel}>
                    {isDownloadingExcel ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                    {isDownloadingExcel ? 'Downloading...' : `Download Excel ${selectedOrders.length > 0 ? `(${selectedOrders.length})` : ''}`}
                </Button>
                <Button variant="outline" size="sm" disabled={isDisabled} onClick={() => handleBulkUpdateStatus('RTO Closed')}>
                    {isBulkUpdating ? 'RTO Closing...' : 'RTO Close'}
                </Button>
                </>
              );
            case 'DTO Requested':
              return (
                <>
                  <Button variant="outline" size="sm" disabled={isDisabled} onClick={() => handleBulkUpdateStatus('DTO Requested')}>
                      {isBulkUpdating ? 'Booking returns...' : `Book ${selectedOrders.length > 0 ? `(${selectedOrders.length})` : ''} Returns`}
                  </Button>
                  <Button variant="outline" size="sm" disabled={isDisabled || isDownloadingExcel} onClick={handleDownloadExcel}>
                    {isDownloadingExcel ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                    {isDownloadingExcel ? 'Downloading...' : `Download Excel ${selectedOrders.length > 0 ? `(${selectedOrders.length})` : ''}`}
                  </Button>
                </>
              )
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
                <Button variant="outline" size="sm" disabled={isDisabled || isDownloadingExcel} onClick={handleDownloadExcel}>
                    {isDownloadingExcel ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                    {isDownloadingExcel ? 'Downloading...' : `Download Excel ${selectedOrders.length > 0 ? `(${selectedOrders.length})` : ''}`}
                </Button>
              );
            default:
          }
        })()}
      </div>
    );
  };


  return (
    <>
    <main className="flex flex-col h-full">
        <div className="flex flex-col flex-1 min-h-0">
            <CardHeader className="border-b p-4 md:p-6 shrink-0">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div>
                        <CardTitle>Your Orders</CardTitle>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap justify-end">
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
                                <SelectItem value="all">All Items ({availabilityCounts.pending + availabilityCounts.available + availabilityCounts.unavailable })</SelectItem>
                                <SelectItem value="pending">Pending({availabilityCounts.pending})</SelectItem>
                                <SelectItem value="available">Available ({availabilityCounts.available})</SelectItem>
                                <SelectItem value="unavailable">Unavailable ({availabilityCounts.unavailable})</SelectItem>
                            </SelectContent>
                        </Select>
                    )}
                    {activeTab === 'RTO In Transit' && (
                        <Select value={rtoInTransitFilter} onValueChange={(value) => setRtoInTransitFilter(value as any)}>
                            <SelectTrigger className="w-full md:w-[180px]">
                                <SelectValue placeholder="Filter by status..." />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All ({rtoInTransitCounts.reAttempt + rtoInTransitCounts.refused + rtoInTransitCounts.noReply})</SelectItem>
                                <SelectItem value="re-attempt">Re-attempt ({rtoInTransitCounts.reAttempt})</SelectItem>
                                <SelectItem value="refused">Refused ({rtoInTransitCounts.refused})</SelectItem>
                                <SelectItem value="no-reply">No Reply ({rtoInTransitCounts.noReply})</SelectItem>
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
                              All ({statusCounts['All Orders'] || 0})
                          </TabsTrigger>
                          <TabsTrigger value="New" className="outline-none flex-shrink-0 whitespace-nowrap rounded-none border-b-2 border-transparent bg-transparent px-3 sm:px-4 py-3 text-sm font-semibold text-gray-500 shadow-none transition-all duration-200 ease-in-out hover:text-gray-700 hover:bg-gray-50 data-[state=active]:border-primary data-[state=active]:bg-primary/10 data-[state=active]:shadow-none">
                              New ({statusCounts['New'] || 0})
                          </TabsTrigger>
                          <TabsTrigger value="Confirmed" className="outline-none flex-shrink-0 whitespace-nowrap rounded-none border-b-2 border-transparent bg-transparent px-3 sm:px-4 py-3 text-sm font-semibold text-gray-500 shadow-none transition-all duration-200 ease-in-out hover:text-gray-700 hover:bg-gray-50 data-[state=active]:border-primary data-[state=active]:bg-primary/10 data-[state=active]:shadow-none">
                              Confirmed ({statusCounts['Confirmed'] || 0})
                          </TabsTrigger>
                          <TabsTrigger value="Ready To Dispatch" className="outline-none flex-shrink-0 whitespace-nowrap rounded-none border-b-2 border-transparent bg-transparent px-3 sm:px-4 py-3 text-sm font-semibold text-gray-500 shadow-none transition-all duration-200 ease-in-out hover:text-gray-700 hover:bg-gray-50 data-[state=active]:border-primary data-[state=active]:bg-primary/10 data-[state=active]:shadow-none">
                              Ready To Dispatch ({statusCounts['Ready To Dispatch'] || 0})
                          </TabsTrigger>
                          <TabsTrigger value="Dispatched" className="outline-none flex-shrink-0 whitespace-nowrap rounded-none border-b-2 border-transparent bg-transparent px-3 sm:px-4 py-3 text-sm font-semibold text-gray-500 shadow-none transition-all duration-200 ease-in-out hover:text-gray-700 hover:bg-gray-50 data-[state=active]:border-primary data-[state=active]:bg-primary/10 data-[state=active]:shadow-none">
                              Dispatched ({statusCounts['Dispatched'] || 0})
                          </TabsTrigger>
                          <TabsTrigger value="In Transit" className="outline-none flex-shrink-0 whitespace-nowrap rounded-none border-b-2 border-transparent bg-transparent px-3 sm:px-4 py-3 text-sm font-semibold text-gray-500 shadow-none transition-all duration-200 ease-in-out hover:text-gray-700 hover:bg-gray-50 data-[state=active]:border-primary data-[state=active]:bg-primary/10 data-[state=active]:shadow-none">
                              In Transit ({statusCounts['In Transit'] || 0})
                          </TabsTrigger>
                          <TabsTrigger value="Out For Delivery" className="outline-none flex-shrink-0 whitespace-nowrap rounded-none border-b-2 border-transparent bg-transparent px-3 sm:px-4 py-3 text-sm font-semibold text-gray-500 shadow-none transition-all duration-200 ease-in-out hover:text-gray-700 hover:bg-gray-50 data-[state=active]:border-primary data-[state=active]:bg-primary/10 data-[state=active]:shadow-none">
                              Out For Delivery ({statusCounts['Out For Delivery'] || 0})
                          </TabsTrigger>
                          <TabsTrigger value="Delivered" className="outline-none flex-shrink-0 whitespace-nowrap rounded-none border-b-2 border-transparent bg-transparent px-3 sm:px-4 py-3 text-sm font-semibold text-gray-500 shadow-none transition-all duration-200 ease-in-out hover:text-gray-700 hover:bg-gray-50 data-[state=active]:border-primary data-[state=active]:bg-primary/10 data-[state=active]:shadow-none">
                              Delivered ({statusCounts['Delivered'] || 0})
                          </TabsTrigger>
                          <TabsTrigger value="RTO In Transit" className="outline-none flex-shrink-0 whitespace-nowrap rounded-none border-b-2 border-transparent bg-transparent px-3 sm:px-4 py-3 text-sm font-semibold text-gray-500 shadow-none transition-all duration-200 ease-in-out hover:text-gray-700 hover:bg-gray-50 data-[state=active]:border-primary data-[state=active]:bg-primary/10 data-[state=active]:shadow-none">
                              RTO In Transit ({statusCounts['RTO In Transit'] || 0})
                          </TabsTrigger>
                          <TabsTrigger value="RTO Delivered" className="outline-none flex-shrink-0 whitespace-nowrap rounded-none border-b-2 border-transparent bg-transparent px-3 sm:px-4 py-3 text-sm font-semibold text-gray-500 shadow-none transition-all duration-200 ease-in-out hover:text-gray-700 hover:bg-gray-50 data-[state=active]:border-primary data-[state=active]:bg-primary/10 data-[state=active]:shadow-none">
                              RTO Delivered ({statusCounts['RTO Delivered'] || 0})
                          </TabsTrigger>
                          <TabsTrigger value="DTO Requested" className="outline-none flex-shrink-0 whitespace-nowrap rounded-none border-b-2 border-transparent bg-transparent px-3 sm:px-4 py-3 text-sm font-semibold text-gray-500 shadow-none transition-all duration-200 ease-in-out hover:text-gray-700 hover:bg-gray-50 data-[state=active]:border-primary data-[state=active]:bg-primary/10 data-[state=active]:shadow-none">
                              DTO Requested ({statusCounts['DTO Requested'] || 0})
                          </TabsTrigger>
                          <TabsTrigger value="DTO Booked" className="outline-none flex-shrink-0 whitespace-nowrap rounded-none border-b-2 border-transparent bg-transparent px-3 sm:px-4 py-3 text-sm font-semibold text-gray-500 shadow-none transition-all duration-200 ease-in-out hover:text-gray-700 hover:bg-gray-50 data-[state=active]:border-primary data-[state=active]:bg-primary/10 data-[state=active]:shadow-none">
                              DTO Booked ({statusCounts['DTO Booked'] || 0})
                          </TabsTrigger>
                          <TabsTrigger value="DTO In Transit" className="outline-none flex-shrink-0 whitespace-nowrap rounded-none border-b-2 border-transparent bg-transparent px-3 sm:px-4 py-3 text-sm font-semibold text-gray-500 shadow-none transition-all duration-200 ease-in-out hover:text-gray-700 hover:bg-gray-50 data-[state=active]:border-primary data-[state=active]:bg-primary/10 data-[state=active]:shadow-none">
                              DTO In Transit ({statusCounts['DTO In Transit'] || 0})
                          </TabsTrigger>
                          <TabsTrigger value="DTO Delivered" className="outline-none flex-shrink-0 whitespace-nowrap rounded-none border-b-2 border-transparent bg-transparent px-3 sm:px-4 py-3 text-sm font-semibold text-gray-500 shadow-none transition-all duration-200 ease-in-out hover:text-gray-700 hover:bg-gray-50 data-[state=active]:border-primary data-[state=active]:bg-primary/10 data-[state=active]:shadow-none">
                              DTO Delivered ({statusCounts['DTO Delivered'] || 0})
                          </TabsTrigger>
                          <TabsTrigger value="Pending Refunds" className="outline-none flex-shrink-0 whitespace-nowrap rounded-none border-b-2 border-transparent bg-transparent px-3 sm:px-4 py-3 text-sm font-semibold text-gray-500 shadow-none transition-all duration-200 ease-in-out hover:text-gray-700 hover:bg-gray-50 data-[state=active]:border-primary data-[state=active]:bg-primary/10 data-[state=active]:shadow-none">
                              Pending Refunds ({statusCounts['Pending Refunds'] || 0})
                          </TabsTrigger>
                          <TabsTrigger value="Lost" className="outline-none flex-shrink-0 whitespace-nowrap rounded-none border-b-2 border-transparent bg-transparent px-3 sm:px-4 py-3 text-sm font-semibold text-gray-500 shadow-none transition-all duration-200 ease-in-out hover:text-gray-700 hover:bg-gray-50 data-[state=active]:border-primary data-[state=active]:bg-primary/10 data-[state=active]:shadow-none">
                              Lost ({statusCounts['Lost'] || 0})
                          </TabsTrigger>
                          <TabsTrigger value="Closed" className="outline-none flex-shrink-0 whitespace-nowrap rounded-none border-b-2 border-transparent bg-transparent px-3 sm:px-4 py-3 text-sm font-semibold text-gray-500 shadow-none transition-all duration-200 ease-in-out hover:text-gray-700 hover:bg-gray-50 data-[state=active]:border-primary data-[state=active]:bg-primary/10 data-[state=active]:shadow-none">
                              Closed ({statusCounts['Closed'] || 0})
                          </TabsTrigger>
                          <TabsTrigger value="RTO Closed" className="outline-none flex-shrink-0 whitespace-nowrap rounded-none border-b-2 border-transparent bg-transparent px-3 sm:px-4 py-3 text-sm font-semibold text-gray-500 shadow-none transition-all duration-200 ease-in-out hover:text-gray-700 hover:bg-gray-50 data-[state=active]:border-primary data-[state=active]:bg-primary/10 data-[state=active]:shadow-none">
                              RTO Closed ({statusCounts['RTO Closed'] || 0})
                          </TabsTrigger>
                          <TabsTrigger value="Cancellation Requested" className="outline-none flex-shrink-0 whitespace-nowrap rounded-none border-b-2 border-transparent bg-transparent px-3 sm:px-4 py-3 text-sm font-semibold text-gray-500 shadow-none transition-all duration-200 ease-in-out hover:text-gray-700 hover:bg-gray-50 data-[state=active]:border-primary data-[state=active]:bg-primary/10 data-[state=active]:shadow-none">
                              Cancellation Requested ({statusCounts['Cancellation Requested'] || 0})
                          </TabsTrigger>
                          <TabsTrigger value="Cancelled" className="outline-none flex-shrink-0 whitespace-nowrap rounded-none border-b-2 border-transparent bg-transparent px-3 sm:px-4 py-3 text-sm font-semibold text-gray-500 shadow-none transition-all duration-200 ease-in-out hover:text-gray-700 hover:bg-gray-50 data-[state=active]:border-primary data-[state=active]:bg-primary/10 data-[state=active]:shadow-none">
                              Cancelled ({statusCounts['Cancelled'] || 0})
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
                                <TableHead>
                                    <Button variant="ghost" onClick={() => handleSort('createdAt')} className="px-1">
                                        Date
                                        <ArrowUpDown className="ml-2 h-4 w-4" />
                                    </Button>
                                </TableHead>
                                {activeTab === 'All Orders'
                                  ? <TableHead className="font-medium text-muted-foreground">Current Status</TableHead>
                                  : <></>
                                }
                                {!['All Orders', 'New', 'Confirmed', 'Cancelled'].includes(activeTab)
                                  ? <TableHead className="font-medium text-muted-foreground">AWB</TableHead>
                                  : <></>
                                }
                                {['DTO Booked', 'DTO In Transit', 'DTO Delivered', 'Pending Refunds'].includes(activeTab)
                                  ? <TableHead className="font-medium text-muted-foreground">Return AWB</TableHead>
                                  : <></>
                                }
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
                            {loading ? (
                                Array.from({ length: rowsPerPage }).map((_, i) => (
                                <TableRow key={i}>
                                    <TableCell className="py-2 px-5"><Skeleton className="h-5 w-5" /></TableCell>
                                    <TableCell className="py-2"><Skeleton className="h-5 w-20" /></TableCell>
                                    <TableCell className="py-2"><Skeleton className="h-5 w-24" /></TableCell>
                                    <TableCell className="py-2"><Skeleton className="h-5 w-24" /></TableCell>
                                    <TableCell className="py-2"><Skeleton className="h-5 w-24" /></TableCell>
                                    <TableCell className="py-2"><Skeleton className="h-5 w-32" /></TableCell>
                                    <TableCell className="text-right py-2"><Skeleton className="h-5 w-16 ml-auto" /></TableCell>
                                    <TableCell className="text-right py-2"><Skeleton className="h-5 w-16 ml-auto" /></TableCell>
                                    <TableCell className="py-2"><Skeleton className="h-6 w-24" /></TableCell>
                                    <TableCell className="py-2"><Skeleton className="h-6 w-24" /></TableCell>
                                    <TableCell className="py-2"><Skeleton className="h-5 w-10" /></TableCell>
                                    <TableCell className="py-2"><Skeleton className="h-8 w-8 ml-auto" /></TableCell>
                                </TableRow>
                                ))
                            ) : currentOrders.length > 0 ? (
                                currentOrders.map((order) => {
                                
                                const customerName = 
                                  order.raw.shipping_address?.name ??
                                  order.raw.billing_address?.name ??
                                  order.raw.customer?.name ??
                                  `${order.raw.shipping_address?.first_name || ''} 
                                  ${order.raw.shipping_address?.last_name || ''}`.trim() ??
                                  `${order.raw.billing_address?.first_name || ''} 
                                  ${order.raw.billing_address?.last_name || ''}`.trim() ??
                                  `${order.raw.customer?.first_name || ''} 
                                  ${order.raw.customer?.last_name || ''}`.trim() ??
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
                                            <Badge 
                                                variant={getStatusBadgeVariant(order.customStatus)} 
                                                className="capitalize text-xs"
                                            >
                                                {order.customStatus}
                                            </Badge>
                                        </TableCell>
                                    )}
                                    {!['All Orders', 'New', 'Confirmed', 'Cancelled'].includes(activeTab)
                                      ? <TableCell className="text-xs md:text-sm py-2">{order.awb || 'N/A'}</TableCell>
                                      : <></>
                                    }
                                    {activeTab.includes('DTO') && activeTab !== 'DTO Requested'
                                      ? <TableCell className="text-xs md:text-sm py-2">{order.awb_reverse || 'N/A'}</TableCell>
                                      : <></>
                                    }
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
                                                        {/* <Button
                                                            className="w-full"
                                                            onClick={() => handleAvailabilityToggle(order)}
                                                            disabled={
                                                                isUpdatingAvailability === order.id ||
                                                                (itemSelection[order.id]?.size || 0) !== order.raw.line_items.length
                                                            }
                                                        >
                                                            {isUpdatingAvailability === order.id && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                                            {order.tags_confirmed?.includes('Available') ? 'Make Unavailable' : 'Make Available'}
                                                        </Button> */}
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
                                )
                                })
                            ) : (
                                <TableRow>
                                <TableCell colSpan={12} className="text-center h-24">
                                    {userData?.activeAccountId ? `No ${typeof activeTab === 'string' ? activeTab.toLowerCase() : ''} orders found.` : 'Please connect a store to see your orders.'}
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
                        ? `${selectedOrders.length} of ${filteredOrders.length} order(s) selected.`
                        : `Showing ${filteredOrders.length > 0 ? indexOfFirstOrder + 1 : 0}-${Math.min(indexOfLastOrder, filteredOrders.length)} of ${filteredOrders.length} orders`
                    }
                    </div>
                        <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">Rows per page</span>
                            <Select
                                value={`${rowsPerPage}`}
                                onValueChange={handleSetRowsPerPage}
                                >
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
    
    <AwbBulkSelectionDialog 
        isOpen={isAwbBulkSelectOpen}
        onClose={() => {
          setIsAwbBulkSelectOpen(false)
          setAwbBulkSelectStatus('')
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
            processAwbAssignments(ordersToProcess.map(o => ({id: o.id, name: o.name})), courier, pickupName, shippingMode);
            setSelectedOrders([]);
        }}
        shopId={userData?.activeAccountId || ''}
     />
     
     <GenerateAwbDialog 
        isOpen={isFetchAwbDialogOpen}
        onClose={() => setIsFetchAwbDialogOpen(false)}
      />
    
    {orderForReturn && userData?.activeAccountId && user && (
        <BookReturnDialog
            isOpen={isReturnDialogOpen}
            onClose={() => setIsReturnDialogOpen(false)}
            order={orderForReturn}
            shopId={userData.activeAccountId}
            user={user}
        />
    )}

    {orderForQc && userData?.activeAccountId && user && (
        <StartQcDialog
            isOpen={isQcDialogOpen}
            onClose={() => setIsQcDialogOpen(false)}
            order={orderForQc}
            shopId={userData.activeAccountId}
            user={user}
        />
    )}
    
    {isAvailabilityDialogOpen && userData?.activeAccountId && user && (
        <AvailabilityDialog
            isOpen={isAvailabilityDialogOpen}
            onClose={() => setIsAvailabilityDialogOpen(false)}
            user={user}
            shopId={userData.activeAccountId}
            confirmedOrders={filteredOrders.filter(o => o.customStatus === 'Confirmed')}
        />
    )}
    
    {isGeneratePODialogOpen && userData?.activeAccountId && user && (
        <GeneratePODialog
            isOpen={isGeneratePODialogOpen}
            onClose={() => setIsGeneratePODialogOpen(false)}
            selectedOrders={orders.filter(o => selectedOrders.includes(o.id))}
            shopId={userData.activeAccountId}
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
                        {viewingOrder.raw.shipping_address?.name ??
                        viewingOrder.raw.billing_address?.name ??
                        viewingOrder.raw.customer?.name ??
                        `${viewingOrder.raw.shipping_address?.first_name || ''} 
                        ${viewingOrder.raw.shipping_address?.last_name || ''}`.trim() ??
                        `${viewingOrder.raw.billing_address?.first_name || ''} 
                        ${viewingOrder.raw.billing_address?.last_name || ''}`.trim() ??
                        `${viewingOrder.raw.customer?.first_name || ''} 
                        ${viewingOrder.raw.customer?.last_name || ''}`.trim() ??
                        viewingOrder.email ??
                        "Not provided"}
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
                                      <Clock className='h-5 w-5'/>
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
                    const awb =  viewingOrder.awb;
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