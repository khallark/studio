// components/perform-pickup-dialog.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { collection, query, where, orderBy, limit, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
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
import { Badge } from '@/components/ui/badge';
import { Loader2, PackageCheck, AlertCircle } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Order } from '@/types/order';
import { useToast } from '@/hooks/use-toast';

interface SubItem {
  id: string; // unique ID for this sub-item
  itemName: string;
  itemSku: string;
  productId: string;
  variantId: string;
  assignedUpc: {
    id: string;
    rackId: string;
    shelfId: string;
  } | null;
  isChecked: boolean;
}

interface PerformPickupDialogProps {
  isOpen: boolean;
  onClose: () => void;
  order: Order;
  businessId: string;
  user: User;
  onSuccess: () => void;
}

export function PerformPickupDialog({
  isOpen,
  onClose,
  order,
  businessId,
  user,
  onSuccess,
}: PerformPickupDialogProps) {
  const { toast } = useToast();
  const [subItems, setSubItems] = useState<SubItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch UPCs and build sub-items list
  useEffect(() => {
    if (!isOpen) return;

    const fetchUPCs = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const items: SubItem[] = [];
        let hasInsufficientStock = false;

        for (const item of order.raw.line_items) {
          // Get store product mapping
          const storeProductRef = doc(
            db,
            'accounts',
            order.storeId,
            'products',
            String(item.product_id)
          );
          const storeProductDoc = await getDoc(storeProductRef);

          if (!storeProductDoc.exists()) {
            setError(`Product ${item.name} not found in store mappings`);
            hasInsufficientStock = true;
            break;
          }

          const storeProductData = storeProductDoc.data();
          const businessProductId = storeProductData?.variantMappings?.[item.variant_id];

          if (!businessProductId) {
            setError(`Product variant ${item.name} not mapped to business inventory`);
            hasInsufficientStock = true;
            break;
          }

          // Query UPCs for this product (FIFO - earliest created first)
          const upcsQuery = query(
            collection(db, 'users', businessId, 'upcs'),
            where('productId', '==', String(businessProductId)),
            where('putAway', '==', 'none'),
            where('orderId', '==', null),
            orderBy('createdAt', 'asc'),
            limit(item.quantity)
          );

          const upcsSnapshot = await getDocs(upcsQuery);

          // Check if we have enough UPCs
          if (upcsSnapshot.docs.length < item.quantity) {
            setError(
              `Insufficient stock for ${item.name}. Need ${item.quantity}, found ${upcsSnapshot.docs.length} in warehouse.`
            );
            hasInsufficientStock = true;
            break;
          }

          // Create sub-items for each quantity
          upcsSnapshot.docs.forEach((upcDoc, index) => {
            items.push({
              id: `${item.id}-${index}`,
              itemName: item.name,
              itemSku: item.sku || 'N/A',
              productId: String(businessProductId),
              variantId: String(item.variant_id),
              assignedUpc: {
                id: upcDoc.id,
                rackId: upcDoc.data().rackId,
                shelfId: upcDoc.data().shelfId,
              },
              isChecked: false,
            });
          });
        }

        if (!hasInsufficientStock) {
          setSubItems(items);
        }
      } catch (err: any) {
        console.error('Error fetching UPCs:', err);
        setError(err.message || 'Failed to fetch warehouse inventory');
      } finally {
        setIsLoading(false);
      }
    };

    fetchUPCs();
  }, [isOpen, order, businessId]);

  const handleToggleSubItem = (subItemId: string) => {
    setSubItems((prev) =>
      prev.map((item) =>
        item.id === subItemId ? { ...item, isChecked: !item.isChecked } : item
      )
    );
  };

  const handleConfirmPickup = async () => {
    setIsProcessing(true);

    try {
      const assignedUpcIds = subItems.map((item) => item.assignedUpc!.id);

      const idToken = await user.getIdToken();
      const response = await fetch('/api/shopify/orders/make-pickup-ready', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          businessId,
          shop: order.storeId,
          orderId: order.id,
          assignedUpcIds,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || errorData.details || 'Failed to confirm pickup');
      }

      toast({
        title: 'Pickup Confirmed',
        description: 'All items have been picked up and prepared for dispatch.',
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Error confirming pickup:', err);
      toast({
        title: 'Pickup Failed',
        description: err.message || 'Failed to confirm pickup',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const allChecked = subItems.length > 0 && subItems.every((item) => item.isChecked);
  const checkedCount = subItems.filter((item) => item.isChecked).length;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackageCheck className="h-5 w-5" />
            Perform Pickup - {order.name}
          </DialogTitle>
          <DialogDescription>
            Pick up each item from the warehouse and check them off the list
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-2 text-sm text-muted-foreground">Loading inventory...</span>
          </div>
        ) : error ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : (
          <>
            <div className="flex-1 overflow-hidden">
              <div className="mb-4 p-3 bg-muted/50 rounded-lg">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">Progress:</span>
                  <span className="text-muted-foreground">
                    {checkedCount} / {subItems.length} items picked
                  </span>
                </div>
                <div className="mt-2 h-2 bg-background rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-300"
                    style={{ width: `${subItems.length > 0 ? (checkedCount / subItems.length) * 100 : 0}%` }}
                  />
                </div>
              </div>

              <ScrollArea className="h-[400px] pr-4">
                <div className="space-y-2">
                  {subItems.map((subItem, index) => (
                    <div key={subItem.id}>
                      <div
                        className={`flex items-start gap-3 p-3 rounded-lg border transition-all ${
                          subItem.isChecked
                            ? 'bg-primary/5 border-primary'
                            : 'bg-card hover:bg-muted/50'
                        }`}
                      >
                        <Checkbox
                          id={subItem.id}
                          checked={subItem.isChecked}
                          onCheckedChange={() => handleToggleSubItem(subItem.id)}
                          className="mt-1"
                        />

                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <label
                                  htmlFor={subItem.id}
                                  className="font-medium text-sm cursor-pointer"
                                >
                                  {subItem.itemName}
                                </label>
                                {subItem.isChecked && (
                                  <Badge variant="default" className="text-xs">
                                    Picked up
                                  </Badge>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground mt-1">
                                SKU: {subItem.itemSku}
                              </p>
                            </div>
                          </div>

                          {subItem.assignedUpc && (
                            <div className="mt-2 p-2 bg-muted/50 rounded text-xs">
                              <span className="text-muted-foreground">Assigned UPC: </span>
                              <span className="font-mono font-medium">
                                {subItem.assignedUpc.rackId} - {subItem.assignedUpc.shelfId}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                      {index < subItems.length - 1 && <Separator className="my-2" />}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={onClose} disabled={isProcessing}>
                Cancel
              </Button>
              <Button
                onClick={handleConfirmPickup}
                disabled={!allChecked || isProcessing}
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Processing...
                  </>
                ) : (
                  'Confirm Pickup'
                )}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}