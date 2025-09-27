
'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2, PackageCheck, AlertCircle } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';

type PageStatus = 'loading' | 'service_unavailable' | 'ready' | 'session_error';

interface SessionData {
  csrfToken: string;
}

interface OrderItem {
  name: string;
  sku: string;
  quantity: number;
  price: number;
}

interface OrderData {
  name: string;
  status: string;
  payment_gateway_names: string[];
  total_price: string;
  total_outstanding: string;
  shipping_address: {
    address1: string;
    address2: string;
    city: string;
    province: string;
    zip: string;
    country: string;
    phone: string;
  };
  items: OrderItem[];
}

export default function BookReturnPage({ params }: { params: { storeId: string } }) {
  const { toast } = useToast();
  const { storeId } = params;

  const [pageStatus, setPageStatus] = useState<PageStatus>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [session, setSession] = useState<SessionData | null>(null);

  const [orderNumber, setOrderNumber] = useState('');
  const [phoneNo, setPhoneNo] = useState('');
  const [order, setOrder] = useState<OrderData | null>(null);
  const [orderLoading, setOrderLoading] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  
  const [selectedSKUs, setSelectedSKUs] = useState<Set<string>>(new Set());
  const [returnRequestLoading, setReturnRequestLoading] = useState(false);
  const [returnRequestResult, setReturnRequestResult] = useState<{ success: boolean, message: string } | null>(null);


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
      } catch (error) {
        console.error(error);
        const message = error instanceof Error ? error.message : 'An unknown error occurred';
        if (message.includes('Service not enabled')) {
            setPageStatus('service_unavailable');
        } else {
            setErrorMessage(message);
            setPageStatus('session_error');
        }
      }
    };
    initializeSession();
  }, [storeId]);
  
  const handleFindOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setOrder(null);
    setOrderError(null);
    setOrderLoading(true);
    setSelectedSKUs(new Set()); // Reset selections on new search
    setReturnRequestResult(null);

    const csrfToken = localStorage.getItem('csrfToken');
    if (!csrfToken) {
      setOrderError('Session is invalid. Please refresh the page.');
      setOrderLoading(false);
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

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || 'Failed to find order.');
        }
        setOrder(data);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'An unknown error occurred.';
        setOrderError(message);
    } finally {
        setOrderLoading(false);
    }
  };
  
    const handleToggleSku = (sku: string) => {
        setSelectedSKUs(prev => {
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
    if (!order || selectedSKUs.size === 0) return;

    setReturnRequestLoading(true);
    setReturnRequestResult(null);

    const csrfToken = localStorage.getItem('csrfToken');
     if (!csrfToken) {
        toast({ title: 'Session Error', description: 'Your session has expired. Please refresh the page.', variant: 'destructive' });
        setReturnRequestLoading(false);
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
            body: JSON.stringify({ orderId: order.name.substring(1), selectedSKUs: Array.from(selectedSKUs) }),
        });
        
        const result = await response.json();
        if (!response.ok) {
            if (result.sessionError) {
                toast({ title: 'Session Expired', description: result.error, variant: 'destructive' });
                setPageStatus('session_error');
            } else {
                throw new Error(result.error || 'Failed to submit return request.');
            }
        } else {
            setReturnRequestResult(result);
            if(result.success) {
              setOrder(null); // Clear order form on success
            }
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : 'An unknown error occurred.';
        toast({ title: 'Error', description: message, variant: 'destructive' });
    } finally {
        setReturnRequestLoading(false);
    }
  };


  const renderContent = () => {
    switch (pageStatus) {
      case 'loading':
        return (
          <div className="flex items-center justify-center h-full gap-2">
            <Loader2 className="h-6 w-6 animate-spin" />
            <p className="text-lg">Initializing secure session...</p>
          </div>
        );
      case 'service_unavailable':
        return (
          <div className="flex items-center justify-center h-full gap-2 text-red-600">
            <AlertCircle className="h-6 w-6" />
            <p className="text-lg font-semibold">Return Service Not Available</p>
          </div>
        );
      case 'session_error':
        return (
          <div className="flex items-center justify-center h-full gap-2 text-red-600">
            <AlertCircle className="h-6 w-6" />
            <p className="text-lg font-semibold">{errorMessage || 'Could not establish a secure session. Please refresh.'}</p>
          </div>
        );
      case 'ready':
        return (
            <div className="w-full max-w-2xl mx-auto">
                <Card>
                    <CardHeader>
                        <CardTitle>Request a Return</CardTitle>
                        <CardDescription>Enter your order details to start the return process.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {returnRequestResult && (
                            <div className={`p-4 rounded-md mb-4 flex items-start gap-3 ${returnRequestResult.success ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-blue-50 text-blue-800 border border-blue-200'}`}>
                                <PackageCheck className="h-5 w-5 mt-1" />
                                <div>
                                    <h4 className="font-semibold">{returnRequestResult.success ? 'Success' : 'Information'}</h4>
                                    <p>{returnRequestResult.message}</p>
                                </div>
                            </div>
                        )}
                        <form onSubmit={handleFindOrder}>
                            <div className="grid md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="orderNumber">Order Number</Label>
                                    <Input id="orderNumber" placeholder="#1001" value={orderNumber} onChange={e => setOrderNumber(e.target.value)} required />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="phoneNo">Phone Number</Label>
                                    <Input id="phoneNo" type="tel" placeholder="Your 10-digit phone number" value={phoneNo} onChange={e => setPhoneNo(e.target.value)} required />
                                </div>
                            </div>
                            {orderError && <p className="mt-2 text-sm text-red-600">{orderError}</p>}
                            <Button type="submit" className="w-full mt-4" disabled={orderLoading}>
                                {orderLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                {orderLoading ? 'Finding Order...' : 'Show my Order'}
                            </Button>
                        </form>

                        {order && (
                            <div className="mt-6 space-y-6">
                                <Separator />
                                <div>
                                    <h3 className="text-lg font-semibold">Order: {order.name}</h3>
                                    <p className="text-sm text-muted-foreground">Status: {order.status}</p>
                                </div>
                                 <Card>
                                    <CardHeader>
                                        <CardTitle>Select Items to Return</CardTitle>
                                        <CardDescription>Choose the items from your order you wish to send back.</CardDescription>
                                    </CardHeader>
                                    <CardContent className="space-y-4">
                                        {order.items.map(item => (
                                            <div key={item.sku} className="flex items-center space-x-3 p-3 border rounded-md">
                                                <Checkbox
                                                id={`item-${item.sku}`}
                                                checked={selectedSKUs.has(item.sku)}
                                                onCheckedChange={() => handleToggleSku(item.sku)}
                                                />
                                                <Label htmlFor={`item-${item.sku}`} className="flex-1 cursor-pointer">
                                                    <p className="font-medium">{item.name}</p>
                                                    <p className="text-xs text-muted-foreground">SKU: {item.sku} | Qty: {item.quantity}</p>
                                                </Label>
                                            </div>
                                        ))}
                                    </CardContent>
                                </Card>
                                <Button className="w-full" onClick={handleRequestReturn} disabled={selectedSKUs.size === 0 || returnRequestLoading}>
                                    {returnRequestLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    Request a Return
                                </Button>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        );
      default:
        return null;
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-muted/40 p-4">
      {renderContent()}
    </main>
  );
}
