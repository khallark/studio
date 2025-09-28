'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, ShieldCheck, Ticket, AlertCircle, Info } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';


export default function BookReturnPage() {
  const params = useParams();
  const storeId = params.storeId as string;
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [orderNumber, setOrderNumber] = useState('');
  const [phoneNo, setPhoneNo] = useState('');
  const [findingOrder, setFindingOrder] = useState(false);
  const [order, setOrder] = useState<any | null>(null);
  const [orderError, setOrderError] = useState<string | null>(null);

  const [selectedVariantIds, setSelectedVariantIds] = useState<Set<number>>(new Set());
  const [requestingReturn, setRequestingReturn] = useState(false);
  const [returnResponse, setReturnResponse] = useState<{success: boolean, message: string} | null>(null);

  useEffect(() => {
    document.title = "Book a return";
  })

  useEffect(() => {
    const startSession = async () => {
      try {
        const response = await fetch('/api/public/book-return/start-session', {
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

  const handleFindOrder = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!orderNumber || !phoneNo) {
          setOrderError('Please enter both Order Number and Phone Number.');
          return;
      }

      setFindingOrder(true);
      setOrderError(null);
      setOrder(null); // Reset previous order
      setReturnResponse(null);
      setSelectedVariantIds(new Set());

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
              body: JSON.stringify({
                  orderNumber: orderNumber,
                  phoneNo: phoneNo,
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
          setFindingOrder(false);
      }
  };
  
    const handleToggleVariantId = (variantId: number) => {
        // Safety check: ensure the variant_id belongs to current order
        if (!order || !order.items.some((item: any) => item.variant_id === variantId)) {
          console.warn('Attempted to toggle variant_id not in current order:', variantId);
          return;
        }

        setSelectedVariantIds(prev => {
        const newSet = new Set(prev);
        if (newSet.has(variantId)) {
            newSet.delete(variantId);
        } else {
            newSet.add(variantId);
        }
        return newSet;
        });
    };

    const handleRequestReturn = async () => {
        if (!order || selectedVariantIds.size === 0) return;

        setRequestingReturn(true);
        setReturnResponse(null);

        try {
            const csrfToken = localStorage.getItem('csrfToken');
            const response = await fetch('/api/public/book-return/request', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': csrfToken!,
                },
                credentials: 'include',
                body: JSON.stringify({
                    orderId: order.id,
                    selectedVariantIds: Array.from(selectedVariantIds)
                })
            });

            const result = await response.json();

            if (!response.ok) {
                if (result.sessionError) {
                    setError('Your session has expired. Please refresh the page to continue.');
                }
                throw new Error(result.error || 'An unknown error occurred.');
            }
            
            setReturnResponse(result);

            if (result.success) {
              setSelectedVariantIds(new Set());
            }

        } catch (error: any) {
            toast({
                title: 'Return Request Failed',
                description: error.message,
                variant: 'destructive'
            });
        } finally {
            setRequestingReturn(false);
        }
    };


  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground">Initializing secure session...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-red-50 p-4">
        <div className="text-center">
            <AlertCircle className="h-16 w-16 text-destructive mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-destructive">Service Unavailable</h1>
            <p className="text-muted-foreground mt-2">{error}</p>
            <Button onClick={() => window.location.reload()} className="mt-6">
                Refresh Page
            </Button>
        </div>
      </div>
    );
  }


  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-4xl mx-auto">

        {/* Store link at the top */}
        <div className="text-center mb-6">
          <a 
            href={`https://${storeId}.myshopify.com`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors duration-200 group"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <span className="border-b border-transparent group-hover:border-current">
              Visit the Store
            </span>
            <svg className="w-3 h-3 transition-transform group-hover:translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        </div>

        {!order && (
            <>
            <div className="text-center mb-8">
                <h1 className="text-4xl font-bold font-headline text-primary">Book a Return</h1>
                <p className="text-muted-foreground mt-2">Find your order to begin the return process.</p>
            </div>
            <Card>
                <form onSubmit={handleFindOrder}>
                    <CardHeader>
                        <CardTitle>Find Your Order</CardTitle>
                        <CardDescription>Enter your order number and the phone number used for the order.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid gap-2">
                            <Label htmlFor="orderNumber">Order Number</Label>
                            <Input
                            id="orderNumber"
                            placeholder="e.g., OWR-MT1001"
                            value={orderNumber}
                            onChange={(e) => {
                              setOrderNumber(e.target.value);
                              if (orderError) setOrderError(null);
                              // Clear selections when user starts typing new order number
                              if (selectedVariantIds.size > 0) setSelectedVariantIds(new Set());
                            }}
                            required
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="phoneNo">Phone Number</Label>
                            <Input
                            id="phoneNo"
                            type="tel"
                            placeholder="e.g., 9876543210"
                            value={phoneNo}
                            onChange={(e) => {
                              setPhoneNo(e.target.value);
                              if (orderError) setOrderError(null);
                              // Clear selections when user changes phone number
                              if (selectedVariantIds.size > 0) setSelectedVariantIds(new Set());
                            }}
                            required
                            />
                        </div>
                        {orderError && (
                            <Alert variant="destructive">
                                <AlertCircle className="h-4 w-4" />
                                <AlertTitle>Error</AlertTitle>
                                <AlertDescription>{orderError}</AlertDescription>
                            </Alert>
                        )}
                    </CardContent>
                    <CardFooter>
                        <Button type="submit" disabled={findingOrder} className="w-full">
                            {findingOrder ? (
                                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Searching...</>
                            ) : (
                                "Show my Order"
                            )}
                        </Button>
                    </CardFooter>
                </form>
            </Card>
            </>
        )}

        {order && (
            <Card className='pb-8 sm:pb-4'>
                <CardHeader>
                    <div className="flex justify-between gap-2 items-start">
                        <div className='flex flex-col gap-2 md:gap-1'>
                            <div className='flex flex-wrap gap-2 md:gap-4 items-center'>
                                <CardTitle>{order.name}</CardTitle>
                                <Badge variant="default">{order.status}</Badge>
                            </div>
                            <CardDescription className={`
                              ${order.status === 'Delivered'
                                ? ''
                                : ((order.status.includes('In Transit') || order.status === 'Out For Delivery') && order.status !== 'DTO In Transit'
                                    ? 'text-[#F0AD4E]'
                                    : 'text-red-500'
                                  )}
                              `}
                            >
                              {(() => {
                                if(order.status === 'Delivered')
                                  return "Review your order and select the items you wish to return."
                                if((order.status.includes('In Transit') || order.status === 'Out For Delivery') && order.status !== 'DTO In Transit')
                                  return "⚠ The order may not be eligible for return, but you can still make a request."
                                if(order.status.includes('DTO'))
                                  return "✖ This order is already booked for return, can't be booked again."
                                return "✖ This order is not eligible for return yet."
                              })()}
                            </CardDescription>
                        </div>
                         <Button variant="outline" onClick={
                          () => {
                            setOrder(null)
                            setSelectedVariantIds(new Set());
                            setReturnResponse(null);
                         }}>← Go back</Button>
                    </div>
                </CardHeader>
                <CardContent className="space-y-6">
                    {returnResponse ? (
                         <Alert variant={returnResponse.success ? 'default' : 'destructive'}>
                            {returnResponse.success ? <ShieldCheck className="h-4 w-4" /> : <Info className="h-4 w-4" />}
                            <AlertTitle>{returnResponse.success ? 'Request Submitted' : 'Information'}</AlertTitle>
                            <AlertDescription>
                                {returnResponse.message}
                            </AlertDescription>
                        </Alert>
                    ) : (
                    <>
                        <div>
                            <h3 className="font-semibold mb-2">Select items to return</h3>
                             <ScrollArea className="border rounded-md p-4">
                                <div className="space-y-4">
                                    {order.items.map((item: any) => (
                                    <div key={item.variant_id} className="flex items-start space-x-4 p-2 rounded-md hover:bg-muted/50">
                                        <Checkbox
                                            id={`item-${item.variant_id}`}
                                            checked={selectedVariantIds.has(item.variant_id)}
                                            onCheckedChange={() => handleToggleVariantId(item.variant_id)}
                                            disabled={
                                              !item.variant_id ||
                                              (order.status !== 'Delivered' && !((order.status.includes('In Transit') || order.status === 'Out For Delivery') && order.status !== 'DTO In Transit')) ||
                                              requestingReturn}
                                            className="mt-1"
                                        />
                                        <Label htmlFor={`item-${item.variant_id}`} className="flex-1 cursor-pointer">
                                            <p className="font-medium">{item.name}</p>
                                            <p className="text-xs text-muted-foreground">Quantity: {item.quantity}</p>
                                        </Label>
                                    </div>
                                    ))}
                                </div>
                            </ScrollArea>
                        </div>
                        
                        <Separator />

                        <div className="grid md:grid-cols-2 gap-6">
                            <div>
                                <h3 className="font-semibold mb-2">Order Status</h3>
                                <p className="text-sm">{order.status}</p>
                            </div>
                            <div>
                                <h3 className="font-semibold mb-2">Shipping Address</h3>
                                <address className="text-sm not-italic text-muted-foreground">
                                    {order.shipping_address.address1}<br />
                                    {order.shipping_address.address2 && <>{order.shipping_address.address2}<br /></>}
                                    {order.shipping_address.city}, {order.shipping_address.province} {order.shipping_address.zip}<br />
                                    {order.shipping_address.country}
                                     {order.shipping_address.phone && <><br />Phone: {order.shipping_address.phone}</>}
                                </address>
                            </div>
                        </div>
                     </>
                    )}
                </CardContent>
                {!returnResponse && (
                    <>
                        {/* Desktop version - in CardFooter */}
                        {!(order.status !== 'Delivered' && !((order.status.includes('In Transit') || order.status === 'Out For Delivery') && order.status !== 'DTO In Transit')) &&
                          <CardFooter className="hidden sm:flex justify-end">
                              <Button
                                  onClick={handleRequestReturn}
                                  disabled={selectedVariantIds.size === 0 || requestingReturn}
                              >
                                  {requestingReturn && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                  Request a Return
                              </Button>
                          </CardFooter>
                        }
                        
                        {/* Mobile version - sticky at bottom */}
                        {!(order.status !== 'Delivered' && !((order.status.includes('In Transit') || order.status === 'Out For Delivery') && order.status !== 'DTO In Transit')) &&
                          <div className="fixed bottom-0 left-0 right-0 p-4 sm:hidden">
                              <Button
                                  onClick={handleRequestReturn}
                                  disabled={selectedVariantIds.size === 0 || requestingReturn}
                                  className="w-full"
                                  size="lg"
                              >
                                  {requestingReturn && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                  Request a Return
                              </Button>
                          </div>
                        }
                    </>
                )}
            </Card>
        )}
      </div>
    </div>
  );
}