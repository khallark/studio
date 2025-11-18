
// store/[storeId]/settings/pickup-locations

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PlusCircle, MapPin, Edit, Trash2 } from 'lucide-react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '@/lib/firebase';
import { doc, getDoc, collection, onSnapshot, DocumentReference } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { useParams } from 'next/navigation';
import { useStoreAuthorization } from '@/hooks/use-store-authorization';
import { useBusinessContext } from '../../layout';

interface Location {
    id: string;
    name: string;
    address: string;
    city: string;
    postcode: string;
    country: string;
}

interface UserData {
    activeAccountId: string | null;
}

type MemberRole = 'SuperAdmin' | 'Admin' | 'Staff' | 'Vendor';


export default function PickupLocationsPage() {
    const params = useParams();
    const nonPrefixedStoreId = params?.storeId as string;
    const { isAuthorized, loading: authLoading, user, businessId } = useBusinessContext();

    const { toast } = useToast();

    const [locations, setLocations] = useState<Location[]>([]);
    const [loading, setLoading] = useState(true);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [editingLocation, setEditingLocation] = useState<Location | null>(null);

    // Form state
    const [name, setName] = useState('');
    const [address, setAddress] = useState('');
    const [city, setCity] = useState('');
    const [postcode, setPostcode] = useState('');
    const [country, setCountry] = useState('');

    useEffect(() => {
        document.title = "Settings - Pickup Locations";
    }, [])

    useEffect(() => {
        if (businessId && user) {
            setLoading(true);

            const locationsRef = collection(db, 'users', businessId, 'pickupLocations');

            const unsubscribe = onSnapshot(locationsRef, (snapshot) => {
                const fetchedLocations = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Location));
                setLocations(fetchedLocations);
                setLoading(false);
            }, (error) => {
                console.error("Error fetching locations:", error);
                toast({
                    title: "Error fetching locations",
                    description: "Could not retrieve pickup locations.",
                    variant: "destructive",
                });
                setLoading(false);
            });

            return () => unsubscribe();
        } else if (!authLoading && (!businessId)) {
            setLoading(false);
        }
    }, [businessId, user, toast, authLoading]);

    useEffect(() => {
        if (editingLocation) {
            setName(editingLocation.name);
            setAddress(editingLocation.address);
            setCity(editingLocation.city);
            setPostcode(editingLocation.postcode);
            setCountry(editingLocation.country);
        } else {
            resetForm();
        }
    }, [editingLocation]);

    const resetForm = () => {
        setName('');
        setAddress('');
        setCity('');
        setPostcode('');
        setCountry('');
        setEditingLocation(null);
    };

    const handleOpenDialog = (location: Location | null = null) => {
        setEditingLocation(location);
        setIsDialogOpen(true);
    };

    const handleCloseDialog = () => {
        resetForm();
        setIsDialogOpen(false);
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!businessId || !user) {
            toast({ title: "No store connected", description: "Please connect a store first.", variant: "destructive" });
            return;
        }
        setIsSubmitting(true);

        const locationData = { name, address, city, postcode, country };
        const isEditing = !!editingLocation;
        const idToken = await user.getIdToken();

        const url = isEditing ? '/api/shopify/locations/update' : '/api/shopify/locations/add';
        const body = isEditing
            ? JSON.stringify({ businessId, locationId: editingLocation.id, location: locationData })
            : JSON.stringify({ businessId, location: locationData });

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`
                },
                body: body,
            });

            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.details || 'Failed to save location');
            }

            toast({
                title: isEditing ? 'Location Updated' : 'Location Added',
                description: `The pickup location has been successfully ${isEditing ? 'updated' : 'saved'}.`
            });
            handleCloseDialog();
        } catch (error) {
            console.error('Failed to save location:', error);
            toast({ title: 'Save Failed', description: error instanceof Error ? error.message : 'An unknown error occurred.', variant: 'destructive' });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDeleteLocation = async (locationId: string) => {
        if (!businessId || !user) {
            toast({ title: "No store connected", description: "Please connect a store first.", variant: "destructive" });
            return;
        }

        try {
            const idToken = await user.getIdToken();
            const response = await fetch('/api/shopify/locations/delete', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`
                },
                body: JSON.stringify({ businessId, locationId }),
            });
            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.details || 'Failed to delete location');
            }
            toast({
                title: 'Location Deleted',
                description: 'The pickup location has been removed.',
            });
        } catch (error) {
            console.error('Failed to delete location:', error);
            toast({ title: 'Delete Failed', description: error instanceof Error ? error.message : 'An unknown error occurred.', variant: 'destructive' });
        }
    };

    if (authLoading) {
        return (
            <div className="flex items-center justify-center h-screen">
                <div className="text-lg">Loading...</div>
            </div>
        )
    }

    if (!isAuthorized) {
        return null;
    }

    return (
        <div className="flex justify-center items-start h-full p-4 md:p-6">
            <Card className="w-full max-w-4xl">
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className="text-2xl font-headline">Pickup Locations</CardTitle>
                            <CardDescription>Manage where customers can pick up their orders.</CardDescription>
                        </div>
                        <Button onClick={() => handleOpenDialog()}>
                            <PlusCircle className="mr-2 h-4 w-4" />
                            Add New Location
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="space-y-4">
                            <Skeleton className="h-20 w-full" />
                            <Skeleton className="h-20 w-full" />
                        </div>
                    ) : locations.length === 0 ? (
                        <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm min-h-[300px]">
                            <div className="flex flex-col items-center gap-1 text-center">
                                <h3 className="text-2xl font-bold tracking-tight">
                                    No pickup locations found
                                </h3>
                                <p className="text-sm text-muted-foreground">
                                    Click "Add New Location" to get started.
                                </p>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {locations.map((location) => (
                                <div key={location.id} className="rounded-lg border p-4 flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <MapPin className="h-8 w-8 text-muted-foreground" />
                                        <div>
                                            <p className="font-semibold">{location.name}</p>
                                            <p className="text-sm text-muted-foreground">
                                                {location.address}, {location.city}, {location.postcode}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <Button variant="ghost" size="icon" onClick={() => handleOpenDialog(location)}>
                                            <Edit className="h-4 w-4" />
                                        </Button>
                                        <AlertDialog>
                                            <AlertDialogTrigger asChild>
                                                <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive">
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </AlertDialogTrigger>
                                            <AlertDialogContent>
                                                <AlertDialogHeader>
                                                    <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                                    <AlertDialogDescription>
                                                        This action cannot be undone. This will permanently delete the pickup location &quot;{location.name}&quot;.
                                                    </AlertDialogDescription>
                                                </AlertDialogHeader>
                                                <AlertDialogFooter>
                                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                    <AlertDialogAction onClick={() => handleDeleteLocation(location.id)}>
                                                        Yes, delete it
                                                    </AlertDialogAction>
                                                </AlertDialogFooter>
                                            </AlertDialogContent>
                                        </AlertDialog>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            <Dialog open={isDialogOpen} onOpenChange={(isOpen) => !isOpen && handleCloseDialog()}>
                <DialogContent className="sm:max-w-[425px]">
                    <form onSubmit={handleSubmit}>
                        <DialogHeader>
                            <DialogTitle>{editingLocation ? 'Edit' : 'Add New'} Pickup Location</DialogTitle>
                            <DialogDescription>
                                Enter the details for your pickup location. Click save when you're done.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                            <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor="name" className="text-right">Name</Label>
                                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Downtown Store" className="col-span-3" required />
                            </div>
                            <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor="address" className="text-right">Address</Label>
                                <Input id="address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="123 Main Street" className="col-span-3" required />
                            </div>
                            <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor="city" className="text-right">City</Label>
                                <Input id="city" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Anytown" className="col-span-3" required />
                            </div>
                            <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor="postcode" className="text-right">Postcode</Label>
                                <Input id="postcode" value={postcode} onChange={(e) => setPostcode(e.target.value)} placeholder="12345" className="col-span-3" required />
                            </div>
                            <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor="country" className="text-right">Country</Label>
                                <Input id="country" value={country} onChange={(e) => setCountry(e.target.value)} placeholder="United States" className="col-span-3" required />
                            </div>
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="secondary" onClick={handleCloseDialog}>Cancel</Button>
                            <Button type="submit" disabled={isSubmitting}>{isSubmitting ? "Saving..." : (editingLocation ? "Save Changes" : "Save Location")}</Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
}
