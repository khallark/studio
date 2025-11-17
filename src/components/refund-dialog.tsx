'use client';

import React, { useState, useMemo } from 'react';
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
import { Order } from '@/types/order';
import { Loader2, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { User } from 'firebase/auth';

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
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get line items from order
  const lineItems = order.raw.line_items || [];
  const returnItemIds = new Set(order.returnItemsVariantIds || []);

  // Calculate refund amount based on selected items
  const refundAmount = useMemo(() => {
    return lineItems
      .filter((item: any) => selectedItems.has(item.variant_id || item.id))
      .reduce((sum: number, item: any) => {
        return sum + (parseFloat(item.price) * item.quantity);
      }, 0);
  }, [selectedItems, lineItems]);

  // Handle item selection toggle
  const handleItemToggle = (itemId: string | number) => {
    setSelectedItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
      }
      return newSet;
    });
  };

  // Handle select all return items
  const handleSelectAllReturnItems = () => {
    const allReturnItemIds = lineItems
      .filter((item: any) => returnItemIds.has(item.variant_id || item.id))
      .map((item: any) => item.variant_id || item.id);
    
    setSelectedItems(new Set(allReturnItemIds));
  };

  // Handle refund submission
  const handleRefund = async () => {
    if (selectedItems.size === 0) {
      setError('Please select at least one item to refund');
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      const response = await fetch('/api/shopify/orders/refund', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          businessId,
          shop: order.storeId,
          orderId: order.id,
          selectedItemIds: Array.from(selectedItems),
          refundAmount,
          refundMethod,
          currency: order.currency,
          customerId: order.raw.customer?.id,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || result.details || 'Failed to process refund');
      }

      // Success!
      onRefundSuccess();
      onClose();
      
      // Reset state
      setSelectedItems(new Set());
      setRefundMethod('store_credit');
      
    } catch (err: any) {
      console.error('Refund error:', err);
      setError(err.message || 'An unexpected error occurred');
    } finally {
      setIsProcessing(false);
    }
  };

  // Reset state when dialog closes
  const handleClose = () => {
    if (!isProcessing) {
      setSelectedItems(new Set());
      setRefundMethod('store_credit');
      setError(null);
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Process Refund - {order.name}</DialogTitle>
          <DialogDescription>
            Select items to refund and choose a refund method. Items marked with a badge are return items.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
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

            <div className="border rounded-lg divide-y">
              {lineItems.map((item: any, index: number) => {
                const itemId = item.variant_id || item.id;
                const isReturnItem = returnItemIds.has(itemId);
                const isSelected = selectedItems.has(itemId);
                const itemTotal = parseFloat(item.price) * item.quantity;

                return (
                  <div
                    key={index}
                    className={`p-4 flex items-start gap-4 hover:bg-muted/50 transition-colors ${
                      isSelected ? 'bg-muted/30' : ''
                    }`}
                  >
                    <Checkbox
                      id={`item-${itemId}`}
                      checked={isSelected}
                      onCheckedChange={() => handleItemToggle(itemId)}
                    />
                    <div className="flex-1 space-y-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
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
                        <span>
                          Price: {new Intl.NumberFormat('en-US', {
                            style: 'currency',
                            currency: order.currency,
                          }).format(parseFloat(item.price))}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
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

          <Separator />

          {/* Refund Summary */}
          <div className="bg-muted/50 rounded-lg p-4 space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Selected Items:</span>
              <span className="font-semibold">{selectedItems.size}</span>
            </div>
            <div className="flex justify-between items-center text-lg">
              <span className="font-semibold">Refund Amount:</span>
              <span className="font-bold font-mono">
                {new Intl.NumberFormat('en-US', {
                  style: 'currency',
                  currency: order.currency,
                }).format(refundAmount)}
              </span>
            </div>
          </div>

          {/* Error Alert */}
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isProcessing}>
            Cancel
          </Button>
          <Button
            onClick={handleRefund}
            disabled={isProcessing || selectedItems.size === 0}
          >
            {isProcessing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              `Process Refund (${new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: order.currency,
              }).format(refundAmount)})`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}