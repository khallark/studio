
'use client';

import React, { useState, useEffect, useCallback } from 'react';
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
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Download, MoreHorizontal } from 'lucide-react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '@/lib/firebase';
import { collection, doc, getDoc, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';

interface Order {
  id: string; // Firestore document ID
  name: string;
  createdAt: string;
  email: string;
  totalPrice: number;
  currency: string;
  financialStatus: string;
  fulfillmentStatus: string;
  raw: {
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
  
  const [orders, setOrders] = useState<Order[]>([]);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 10;

  // Fetch user data to get active account
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

  // Listen for real-time order updates
  useEffect(() => {
    if (userData?.activeAccountId) {
      setLoading(true);
      const ordersRef = collection(db, 'accounts', userData.activeAccountId, 'orders');
      const q = query(ordersRef, orderBy('createdAt', 'desc'));

      const unsubscribe = onSnapshot(q, (snapshot) => {
        const fetchedOrders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));
        setOrders(fetchedOrders);
        setLoading(false);
      }, (error) => {
        console.error("Error fetching orders:", error);
        toast({
          title: "Error fetching orders",
          description: "Could not connect to the database. Please try again later.",
          variant: "destructive",
        });
        setLoading(false);
      });

      return () => unsubscribe(); // Cleanup listener on component unmount
    } else if (!userLoading && userData) {
        setLoading(false);
    }
  }, [userData, toast, userLoading]);

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


  // Pagination logic
  const indexOfLastOrder = currentPage * rowsPerPage;
  const indexOfFirstOrder = indexOfLastOrder - rowsPerPage;
  const currentOrders = orders.slice(indexOfFirstOrder, indexOfLastOrder);
  const totalPages = Math.ceil(orders.length / rowsPerPage);

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
          <Button onClick={handleBackfill} disabled={isSyncing || !userData?.activeAccountId}>
            <Download className="mr-2" />
            {isSyncing ? 'Syncing...' : 'Sync Orders'}
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
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
                currentOrders.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell className="font-medium">{order.name}</TableCell>
                    <TableCell>{new Date(order.createdAt).toLocaleDateString()}</TableCell>
                    <TableCell>{order.email}</TableCell>
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
                          <DropdownMenuItem>Confirm Order</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={8} className="text-center h-24">
                    {userData?.activeAccountId ? 'No orders found. Try syncing your orders.' : 'Please connect a store to see your orders.'}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
        <CardFooter>
          <div className="flex items-center justify-between w-full">
            <div className="text-xs text-muted-foreground">
              Showing{' '}
              <strong>
                {orders.length > 0 ? indexOfFirstOrder + 1 : 0}-
                {Math.min(indexOfLastOrder, orders.length)}
              </strong>{' '}
              of <strong>{orders.length}</strong> orders
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
                        <p className="text-sm">{selectedOrder.email}</p>
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
                           <TableCell className="text-right">{new Intl.NumberFormat('en-US', { style: 'currency', currency: selectedOrder.currency }).format(item.price)}</TableCell>
                          <TableCell className="text-right">{new Intl.NumberFormat('en-US', { style: 'currency', currency: selectedOrder.currency }).format(item.price * item.quantity)}</TableCell>
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
    </>
  );
}
