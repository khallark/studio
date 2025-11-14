'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface Order {
  id: string;
  name: string;
  raw: {
    line_items: any[];
  };
}

interface GeneratePODialogProps {
  isOpen: boolean;
  onClose: () => void;
  selectedOrders: Order[];
  shopId: string;
  businessId: string
  user: any;
}

export function GeneratePODialog({ isOpen, onClose, selectedOrders, shopId, user, businessId }: GeneratePODialogProps) {
  const [selectedVendor, setSelectedVendor] = useState<string>('');
  const [poNumber, setPoNumber] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(false);
  const { toast } = useToast();

  const uniqueVendors = useMemo(() => {
    const vendorSet = new Set<string>();
    selectedOrders.forEach(order => {
      order.raw?.line_items?.forEach((item: any) => {
        if (item.vendor) {
          vendorSet.add(item.vendor);
        }
      });
    });
    return Array.from(vendorSet).sort();
  }, [selectedOrders]);

  useEffect(() => {
    if (isOpen) {
      setSelectedVendor('');
      setPoNumber('');
    }
  }, [isOpen]);

  const handleGenerate = async () => {
    if (!selectedVendor) {
      toast({
        title: 'Vendor Required',
        description: 'Please select a vendor.',
        variant: 'destructive',
      });
      return;
    }

    if (!poNumber.trim()) {
      toast({
        title: 'PO Number Required',
        description: 'Please enter a PO number.',
        variant: 'destructive',
      });
      return;
    }

    setIsGenerating(true);
    try {
      const idToken = await user.getIdToken();
      const response = await fetch('/api/shopify/orders/generate-purchase-order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          businessId,
          shop: shopId,
          vendor: selectedVendor,
          poNumber: poNumber.trim(),
          orderIds: selectedOrders.map(o => o.id),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.details || 'Failed to generate purchase order.');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `PO-Ghamand-${poNumber.trim()}-${selectedVendor}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      toast({
        title: 'Purchase Order Generated',
        description: 'Your purchase order has been downloaded successfully.',
      });

      onClose();
    } catch (error) {
      console.error('Generate PO error:', error);
      toast({
        title: 'Generation Failed',
        description: error instanceof Error ? error.message : 'An unknown error occurred.',
        variant: 'destructive',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Generate Purchase Order</DialogTitle>
          <DialogDescription>
            Select a vendor and enter a PO number to generate a purchase order.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="vendor">Vendor</Label>
            {uniqueVendors.length > 0 ? (
              <Select value={selectedVendor} onValueChange={setSelectedVendor}>
                <SelectTrigger id="vendor">
                  <SelectValue placeholder="Select a vendor..." />
                </SelectTrigger>
                <SelectContent>
                  {uniqueVendors.map((vendor) => (
                    <SelectItem key={vendor} value={vendor}>
                      {vendor}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="text-sm text-muted-foreground">No vendors found in confirmed orders.</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="po-number">PO Number</Label>
            <Input
              id="po-number"
              placeholder="e.g., 20"
              value={poNumber}
              onChange={(e) => setPoNumber(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={isGenerating}>
            Cancel
          </Button>
          <Button onClick={handleGenerate} disabled={isGenerating || uniqueVendors.length === 0}>
            {isGenerating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Generate Purchase Order
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}