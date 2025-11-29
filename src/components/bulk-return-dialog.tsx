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
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Skeleton } from './ui/skeleton';

interface Order {
    id: string;
    name: string;
    storeId: string;
}

interface Location {
    id: string;
    name: string;
    address: string;
    city: string;
    postcode: string;
    country: string;
}

interface BulkReturnDialogProps {
    isOpen: boolean;
    onClose: () => void;
    orders: Order[];
    onConfirm: (pickupName: string) => void;
    businessId: string;
}

export function BulkReturnDialog({
    businessId,
    isOpen,
    onClose,
    orders,
    onConfirm
}: BulkReturnDialogProps) {
    const [selectedWarehouse, setSelectedWarehouse] = useState<string | null>(null);
    const [availableWarehouses, setAvailableWarehouses] = useState<Location[]>([]);
    const [loadingWarehouses, setLoadingWarehouses] = useState(true);

    const { toast } = useToast();

    useEffect(() => {
        if (isOpen && businessId) {
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
                toast({
                    title: "Error",
                    description: "Could not load warehouse options.",
                    variant: "destructive"
                });
                setLoadingWarehouses(false);
            });
        }
    }, [isOpen, businessId, toast]);

    const handleConfirm = () => {
        if (availableWarehouses.length === 0) {
            toast({
                title: "No Pickup Locations",
                description: "Please add at least one pickup location in Settings before booking returns.",
                variant: "destructive"
            });
            return;
        }

        if (!selectedWarehouse) {
            toast({
                title: "Selection Required",
                description: "Please select a warehouse.",
                variant: "destructive"
            });
            return;
        }

        const selectedLocation = availableWarehouses.find(w => w.id === selectedWarehouse);
        const pickupName = selectedLocation?.name || "";

        onConfirm(pickupName);
    };

    const canProceed = availableWarehouses.length > 0;

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Book Return for {orders.length} Order(s)</DialogTitle>
                    <DialogDescription>
                        Select the warehouse for return pickup.
                    </DialogDescription>
                </DialogHeader>
                <div className="py-6 min-h-[200px]">
                    <div className="space-y-4">
                        <h3 className="font-semibold">Choose Warehouse</h3>
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
                            <p className="text-sm text-muted-foreground text-center py-4">
                                No warehouses found. Please add a pickup location in Settings.
                            </p>
                        )}
                    </div>
                </div>
                <DialogFooter className="flex justify-between w-full">
                    <div>
                        <Button variant="secondary" onClick={onClose}>Cancel</Button>
                        <Button onClick={handleConfirm} className="ml-2" disabled={!canProceed}>
                            Book Returns
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}