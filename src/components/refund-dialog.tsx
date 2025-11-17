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
import { Input } from '@/components/ui/input';
import { Order } from '@/types/order';
import { Loader2, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useProcessRefund } from '@/hooks/use-order-mutations';
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
  const [manualRefundAmount, setManualRefundAmount] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  // Use the mutation hook
  const processRefund = useProcessRefund(businessId, user);

  // Get line items from order
  const lineItems = order.raw.line_items || [];
  const returnItemIds = new Set(order.returnItemsVariantIds || []);

  // Calculate suggested refund amount based on selected items
  const calculatedAmount = useMemo(() => {
    return lineItems
      .filter((item: any) => selectedItems.has(item.variant_id || item.id))
      .reduce((sum: number, item: any) => {
        return sum + (parseFloat(item.price) * item.quantity);
      }, 0);
  }, [selectedItems, lineItems]);

  // Update manual amount when calculated amount changes
  React.useEffect(() => {
    if (calculatedAmount > 0) {
      setManualRefundAmount(calculatedAmount.toFixed(2));
    } else {
      setManualRefundAmount('');
    }
  }, [calculatedAmount]);

  // Parse manual refund amount
  const refundAmount = parseFloat(manualRefundAmount) || 0;

  // Validate refund amount
  const isValidAmount = refundAmount > 0 && refundAmount <= order.totalPrice;

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
  const handleRefund = () => {
    if (selectedItems.size === 0) {
      setError('Please select at least one item to refund');
      return;
    }

    if (!isValidAmount) {
      setError('Please enter a valid refund amount');
      return;
    }

    if (refundAmount > order.totalPrice) {
      setError(`Refund amount cannot exceed order total (${new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: order.currency,
      }).format(order.totalPrice)})`);
      return;
    }

    setError(null);

    processRefund.mutate(
      {
        orderId: order.id,
        storeId: order.storeId,
        selectedItemIds: Array.from(selectedItems),
        refundAmount,
        refundMethod,
        currency: order.currency,
        customerId: order.raw.customer?.id,
      },
      {
        onSuccess: () => {
          onRefundSuccess();
          onClose();
          // Reset state
          setSelectedItems(new Set());
          setRefundMethod('store_credit');
          setManualRefundAmount('');
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
      setManualRefundAmount('');
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
            Select items to refund and enter the refund amount. Items marked with a badge are return items.
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

            <div className="border rounded-lg divide-y max-h-64 overflow-y-auto">
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

          {/* Refund Amount */}
          <div className="space-y-4">
            <h4 className="font-semibold">Refund Amount</h4>
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Order Total:</span>
                <span className="font-mono">
                  {new Intl.NumberFormat('en-US', {
                    style: 'currency',
                    currency: order.currency,
                  }).format(order.totalPrice)}
                </span>
              </div>
              {calculatedAmount > 0 && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Suggested Amount (based on selection):</span>
                  <span className="font-mono font-semibold">
                    {new Intl.NumberFormat('en-US', {
                      style: 'currency',
                      currency: order.currency,
                    }).format(calculatedAmount)}
                  </span>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="refund-amount">Enter Refund Amount *</Label>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-semibold">{order.currency}</span>
                  <Input
                    id="refund-amount"
                    type="number"
                    min="0"
                    max={order.totalPrice}
                    step="0.01"
                    placeholder="0.00"
                    value={manualRefundAmount}
                    onChange={(e) => setManualRefundAmount(e.target.value)}
                    className="flex-1 text-lg font-mono"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  You can adjust the amount as needed (max: {new Intl.NumberFormat('en-US', {
                    style: 'currency',
                    currency: order.currency,
                  }).format(order.totalPrice)})
                </p>
              </div>
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

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={processRefund.isPending}>
            Cancel
          </Button>
          <Button
            onClick={handleRefund}
            disabled={processRefund.isPending || selectedItems.size === 0 || !isValidAmount}
          >
            {processRefund.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              `Process Refund${refundAmount > 0 ? ` (${new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: order.currency,
              }).format(refundAmount)})` : ''}`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}