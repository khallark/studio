
'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

interface Order {
  id: string;
  name: string;
  tags_confirmed?: string[];
  raw: {
    line_items: Array<{
      id: string | number;
      title: string;
      quantity: number;
      sku: string;
    }>;
  };
}

interface AvailabilityDialogProps {
  isOpen: boolean;
  onClose: () => void;
  user: any;
  shopId: string;
  confirmedOrders: Order[];
}

export function AvailabilityDialog({
  isOpen,
  onClose,
  user,
  shopId,
  confirmedOrders,
}: AvailabilityDialogProps) {
  const { toast } = useToast();
  const [orders, setOrders] = useState<Order[]>([]);
  const [itemSelection, setItemSelection] = useState<Record<string, Set<string | number>>>({});
  const [processingOrder, setProcessingOrder] = useState<string | null>(null);
  const [processingAction, setProcessingAction] = useState<'Available' | 'Unavailable' | null>(null); // Add this

  useEffect(() => {
    if (isOpen) {
      setOrders(confirmedOrders);
      setItemSelection({});
    }
  }, [isOpen]);

  const handleItemCheck = (orderId: string, lineItemId: string | number) => {
    setItemSelection((prev) => {
      const newSelection = { ...prev };
      if (!newSelection[orderId]) {
        newSelection[orderId] = new Set();
      }
      const orderItems = new Set(newSelection[orderId]);
      if (orderItems.has(lineItemId)) {
        orderItems.delete(lineItemId);
      } else {
        orderItems.add(lineItemId);
      }
      newSelection[orderId] = orderItems;
      return newSelection;
    });
  };

  const handleAction = async (order: Order, action: 'Available' | 'Unavailable' | 'Ignore') => {
    if (action === 'Ignore') {
      setOrders((prev) => prev.filter((o) => o.id !== order.id));
      return;
    }

    setProcessingOrder(order.id);
    setProcessingAction(action);
    const tagAction = action === 'Available' ? 'add' : 'remove';

    try {
      const idToken = await user.getIdToken();
      const response = await fetch('/api/shopify/orders/update-tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({
          shop: shopId,
          orderId: order.id,
          tag: 'Available',
          action: tagAction,
        }),
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.details || 'Failed to update order');
      
      // Animate out after success
      setTimeout(() => {
        setOrders((prev) => prev.filter((o) => o.id !== order.id));
        setProcessingOrder(null);
      }, 300);

    } catch (error) {
      toast({
        title: 'Update Failed',
        description: error instanceof Error ? error.message : 'An unknown error occurred.',
        variant: 'destructive',
      });
      setProcessingOrder(null);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Perform Items Availability</DialogTitle>
          <DialogDescription>
            Review each confirmed order and mark its item availability status.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="flex-1 -mx-6 px-6">
          <div className="space-y-4 py-4">
            <AnimatePresence>
              {orders.map((order) => {
                const allItemsSelected =
                  order.raw.line_items.length > 0 &&
                  (itemSelection[order.id]?.size ?? 0) === order.raw.line_items.length;
                const isCurrentlyAvailable = order.tags_confirmed?.includes('Available');

                return (
                  <motion.div
                    key={order.id}
                    layout
                    initial={{ opacity: 1, x: 0 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{
                        opacity: 0,
                        x: processingOrder === order.id
                            ? (processingAction === 'Available' ? 300 : -300)  // Use the action taken
                            : 0,
                        scale: processingOrder !== order.id ? 0.8 : 1,
                        transition: { duration: 0.3 }
                    }}
                    className="border rounded-lg overflow-hidden"
                  >
                    <div className="p-4 bg-card flex justify-between items-center">
                      <h3 className="font-semibold">{order.name}</h3>
                      {isCurrentlyAvailable ? (
                        <Badge variant="success">Available</Badge>
                      ) : (
                        <Badge variant="secondary">Unavailable</Badge>
                      )}
                    </div>
                    <div className="p-4 space-y-3">
                      <div className="space-y-2">
                        {order.raw.line_items.map((item) => (
                          <div key={item.id} className="flex items-center space-x-2">
                            <Checkbox
                              id={`item-${order.id}-${item.id}`}
                              checked={itemSelection[order.id]?.has(item.id)}
                              onCheckedChange={() => handleItemCheck(order.id, item.id)}
                            />
                            <Label
                              htmlFor={`item-${order.id}-${item.id}`}
                              className="text-sm font-normal"
                            >
                              {item.sku} (Qty: {item.quantity})
                            </Label>
                          </div>
                        ))}
                      </div>
                      <Select
                        disabled={!allItemsSelected || processingOrder === order.id}
                        onValueChange={(value: 'Available' | 'Unavailable' | 'Ignore') =>
                          handleAction(order, value)
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select action..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Available">Available</SelectItem>
                          <SelectItem value="Unavailable">Unavailable</SelectItem>
                          <SelectItem value="Ignore">Ignore</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
            {orders.length === 0 && (
                <div className="text-center py-20 text-muted-foreground">
                    <p>You&apos;ve processed all confirmed orders!</p>
                </div>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

