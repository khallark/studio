// app/checkout/customer-details.tsx
"use client";

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Edit } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Props {
    sessionId: string;
    phone: string;
}

export default function CustomerDetails({ sessionId, phone }: Props) {
    const [isEditing, setIsEditing] = useState(false);
    const [name, setName] = useState('John Doe');
    const [email, setEmail] = useState('john.doe@example.com');
    const [address, setAddress] = useState('123 Main St, Anytown, USA');
    const { toast } = useToast();

    // In a real app, you would fetch customer data based on sessionId or phone
    // useEffect(() => {
    //     const fetchCustomerData = async () => { ... };
    //     fetchCustomerData();
    // }, [sessionId, phone]);

    const handleSave = () => {
        // In a real app, you would have an API call here to save the details
        console.log("Saving data:", { name, email, address });
        toast({ title: "Details Updated", description: "Your shipping information has been saved."});
        setIsEditing(false);
    };
    
    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold">Shipping Details</h3>
                {!isEditing && (
                     <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
                        <Edit className="mr-2 h-4 w-4" />
                        Edit
                    </Button>
                )}
            </div>

            {isEditing ? (
                <Card>
                    <CardContent className="pt-6 space-y-4">
                        <div className="grid gap-2">
                            <Label htmlFor="name">Full Name</Label>
                            <Input id="name" value={name} onChange={e => setName(e.target.value)} />
                        </div>
                         <div className="grid gap-2">
                            <Label htmlFor="email">Email</Label>
                            <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} />
                        </div>
                         <div className="grid gap-2">
                            <Label htmlFor="address">Full Address</Label>
                            <Input id="address" value={address} onChange={e => setAddress(e.target.value)} />
                        </div>
                        <div className="flex justify-end gap-2">
                            <Button variant="ghost" onClick={() => setIsEditing(false)}>Cancel</Button>
                            <Button onClick={handleSave}>Save</Button>
                        </div>
                    </CardContent>
                </Card>
            ) : (
                <div className="text-sm text-muted-foreground">
                    <p className="font-medium text-foreground">{name}</p>
                    <p>{email}</p>
                    <p>{phone}</p>
                    <p>{address}</p>
                </div>
            )}
        </div>
    )
}
