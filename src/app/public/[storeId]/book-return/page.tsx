// src/app/public/[storeId]/book-return/page.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, AlertCircle, CheckCircle, Package } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

type PageStatus = 'loading' | 'service_unavailable' | 'session_error' | 'ready_to_search' | 'searching' | 'order_found' | 'order_not_found';

interface SessionData {
  storeId: string;
  storeAlias: string;
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
  shipping_address: {
    name: string;
    address1: string;
    address2: string;
    city: string;
    province: string;
    zip: string;
    country: string;
  };
  items: OrderItem[];
}

export default function BookReturnPage() {
  const params = useParams();
  const storeId = params.storeId as string;

  const [status, setStatus] = useState<PageStatus>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [session, setSession] = useState<SessionData | null>(null);

  const [orderNumber, setOrderNumber] = useState('');
  const [phoneNo, setPhoneNo] = useState('');
  const [orderData, setOrderData] = useState<OrderData | null>(null);

  useEffect(() => {
    if (storeId) {
      const initializeSession = async () => {
        try {
          const response = await fetch('/api/public/book-return/start-session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
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
          setStatus('ready_to_search');
        } catch (error: any) {
          console.error(error);
          setErrorMessage(error.message);
          setStatus('session_error');
        }
      };
      initializeSession();
    }
  }, [storeId]);

  const handleSearchOrder = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!orderNumber || !phoneNo) {
          setStatus('order_not_found');
          setErrorMessage('Please enter both Order Number and Phone Number.');
          return;
      }

      setStatus('searching');
      setOrderData(null);
      setErrorMessage('');

      try {
          const csrfToken = localStorage.getItem('csrfToken');
          if (!csrfToken) {
              throw new Error('Session is invalid. Please refresh the page.');
          }

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

          setOrderData(result);
          setStatus('order_found');

      } catch (error: any) {
          setErrorMessage(error.message);
          setStatus('order_not_found');
      }
  };

  const renderContent = () => {
    switch (status) {
      case 'loading':
        return <div className="flex items-center gap-2"><Loader2 className="h-5 w-5 animate-spin" /><span>Initializing session...</span></div>;
      case 'session_error':
        return <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertTitle>Session Error</AlertTitle><AlertDescription>{errorMessage || 'Could not start a secure session.'}</AlertDescription></Alert>;
      case 'service_unavailable':
        return <Alert><AlertCircle className="h-4 w-4" /><AlertTitle>Service Unavailable</AlertTitle><AlertDescription>The return service is not available for this store.</AlertDescription></Alert>;
      
      case 'ready_to_search':
      case 'searching':
      case 'order_not_found':
      case 'order_found':
        return (
          <Card className="w-full max-w-lg">
            <CardHeader>
              <CardTitle>Book a Return</CardTitle>
              <CardDescription>Enter your order details to begin the return process.</CardDescription>
            </CardHeader>
            <form onSubmit={handleSearchOrder}>
              <CardContent className="space-y-4">
                <div className="grid gap-2">
                  <Label htmlFor="order-number">Order Number</Label>
                  <Input id="order-number" placeholder="#1234" value={orderNumber} onChange={(e) => setOrderNumber(e.target.value.replace(/#/g, ''))} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="phone-number">Phone Number</Label>
                  <Input id="phone-number" type="tel" placeholder="Your phone number" value={phoneNo} onChange={(e) => setPhoneNo(e.target.value)} />
                </div>
              </CardContent>
              <CardFooter className="flex flex-col items-stretch">
                <Button type="submit" disabled={status === 'searching'}>
                  {status === 'searching' ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Searching...</> : 'Show my Order'}
                </Button>
                {status === 'order_not_found' && errorMessage && (
                    <Alert variant="destructive" className="mt-4">
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle>Error</AlertTitle>
                        <AlertDescription>{errorMessage}</AlertDescription>
                    </Alert>
                )}
              </CardFooter>
            </form>
            {orderData && (
                <div className="p-6 pt-0">
                    <Separator className="my-4"/>
                    <div className="space-y-4">
                        <div className="flex justify-between items-center">
                            <h3 className="text-lg font-semibold">Your Order: {orderData.name}</h3>
                            <Badge>{orderData.status}</Badge>
                        </div>
                        <div className="space-y-2">
                            <h4 className="font-medium">Items</h4>
                            <div className="space-y-2 rounded-md border p-2">
                                {orderData.items.map((item, index) => (
                                    <div key={index} className="flex justify-between items-center text-sm">
                                        <span>{item.name} (x{item.quantity})</span>
                                        <span className="font-mono">{item.price}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                         <div>
                            <h4 className="font-medium">Shipping Address</h4>
                            <div className="text-sm text-muted-foreground">
                                <p>{orderData.shipping_address.name}</p>
                                <p>{orderData.shipping_address.address1}</p>
                                <p>{orderData.shipping_address.city}, {orderData.shipping_address.province} {orderData.shipping_address.zip}</p>
                            </div>
                        </div>
                         <Button className="w-full mt-4">
                           <Package className="mr-2 h-4 w-4" />
                           Proceed to Return
                         </Button>
                    </div>
                </div>
            )}
          </Card>
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
