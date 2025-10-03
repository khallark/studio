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
import { Loader2, ShieldCheck, Ticket, AlertCircle, Info, Upload, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const STATUS_MAP: Record<string, string> = {
  'New': 'In process',
  'Confirmed': 'In process',
  'Ready To Dispatch': 'Ready to ship',
  'Dispatched': 'On its way',
  'In Transit': 'On its way',
  'Out For Delivery': 'Near the destination',
  'Delivered': 'Delivered',
  'RTO In Transit': 'On way back',
  'RTO Delivered': 'Return Completed',
  'DTO Requested': 'Return requested',
  'DTO Booked': 'Return booked',
  'DTO In Transit': 'On way back',
  'DTO Delivered': 'Return Completed',
  'Lost': 'Lost',
  'Closed': 'Delivered',
  'RTO Closed': 'Return Completed',
  'Cancelled': 'Cancelled'
};

const getMappedStatus = (status: string): string => {
  return STATUS_MAP[status] || status;
};

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

  const [uploadedImages, setUploadedImages] = useState<File[]>([]);
  const [returnReason, setReturnReason] = useState('');
  const [otherReasonText, setOtherReasonText] = useState('');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [cancellingRequest, setCancellingRequest] = useState(false);

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
      setOrder(null);
      setReturnResponse(null);
      setSelectedVariantIds(new Set());
      setUploadedImages([]);
      setReturnReason('');
      setOtherReasonText('');
      setUploadError(null);

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

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    setUploadError(null);
    const newFiles = Array.from(files);
    
    if (uploadedImages.length + newFiles.length > 10) {
      setUploadError('You can upload a maximum of 10 images.');
      return;
    }

    for (const file of newFiles) {
      if (file.size > 5 * 1024 * 1024) {
        setUploadError('Each image must be less than 5 MB.');
        return;
      }
      if (!file.type.startsWith('image/')) {
        setUploadError('Only image files are allowed.');
        return;
      }
    }

    setUploadedImages(prev => [...prev, ...newFiles]);
  };

  const handleRemoveImage = (index: number) => {
    setUploadedImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleRequestReturn = async () => {
      if (!order || selectedVariantIds.size === 0) return;

      if (uploadedImages.length === 0) {
        toast({
          title: 'Image Required',
          description: 'Please upload at least one image.',
          variant: 'destructive'
        });
        return;
      }

      if (!returnReason) {
        toast({
          title: 'Reason Required',
          description: 'Please select a reason for return.',
          variant: 'destructive'
        });
        return;
      }

      if (returnReason === 'Others' && !otherReasonText.trim()) {
        toast({
          title: 'Details Required',
          description: 'Please provide details for your return reason.',
          variant: 'destructive'
        });
        return;
      }

      setRequestingReturn(true);
      setReturnResponse(null);

      try {
          const csrfToken = localStorage.getItem('csrfToken');
          
          // Create FormData to send images along with other data
          const formData = new FormData();
          formData.append('orderId', order.id);
          formData.append('selectedVariantIds', JSON.stringify(Array.from(selectedVariantIds)));
          formData.append('booked_return_reason', returnReason === 'Others' ? otherReasonText : returnReason);
          
          // Append all images
          uploadedImages.forEach((file, index) => {
            formData.append(`image_${index}`, file);
          });

          const response = await fetch('/api/public/book-return/request', {
              method: 'POST',
              headers: {
                  'X-CSRF-Token': csrfToken!,
              },
              credentials: 'include',
              body: formData
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
            setUploadedImages([]);
            setReturnReason('');
            setOtherReasonText('');
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

  const handleCancelRequest = async () => {
    if (!order) return;

    setCancellingRequest(true);

    try {
      const csrfToken = localStorage.getItem('csrfToken');
      
      const response = await fetch('/api/public/book-return/cancel-request', {
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

      toast({
        title: 'Request Cancelled',
        description: result.message,
      });

      // Refresh the page to show updated order status
      window.location.reload();

    } catch (error: any) {
      toast({
        title: 'Cancellation Failed',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setCancellingRequest(false);
    }
  };

  const handleTrackOrder = () => {
    if (!order) return;
    
    const awb = order.awb_reverse || order.awb;
    if (awb) {
      window.open(`https://www.delhivery.com/track-v2/package/${awb}`, '_blank');
    }
  };

  useEffect(() => {
    if(order && order.returnItemsVariantIds)
      setSelectedVariantIds(new Set(order.returnItemsVariantIds))
  }, [order])

  const canRequest = ['Delivered'];
  const alreadyRequested = ['DTO Requested'];
  const canTryRequesting = ['In Transit', 'Out For Delivery', 'RTO In Transit'];
  const notEligible = ['New', 'Confirmed', 'Ready To Dispatch', 'Dispatched', 'RTO Delivered', 'Lost', 'Closed', 'RTO Closed'];
  const alreadyInProcess = ['DTO Booked', 'DTO In Transit', 'DTO Delivered'];

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
            <svg className="w-3 h-3 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <span className="border-b border-transparent group-hover:border-current">
              Visit the Store
            </span>
            <svg className="w-2.5 h-2.5 sm:w-3 sm:h-3 transition-transform group-hover:translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        </div>

        {!order && (
            <>
            <div className="text-center mb-8">
                <h1 className="text-2xl sm:text-4xl font-bold font-headline text-primary">Book a Return</h1>
                <p className="text-muted-foreground mt-2 text-sm sm:text-base">Find your order to begin the return process.</p>
            </div>
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg sm:text-xl">Find Your Order</CardTitle>
                    <CardDescription className="text-xs sm:text-sm">Enter your order number and the phone number used for the order.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-2">
                    <Label htmlFor="orderNumber" className="text-xs sm:text-sm">Order Number</Label>
                    <div className="relative flex items-center">
                      <div className="absolute left-[5px] flex items-center pointer-events-none">
                        <span className="text-[10px] sm:text-sm font-semibold bg-white px-1.5 sm:px-2 py-0.5 sm:py-1 rounded border border-gray-300">
                          #OWR-MT
                        </span>
                      </div>
                      <Input
                        id="orderNumber"
                        placeholder="e.g., 14569"
                        value={orderNumber}
                        onChange={(e) => {
                          setOrderNumber(e.target.value);
                          if (orderError) setOrderError(null);
                          if (selectedVariantIds.size > 0) setSelectedVariantIds(new Set());
                        }}
                        className="pl-[70px] sm:pl-[88px] text-sm"
                        required
                      />
                    </div>
                  </div>
                  <div className="grid gap-2">
                      <Label htmlFor="phoneNo" className="text-xs sm:text-sm">Phone Number</Label>
                      <Input
                      id="phoneNo"
                      type="tel"
                      placeholder="e.g., 9876543210"
                      value={phoneNo}
                      onChange={(e) => {
                        setPhoneNo(e.target.value);
                        if (orderError) setOrderError(null);
                        if (selectedVariantIds.size > 0) setSelectedVariantIds(new Set());
                      }}
                      className="text-sm"
                      required
                      />
                  </div>
                  {orderError && (
                      <Alert variant="destructive">
                          <AlertCircle className="h-3 w-3 sm:h-4 sm:w-4" />
                          <AlertTitle className="text-xs sm:text-sm">Error</AlertTitle>
                          <AlertDescription className="text-xs sm:text-sm">{orderError}</AlertDescription>
                      </Alert>
                  )}
                </CardContent>
                <CardFooter>
                    <Button 
                      onClick={handleFindOrder}
                      disabled={findingOrder} 
                      className="w-full text-sm"
                    >
                        {findingOrder ? (
                            <><Loader2 className="mr-2 h-3 w-3 sm:h-4 sm:w-4 animate-spin" /> Searching...</>
                        ) : (
                            "Show my Order"
                        )}
                    </Button>
                </CardFooter>
            </Card>
            </>
        )}

        {order && (
            <Card className='pb-8 sm:pb-4'>
                <CardHeader>
                    <div className="flex justify-between gap-2 items-start">
                        <div className='flex flex-col gap-2 md:gap-1'>
                            <div className='flex flex-wrap gap-2 md:gap-4 items-center'>
                                <CardTitle className="text-lg sm:text-xl">{order.name}</CardTitle>
                                <Badge variant="default" className="text-xs">{getMappedStatus(order.status)}</Badge>
                            </div>
                            <CardDescription className={`text-xs sm:text-sm
                              ${canTryRequesting.includes(order.status) ? 'text-[#F0AD4E]' : ''} 
                              ${notEligible.includes(order.status) ? 'text-red-500' : ''} 
                              ${alreadyInProcess.includes(order.status) ? 'text-red-500' : ''} 
                            `}
                            >
                              {(() => {
                                if(canRequest.includes(order.status))
                                  return "Review your order and select the items you wish to return.";
                                if(alreadyRequested.includes(order.status))
                                  return "Review your order and update the return selection again.";
                                if(canTryRequesting.includes(order.status))
                                  return "⚠ The order may not be eligible for return, but you can still make a request.";
                                if(notEligible.includes(order.status))
                                  return "✖ This order is not eligible for return yet.";
                                if(alreadyInProcess.includes(order.status))
                                  return "✖ This order is already booked for return, can't be booked again.";
                              })()}
                            </CardDescription>
                        </div>
                         <Button variant="outline" size="sm" className="text-xs sm:text-sm" onClick={
                          () => {
                            setOrder(null)
                            setSelectedVariantIds(new Set());
                            setReturnResponse(null);
                            setUploadedImages([]);
                            setReturnReason('');
                            setOtherReasonText('');
                         }}>← Go back</Button>
                    </div>
                </CardHeader>
                <CardContent className="space-y-6">
                    {returnResponse ? (
                         <Alert variant={returnResponse.success ? 'default' : 'destructive'}>
                            {returnResponse.success ? <ShieldCheck className="h-3 w-3 sm:h-4 sm:w-4" /> : <Info className="h-3 w-3 sm:h-4 sm:w-4" />}
                            <AlertTitle className="text-xs sm:text-sm">{returnResponse.success ? 'Request Submitted' : 'Information'}</AlertTitle>
                            <AlertDescription className="text-xs sm:text-sm">
                                {returnResponse.message}
                            </AlertDescription>
                        </Alert>
                    ) : (
                    <>
                        <div className="bg-muted/50 border rounded-lg p-4">
                          <p className="text-xs sm:text-sm font-bold leading-relaxed">
                            {(() => {
                              if(order.status == 'Delivered') {
                                return (
                                  <>
                                    Your can book a return request for this order from here.
                                  </>
                                )
                              }
                              if (order.status === 'DTO Requested') {
                                return (
                                  <>
                                    <span className="text-blue-600">Return Requested</span>
                                    <br />
                                    Your return request has been successfully processed. If you wish to update the items or cancel the request, you can still do so using the options available on your screen.
                                  </>
                                );
                              }
                              if (order.status === 'DTO Booked') {
                                return (
                                  <>
                                    <span className="text-green-600">Return Booked</span>
                                    <br />
                                    Your return has been booked. A delivery partner will reach you within 48 hours to pick up the items. Once picked, the parcel will reach our warehouse in 3–5 days. After a successful Quality Check (QC), your refund will be credited to your OWR wallet.
                                  </>
                                );
                              }
                              if (order.status === 'DTO In Transit') {
                                return (
                                  <>
                                    <span className="text-orange-600">Return In-Transit</span>
                                    <br />
                                    Your return is on the way to our warehouse. Once delivered, it will go through our Quality Check (QC) process. After a successful QC, your refund will be credited to your OWR wallet. You can track your return parcel using the "Track" button above.
                                  </>
                                );
                              }
                              if (order.status === 'DTO Delivered') {
                                return (
                                  <>
                                    <span className="text-purple-600">Pending Refund</span>
                                    <br />
                                    We've received your return at our warehouse. It is currently under Quality Check (QC), which usually takes up to 24 hours. After a successful QC, your refund will be processed and credited to your OWR wallet.
                                  </>
                                );
                              }
                              if (order.status === 'DTO Closed') {
                                return (
                                  <>
                                    <span className="text-gray-600">Return Closed</span>
                                    <br />
                                    Your return has been successfully closed, and no further action is required for this order. If you still have any questions, please DM us on Instagram @owr.life.
                                  </>
                                );
                              }
                              return (
                                <>
                                  This order may not be eligible for requesting return. If you have any questions, please DM us on Instagram @owr.life.
                                </>
                              );
                            })()}
                          </p>
                        </div>

                        <div>
                            <h3 className="font-semibold mb-2 text-sm sm:text-base">Select items to return</h3>
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
                                              notEligible.includes(order.status) ||
                                              alreadyInProcess.includes(order.status) ||
                                              requestingReturn}
                                            className="mt-1"
                                        />
                                        <Label htmlFor={`item-${item.variant_id}`} className="flex-1 cursor-pointer">
                                            <p className="font-medium text-xs sm:text-sm">{item.name}</p>
                                            <p className="text-[10px] sm:text-xs text-muted-foreground">Quantity: {item.quantity}</p>
                                        </Label>
                                    </div>
                                    ))}
                                </div>
                            </ScrollArea>
                        </div>

                        <div>
                          <Label htmlFor="image-upload" className="text-sm sm:text-base font-semibold mb-2 block">
                            Upload Images <span className="text-destructive">*</span>
                          </Label>
                          <p className="text-[10px] sm:text-xs text-muted-foreground mb-2">
                            Upload 1-10 images (max 5 MB each)
                          </p>
                          <div className="space-y-3">
                            <div className="flex items-center gap-2">
                              <Input
                                id="image-upload"
                                type="file"
                                accept="image/*"
                                multiple
                                onChange={handleImageUpload}
                                className="hidden"
                                disabled={notEligible.includes(order.status) || alreadyInProcess.includes(order.status) || requestingReturn || uploadedImages.length >= 10}
                              />
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => document.getElementById('image-upload')?.click()}
                                disabled={notEligible.includes(order.status) || alreadyInProcess.includes(order.status) || requestingReturn || uploadedImages.length >= 10}
                                className="text-xs sm:text-sm"
                              >
                                <Upload className="h-3 w-3 sm:h-4 sm:w-4 mr-2" />
                                Choose Images
                              </Button>
                              <span className="text-[10px] sm:text-xs text-muted-foreground">
                                {uploadedImages.length}/10 uploaded
                              </span>
                            </div>
                            {uploadError && (
                              <p className="text-xs text-destructive">{uploadError}</p>
                            )}
                            {uploadedImages.length > 0 && (
                              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                                {uploadedImages.map((file, index) => (
                                  <div key={index} className="relative group">
                                    <img
                                      src={URL.createObjectURL(file)}
                                      alt={`Upload ${index + 1}`}
                                      className="w-full h-20 sm:h-24 object-cover rounded-md border"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveImage(index)}
                                      className="absolute top-1 right-1 bg-destructive text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                      disabled={requestingReturn}
                                    >
                                      <X className="h-3 w-3" />
                                    </button>
                                    <p className="text-[8px] sm:text-[10px] text-muted-foreground mt-1 truncate">
                                      {file.name}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>

                        <div>
                          <Label htmlFor="return-reason" className="text-sm sm:text-base font-semibold mb-2 block">
                            Select a Reason <span className="text-destructive">*</span>
                          </Label>
                          <Select
                            value={returnReason}
                            onValueChange={setReturnReason}
                            disabled={notEligible.includes(order.status) || alreadyInProcess.includes(order.status) || requestingReturn}
                          >
                            <SelectTrigger className="text-xs sm:text-sm">
                              <SelectValue placeholder="Choose a reason for return" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Size Exchange" className="text-xs sm:text-sm">Size Exchange</SelectItem>
                              <SelectItem value="Wrong Product Delivered" className="text-xs sm:text-sm">Wrong Product Delivered</SelectItem>
                              <SelectItem value="Not Satisfied with quality" className="text-xs sm:text-sm">Not Satisfied with quality</SelectItem>
                              <SelectItem value="Manufacturing Defect" className="text-xs sm:text-sm">Manufacturing Defect</SelectItem>
                              <SelectItem value="Product Doesn't look like images uploaded" className="text-xs sm:text-sm">Product Doesn't look like images uploaded</SelectItem>
                              <SelectItem value="Others" className="text-xs sm:text-sm">Others</SelectItem>
                            </SelectContent>
                          </Select>
                          {returnReason === 'Others' && (
                            <div className="mt-3">
                              <Label htmlFor="other-reason" className="text-xs sm:text-sm mb-1 block">
                                Please specify <span className="text-destructive">*</span>
                              </Label>
                              <Textarea
                                id="other-reason"
                                placeholder="Enter your reason here..."
                                value={otherReasonText}
                                onChange={(e) => setOtherReasonText(e.target.value.slice(0, 500))}
                                maxLength={500}
                                className="text-xs sm:text-sm"
                                disabled={requestingReturn}
                              />
                              <p className="text-[10px] sm:text-xs text-muted-foreground mt-1">
                                {otherReasonText.length}/500 characters
                              </p>
                            </div>
                          )}
                        </div>
                        
                        <Separator />

                        <div className="flex flex-col sm:flex-row gap-3">
                          {order.status === 'DTO Requested' && (
                            <Button
                              variant="destructive"
                              onClick={handleCancelRequest}
                              disabled={cancellingRequest}
                              className="text-xs sm:text-sm flex-1"
                            >
                              {cancellingRequest && <Loader2 className="mr-2 h-3 w-3 sm:h-4 sm:w-4 animate-spin" />}
                              Cancel Request
                            </Button>
                          )}
                          {alreadyInProcess.includes(order.status) &&
                          <Button
                            onClick={handleTrackOrder}
                            className="text-xs sm:text-sm flex-1"
                          >
                            Track my Return
                          </Button>}
                        </div>

                        <Separator />

                        <div className="grid md:grid-cols-2 gap-6">
                            <div>
                                <h3 className="font-semibold mb-2 text-sm sm:text-base">Order Status</h3>
                                <p className="text-xs sm:text-sm">{getMappedStatus(order.status)}</p>
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
                     </>
                    )}
                </CardContent>
                {!returnResponse && (
                    <>
                        {!(notEligible.includes(order.status) ||
                          alreadyInProcess.includes(order.status)) &&
                          <CardFooter className="hidden sm:flex justify-end">
                              <Button
                                  onClick={handleRequestReturn}
                                  disabled={selectedVariantIds.size === 0 || requestingReturn}
                                  className="text-sm"
                              >
                                  {requestingReturn && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                  Request a Return
                              </Button>
                          </CardFooter>
                        }
                        
                        {!(notEligible.includes(order.status) ||
                          alreadyInProcess.includes(order.status)) &&
                          <div className="fixed bottom-0 left-0 right-0 p-4 sm:hidden">
                              <Button
                                  onClick={handleRequestReturn}
                                  disabled={selectedVariantIds.size === 0 || requestingReturn}
                                  className="w-full text-sm"
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