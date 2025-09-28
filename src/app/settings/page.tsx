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
import React, { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '@/lib/firebase';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
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

interface AccountData {
  companyAddress?: CompanyAddress;
  primaryContact?: PrimaryContact;
  customerServices?: CustomerServices;
}

export default function SettingsPage() {
  const [user, userLoading] = useAuthState(auth);
  const { toast } = useToast();

  const [accountData, setAccountData] = useState<AccountData | null>(null);
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null);
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
  })

  // 1. Fetch User's Active Account ID
  useEffect(() => {
    const fetchUserData = async () => {
      if (user) {
        const userRef = doc(db, 'users', user.uid);
        const userDoc = await getDoc(userRef);
        if (userDoc.exists()) {
          setActiveAccountId(userDoc.data().activeAccountId || null);
        }
      }
    };
    if (!userLoading) {
      fetchUserData();
    }
  }, [user, userLoading]);
  
  // 2. Listen for real-time updates on the Account document
  useEffect(() => {
    if (!activeAccountId) {
        setLoading(false);
        return;
    }
    
    setLoading(true);
    const accountRef = doc(db, 'accounts', activeAccountId);
    const unsubscribe = onSnapshot(accountRef, (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data() as AccountData;
            setAccountData(data);
            setAddressForm(data.companyAddress || { address: '', pincode: '', city: '', state: '', country: '' });
            setContactForm(data.primaryContact || { name: '', phone: '', email: '' });
        } else {
            setAccountData(null);
        }
        setLoading(false);
    }, (error) => {
        console.error("Error fetching account data:", error);
        toast({ title: "Error", description: "Could not fetch store details.", variant: "destructive" });
        setLoading(false);
    });

    return () => unsubscribe();
  }, [activeAccountId, toast]);
  
  const hasAddress = !!accountData?.companyAddress;
  const hasContact = !!accountData?.primaryContact;

  const handleSaveAddress = async () => {
    if (!activeAccountId || !user) return;
    setIsSubmittingAddress(true);
    try {
        const idToken = await user.getIdToken();
        const response = await fetch('/api/shopify/account/update-address', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
            body: JSON.stringify({ shop: activeAccountId, address: addressForm }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.details || 'Failed to save address');
        toast({ title: 'Address Saved', description: 'Your company address has been updated.' });
        setIsEditingAddress(false);
    } catch (error) {
        toast({ title: 'Save Failed', description: error instanceof Error ? error.message : 'An unknown error occurred.', variant: 'destructive' });
    } finally {
        setIsSubmittingAddress(false);
    }
  };

  const handleSaveContact = async () => {
      if (!activeAccountId || !user) return;
      setIsSubmittingContact(true);
      try {
        const idToken = await user.getIdToken();
        const response = await fetch('/api/shopify/account/update-contact', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
            body: JSON.stringify({ shop: activeAccountId, contact: contactForm }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.details || 'Failed to save contact');
        toast({ title: 'Contact Saved', description: 'Your primary contact has been updated.' });
        setIsEditingContact(false);
    } catch (error) {
        toast({ title: 'Save Failed', description: error instanceof Error ? error.message : 'An unknown error occurred.', variant: 'destructive' });
    } finally {
        setIsSubmittingContact(false);
    }
  };
  
    const handleToggleService = async (serviceName: 'bookReturnPage', isEnabled: boolean) => {
        if (!activeAccountId || !user) return;
        setIsTogglingService(true);
        try {
            const idToken = await user.getIdToken();
            const response = await fetch('/api/shopify/account/toggle-service', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
                body: JSON.stringify({ shop: activeAccountId, serviceName, isEnabled }),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.details || 'Failed to toggle service');
            toast({
                title: 'Service Updated',
                description: `'Booking a return' page has been ${isEnabled ? 'enabled' : 'disabled'}.`
            });
        } catch (error) {
            toast({ title: 'Update Failed', description: error instanceof Error ? error.message : 'An unknown error occurred.', variant: 'destructive' });
        } finally {
            setIsTogglingService(false);
        }
  };

  
  const handleCancelEditAddress = () => {
      setAddressForm(accountData?.companyAddress || { address: '', pincode: '', city: '', state: '', country: '' });
      setIsEditingAddress(false);
  }

  const handleCancelEditContact = () => {
      setContactForm(accountData?.primaryContact || { name: '', phone: '', email: '' });
      setIsEditingContact(false);
  }

  if (loading) {
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
          {!activeAccountId ? (
            <div className="text-center py-10 text-muted-foreground">
              Please connect a Shopify store to manage its details.
            </div>
          ) : (
            <div className="space-y-8">
              {/* Company Address Section */}
              <section>
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-semibold">Company Address</h2>
                  {!isEditingAddress && (
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
                        <p>{accountData?.companyAddress?.address}</p>
                        <p>{accountData?.companyAddress?.city}, {accountData?.companyAddress?.state} {accountData?.companyAddress?.pincode}</p>
                        <p>{accountData?.companyAddress?.country}</p>
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
                    {!isEditingContact && (
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
                        <p className="font-medium text-foreground">{accountData?.primaryContact?.name}</p>
                        <p>{accountData?.primaryContact?.phone}</p>
                        <p>{accountData?.primaryContact?.email}</p>
                    </div>
                ) : (
                    <div className="text-center py-6 text-muted-foreground border-2 border-dashed rounded-lg">
                        No primary contact has been added yet.
                    </div>
                )}
              </section>
              
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
                                checked={accountData?.customerServices?.bookReturnPage?.enabled || false}
                                onCheckedChange={(isChecked) => handleToggleService('bookReturnPage', isChecked)}
                                disabled={isTogglingService}
                            />
                          </div>
                      </div>
                  </div>
              </section>

            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
