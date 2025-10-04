
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
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Skeleton } from './ui/skeleton';

interface Order {
  id: string;
  name: string;
}

interface AssignAwbDialogProps {
  isOpen: boolean;
  onClose: () => void;
  orders: Order[];
  onConfirm: (courier: string, pickupName: string, shippingMode: string) => void;
  shopId: string;
}

const shippingModes = ['Surface', 'Express'];

interface CourierIntegrations {
    delhivery?: { apiKey: string; };
    shiprocket?: { email: string; apiKey: string; };
    priorityEnabled?: boolean;
    priorityList?: string[];
}

export function AssignAwbDialog({ isOpen, onClose, orders, onConfirm, shopId }: AssignAwbDialogProps) {
  const [step, setStep] = useState(1);
  const [selectedCourier, setSelectedCourier] = useState<string | null>(null);
  const [selectedMode, setSelectedMode] = useState<string | null>(null);
  
  const [availableCouriers, setAvailableCouriers] = useState<string[]>([]);
  const [loadingCouriers, setLoadingCouriers] = useState(true);

  const { toast } = useToast();
  
  useEffect(() => {
    if (isOpen && shopId) {
      setLoadingCouriers(true);
      const accountRef = doc(db, 'accounts', shopId);
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
          }
          
          setAvailableCouriers(courierOptions);
          setSelectedCourier(courierOptions[0] || null);
        }
        setLoadingCouriers(false);
      }).catch(err => {
        console.error("Failed to fetch courier integrations", err);
        toast({ title: "Error", description: "Could not load courier options.", variant: "destructive"});
        setLoadingCouriers(false);
      });
    }

    if (isOpen) {
      setStep(1);
      setSelectedMode(null);
    }
  }, [isOpen, shopId, toast]);

  const handleNext = () => {
    if (step === 1 && !selectedCourier) {
      toast({ title: "Selection Required", description: "Please select a courier service.", variant: "destructive" });
      return;
    }
    
    // If Shiprocket is chosen, go directly to confirm
    if (step === 1 && selectedCourier === 'Shiprocket') {
      handleConfirm();
      return;
    }

    setStep(s => s + 1);
  };

  const handleBack = () => {
    setStep(s => s - 1);
  };

  const handleConfirm = () => {
    if(!selectedCourier) {
      toast({ title: "Selection Required", description: "Please select a courier.", variant: "destructive" });
      return;
    }
    if ((selectedCourier === 'Delhivery' || selectedCourier === 'Priority') && !selectedMode) {
        toast({ title: "Selection Required", description: "Please select a shipping mode.", variant: "destructive" });
        return;
    }

    const pickupName = "Majime Productions 2"; // Hardcoded pickup name
    
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
        if (selectedCourier === 'Shiprocket') return null;
        return (
          <div className="space-y-4">
            <h3 className="font-semibold">Step 2: Choose Shipping Mode</h3>
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
  
  const isFinalStep = ((selectedCourier === 'Delhivery' || selectedCourier === 'Priority') && step === 2) || (selectedCourier === 'Shiprocket' && step === 1);
  const canProceed = availableCouriers.length > 0;


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
