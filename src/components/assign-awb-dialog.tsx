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
import { ChevronLeft } from 'lucide-react';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Skeleton } from './ui/skeleton';

interface Order {
  id: string;
  name: string;
}

interface Location {
  id: string;
  name: string;
  address: string;
  city: string;
  postcode: string;
  country: string;
}

interface AssignAwbDialogProps {
  isOpen: boolean;
  onClose: () => void;
  orders: Order[];
  onConfirm: (courier: string, pickupName: string, shippingMode: string) => void;
  businessId: string;
}

const shippingModes = ['Surface', 'Express'];

interface CourierIntegrations {
  delhivery?: { apiKey: string; };
  shiprocket?: { email: string; apiKey: string; };
  xpressbees?: { email: string; apiKey: string; };
  bluedart?: { customerCode: string; loginId: string; licenceKey: string; }; // Added Blue Dart
  priorityEnabled?: boolean;
  priorityList?: string[];
}

export function AssignAwbDialog({ businessId, isOpen, onClose, orders, onConfirm }: AssignAwbDialogProps) {
  const [step, setStep] = useState(1);
  const [selectedCourier, setSelectedCourier] = useState<string | null>(null);
  const [selectedWarehouse, setSelectedWarehouse] = useState<string | null>(null);
  const [selectedMode, setSelectedMode] = useState<string | null>(null);

  const [availableCouriers, setAvailableCouriers] = useState<string[]>([]);
  const [availableWarehouses, setAvailableWarehouses] = useState<Location[]>([]);
  const [loadingCouriers, setLoadingCouriers] = useState(true);
  const [loadingWarehouses, setLoadingWarehouses] = useState(true);

  const { toast } = useToast();

  useEffect(() => {
    if (isOpen && businessId) {
      // Fetch courier integrations
      setLoadingCouriers(true);
      const accountRef = doc(db, 'users', businessId);
      getDoc(accountRef).then(docSnap => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          const integrations: CourierIntegrations | undefined = data.integrations?.couriers;
          let courierOptions: string[] = [];

          if (integrations) {
            // Check for priority
            if (integrations.priorityEnabled && integrations.priorityList && integrations.priorityList.length > 0) {
              courierOptions.push('Priority');
            }
            // Add integrated couriers
            if (integrations.delhivery) courierOptions.push('Delhivery');
            if (integrations.shiprocket) courierOptions.push('Shiprocket');
            if (integrations.xpressbees) courierOptions.push('Xpressbees');
            if (integrations.bluedart) courierOptions.push('Blue Dart'); // Added Blue Dart
          }

          setAvailableCouriers(courierOptions);
          setSelectedCourier(courierOptions[0] || null);
        }
        setLoadingCouriers(false);
      }).catch(err => {
        console.error("Failed to fetch courier integrations", err);
        toast({ title: "Error", description: "Could not load courier options.", variant: "destructive" });
        setLoadingCouriers(false);
      });

      // Fetch pickup locations
      setLoadingWarehouses(true);
      const pickupLocationsRef = collection(db, 'users', businessId, 'pickupLocations');
      getDocs(pickupLocationsRef).then(snapshot => {
        const locations: Location[] = [];
        snapshot.forEach(doc => {
          locations.push({ id: doc.id, ...doc.data() } as Location);
        });
        setAvailableWarehouses(locations);
        setSelectedWarehouse(locations[0]?.id || null);
        setLoadingWarehouses(false);
      }).catch(err => {
        console.error("Failed to fetch pickup locations", err);
        toast({ title: "Error", description: "Could not load warehouse options.", variant: "destructive" });
        setLoadingWarehouses(false);
      });
    }

    if (isOpen) {
      setStep(1);
      setSelectedMode(null);
    }
  }, [isOpen, businessId, toast]);

  const handleNext = () => {
    if (step === 1 && !selectedCourier) {
      toast({ title: "Selection Required", description: "Please select a courier service.", variant: "destructive" });
      return;
    }

    if (step === 2 && !selectedWarehouse) {
      toast({ title: "Selection Required", description: "Please select a warehouse.", variant: "destructive" });
      return;
    }

    setStep(s => s + 1);
  };

  const handleBack = () => {
    setStep(s => s - 1);
  };

  const handleConfirm = () => {
    if (availableWarehouses.length === 0) {
      toast({
        title: "No Pickup Locations",
        description: "Please add at least one pickup location in Settings before assigning AWBs.",
        variant: "destructive"
      });
      return;
    }

    if (!selectedCourier) {
      toast({ title: "Selection Required", description: "Please select a courier.", variant: "destructive" });
      return;
    }
    if (!selectedWarehouse) {
      toast({ title: "Selection Required", description: "Please select a warehouse.", variant: "destructive" });
      return;
    }
    // Updated: Blue Dart also requires shipping mode selection
    if ((selectedCourier === 'Delhivery' || selectedCourier === 'Xpressbees' || selectedCourier === 'Blue Dart') && !selectedMode) {
      toast({ title: "Selection Required", description: "Please select a shipping mode.", variant: "destructive" });
      return;
    }

    const selectedLocation = availableWarehouses.find(w => w.id === selectedWarehouse);
    const pickupName = selectedLocation?.name || "";

    onConfirm(selectedCourier, pickupName, selectedMode || 'Surface');
    onClose();
  };

  const renderStepContent = () => {
    switch (step) {
      case 1:
        return (
          <div className="space-y-4">
            <h3 className="font-semibold">Step 1: Choose Courier Service</h3>
            {loadingCouriers ? (
              <div className="space-y-2">
                <Skeleton className="h-6 w-full" />
                <Skeleton className="h-6 w-full" />
              </div>
            ) : availableCouriers.length > 0 ? (
              <RadioGroup value={selectedCourier || ""} onValueChange={setSelectedCourier}>
                {availableCouriers.map(service => (
                  <div key={service} className="flex items-center space-x-2">
                    <RadioGroupItem value={service} id={service} />
                    <Label htmlFor={service} className="capitalize">{service}</Label>
                  </div>
                ))}
              </RadioGroup>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">No courier services integrated. Please connect a courier in Settings.</p>
            )}
          </div>
        );
      case 2:
        return (
          <div className="space-y-4">
            <h3 className="font-semibold">Step 2: Choose Warehouse</h3>
            {loadingWarehouses ? (
              <div className="space-y-2">
                <Skeleton className="h-6 w-full" />
                <Skeleton className="h-6 w-full" />
              </div>
            ) : availableWarehouses.length > 0 ? (
              <RadioGroup value={selectedWarehouse || ""} onValueChange={setSelectedWarehouse}>
                {availableWarehouses.map(warehouse => (
                  <div key={warehouse.id} className="flex items-center space-x-2">
                    <RadioGroupItem value={warehouse.id} id={warehouse.id} />
                    <Label htmlFor={warehouse.id}>{warehouse.name}</Label>
                  </div>
                ))}
              </RadioGroup>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">No warehouses found. Please add a pickup location in Settings.</p>
            )}
          </div>
        );
      case 3:
        // Updated: Skip shipping mode for Shiprocket and Priority only
        if (selectedCourier === 'Shiprocket' || selectedCourier === 'Priority') return null;
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

  // Updated: Blue Dart requires shipping mode, so it follows the 3-step flow like Delhivery/Xpressbees
  const isFinalStep = (
    (selectedCourier === 'Delhivery' || selectedCourier === 'Xpressbees' || selectedCourier === 'Blue Dart') && step === 3
  ) || (
      (selectedCourier === 'Shiprocket' || selectedCourier === 'Priority') && step === 2
    );

  const canProceed = availableCouriers.length > 0 && availableWarehouses.length > 0;


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
            {!isFinalStep && (
              <Button onClick={handleNext} className="ml-2" disabled={!canProceed}>Next</Button>
            )}
            {isFinalStep && (
              <Button onClick={handleConfirm} className="ml-2" disabled={!canProceed}>
                Assign AWBs & Create Shipments
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}