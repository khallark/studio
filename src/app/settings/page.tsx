
'use client';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import React, { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '@/lib/firebase';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Loader2 } from 'lucide-react';

interface CompanyAddress {
  address: string;
  pincode: string;
  city: string;
  state: string;
  country: string;
}

interface PrimaryContact {
  name: string;
  phone: string;
  email: string;
}

interface CustomerServices {
    bookReturnPage?: {
        enabled: boolean;
    }
}

interface SettingsData {
  companyAddress?: CompanyAddress;
  primaryContact?: PrimaryContact;
  customerServices?: CustomerServices;
}

type MemberRole = 'SuperAdmin' | 'Admin' | 'Staff' | 'Vendor';

export default function SettingsPage() {
  const [user, userLoading] = useAuthState(auth);
  const { toast } = useToast();

  const [activeAccountId, setActiveAccountId] = useState<string | null>(null);
  const [memberRole, setMemberRole] = useState<MemberRole | null>(null);
  const [displayedData, setDisplayedData] = useState<SettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  
  const [isEditingAddress, setIsEditingAddress] = useState(false);
  const [isEditingContact, setIsEditingContact] = useState(false);
  
  const [addressForm, setAddressForm] = useState<CompanyAddress>({ address: '', pincode: '', city: '', state: '', country: '' });
  const [contactForm, setContactForm] = useState<PrimaryContact>({ name: '', phone: '', email: '' });

  const [isSubmittingAddress, setIsSubmittingAddress] = useState(false);
  const [isSubmittingContact, setIsSubmittingContact] = useState(false);
  const [isTogglingService, setIsTogglingService] = useState(false);

  useEffect(() => {
    document.title = "Settings - Store Details";
  });

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    try {
      const idToken = await user.getIdToken();
      const response = await fetch('/api/settings/get-details', {
        headers: { 'Authorization': `Bearer ${idToken}` }
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.details || 'Failed to fetch settings');
      }
      
      setMemberRole(data.role);
      setDisplayedData(data.settings);
      setAddressForm(data.settings.companyAddress || { address: '', pincode: '', city: '', state: '', country: '' });
      setContactForm(data.settings.primaryContact || { name: '', phone: '', email: '' });

    } catch (error) {
      toast({
        title: 'Error Loading Settings',
        description: error instanceof Error ? error.message : 'Could not load your settings data.',
        variant: 'destructive',
      });
      setMemberRole(null);
      setDisplayedData(null);
    } finally {
      setLoading(false);
    }
  }, [user, toast]);

  useEffect(() => {
    if (!userLoading) {
      fetchData();
    }
  }, [user, userLoading, fetchData]);
  
  const hasAddress = !!displayedData?.companyAddress?.address;
  const hasContact = !!displayedData?.primaryContact?.name;
  const isReadOnly = memberRole === 'Staff';

  const handleSaveAddress = async () => {
    if (!user) return;
    setIsSubmittingAddress(true);
    
    try {
        const idToken = await user.getIdToken();
        // The API now correctly determines where to save based on the user's role.
        const response = await fetch('/api/shopify/account/update-address', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
            body: JSON.stringify({ 
                // The API gets the active shop from the user's token.
                shop: 'unused', // This value is now ignored by the API but kept for structure
                address: addressForm,
             }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.details || 'Failed to save address');
        toast({ title: 'Address Saved', description: 'Your company address has been updated.' });
        setIsEditingAddress(false);
        fetchData(); // Refetch data after saving
    } catch (error) {
        toast({ title: 'Save Failed', description: error instanceof Error ? error.message : 'An unknown error occurred.', variant: 'destructive' });
    } finally {
        setIsSubmittingAddress(false);
    }
  };

  const handleSaveContact = async () => {
      if (!user) return;
      setIsSubmittingContact(true);
      try {
        const idToken = await user.getIdToken();
        const response = await fetch('/api/shopify/account/update-contact', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
            body: JSON.stringify({ 
                shop: 'unused',
                contact: contactForm 
            }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.details || 'Failed to save contact');
        toast({ title: 'Contact Saved', description: 'Your primary contact has been updated.' });
        setIsEditingContact(false);
        fetchData(); // Refetch data
    } catch (error) {
        toast({ title: 'Save Failed', description: error instanceof Error ? error.message : 'An unknown error occurred.', variant: 'destructive' });
    } finally {
        setIsSubmittingContact(false);
    }
  };
  
    const handleToggleService = async (serviceName: 'bookReturnPage', isEnabled: boolean) => {
        if (!user || isReadOnly) return;
        setIsTogglingService(true);
        try {
            const idToken = await user.getIdToken();
            const response = await fetch('/api/shopify/account/toggle-service', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
                body: JSON.stringify({ shop: 'unused', serviceName, isEnabled }),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.details || 'Failed to toggle service');
            toast({
                title: 'Service Updated',
                description: `'Booking a return' page has been ${isEnabled ? 'enabled' : 'disabled'}.`
            });
            fetchData(); // Refetch
        } catch (error) {
            toast({ title: 'Update Failed', description: error instanceof Error ? error.message : 'An unknown error occurred.', variant: 'destructive' });
        } finally {
            setIsTogglingService(false);
        }
  };

  
  const handleCancelEditAddress = () => {
      setAddressForm(displayedData?.companyAddress || { address: '', pincode: '', city: '', state: '', country: '' });
      setIsEditingAddress(false);
  }

  const handleCancelEditContact = () => {
      setContactForm(displayedData?.primaryContact || { name: '', phone: '', email: '' });
      setIsEditingContact(false);
  }

  if (loading || userLoading) {
      return (
          <div className="flex justify-center items-start h-full p-4 md:p-6">
              <Card className="w-full max-w-4xl">
                  <CardHeader>
                      <Skeleton className="h-8 w-48" />
                      <Skeleton className="h-4 w-72" />
                  </CardHeader>
                  <CardContent className="space-y-8">
                     <Skeleton className="h-40 w-full" />
                     <Separator />
                     <Skeleton className="h-32 w-full" />
                     <Separator />
                     <Skeleton className="h-32 w-full" />
                  </CardContent>
              </Card>
          </div>
      )
  }

  return (
    <div className="flex justify-center items-start h-full p-4 md:p-6">
      <Card className="w-full max-w-4xl">
        <CardHeader>
          <CardTitle className="text-2xl font-headline">Store Details</CardTitle>
          <CardDescription>Manage your company address and primary contact information.</CardDescription>
        </CardHeader>
        <CardContent>
          {!displayedData ? (
            <div className="text-center py-10 text-muted-foreground">
              Please connect a Shopify store to manage its details.
            </div>
          ) : !memberRole ? (
             <div className="text-center py-10 text-muted-foreground">
                You do not have permission to view this page.
            </div>
          ) : (
            <div className="space-y-8">
              {/* Company Address Section */}
              <section>
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-semibold">Company Address</h2>
                  {!isEditingAddress && !isReadOnly && (
                    <Button variant="outline" onClick={() => setIsEditingAddress(true)}>
                      {hasAddress ? 'Edit Details' : 'Add Details'}
                    </Button>
                  )}
                </div>
                {isEditingAddress ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="md:col-span-2 grid gap-2">
                            <Label htmlFor="address">Address</Label>
                            <Input id="address" value={addressForm.address} onChange={(e) => setAddressForm({...addressForm, address: e.target.value})} />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="pincode">Pincode</Label>
                            <Input id="pincode" value={addressForm.pincode} onChange={(e) => setAddressForm({...addressForm, pincode: e.target.value})} />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="city">City</Label>
                            <Input id="city" value={addressForm.city} onChange={(e) => setAddressForm({...addressForm, city: e.target.value})} />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="state">State</Label>
                            <Input id="state" value={addressForm.state} onChange={(e) => setAddressForm({...addressForm, state: e.target.value})} />
                        </div>
                         <div className="grid gap-2">
                            <Label htmlFor="country">Country</Label>
                            <Input id="country" value={addressForm.country} onChange={(e) => setAddressForm({...addressForm, country: e.target.value})} />
                        </div>
                    </div>
                    <div className="flex justify-end gap-2 mt-4">
                        <Button variant="secondary" onClick={handleCancelEditAddress}>Cancel</Button>
                        <Button onClick={handleSaveAddress} disabled={isSubmittingAddress}>{isSubmittingAddress ? "Saving..." : "Save Address"}</Button>
                    </div>
                  </div>
                ) : hasAddress ? (
                    <div className="text-sm text-muted-foreground space-y-1">
                        <p>{displayedData?.companyAddress?.address}</p>
                        <p>{displayedData?.companyAddress?.city}, {displayedData?.companyAddress?.state} {displayedData?.companyAddress?.pincode}</p>
                        <p>{displayedData?.companyAddress?.country}</p>
                    </div>
                ) : (
                  <div className="text-center py-6 text-muted-foreground border-2 border-dashed rounded-lg">
                    No company address has been added yet.
                  </div>
                )}
              </section>

              <Separator />

              {/* Primary Contact Section */}
              <section>
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-semibold">Primary Contact</h2>
                    {!isEditingContact && !isReadOnly && (
                        <Button variant="outline" onClick={() => setIsEditingContact(true)}>
                            {hasContact ? 'Edit Details' : 'Add Details'}
                        </Button>
                    )}
                </div>
                {isEditingContact ? (
                   <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="grid gap-2">
                                <Label htmlFor="contact-name">Name</Label>
                                <Input id="contact-name" value={contactForm.name} onChange={(e) => setContactForm({...contactForm, name: e.target.value})} />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="contact-phone">Phone no</Label>
                                <Input id="contact-phone" type="tel" value={contactForm.phone} onChange={(e) => setContactForm({...contactForm, phone: e.target.value})} />
                            </div>
                            <div className="md:col-span-2 grid gap-2">
                                <Label htmlFor="contact-email">Email Id</Label>
                                <Input id="contact-email" type="email" value={contactForm.email} onChange={(e) => setContactForm({...contactForm, email: e.target.value})} />
                            </div>
                        </div>
                        <div className="flex justify-end gap-2 mt-4">
                            <Button variant="secondary" onClick={handleCancelEditContact}>Cancel</Button>
                            <Button onClick={handleSaveContact} disabled={isSubmittingContact}>{isSubmittingContact ? "Saving..." : "Save Contact"}</Button>
                        </div>
                   </div>
                ) : hasContact ? (
                    <div className="text-sm text-muted-foreground space-y-1">
                        <p className="font-medium text-foreground">{displayedData?.primaryContact?.name}</p>
                        <p>{displayedData?.primaryContact?.phone}</p>
                        <p>{displayedData?.primaryContact?.email}</p>
                    </div>
                ) : (
                    <div className="text-center py-6 text-muted-foreground border-2 border-dashed rounded-lg">
                        No primary contact has been added yet.
                    </div>
                )}
              </section>
              
              {/* Customer services can only be toggled by SuperAdmins/Admins, not Vendors */}
              {memberRole !== 'Vendor' && (
                <>
                  <Separator />

                  {/* Customer Services Section */}
                  <section>
                      <h2 className="text-xl font-semibold mb-4">Customer Services</h2>
                      <div className="rounded-lg border p-6 space-y-6">
                          <div>
                              <h3 className="font-semibold">Enabled Services</h3>
                              <p className="text-sm text-muted-foreground mt-1 mb-4">
                                  Enable or disable public-facing pages for your customers.
                              </p>
                              <div className="flex items-center justify-between p-4 border rounded-md">
                                <div>
                                    <h4 className="font-medium">'Booking a return' page</h4>
                                    <p className="text-sm text-muted-foreground">
                                        Allows customers to initiate returns from a public page.
                                    </p>
                                </div>
                                <Switch
                                    checked={displayedData?.customerServices?.bookReturnPage?.enabled || false}
                                    onCheckedChange={(isChecked) => handleToggleService('bookReturnPage', isChecked)}
                                    disabled={isTogglingService || isReadOnly}
                                />
                              </div>
                          </div>
                      </div>
                  </section>
                </>
              )}

            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
