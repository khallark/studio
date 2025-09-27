'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2, AlertTriangle, CheckCircle, Package } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';

type PageStatus = 'validating' | 'ready' | 'loading' | 'order_shown' | 'return_requested' | 'error';

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

interface FetchedOrder {
    name: string;
    status: string;
    items: OrderItem[];
    shipping_address: any
    // Add other fields from your API response as needed
}

export default function BookReturnPage({ params }: { params: { storeId: string } }) {
  const { storeId } = params;
  const { toast } = useToast();

  const [pageStatus, setPageStatus] = useState<PageStatus>('validating');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [session, setSession] = useState<SessionData | null>(null);

  const [orderNumber, setOrderNumber] = useState('');
  const [phoneNo, setPhoneNo] = useState('');
  const [order, setOrder] = useState<FetchedOrder | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null); // To store the internal order ID
  const [isLoadingOrder, setIsLoadingOrder] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);

  const [selectedSkus, setSelectedSkus] = useState<Set<string>>(new Set());
  const [isRequestingReturn, setIsRequestingReturn] = useState(false);
  const [returnResponse, setReturnResponse] = useState<{success: boolean, message: string} | null>(null);


  useEffect(() => {
    const initializeSession = async () => {
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
          throw new Error(errorData.error || 'Failed to initialize session');
        }

        const sessionData = await response.json();
        setSession(sessionData);
        localStorage.setItem('csrfToken', sessionData.csrfToken);
        setPageStatus('ready');
      } catch (err: any) {
        setErrorMessage(err.message || 'An unexpected error occurred.');
        setPageStatus('error');
      }
    };

    initializeSession();
  }, [storeId]);

  const handleFetchOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoadingOrder(true);
    setOrderError(null);
    setOrder(null);
    setReturnResponse(null);

    const csrfToken = localStorage.getItem('csrfToken');
    if (!csrfToken) {
      setOrderError('Session is invalid. Please refresh the page.');
      setIsLoadingOrder(false);
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
        body: JSON.stringify({ orderNumber, phoneNo }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to fetch order.');
      }
      
      setOrder(result.order);
      setOrderId(result.orderId);
      setPageStatus('order_shown');

    } catch (err: any) {
      setOrderError(err.message);
    } finally {
      setIsLoadingOrder(false);
    }
  };
  
  const handleToggleItem = (sku: string) => {
    setSelectedSkus(prev => {
        const newSet = new Set(prev);
        if (newSet.has(sku)) {
            newSet.delete(sku);
        } else {
            newSet.add(sku);
        }
        return newSet;
    });
  };

  const handleRequestReturn = async () => {
    if (!orderId || selectedSkus.size === 0) return;

    setIsRequestingReturn(true);
    setReturnResponse(null);
    toast({ title: 'Submitting your return request...' });
    
    const csrfToken = localStorage.getItem('csrfToken');
    if (!csrfToken) {
        toast({ title: 'Error', description: 'Session is invalid. Please refresh.', variant: 'destructive'});
        setIsRequestingReturn(false);
        return;
    }

    try {
        const response = await fetch('/api/public/book-return/request', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': csrfToken,
            },
            credentials: 'include',
            body: JSON.stringify({
                orderId: orderId,
                selectedSKUs: Array.from(selectedSkus)
            })
        });

        const result = await response.json();
        
        if (!response.ok) {
            if (result.sessionError) {
                 toast({ title: 'Session Error', description: result.error, variant: 'destructive'});
                 setPageStatus('error');
                 setErrorMessage(result.error);
            } else {
                throw new Error(result.error || 'An unknown error occurred.');
            }
        } else {
             setReturnResponse(result);
             if (result.success) {
                toast({ title: 'Success', description: result.message });
                setPageStatus('return_requested');
             } else {
                toast({ title: 'Info', description: result.message, duration: 5000});
             }
        }

    } catch (err: any) {
        toast({ title: 'Request Failed', description: err.message, variant: 'destructive' });
    } finally {
        setIsRequestingReturn(false);
    }
  };


  const renderContent = () => {
    switch (pageStatus) {
      case 'validating':
        return (
          <div className="flex flex-col items-center justify-center gap-4 text-center">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="text-lg font-medium">Validating and securing your session...</p>
            <p className="text-sm text-muted-foreground">Please wait a moment.</p>
          </div>
        );
      case 'error':
        return (
          <div className="flex flex-col items-center justify-center gap-4 text-center">
            <AlertTriangle className="h-10 w-10 text-destructive" />
            <p className="text-lg font-medium">An Error Occurred</p>
            <p className="text-sm text-muted-foreground max-w-sm">{errorMessage}</p>
             <Button onClick={() => window.location.reload()}>Refresh Page</Button>
          </div>
        );
      case 'ready':
      case 'order_shown':
      case 'return_requested':
        return (
          <Card className="w-full max-w-4xl mx-auto">
            <CardHeader>
              <CardTitle className="text-2xl font-headline">Book a Return</CardTitle>
              <CardDescription>Enter your order details to begin the return process.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleFetchOrder}>
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="grid gap-2">
                    <Label htmlFor="order-number">Order Number</Label>
                    <Input id="order-number" placeholder="#1234" value={orderNumber} onChange={e => setOrderNumber(e.target.value)} required disabled={isLoadingOrder || !!order} />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="phone">Phone Number</Label>
                    <Input id="phone" placeholder="Your 10-digit phone number" value={phoneNo} onChange={e => setPhoneNo(e.target.value)} required disabled={isLoadingOrder || !!order} />
                  </div>
                </div>
                {orderError && <p className="mt-4 text-sm text-center text-destructive">{orderError}</p>}
                {!order && (
                    <Button type="submit" className="w-full mt-6" disabled={isLoadingOrder}>
                        {isLoadingOrder ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : null}
                        {isLoadingOrder ? 'Finding Your Order...' : 'Show my Order'}
                    </Button>
                )}
              </form>
              
              {order && (
                <div className="mt-8 space-y-6">
                    <Separator />
                    <h3 className="text-xl font-semibold">Your Order: {order.name}</h3>
                    <div className="grid md:grid-cols-2 gap-6">
                        <div>
                             <h4 className="font-medium mb-2">Select items to return:</h4>
                             <div className="space-y-3 rounded-md border p-4">
                                {order.items.map(item => (
                                    <div key={item.sku} className="flex items-center space-x-3">
                                        <Checkbox
                                            id={`item-${item.sku}`}
                                            checked={selectedSkus.has(item.sku)}
                                            onCheckedChange={() => handleToggleItem(item.sku)}
                                            disabled={pageStatus === 'return_requested'}
                                        />
                                        <Label htmlFor={`item-${item.sku}`} className="flex-1 cursor-pointer">
                                            <p>{item.name} (x{item.quantity})</p>
                                            <p className="text-xs text-muted-foreground">SKU: {item.sku}</p>
                                        </Label>
                                    </div>
                                ))}
                             </div>
                        </div>
                         <div>
                            <h4 className="font-medium mb-2">Shipping Address</h4>
                             <div className="text-sm text-muted-foreground">
                                <p>{order.shipping_address?.address1}</p>
                                <p>{order.shipping_address?.address2}</p>
                                <p>{order.shipping_address?.city}, {order.shipping_address?.province} {order.shipping_address?.zip}</p>
                                <p>{order.shipping_address?.country}</p>
                             </div>
                        </div>
                    </div>
                </div>
              )}

             {returnResponse && (
                <div className={`mt-6 p-4 rounded-md flex items-start gap-4 ${returnResponse.success ? 'bg-green-50 border-green-200 text-green-800' : 'bg-yellow-50 border-yellow-200 text-yellow-800'}`}>
                    {returnResponse.success ? <CheckCircle className="h-5 w-5 mt-0.5"/> : <AlertTriangle className="h-5 w-5 mt-0.5" />}
                    <div className="flex-1">
                        <h4 className="font-semibold">{returnResponse.success ? "Request Submitted" : "Information"}</h4>
                        <p className="text-sm">{returnResponse.message}</p>
                    </div>
                </div>
             )}

            </CardContent>
            {pageStatus === 'order_shown' && order && (
                <CardFooter>
                    <Button 
                        className="w-full"
                        onClick={handleRequestReturn}
                        disabled={selectedSkus.size === 0 || isRequestingReturn}
                    >
                        {isRequestingReturn ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : null}
                        Request a Return for {selectedSkus.size} item(s)
                    </Button>
                </CardFooter>
            )}
          </Card>
        );
      default:
        return null;
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-muted/40 p-4 md:p-6">
      {renderContent()}
    </main>
  );
}
