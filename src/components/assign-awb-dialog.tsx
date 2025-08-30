
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
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Skeleton } from '@/components/ui/skeleton';
import { ChevronLeft } from 'lucide-react';

interface Order {
  id: string;
  name: string;
}

interface PickupLocation {
  id: string;
  name: string;
  address: string;
  city: string;
}

interface AssignAwbDialogProps {
  isOpen: boolean;
  onClose: () => void;
  orders: Order[];
  onConfirm: (orders: Order[]) => void;
  shopId: string;
}

const courierServices = ['Delhivery', 'Shiprocket', 'Blue Dart'];
const shippingModes = ['Surface', 'Express'];

export function AssignAwbDialog({ isOpen, onClose, orders, onConfirm, shopId }: AssignAwbDialogProps) {
  const [step, setStep] = useState(1);
  const [selectedCourier, setSelectedCourier] = useState<string | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<string | null>(null);
  const [selectedMode, setSelectedMode] = useState<string | null>(null);
  
  const [pickupLocations, setPickupLocations] = useState<PickupLocation[]>([]);
  const [loadingLocations, setLoadingLocations] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    if (isOpen && shopId) {
      setLoadingLocations(true);
      const locationsRef = collection(db, 'accounts', shopId, 'pickupLocations');
      const unsubscribe = onSnapshot(locationsRef, (snapshot) => {
        const fetchedLocations = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PickupLocation));
        setPickupLocations(fetchedLocations);
        setLoadingLocations(false);
      }, (error) => {
        console.error("Error fetching locations:", error);
        toast({ title: "Error", description: "Could not fetch pickup locations.", variant: "destructive" });
        setLoadingLocations(false);
      });
      return () => unsubscribe();
    }
  }, [isOpen, shopId, toast]);
  
  useEffect(() => {
    // Reset state when dialog opens
    if (isOpen) {
      setStep(1);
      setSelectedCourier(null);
      setSelectedLocation(null);
      setSelectedMode(null);
    }
  }, [isOpen]);

  const handleNext = () => {
    if (step === 1 && !selectedCourier) {
      toast({ title: "Selection Required", description: "Please select a courier service.", variant: "destructive" });
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

  const handleConfirm = () => {
    if (!selectedMode) {
        toast({ title: "Selection Required", description: "Please select a shipping mode.", variant: "destructive" });
        return;
    }
    onConfirm(orders);
    onClose();
  };

  const renderStepContent = () => {
    switch (step) {
      case 1:
        return (
          <div className="space-y-4">
            <h3 className="font-semibold">Step 1: Choose Courier Service</h3>
            <RadioGroup value={selectedCourier || ""} onValueChange={setSelectedCourier}>
              {courierServices.map(service => (
                <div key={service} className="flex items-center space-x-2">
                  <RadioGroupItem value={service} id={service} />
                  <Label htmlFor={service}>{service}</Label>
                </div>
              ))}
            </RadioGroup>
          </div>
        );
      case 2:
        return (
          <div className="space-y-4">
            <h3 className="font-semibold">Step 2: Select Pickup Location</h3>
            {loadingLocations ? (
                <div className="space-y-2">
                    <Skeleton className="h-6 w-full" />
                    <Skeleton className="h-6 w-full" />
                </div>
            ): pickupLocations.length > 0 ? (
                <RadioGroup value={selectedLocation || ""} onValueChange={setSelectedLocation}>
                    {pickupLocations.map(location => (
                        <div key={location.id} className="flex items-center space-x-2">
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
            <h3 className="font-semibold">Step 3: Choose Shipping Mode</h3>
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

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign AWB for {orders.length} Order(s)</DialogTitle>
          <DialogDescription>
            Follow the steps to create shipments for the selected orders.
          </DialogDescription>
        </DialogHeader>
        <div className="py-6 min-h-[200px]">
            {renderStepContent()}
        </div>
        <DialogFooter className="flex justify-between w-full">
            <div>
              {step > 1 && (
                <Button variant="ghost" onClick={handleBack}>
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Back
                </Button>
              )}
            </div>
            <div>
              <Button variant="secondary" onClick={onClose}>Cancel</Button>
              {step < 3 && <Button onClick={handleNext} className="ml-2">Next</Button>}
              {step === 3 && <Button onClick={handleConfirm} className="ml-2">Assign AWBs & Create Shipments</Button>}
            </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
