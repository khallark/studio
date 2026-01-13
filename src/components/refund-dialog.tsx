'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Order } from '@/types/order';
import { Loader2, AlertCircle, Images, Video } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useProcessRefund } from '@/hooks/use-order-mutations';
import { User } from 'firebase/auth';
import { storage } from '@/lib/firebase';
import { ref, getDownloadURL } from 'firebase/storage';
import Image from 'next/image';
import { ScrollArea } from '@/components/ui/scroll-area';
import { SHARED_STORE_IDS } from '@/lib/shared-constants';

interface RefundDialogProps {
  isOpen: boolean;
  onClose: () => void;
  order: Order;
  businessId: string;
  user: User | null | undefined;
  onRefundSuccess: () => void;
}

type RefundMethod = 'store_credit' | 'manual';

export function RefundDialog({
  isOpen,
  onClose,
  order,
  businessId,
  user,
  onRefundSuccess,
}: RefundDialogProps) {
  const [selectedItems, setSelectedItems] = useState<Set<string | number>>(new Set());
  const [refundMethod, setRefundMethod] = useState<RefundMethod>('store_credit');
  // Track refund amount for each item: { [itemId]: amount }
  const [itemRefundAmounts, setItemRefundAmounts] = useState<Record<string | number, string>>({});
  const [error, setError] = useState<string | null>(null);

  // Media states
  const [customerImageUrls, setCustomerImageUrls] = useState<string[]>([]);
  const [qcVideoUrl, setQcVideoUrl] = useState<string | null>(null);
  const [loadingMedia, setLoadingMedia] = useState(false);

  // Use the mutation hook
  const processRefund = useProcessRefund(businessId, user);

  // Get line items from order
  const lineItems = order.raw.line_items || [];
  const returnItemIds = new Set(order.returnItemsVariantIds || []);

  // Fetch customer images and QC video
  const fetchMedia = useCallback(async () => {
    if (!order.booked_return_images && !order.unboxing_video_path) return;

    setLoadingMedia(true);

    try {
      // Fetch customer images
      if (order.booked_return_images && order.booked_return_images.length > 0) {
        const imageUrls = await Promise.all(
          order.booked_return_images.map(async (imageName) => {
            try {
              // Try appropriate path based on store
              let imageRef;
              if (SHARED_STORE_IDS.includes(order.storeId)) {
                imageRef = ref(storage, `return-images/shared/${order.storeId}/${order.id}/${imageName}`);
              } else {
                imageRef = ref(storage, `return-images/${businessId}/${order.storeId}/${order.id}/${imageName}`);
              }

              try {
                return await getDownloadURL(imageRef);
              } catch (err: any) {
                // Fallback to legacy path
                if (err.code === 'storage/object-not-found') {
                  const legacyRef = ref(storage, `return-images/${order.storeId}/${order.id}/${imageName}`);
                  return await getDownloadURL(legacyRef);
                }
                throw err;
              }
            } catch (error) {
              console.error(`Failed to get download URL for ${imageName}`, error);
              return null;
            }
          })
        );
        setCustomerImageUrls(imageUrls.filter((url): url is string => url !== null));
      }

      // Fetch QC video
      if (order.unboxing_video_path) {
        try {
          const videoRef = ref(storage, order.unboxing_video_path);
          const videoUrl = await getDownloadURL(videoRef);
          setQcVideoUrl(videoUrl);
        } catch (error) {
          console.error('Failed to get QC video URL', error);
          setQcVideoUrl(null);
        }
      }
    } catch (error) {
      console.error('Error fetching media:', error);
    } finally {
      setLoadingMedia(false);
    }
  }, [order, businessId]);

  // Fetch media when dialog opens
  useEffect(() => {
    if (isOpen) {
      fetchMedia();
    } else {
      // Reset media when dialog closes
      setCustomerImageUrls([]);
      setQcVideoUrl(null);
    }
  }, [isOpen, fetchMedia]);

  // Helper function to calculate item total (price * qty - discounts)
  const getItemTotal = useCallback((item: any) => {
    return parseFloat(item.price) * item.quantity -
      item.discount_allocations.reduce((a: any, i: any) => a + Number(i.amount), 0);
  }, []);

  // Calculate total refund amount from all item amounts
  const totalRefundAmount = useMemo(() => {
    return Object.values(itemRefundAmounts).reduce((sum, amount) => {
      const parsed = parseFloat(amount) || 0;
      return sum + parsed;
    }, 0);
  }, [itemRefundAmounts]);

  // Handle item selection toggle
  const handleItemToggle = (itemId: string | number, item: any) => {
    setSelectedItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) {
        // Deselecting - set refund amount to empty (will be treated as 0)
        newSet.delete(itemId);
        setItemRefundAmounts(prev => {
          const updated = { ...prev };
          delete updated[itemId];
          return updated;
        });
      } else {
        // Selecting - auto-fill with suggested amount
        newSet.add(itemId);
        const suggestedAmount = getItemTotal(item);
        setItemRefundAmounts(prev => ({
          ...prev,
          [itemId]: suggestedAmount.toFixed(2),
        }));
      }
      return newSet;
    });
  };

  // Handle individual item refund amount change
  const handleItemAmountChange = (itemId: string | number, value: string) => {
    setItemRefundAmounts(prev => ({
      ...prev,
      [itemId]: value,
    }));
  };

  // Handle select all return items
  const handleSelectAllReturnItems = () => {
    const returnItems = lineItems.filter((item: any) =>
      returnItemIds.has(item.variant_id || item.id)
    );

    const newSelectedItems = new Set<string | number>();
    const newAmounts: Record<string | number, string> = {};

    returnItems.forEach((item: any) => {
      const itemId = item.variant_id || item.id;
      newSelectedItems.add(itemId);
      newAmounts[itemId] = getItemTotal(item).toFixed(2);
    });

    setSelectedItems(newSelectedItems);
    setItemRefundAmounts(newAmounts);
  };

  // Validate refund amount
  const isValidAmount = totalRefundAmount >= 0 && totalRefundAmount <= Number(order.raw.total_price);

  // Build itemRefundAmounts map for API (include all line items, 0 for unselected)
  const buildItemRefundAmountsForApi = () => {
    const result: Record<string | number, number> = {};
    lineItems.forEach((item: any) => {
      const itemId = item.variant_id || item.id;
      const amount = parseFloat(itemRefundAmounts[itemId] || '0') || 0;
      result[itemId] = amount;
    });
    return result;
  };

  // Handle refund submission
  const handleRefund = () => {
    if (selectedItems.size === 0) {
      setError('Please select at least one item to refund');
      return;
    }

    if (!isValidAmount) {
      setError('Please enter valid refund amounts');
      return;
    }

    if (totalRefundAmount <= 0) {
      setError('Total refund amount must be greater than 0');
      return;
    }

    if (totalRefundAmount > Number(order.raw.total_price)) {
      setError(`Total refund amount cannot exceed order total (${new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: order.currency,
      }).format(Number(order.raw.total_price))})`);
      return;
    }

    setError(null);

    processRefund.mutate(
      {
        orderId: order.id,
        storeId: order.storeId,
        selectedItemIds: Array.from(selectedItems),
        refundAmount: totalRefundAmount,
        itemRefundAmounts: buildItemRefundAmountsForApi(),
        refundMethod,
        currency: order.currency,
        customerId: Number(order.raw.customer?.id),
      },
      {
        onSuccess: () => {
          onRefundSuccess();
          onClose();
          // Reset state
          setSelectedItems(new Set());
          setRefundMethod('store_credit');
          setItemRefundAmounts({});
        },
        onError: (err: any) => {
          setError(err.message || 'An unexpected error occurred');
        },
      }
    );
  };

  // Reset state when dialog closes
  const handleClose = () => {
    if (!processRefund.isPending) {
      setSelectedItems(new Set());
      setRefundMethod('store_credit');
      setItemRefundAmounts({});
      setError(null);
      onClose();
    }
  };

  const hasMedia = (order.booked_return_images && order.booked_return_images.length > 0) || order.unboxing_video_path;

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Process Refund - {order.name}</DialogTitle>
          <DialogDescription>
            Select items to refund and enter the refund amount for each item.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 overflow-y-auto pr-4 -mr-4">
          <div className="space-y-6 py-4">
            {/* Customer Images and QC Video Section */}
            {hasMedia && (
              <>
                <div className="space-y-4">
                  <h4 className="font-semibold flex items-center gap-2">
                    <Images className="h-4 w-4" />
                    Return Evidence
                  </h4>

                  {loadingMedia ? (
                    <div className="flex items-center justify-center p-8">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                      <span className="ml-2 text-sm text-muted-foreground">Loading media...</span>
                    </div>
                  ) : (
                    <div className="grid md:grid-cols-2 gap-4">
                      {/* Customer Images */}
                      {customerImageUrls.length > 0 && (
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">Customer Images</Label>
                          <div className="grid grid-cols-2 gap-2 border rounded-lg p-3">
                            {customerImageUrls.map((url, index) => (
                              <div key={index} className="relative aspect-square">
                                <Image
                                  src={url}
                                  alt={`Customer image ${index + 1}`}
                                  fill
                                  style={{ objectFit: 'cover' }}
                                  className="rounded-md"
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* QC Video */}
                      {qcVideoUrl && (
                        <div className="space-y-2">
                          <Label className="text-sm font-medium flex items-center gap-2">
                            <Video className="h-4 w-4" />
                            QC Unboxing Video
                          </Label>
                          <div className="border rounded-lg p-3">
                            <video
                              src={qcVideoUrl}
                              controls
                              className="w-full rounded-md"
                              preload="metadata"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {!loadingMedia && customerImageUrls.length === 0 && !qcVideoUrl && (
                    <p className="text-sm text-muted-foreground">No media available for this return.</p>
                  )}
                </div>
                <Separator />
              </>
            )}

            {/* Line Items Selection */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold">Items</h4>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSelectAllReturnItems}
                  disabled={returnItemIds.size === 0}
                >
                  Select All Return Items
                </Button>
              </div>

              <div className="border rounded-lg divide-y max-h-96 overflow-y-auto">
                {lineItems.map((item: any, index: number) => {
                  const itemId = item.variant_id || item.id;
                  const isReturnItem = returnItemIds.has(itemId);
                  const isSelected = selectedItems.has(itemId);
                  const itemTotal = getItemTotal(item);
                  const currentAmount = itemRefundAmounts[itemId] || '';

                  return (
                    <div
                      key={index}
                      className={`p-4 space-y-3 hover:bg-muted/50 transition-colors ${isSelected ? 'bg-muted/30' : ''}`}
                    >
                      <div className="flex items-start gap-4">
                        <Checkbox
                          id={`item-${itemId}`}
                          checked={isSelected}
                          onCheckedChange={() => handleItemToggle(itemId, item)}
                        />
                        <div className="flex-1 space-y-1">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 gap-2">
                              <Label
                                htmlFor={`item-${itemId}`}
                                className="font-medium cursor-pointer"
                              >
                                {item.name}
                              </Label>
                              {isReturnItem && (
                                <Badge variant="secondary" className="ml-2">
                                  Return Item
                                </Badge>
                              )}
                              {item.qc_status && (
                                <Badge variant='success' className="ml-2">
                                  {item.qc_status}
                                </Badge>
                              )}
                            </div>
                            <div className="text-right">
                              <p className="font-mono text-sm">
                                {new Intl.NumberFormat('en-US', {
                                  style: 'currency',
                                  currency: order.currency,
                                }).format(itemTotal)}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            {item.sku && <span>SKU: {item.sku}</span>}
                            <span>Qty: {item.quantity}</span>
                            <span className='font-mono'>
                              Price: {new Intl.NumberFormat('en-US', {
                                style: 'currency',
                                currency: order.currency,
                              }).format(parseFloat(item.price))}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Per-item refund amount input */}
                      {isSelected && (
                        <div className="ml-8 flex items-center gap-3">
                          <Label htmlFor={`amount-${itemId}`} className="text-sm text-muted-foreground whitespace-nowrap">
                            Refund Amount:
                          </Label>
                          <div className="flex items-center gap-2 flex-1 max-w-xs">
                            <span className="text-sm font-medium">{order.currency}</span>
                            <Input
                              id={`amount-${itemId}`}
                              type="number"
                              min="0"
                              max={itemTotal}
                              step="0.01"
                              placeholder="0.00"
                              value={currentAmount}
                              onChange={(e) => handleItemAmountChange(itemId, e.target.value)}
                              className="font-mono"
                            />
                          </div>
                          <span className="text-xs text-muted-foreground">
                            (max: {new Intl.NumberFormat('en-US', {
                              style: 'currency',
                              currency: order.currency,
                            }).format(itemTotal)})
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <Separator />

            {/* Refund Amount Summary */}
            <div className="space-y-4">
              <h4 className="font-semibold">Refund Summary</h4>
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Order Total:</span>
                  <span className="font-mono">
                    {new Intl.NumberFormat('en-US', {
                      style: 'currency',
                      currency: order.currency,
                    }).format(Number(order.raw?.total_price))}
                  </span>
                </div>

                {/* Show breakdown of selected items */}
                {selectedItems.size > 0 && (
                  <div className="border rounded-lg p-3 space-y-2 bg-muted/20">
                    <p className="text-sm font-medium">Selected Items Breakdown:</p>
                    {lineItems
                      .filter((item: any) => selectedItems.has(item.variant_id || item.id))
                      .map((item: any, index: number) => {
                        const itemId = item.variant_id || item.id;
                        const amount = parseFloat(itemRefundAmounts[itemId] || '0') || 0;
                        return (
                          <div key={index} className="flex justify-between text-sm">
                            <span className="text-muted-foreground truncate max-w-[60%]">
                              {item.name}
                            </span>
                            <span className="font-mono">
                              {new Intl.NumberFormat('en-US', {
                                style: 'currency',
                                currency: order.currency,
                              }).format(amount)}
                            </span>
                          </div>
                        );
                      })}
                    <Separator className="my-2" />
                    <div className="flex justify-between font-semibold">
                      <span>Total Refund Amount:</span>
                      <span className="font-mono text-lg">
                        {new Intl.NumberFormat('en-US', {
                          style: 'currency',
                          currency: order.currency,
                        }).format(totalRefundAmount)}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <Separator />

            {/* Refund Method Selection */}
            <div className="space-y-4">
              <h4 className="font-semibold">Refund Method</h4>
              <RadioGroup
                value={refundMethod}
                onValueChange={(value) => setRefundMethod(value as RefundMethod)}
              >
                <div className="flex items-start space-x-3 space-y-0 rounded-md border p-4">
                  <RadioGroupItem value="store_credit" id="store_credit" />
                  <div className="flex-1">
                    <Label htmlFor="store_credit" className="font-medium cursor-pointer">
                      Add to Customer's Store Credits
                    </Label>
                    <p className="text-sm text-muted-foreground mt-1">
                      Refund will be added to customer's store credit balance via Shopify
                    </p>
                  </div>
                </div>

                <div className="flex items-start space-x-3 space-y-0 rounded-md border p-4">
                  <RadioGroupItem value="manual" id="manual" />
                  <div className="flex-1">
                    <Label htmlFor="manual" className="font-medium cursor-pointer">
                      Manually Paid
                    </Label>
                    <p className="text-sm text-muted-foreground mt-1">
                      Mark as refunded without processing through Shopify
                    </p>
                  </div>
                </div>
              </RadioGroup>
            </div>

            {/* Error Alert */}
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="mt-4 pt-4 border-t">
          <Button variant="outline" onClick={handleClose} disabled={processRefund.isPending}>
            Cancel
          </Button>
          <Button
            onClick={handleRefund}
            disabled={processRefund.isPending || selectedItems.size === 0 || !isValidAmount || totalRefundAmount <= 0}
            className='font-mono'
          >
            {processRefund.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              `Process Refund${totalRefundAmount > 0 ? ` (${new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: order.currency,
              }).format(totalRefundAmount)})` : ''}`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}