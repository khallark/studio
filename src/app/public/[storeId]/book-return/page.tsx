
'use client';

import { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

type PageStatus =
  | 'loading'
  | 'initializing'
  | 'ready'
  | 'searching'
  | 'order_found'
  | 'error';

interface Session {
  sessionId: string;
  csrfToken: string;
}

interface OrderItem {
  name: string;
  sku: string;
  quantity: number;
  price: number;
}

interface Order {
  name: string;
  status: string;
  payment_gateway_names: string[];
  total_price: string;
  total_outstanding: string;
  shipping_address: any;
  items: OrderItem[];
}

export default function BookReturnPage({
  params,
}: {
  params: { storeId: string };
}) {
  const [status, setStatus] = useState<PageStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);

  const [orderNumber, setOrderNumber] = useState('');
  const [phoneNo, setPhoneNo] = useState('');
  const [order, setOrder] = useState<Order | null>(null);
  const [selectedItems, setSelectedItems] = useState<OrderItem[]>([]);

  // 1. Initial validation and session creation
  useEffect(() => {
    const initializeSession = async () => {
      setStatus('initializing');
      try {
        const response = await fetch('/api/public/book-return/start-session', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({
            storeId: params.storeId,
          }),
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || 'Failed to initialize session');
        }

        setSession(data);
        localStorage.setItem('csrfToken', data.csrfToken);
        setStatus('ready');
      } catch (err: any) {
        setError(
          err.message || 'This return portal is currently unavailable.'
        );
        setStatus('error');
      }
    };

    initializeSession();
  }, [params.storeId]);

  const handleSearchOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderNumber || !phoneNo) {
      setError('Please enter both Order Number and Phone Number.');
      return;
    }
    const csrfToken = localStorage.getItem('csrfToken');
    if (!csrfToken) {
      setError('Session is invalid. Please refresh the page.');
      return;
    }

    setStatus('searching');
    setError(null);
    setOrder(null);
    setSelectedItems([]);

    try {
      const response = await fetch('/api/public/book-return/order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken,
        },
        credentials: 'include',
        body: JSON.stringify({
          orderNumber,
          phoneNo,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Could not find the order.');
      }
      setOrder(data);
      setStatus('order_found');
    } catch (err: any) {
      setError(
        err.message || 'An unexpected error occurred while fetching your order.'
      );
      setStatus('ready'); // Go back to the form
    }
  };

  const handleToggleItem = (item: OrderItem) => {
    setSelectedItems((prev) => {
      const isSelected = prev.some((i) => i.sku === item.sku);
      if (isSelected) {
        return prev.filter((i) => i.sku !== item.sku);
      } else {
        return [...prev, item];
      }
    });
  };

  const renderContent = () => {
    switch (status) {
      case 'loading':
      case 'initializing':
        return (
          <div className="flex flex-col items-center gap-2 text-center p-4">
            <Loader2 className="h-10 w-10 text-primary animate-spin" />
            <h3 className="text-xl font-semibold tracking-tight">
              Initializing Secure Session...
            </h3>
            <p className="text-sm text-muted-foreground max-w-sm">
              Please wait while we prepare the return portal.
            </p>
          </div>
        );
      case 'error':
        return (
          <div className="flex flex-col items-center gap-2 text-center p-4">
            <AlertCircle className="h-10 w-10 text-destructive" />
            <h3 className="text-xl font-semibold tracking-tight">
              An Error Occurred
            </h3>
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 p-3 rounded-md max-w-sm">
              {error}
            </p>
          </div>
        );
      case 'ready':
      case 'searching':
      case 'order_found':
        return (
          <div className="w-full max-w-2xl space-y-8">
            <Card>
              <CardHeader>
                <CardTitle>Book a Return</CardTitle>
                <CardDescription>
                  Enter your order details to begin the return process.
                </CardDescription>
              </CardHeader>
              <form onSubmit={handleSearchOrder}>
                <CardContent className="space-y-4">
                  <div className="grid gap-2">
                    <Label htmlFor="orderNumber">Order Number</Label>
                    <Input
                      id="orderNumber"
                      placeholder="#1001"
                      value={orderNumber}
                      onChange={(e) => setOrderNumber(e.target.value)}
                      required
                      disabled={status === 'searching'}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="phoneNo">Phone Number</Label>
                    <Input
                      id="phoneNo"
                      type="tel"
                      placeholder="Your 10-digit phone number"
                      value={phoneNo}
                      onChange={(e) => setPhoneNo(e.target.value)}
                      required
                      disabled={status === 'searching'}
                    />
                  </div>
                  {error && (
                    <p className="text-sm text-destructive text-center">
                      {error}
                    </p>
                  )}
                </CardContent>
                <CardFooter>
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={status === 'searching'}
                  >
                    {status === 'searching' && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Show my Order
                  </Button>
                </CardFooter>
              </form>
            </Card>

            {status === 'searching' && (
              <div className="space-y-4">
                <Skeleton className="h-8 w-1/2" />
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
              </div>
            )}

            {order && (
              <Card className="w-full max-w-2xl">
                <CardHeader>
                  <CardTitle>Order {order.name}</CardTitle>
                  <CardDescription>
                    Please select the items you wish to return.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[50px]"></TableHead>
                          <TableHead>Product</TableHead>
                          <TableHead className="text-center">Quantity</TableHead>
                          <TableHead className="text-right">Price</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {order.items.map((item, index) => (
                          <TableRow key={index}>
                            <TableCell>
                              <Checkbox
                                checked={selectedItems.some(
                                  (i) => i.sku === item.sku
                                )}
                                onCheckedChange={() => handleToggleItem(item)}
                              />
                            </TableCell>
                            <TableCell>
                              <div className="font-medium">{item.name}</div>
                              <div className="text-xs text-muted-foreground">
                                SKU: {item.sku}
                              </div>
                            </TableCell>
                            <TableCell className="text-center">
                              {item.quantity}
                            </TableCell>
                            <TableCell className="text-right">
                              ${Number(item.price).toFixed(2)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <div>
                    <h4 className="font-semibold">Shipping Address</h4>
                    <address className="text-sm text-muted-foreground not-italic mt-1">
                      {order.shipping_address.address1}
                      {order.shipping_address.address2 &&
                        `, ${order.shipping_address.address2}`}
                      <br />
                      {order.shipping_address.city},{' '}
                      {order.shipping_address.province}{' '}
                      {order.shipping_address.zip}
                      <br />
                      {order.shipping_address.country}
                    </address>
                  </div>
                </CardContent>
                <CardFooter>
                  <Button
                    className="w-full"
                    disabled={selectedItems.length === 0}
                    // onClick={handleRequestReturn}
                  >
                    Request a Return
                  </Button>
                </CardFooter>
              </Card>
            )}
          </div>
        );
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-muted/40 p-4 md:p-6">
      <div className="w-full max-w-4xl">{renderContent()}</div>
    </main>
  );
}

