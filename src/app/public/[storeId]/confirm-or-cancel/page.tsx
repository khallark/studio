    // app/public/[storeId]/confirm-or-cancel/page.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, ShieldCheck, AlertCircle, CheckCircle, XCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';

const STATUS_MAP: Record<string, string> = {
  'New': 'In process',
  'Confirmed': 'In process',
  'Ready To Dispatch': 'Ready to ship',
  'Dispatched': 'On its way',
  'In Transit': 'On its way',
  'Out For Delivery': 'Near the destination',
  'Delivered': 'Delivered',
  'Cancellation Requested': 'Cancellation Requested',
  'Cancelled': 'Cancelled'
};

const getMappedStatus = (status: string): string => {
  return STATUS_MAP[status] || status;
};

export default function ConfirmOrCancelPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const storeId = params.storeId as string;
  const orderNumber = searchParams.get('order_number');
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [fetchingOrder, setFetchingOrder] = useState(false);
  const [order, setOrder] = useState<any | null>(null);
  const [orderError, setOrderError] = useState<string | null>(null);

  const [confirming, setConfirming] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [actionResponse, setActionResponse] = useState<{success: boolean, message: string} | null>(null);

  useEffect(() => {
    document.title = "Confirm or Cancel Order";
  }, []);

  useEffect(() => {
    const startSession = async () => {
      try {
        const response = await fetch('/api/public/confirm-or-cancel/start-session', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({ storeId: storeId })
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to initialize session');
        }

        const sessionData = await response.json();
        localStorage.setItem('csrfToken', sessionData.csrfToken);

      } catch (err: any) {
        setError(err.message || 'An unknown error occurred.');
      } finally {
        setLoading(false);
      }
    };

    if (storeId) {
      startSession();
    }
  }, [storeId]);

  useEffect(() => {
    if (!loading && !error && orderNumber) {
      fetchOrder();
    }
  }, [loading, error, orderNumber]);

  const fetchOrder = async () => {
    if (!orderNumber) {
      setOrderError('Order number is required.');
      return;
    }

    setFetchingOrder(true);
    setOrderError(null);
    setOrder(null);
    setActionResponse(null);

    try {
      const csrfToken = localStorage.getItem('csrfToken');
      if (!csrfToken) {
        throw new Error('Session is invalid. Please refresh the page.');
      }

      const response = await fetch('/api/public/confirm-or-cancel/order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken,
        },
        credentials: 'include',
        body: JSON.stringify({
          orderNumber: orderNumber,
        })
      });
      
      const responseData = await response.json();
      if (!response.ok) {
        throw new Error(responseData.error || 'Failed to find order.');
      }
      
      setOrder(responseData);

    } catch (err: any) {
      setOrderError(err.message);
    } finally {
      setFetchingOrder(false);
    }
  };

  const handleConfirmOrder = async () => {
    if (!order) return;

    setConfirming(true);
    setActionResponse(null);

    try {
      const csrfToken = localStorage.getItem('csrfToken');
      
      const response = await fetch('/api/public/confirm-or-cancel/confirm-order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken!,
        },
        credentials: 'include',
        body: JSON.stringify({
          orderId: order.id
        })
      });

      const result = await response.json();

      if (!response.ok) {
        if (result.sessionError) {
          setError('Your session has expired. Please refresh the page to continue.');
        }
        throw new Error(result.error || 'An unknown error occurred.');
      }

      setActionResponse(result);
      
      if (result.success) {
        // Refresh order data
        await fetchOrder();
      }

    } catch (error: any) {
      toast({
        title: 'Confirmation Failed',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setConfirming(false);
    }
  };

  const handleCancelOrder = async () => {
    if (!order) return;

    setCancelling(true);
    setActionResponse(null);

    try {
      const csrfToken = localStorage.getItem('csrfToken');
      
      const response = await fetch('/api/public/confirm-or-cancel/cancel-order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken!,
        },
        credentials: 'include',
        body: JSON.stringify({
          orderId: order.id
        })
      });

      const result = await response.json();

      if (!response.ok) {
        if (result.sessionError) {
          setError('Your session has expired. Please refresh the page to continue.');
        }
        throw new Error(result.error || 'An unknown error occurred.');
      }

      setActionResponse(result);
      
      if (result.success) {
        // Refresh order data
        await fetchOrder();
      }

    } catch (error: any) {
      toast({
        title: 'Cancellation Failed',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setCancelling(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground text-sm sm:text-base">Initializing secure session...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-red-50 p-4">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 sm:h-16 sm:w-16 text-destructive mx-auto mb-4" />
          <h1 className="text-xl sm:text-2xl font-bold text-destructive">Service Unavailable</h1>
          <p className="text-muted-foreground mt-2 text-sm sm:text-base">{error}</p>
          <Button onClick={() => window.location.reload()} className="mt-6">
            Refresh Page
          </Button>
        </div>
      </div>
    );
  }

  if (!orderNumber) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-4">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 sm:h-16 sm:w-16 text-destructive mx-auto mb-4" />
          <h1 className="text-xl sm:text-2xl font-bold">Invalid Request</h1>
          <p className="text-muted-foreground mt-2 text-sm sm:text-base">Order number is missing from the URL.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-4xl mx-auto">
        <div className="text-center mb-6">
          <a 
            href={`https://${storeId}.myshopify.com`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-xs sm:text-sm text-muted-foreground hover:text-primary transition-colors duration-200 group"
          >
            <svg className="w-3 h-3 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <span className="border-b border-transparent group-hover:border-current">
              Visit the Store
            </span>
          </a>
        </div>

        <div className="text-center mb-8">
          <h1 className="text-2xl sm:text-4xl font-bold font-headline text-primary">Confirm or Cancel Order</h1>
          <p className="text-muted-foreground mt-2 text-sm sm:text-base">Manage your order #{orderNumber}</p>
        </div>

        {fetchingOrder && (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
            <p className="text-muted-foreground text-sm">Loading order details...</p>
          </div>
        )}

        {orderError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{orderError}</AlertDescription>
          </Alert>
        )}

        {order && (
          <Card className='pb-8 sm:pb-4'>
            <CardHeader>
              <div className="flex justify-between gap-2 items-start">
                <div className='flex flex-col gap-2 md:gap-1'>
                  <div className='flex flex-wrap gap-2 md:gap-4 items-center'>
                    <CardTitle className="text-lg sm:text-xl">{order.name}</CardTitle>
                    <Badge variant="default" className="text-xs">{getMappedStatus(order.customStatus)}</Badge>
                  </div>
                  <CardDescription className="text-xs sm:text-sm">
                    {order.customStatus === 'New' 
                      ? 'You can confirm or cancel this order.'
                      : 'This order cannot be modified anymore.'}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {actionResponse && (
                <Alert variant={actionResponse.success ? 'default' : 'destructive'}>
                  {actionResponse.success ? <ShieldCheck className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                  <AlertTitle className="text-sm">{actionResponse.success ? 'Success' : 'Error'}</AlertTitle>
                  <AlertDescription className="text-sm">
                    {actionResponse.message}
                  </AlertDescription>
                </Alert>
              )}

              <div className="bg-muted/50 border rounded-lg p-4">
                <p className="text-xs sm:text-sm font-bold leading-relaxed">
                  {order.customStatus === 'New' ? (
                    <>
                      Your order is currently pending confirmation. You can either <span className="text-green-600">confirm</span> to proceed with the order or <span className="text-red-600">cancel</span> if you've changed your mind.
                    </>
                  ) : order.customStatus === 'Confirmed' ? (
                    <>
                      <span className="text-green-600">Order Confirmed</span>
                      <br />
                      Your order has been confirmed and is being prepared for shipment.
                    </>
                  ) : order.customStatus === 'Cancellation Requested' ? (
                    <>
                      <span className="text-red-600">Cancellation Requested</span>
                      <br />
                      Your cancellation request has been received and is being processed.
                    </>
                  ) : (
                    <>
                      This order is in {order.customStatus} status and cannot be modified.
                    </>
                  )}
                </p>
              </div>

              <div>
                <h3 className="font-semibold mb-2 text-sm sm:text-base">Order Items</h3>
                <div className="space-y-3 border rounded-md p-4">
                  {order.items.map((item: any, index: number) => (
                    <div key={index} className="flex justify-between items-start">
                      <div>
                        <p className="font-medium text-xs sm:text-sm">{item.name}</p>
                        <p className="text-[10px] sm:text-xs text-muted-foreground">Quantity: {item.quantity}</p>
                      </div>
                      <p className="text-xs sm:text-sm font-semibold">₹{item.price}</p>
                    </div>
                  ))}
                  <Separator />
                  <div className="flex justify-between items-center font-bold">
                    <p className="text-sm sm:text-base">Total</p>
                    <p className="text-sm sm:text-base">₹{order.raw?.total_price || '0.00'}</p>
                  </div>
                </div>
              </div>

              {order.customStatus === 'New' && !actionResponse && (
                <>
                  <Separator />
                  <div className="flex flex-col sm:flex-row gap-3">
                    <Button
                      onClick={handleConfirmOrder}
                      disabled={confirming || cancelling}
                      className="flex-1 text-xs sm:text-sm"
                    >
                      {confirming && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      <CheckCircle className="mr-2 h-4 w-4" />
                      Confirm Order
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={handleCancelOrder}
                      disabled={confirming || cancelling}
                      className="flex-1 text-xs sm:text-sm"
                    >
                      {cancelling && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      <XCircle className="mr-2 h-4 w-4" />
                      Cancel Order
                    </Button>
                  </div>
                </>
              )}

              <Separator />

              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <h3 className="font-semibold mb-2 text-sm sm:text-base">Order Status</h3>
                  <p className="text-xs sm:text-sm">{getMappedStatus(order.customStatus)}</p>
                </div>
                <div>
                  <h3 className="font-semibold mb-2 text-sm sm:text-base">Shipping Address</h3>
                  <address className="text-xs sm:text-sm not-italic text-muted-foreground">
                    {order.shipping_address.address1}<br />
                    {order.shipping_address.address2 && <>{order.shipping_address.address2}<br /></>}
                    {order.shipping_address.city}, {order.shipping_address.province} {order.shipping_address.zip}<br />
                    {order.shipping_address.country}
                    {order.shipping_address.phone && <><br />Phone: {order.shipping_address.phone}</>}
                  </address>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}