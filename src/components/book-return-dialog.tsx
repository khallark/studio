'use client';

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Info } from 'lucide-react';
import { ScrollArea } from './ui/scroll-area';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface Order {
  id: string;
  name: string;
  returnItemsVariantIds?: (string | number)[];
  raw: {
    line_items: Array<{
      id: string | number;
      title: string;
      quantity: number;
      sku: string | null;
      variant_id?: string | number;
    }>;
  };
}

interface BookReturnDialogProps {
  isOpen: boolean;
  onClose: () => void;
  order: Order;
  shopId: string;
  user: any; // Firebase user object
  businessId: string;
}

export function BookReturnDialog({ isOpen, onClose, order, shopId, user, businessId }: BookReturnDialogProps) {
  const [selectedVariantIds, setSelectedVariantIds] = useState<Set<string>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const isCustomerReturn = order.returnItemsVariantIds && order.returnItemsVariantIds.length > 0;

  useEffect(() => {
  if (isOpen) {
    setSelectedVariantIds(new Set());
    setIsSubmitting(false);
    
    // If customer has selected items for return, pre-select them
    if (isCustomerReturn) {
      const preSelectedVariantIds = new Set<string>();
      // FIX: Convert returnItemsVariantIds to strings for comparison
      const customerSelectedIds = order.returnItemsVariantIds?.map(String) || [];
      
      order.raw.line_items.forEach(item => {
        const variantId = String(item.variant_id);
        if (customerSelectedIds.includes(variantId) && item.variant_id) {
          preSelectedVariantIds.add(variantId);
        }
      });
      setSelectedVariantIds(preSelectedVariantIds);
    }
  }
}, [isOpen, order, isCustomerReturn]);

  const handleToggleVariant = (variantId: string) => {
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

  const handleConfirm = async () => {
    if (selectedVariantIds.size === 0) {
      toast({ 
        title: "Selection Required", 
        description: "Please select at least one item to return.", 
        variant: "destructive" 
      });
      return;
    }

    if(!businessId) {
      toast({ 
        title: "Auth Error", 
        description: "Business not found.", 
        variant: "destructive"
      });
      return;
    }

    if (!user) {
      toast({ 
        title: "Auth Error", 
        description: "User not found.", 
        variant: "destructive"
      });
      return;
    }

    setIsSubmitting(true);
    toast({ 
      title: 'Booking Return', 
      description: 'Please wait while we book the return shipment...' 
    });

    try {
      const idToken = await user.getIdToken();
      const response = await fetch('/api/shopify/courier/book-reverse-order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({
          businessId,
          shop: shopId,
          orderId: order.id,
          variant_ids_of_selected_line_items_to_be_returned: Array.from(selectedVariantIds),
          pickupName: "Majime Production 2",
          shipping_mode: "Surface",
        })
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.reason || 'Failed to book return shipment.');
      }

      toast({
        title: 'Return Booked',
        description: `Return successfully booked for order ${order.name}.`,
      });
      onClose();

    } catch (error) {
      toast({
        title: 'Booking Failed',
        description: error instanceof Error ? error.message : 'An unknown error occurred.',
        variant: 'destructive'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const isItemSelected = (item: typeof order.raw.line_items[0]) => {
    if (isCustomerReturn && order.returnItemsVariantIds) {
      const variantId = String(item.variant_id);
      // FIX: Convert to strings for comparison
      return order.returnItemsVariantIds.map(String).includes(variantId);
    }
    return false;
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Book Return for Order {order.name}</DialogTitle>
          <DialogDescription>
            Select the items to book for return shipment.
          </DialogDescription>
        </DialogHeader>
        
        <div className="py-6 min-h-[300px]">
          {isCustomerReturn && (
            <Alert className="mb-4">
              <Info className="h-4 w-4" />
              <AlertDescription>
                The selected items were requested for return by the customer.
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-4">
            <h3 className="font-semibold">Select items to return</h3>
            <ScrollArea className="h-64 border rounded-md p-4">
              <div className="space-y-3">
                {order.raw.line_items.map(item => {
                  const isPreSelected = isItemSelected(item);
                  const variantId = String(item.variant_id || '');
                  return (
                    <div 
                      key={item.id} 
                      className={`flex items-center space-x-3 ${isPreSelected ? 'bg-blue-50 p-2 rounded' : ''}`}
                    >
                      <Checkbox
                        id={`item-${item.id}`}
                        checked={selectedVariantIds.has(variantId)}
                        onCheckedChange={() => handleToggleVariant(variantId)}
                        disabled={!item.variant_id}
                      />
                      <Label htmlFor={`item-${item.id}`} className="flex-1">
                        <p>{item.title}</p>
                        <p className="text-xs text-muted-foreground">Qty: {item.quantity || '0'}</p>
                      </Label>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </div>
        </div>

        <DialogFooter className="flex justify-between w-full">
          <div>
            <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
          </div>
          <div>
            <Button 
              onClick={handleConfirm} 
              disabled={selectedVariantIds.size === 0 || isSubmitting}
            >
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirm Booking
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}