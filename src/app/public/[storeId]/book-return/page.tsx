'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2, PackageSearch } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';

interface ServiceStatus {
  serviceEnabled: boolean;
  message: string;
}

interface SessionData {
  sessionId: string;
  csrfToken: string;
}

interface OrderItem {
    name: string;
    sku: string;
    quantity: number;
    price: string;
}

interface OrderData {
    name: string;
    status: string;
    logs: any[];
    payment_gateway_names: string[];
    total_price: string;
    total_outstanding: string;
    shipping_address: any;
    items: OrderItem[];
}

export default function BookReturnPage({ params }: { params: { storeId: string } }) {
  const { toast } = useToast();
  const storeId = params.storeId;

  const [status, setStatus] = useState<ServiceStatus | null>(null);
  const [session, setSession] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(true);

  const [orderNumber, setOrderNumber] = useState('');
  const [phoneNo, setPhoneNo] = useState('');
  const [isFetchingOrder, setIsFetchingOrder] = useState(false);
  const [order, setOrder] = useState<OrderData | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());

  useEffect(() => {
    const initializeSession = async () => {
      setLoading(true);
      try {
        const response = await fetch('/api/public/book-return/start-session', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({ storeId }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          setStatus({ serviceEnabled: false, message: errorData.error || 'Failed to initialize session.' });
          throw new Error(errorData.error || 'Failed to initialize session');
        }

        const sessionData = await response.json();
        setSession(sessionData);
        localStorage.setItem('csrfToken', sessionData.csrfToken);
        setStatus({ serviceEnabled: true, message: 'Service is active.' });
      } catch (error) {
        console.error('Session initialization error:', error);
        if (!status) {
          setStatus({ serviceEnabled: false, message: error instanceof Error ? error.message : 'An unknown error occurred.' });
        }
      } finally {
        setLoading(false);
      }
    };

    initializeSession();
  }, [storeId]);
  
  const handleFetchOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsFetchingOrder(true);
    setFetchError(null);
    setOrder(null);
    setSelectedItems(new Set()); // Reset selection
    
    const csrfToken = localStorage.getItem('csrfToken');
    if (!csrfToken) {
        setFetchError('Session is invalid. Please refresh the page.');
        setIsFetchingOrder(false);
        return;
    }

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
            })
        });

        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.error || 'Failed to fetch order.');
        }

        setOrder(result);

    } catch (error) {
        setFetchError(error instanceof Error ? error.message : 'An unknown error occurred.');
    } finally {
        setIsFetchingOrder(false);
    }
  }
  
  const handleToggleItem = (sku: string) => {
      setSelectedItems(prev => {
          const newSet = new Set(prev);
          if (newSet.has(sku)) {
              newSet.delete(sku);
          } else {
              newSet.add(sku);
          }
          return newSet;
      });
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-muted/50 p-4">
        <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
        <p className="text-lg font-semibold">Initializing secure session...</p>
        <p className="text-muted-foreground">Please wait.</p>
      </div>
    );
  }

  if (!status?.serviceEnabled) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-muted/50 p-4 text-center">
        <Card className="w-full max-w-md">
            <CardHeader>
                <CardTitle>Service Not Available</CardTitle>
            </CardHeader>
            <CardContent>
                <p>{status?.message || 'This service is currently unavailable. Please try again later.'}</p>
            </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex justify-center items-start min-h-screen bg-muted/50 p-4 md:p-8">
      <div className="w-full max-w-3xl space-y-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Book a Return</CardTitle>
            <CardDescription>Enter your order details to begin the return process.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleFetchOrder} className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="order-number">Order Number</Label>
                  <Input 
                    id="order-number" 
                    placeholder="e.g., #1001"
                    value={orderNumber}
                    onChange={(e) => setOrderNumber(e.target.value)}
                    required
                    />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone-number">Phone Number</Label>
                  <Input 
                    id="phone-number" 
                    type="tel"
                    placeholder="Your 10-digit phone number" 
                    value={phoneNo}
                    onChange={(e) => setPhoneNo(e.target.value)}
                    required
                    />
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={isFetchingOrder}>
                {isFetchingOrder && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Show my Order
              </Button>
            </form>
          </CardContent>
        </Card>
        
        {fetchError && (
             <Card className="border-destructive">
                <CardHeader>
                    <CardTitle className="text-destructive">Error</CardTitle>
                </CardHeader>
                <CardContent>
                    <p>{fetchError}</p>
                </CardContent>
             </Card>
        )}

        {order && (
            <Card>
                <CardHeader>
                    <div className="flex justify-between items-start">
                        <div>
                            <CardTitle>Order {order.name}</CardTitle>
                            <CardDescription>Select items you wish to return.</CardDescription>
                        </div>
                        <Badge>{order.status}</Badge>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <h4 className="font-semibold">Items</h4>
                            <div className="border rounded-lg">
                                {order.items.map(item => (
                                    <div key={item.sku} className="flex items-center gap-4 p-4 border-b last:border-b-0">
                                         <Checkbox 
                                            id={`item-${item.sku}`} 
                                            onCheckedChange={() => handleToggleItem(item.sku)}
                                            checked={selectedItems.has(item.sku)}
                                         />
                                         <Label htmlFor={`item-${item.sku}`} className="flex-1 cursor-pointer">
                                            <div className="flex justify-between">
                                                <span>{item.name} (x{item.quantity})</span>
                                                <span className="font-mono">{new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(Number(item.price) * item.quantity)}</span>
                                            </div>
                                            <p className="text-xs text-muted-foreground">SKU: {item.sku}</p>
                                         </Label>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <Separator />
                        <div className="grid md:grid-cols-2 gap-6">
                            <div>
                                <h4 className="font-semibold">Shipping Address</h4>
                                <div className="text-sm text-muted-foreground mt-2">
                                    <p>{order.shipping_address.address1}</p>
                                    {order.shipping_address.address2 && <p>{order.shipping_address.address2}</p>}
                                    <p>{order.shipping_address.city}, {order.shipping_address.province} {order.shipping_address.zip}</p>
                                    <p>{order.shipping_address.country}</p>
                                </div>
                            </div>
                             <div className="text-right">
                                <h4 className="font-semibold">Order Total</h4>
                                <p className="text-2xl font-bold font-mono">{new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(Number(order.total_price))}</p>
                             </div>
                        </div>
                    </div>
                </CardContent>
                <CardFooter className="flex justify-end">
                     <Button size="lg" disabled={selectedItems.size === 0}>
                        Request a Return
                    </Button>
                </CardFooter>
            </Card>
        )}
         {!order && !isFetchingOrder && !fetchError && (
             <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed h-64 text-center p-8">
                <PackageSearch className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold">Your order details will appear here.</h3>
                <p className="text-muted-foreground text-sm">Please enter your order number and phone to find your order.</p>
             </div>
         )}
      </div>
    </div>
  );
}
