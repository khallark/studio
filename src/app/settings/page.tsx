
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
import React, { useState } from 'react';
import { useToast } from '@/hooks/use-toast';

export default function SettingsPage() {
    const { toast } = useToast();

    // In a real app, this state would be populated from your database
    const [companyAddress, setCompanyAddress] = useState({
        address: '123 Market Street',
        pincode: '90210',
        city: 'Beverly Hills',
        state: 'California',
        country: 'USA'
    });

    const [primaryContact, setPrimaryContact] = useState({
        name: 'John Doe',
        phone: '+1 (555) 123-4567',
        email: 'john.doe@example.com'
    });

    const handleSave = () => {
        // In a real app, you would call an API to save this data.
        console.log('Saving data:', { companyAddress, primaryContact });
        toast({
            title: 'Settings Saved',
            description: 'Your changes have been successfully saved.',
        });
    }

  return (
    <div className="flex justify-center items-start h-full p-4 md:p-6">
      <Card className="w-full max-w-4xl">
         <CardHeader>
            <CardTitle className="text-2xl font-headline">Store Details</CardTitle>
            <CardDescription>Manage your company address and primary contact information.</CardDescription>
         </CardHeader>
         <CardContent>
            <div className="space-y-8">
                <section>
                    <h2 className="text-xl font-semibold mb-4">Company Address</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="md:col-span-2 grid gap-2">
                            <Label htmlFor="address">Address</Label>
                            <Input id="address" value={companyAddress.address} onChange={(e) => setCompanyAddress({...companyAddress, address: e.target.value})} />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="pincode">Pincode</Label>
                            <Input id="pincode" value={companyAddress.pincode} onChange={(e) => setCompanyAddress({...companyAddress, pincode: e.target.value})} />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="city">City</Label>
                            <Input id="city" value={companyAddress.city} onChange={(e) => setCompanyAddress({...companyAddress, city: e.target.value})} />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="state">State</Label>
                            <Input id="state" value={companyAddress.state} onChange={(e) => setCompanyAddress({...companyAddress, state: e.target.value})} />
                        </div>
                         <div className="grid gap-2">
                            <Label htmlFor="country">Country</Label>
                            <Input id="country" value={companyAddress.country} onChange={(e) => setCompanyAddress({...companyAddress, country: e.target.value})} />
                        </div>
                    </div>
                </section>
                
                <Separator />

                <section>
                    <h2 className="text-xl font-semibold mb-4">Primary Contact</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="grid gap-2">
                            <Label htmlFor="contact-name">Name</Label>
                            <Input id="contact-name" value={primaryContact.name} onChange={(e) => setPrimaryContact({...primaryContact, name: e.target.value})} />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="contact-phone">Phone no</Label>
                            <Input id="contact-phone" type="tel" value={primaryContact.phone} onChange={(e) => setPrimaryContact({...primaryContact, phone: e.target.value})} />
                        </div>
                         <div className="md:col-span-2 grid gap-2">
                            <Label htmlFor="contact-email">Email Id</Label>
                            <Input id="contact-email" type="email" value={primaryContact.email} onChange={(e) => setPrimaryContact({...primaryContact, email: e.target.value})} />
                        </div>
                    </div>
                </section>
            </div>
         </CardContent>
         <CardFooter className="border-t pt-6">
            <Button onClick={handleSave}>Save Changes</Button>
         </CardFooter>
      </Card>
    </div>
  )
}
