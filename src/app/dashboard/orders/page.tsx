
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
  CardDescription,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Download, MoreHorizontal, Trash2, History, Bot, User } from 'lucide-react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '@/lib/firebase';
import { collection, doc, getDoc, onSnapshot, query, orderBy, Timestamp } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AssignAwbDialog } from '@/components/assign-awb-dialog';

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
  isDeleted?: boolean; // Tombstone flag
  logs?: OrderLog[];
  raw: {
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

interface OrdersPageProps {
  processAwbAssignments: (orders: {id: string, name: string}[]) => Promise<void>;
}

export default function OrdersPage({ processAwbAssignments }: OrdersPageProps) {
  const [user, userLoading] = useAuthState(auth);
  const { toast } = useToast();
  
  const [orders, setOrders] = useState<Order[]>([]);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [viewingLogsFor, setViewingLogsFor] = useState<Order | null>(null);
  
  const [activeTab, setActiveTab] = useState<CustomStatus>('New');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedOrders, setSelectedOrders] = useState<string[]>([]);
  const rowsPerPage = 10;
  
  const [isAwbDialogOpen, setIsAwbDialogOpen] = useState(false);
  const [ordersForAwb, setOrdersForAwb] = useState<Order[]>([]);

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

      return () => unsubscribe();
    } else if (!userLoading && userData) {
        setLoading(false);
    }
  }, [userData, toast, userLoading]);
  
  const handleAssignAwb = (orderIds: string[]) => {
      const ordersToProcess = orders.filter(o => orderIds.includes(o.id));
      setOrdersForAwb(ordersToProcess);
      setIsAwbDialogOpen(true);
  };

  const handleBackfill = useCallback(async () => {
    if (!userData?.activeAccountId) {
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
      const response = await fetch('/api/shopify/backfill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
  }, [userData, toast]);

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
    return orders.reduce((acc, order) => {
      if (order.isDeleted) return acc;
      const status = order.customStatus || 'New';
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {} as Record<CustomStatus, number>);
  }, [orders]);
  
  const filteredOrders = useMemo(() => {
    return orders.filter(order => (order.customStatus || 'New') === activeTab && !order.isDeleted);
  }, [orders, activeTab]);

  const indexOfLastOrder = currentPage * rowsPerPage;
  const indexOfFirstOrder = indexOfLastOrder - rowsPerPage;
  const currentOrders = filteredOrders.slice(indexOfFirstOrder, indexOfLastOrder);
  const totalPages = Math.ceil(filteredOrders.length / rowsPerPage);

  useEffect(() => {
    setCurrentPage(1);
    setSelectedOrders([]);
  }, [activeTab]);

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

  const renderActionItems = (order: Order) => {
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
            <DropdownMenuItem onClick={() => handleAssignAwb([order.id])}>
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
            <Button variant="outline" size="sm" disabled={isDisabled} onClick={() => handleAssignAwb(selectedOrders)}>
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
    <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Your Orders</CardTitle>
            <CardDescription>
              A list of all the orders from your connected stores.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
              {renderBulkActionButtons()}
              <Button onClick={handleBackfill} disabled={isSyncing || !userData?.activeAccountId}>
                  <Download className="mr-2" />
                  {isSyncing ? 'Syncing...' : 'Sync Orders'}
              </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as CustomStatus)}>
            <TabsList>
              <TabsTrigger value="New">New ({statusCounts['New'] || 0})</TabsTrigger>
              <TabsTrigger value="Confirmed">Confirmed ({statusCounts['Confirmed'] || 0})</TabsTrigger>
              <TabsTrigger value="Ready To Dispatch">Ready To Dispatch ({statusCounts['Ready To Dispatch'] || 0})</TabsTrigger>
              <TabsTrigger value="Dispatched">Dispatched ({statusCounts['Dispatched'] || 0})</TabsTrigger>
              <TabsTrigger value="Cancelled">Cancelled ({statusCounts['Cancelled'] || 0})</TabsTrigger>
            </TabsList>
            <TabsContent value={activeTab}>
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
                        <TableRow key={order.id} data-state={selectedOrders.includes(order.id) && "selected"}>
                          <TableCell>
                            <Checkbox
                              checked={selectedOrders.includes(order.id)}
                              onCheckedChange={() => handleSelectOrder(order.id)}
                              aria-label={`Select order ${order.name}`}
                            />
                          </TableCell>
                          <TableCell className="font-medium">{order.name}</TableCell>
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
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button aria-haspopup="true" size="icon" variant="ghost">
                                  <MoreHorizontal className="h-4 w-4" />
                                  <span className="sr-only">Toggle menu</span>
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                 <DropdownMenuItem onClick={() => setSelectedOrder(order)}>
                                  View Details
                                </DropdownMenuItem>
                                 <DropdownMenuItem onClick={() => setViewingLogsFor(order)}>
                                  <History className="mr-2 h-4 w-4" />
                                  View Logs
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                {renderActionItems(order)}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      )
                    })
                  ) : (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center h-24">
                        {userData?.activeAccountId ? `No ${activeTab.toLowerCase()} orders found.` : 'Please connect a store to see your orders.'}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TabsContent>
          </Tabs>
        </CardContent>
        <CardFooter>
          <div className="flex items-center justify-between w-full">
            <div className="text-xs text-muted-foreground">
                {selectedOrders.length > 0
                ? `${selectedOrders.length} of ${filteredOrders.length} order(s) selected.`
                : `Showing ${filteredOrders.length > 0 ? indexOfFirstOrder + 1 : 0}-${Math.min(indexOfLastOrder, filteredOrders.length)} of ${filteredOrders.length} orders`
              }
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
        </CardFooter>
      </Card>
    </main>

    <AssignAwbDialog
        isOpen={isAwbDialogOpen}
        onClose={() => setIsAwbDialogOpen(false)}
        orders={ordersForAwb}
        onConfirm={processAwbAssignments}
        shopId={userData?.activeAccountId || ''}
     />

    <Dialog open={!!selectedOrder} onOpenChange={(isOpen) => !isOpen && setSelectedOrder(null)}>
        <DialogContent className="sm:max-w-2xl">
          {selectedOrder && (
            <>
              <DialogHeader>
                <DialogTitle>Order {selectedOrder.name}</DialogTitle>
                <DialogDescription>
                  Details for order placed on {new Date(selectedOrder.createdAt).toLocaleString()}.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-6 py-4">
                <div className="grid grid-cols-2 gap-8">
                    <div>
                        <h3 className="font-semibold mb-2">Customer</h3>
                        <p className="text-sm">{`${selectedOrder.raw.customer?.first_name || ''} ${selectedOrder.raw.customer?.last_name || ''}`.trim()}</p>
                        <p className="text-sm text-muted-foreground">{selectedOrder.email}</p>
                    </div>
                    <div>
                        <h3 className="font-semibold mb-2">Shipping Address</h3>
                        {selectedOrder.raw.shipping_address ? (
                            <div className="text-sm">
                                <p>{selectedOrder.raw.shipping_address.address1}{selectedOrder.raw.shipping_address.address2}</p>
                                <p>{selectedOrder.raw.shipping_address.city}, {selectedOrder.raw.shipping_address.province} {selectedOrder.raw.shipping_address.zip}</p>
                                <p>{selectedOrder.raw.shipping_address.country}</p>
                            </div>
                        ): (
                            <p className="text-sm text-muted-foreground">No shipping address provided.</p>
                        )}
                    </div>
                </div>
                <Separator />
                <div>
                  <h3 className="font-semibold mb-2">Items</h3>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead>SKU</TableHead>
                        <TableHead className="text-center">Quantity</TableHead>
                        <TableHead className="text-right">Price</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedOrder.raw.line_items.map((item: any, index: number) => (
                        <TableRow key={index}>
                          <TableCell className="font-medium">{item.title}</TableCell>
                          <TableCell>{item.sku || 'N/A'}</TableCell>
                          <TableCell className="text-center">{item.quantity}</TableCell>
                           <TableCell className="text-right">{new Intl.NumberFormat('en-US', { style: 'currency', currency: selectedOrder.currency }).format(item.price)}</TableCell>                          <TableCell className="text-right">{new Intl.NumberFormat('en-US', { style: 'currency', currency: selectedOrder.currency }).format(item.price * item.quantity)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                 <Separator />
                 <div className="flex justify-end items-center gap-4 text-lg font-bold">
                    <div>Total:</div>
                    <div>{new Intl.NumberFormat('en-US', { style: 'currency', currency: selectedOrder.currency }).format(selectedOrder.totalPrice)}</div>
                 </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
      
      <Dialog open={!!viewingLogsFor} onOpenChange={(isOpen) => !isOpen && setViewingLogsFor(null)}>
        <DialogContent className="sm:max-w-2xl">
          {viewingLogsFor && (
            <>
              <DialogHeader>
                <DialogTitle>History for Order {viewingLogsFor.name}</DialogTitle>
                <DialogDescription>
                  A chronological list of all actions taken on this order.
                </DialogDescription>
              </DialogHeader>
              <ScrollArea className="max-h-[60vh] mt-4 rounded-md border">
                <div className="p-6 space-y-6">
                  {(viewingLogsFor.logs && viewingLogsFor.logs.length > 0) ? (
                     [...viewingLogsFor.logs].sort((a, b) => b.timestamp.toMillis() - a.timestamp.toMillis()).map((log, index) => (
                      <div key={index} className="flex items-start gap-4">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
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
                           <p className="text-xs text-muted-foreground mt-1">
                            {log.timestamp?.toDate().toLocaleString()}
                          </p>
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
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
