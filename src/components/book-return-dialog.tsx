
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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Skeleton } from '@/components/ui/skeleton';
import { ChevronLeft, Loader2 } from 'lucide-react';
import { ScrollArea } from './ui/scroll-area';

interface Order {
  id: string;
  name: string;
  raw: {
    line_items: Array<{
      id: string | number;
      title: string;
      quantity: number;
      sku: string | null;
    }>;
  };
}

interface PickupLocation {
  id: string;
  name: string;
  address: string;
  city: string;
}

interface BookReturnDialogProps {
  isOpen: boolean;
  onClose: () => void;
  order: Order;
  shopId: string;
  user: any; // Firebase user object
}

const shippingModes = ['Surface', 'Express'];

export function BookReturnDialog({ isOpen, onClose, order, shopId, user }: BookReturnDialogProps) {
  const [step, setStep] = useState(1);
  const [selectedSkus, setSelectedSkus] = useState<Set<string>>(new Set());
  const [selectedLocation, setSelectedLocation] = useState<string | null>(null);
  const [selectedMode, setSelectedMode] = useState<string | null>(null);
  
  const [pickupLocations, setPickupLocations] = useState<PickupLocation[]>([]);
  const [loadingLocations, setLoadingLocations] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (isOpen && shopId) {
      setLoadingLocations(true);
      const locationsRef = collection(db, 'accounts', shopId, 'pickupLocations');
      const unsubscribe = onSnapshot(locationsRef, (snapshot) => {
        const fetchedLocations = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PickupLocation));
        setPickupLocations(fetchedLocations);
        if (fetchedLocations.length > 0 && !selectedLocation) {
            setSelectedLocation(fetchedLocations[0].id);
        }
        setLoadingLocations(false);
      }, (error) => {
        console.error("Error fetching locations:", error);
        toast({ title: "Error", description: "Could not fetch pickup locations.", variant: "destructive" });
        setLoadingLocations(false);
      });
      return () => unsubscribe();
    }
  }, [isOpen, shopId, toast, selectedLocation]);

  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setSelectedSkus(new Set());
      // setSelectedLocation(pickupLocations.length > 0 ? pickupLocations[0].id : null);
      setSelectedMode(null);
      setIsSubmitting(false);
    }
  }, [isOpen, pickupLocations]);

  const handleToggleSku = (sku: string) => {
    setSelectedSkus(prev => {
      const newSet = new Set(prev);
      if (newSet.has(sku)) {
        newSet.delete(sku);
      } else {
        newSet.add(sku);
      }
      return newSet;
    });
  };

  const handleNext = () => {
    if (step === 1 && selectedSkus.size === 0) {
      toast({ title: "Selection Required", description: "Please select at least one item to return.", variant: "destructive" });
      return;
    }
    if (step === 2 && !selectedLocation) {
        toast({ title: "Selection Required", description: "Please select a pickup location.", variant: "destructive" });
        return;
    }
    setStep(s => s + 1);
  };

  const handleBack = () => {
    setStep(s => s - 1);
  };

  const handleConfirm = async () => {
    if (!selectedMode) {
      toast({ title: "Selection Required", description: "Please select a shipping mode.", variant: "destructive" });
      return;
    }
    if (!selectedLocation) {
        toast({ title: "Selection Required", description: "Please select a pickup location.", variant: "destructive" });
        return;
    }
    if (!user) {
        toast({ title: "Auth Error", description: "User not found.", variant: "destructive"});
        return;
    }

    const pickupName = pickupLocations.find(loc => loc.id === selectedLocation)?.name;
    if (!pickupName) {
        toast({ title: "Error", description: "Could not find selected pickup location name.", variant: "destructive" });
        return;
    }

    setIsSubmitting(true);
    toast({ title: 'Booking Return', description: 'Please wait while we book the return shipment...' });

    try {
        const idToken = await user.getIdToken();
        const response = await fetch('/api/shopify/courier/book-reverse-order', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${idToken}`
            },
            body: JSON.stringify({
                shop: shopId,
                orderId: order.id,
                skus_of_selected_line_items_to_be_returned: Array.from(selectedSkus),
                pickupName,
                shipping_mode: selectedMode,
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

  const renderStepContent = () => {
    switch (step) {
      case 1:
        return (
          <div className="space-y-4">
            <h3 className="font-semibold">Step 1: Select items to return</h3>
            <ScrollArea className="h-64 border rounded-md p-4">
              <div className="space-y-3">
                {order.raw.line_items.map(item => (
                  <div key={item.id} className="flex items-center space-x-3">
                    <Checkbox
                      id={`item-${item.id}`}
                      checked={selectedSkus.has(item.sku || '')}
                      onCheckedChange={() => handleToggleSku(item.sku || '')}
                      disabled={!item.sku}
                    />
                    <Label htmlFor={`item-${item.id}`} className="flex-1">
                      <p>{item.title}</p>
                      <p className="text-xs text-muted-foreground">SKU: {item.sku || 'N/A'}</p>
                    </Label>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        );
      case 2:
        return (
          <div className="space-y-4">
            <h3 className="font-semibold">Step 2: Select return pickup address</h3>
            {loadingLocations ? (
                <div className="space-y-2">
                    <Skeleton className="h-6 w-full" />
                    <Skeleton className="h-6 w-full" />
                </div>
            ) : pickupLocations.length > 0 ? (
                <RadioGroup value={selectedLocation || ""} onValueChange={setSelectedLocation}>
                    {pickupLocations.map(location => (
                        <div key={location.id} className="flex items-center space-x-2 p-3 border rounded-md">
                            <RadioGroupItem value={location.id} id={location.id} />
                            <Label htmlFor={location.id}>{location.name} - {location.address}, {location.city}</Label>
                        </div>
                    ))}
                </RadioGroup>
            ) : (
                <p className="text-sm text-muted-foreground text-center py-4">No pickup locations found. Please add one in Settings.</p>
            )}
          </div>
        );
      case 3:
        return (
          <div className="space-y-4">
            <h3 className="font-semibold">Step 3: Choose shipping mode</h3>
            <RadioGroup value={selectedMode || ""} onValueChange={setSelectedMode}>
              {shippingModes.map(mode => (
                <div key={mode} className="flex items-center space-x-2">
                  <RadioGroupItem value={mode} id={mode} />
                  <Label htmlFor={mode}>{mode}</Label>
                </div>
              ))}
            </RadioGroup>
          </div>
        );
      default:
        return null;
    }
  };

  const isNextDisabled = () => {
      if (step === 1 && selectedSkus.size === 0) return true;
      if (step === 2 && !selectedLocation) return true;
      return false;
  }
  
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Book Return for Order {order.name}</DialogTitle>
          <DialogDescription>
            Follow the steps to book a return shipment.
          </DialogDescription>
        </DialogHeader>
        <div className="py-6 min-h-[300px]">
            {renderStepContent()}
        </div>
        <DialogFooter className="flex justify-between w-full">
            <div>
              {step > 1 && (
                <Button variant="ghost" onClick={handleBack} disabled={isSubmitting}>
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Back
                </Button>
              )}
            </div>
            <div>
              <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>Cancel</Button>
              {step < 3 ? (
                <Button onClick={handleNext} className="ml-2" disabled={isNextDisabled()}>Next</Button>
              ) : (
                  <Button onClick={handleConfirm} className="ml-2" disabled={!selectedMode || isSubmitting}>
                      {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Confirm Booking
                  </Button>
              )}
            </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

