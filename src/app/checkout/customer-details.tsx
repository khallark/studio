// app/checkout/customer-details.tsx
"use client";

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Edit, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';

interface Props {
    sessionId: string;
    phone: string;
}

export default function CustomerDetails({ sessionId, phone }: Props) {
    const [isEditing, setIsEditing] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    
    // The verified phone number from parent
    const [verifiedPhone, setVerifiedPhone] = useState('');
    
    // Form fields
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [address, setAddress] = useState('');
    
    const { toast } = useToast();

    // Store original values to revert on cancel
    const [originalValues, setOriginalValues] = useState({ name: '', email: '', address: '' });

    useEffect(() => {
        const fetchCustomerData = async () => {
            setIsLoading(true);
            try {
                const res = await fetch('/apps/checkout/customer');
                const data = await res.json();

                if (!res.ok) throw new Error(data.error || 'Failed to fetch details');
                
                setName(data.name || '');
                setEmail(data.email || '');
                setAddress(data.address || '');
                setVerifiedPhone(data.phone || '');

                setOriginalValues({ name: data.name || '', email: data.email || '', address: data.address || '' });

            } catch (err) {
                 toast({ 
                    title: "Error", 
                    description: err instanceof Error ? err.message : "Could not load your details.",
                    variant: "destructive"
                });
            } finally {
                setIsLoading(false);
            }
        };
        fetchCustomerData();
    }, [sessionId, toast]);

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const res = await fetch('/apps/checkout/customer', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, email, address }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to save details');
            
            toast({ title: "Details Updated", description: "Your shipping information has been saved."});
            setOriginalValues({ name, email, address });
            setIsEditing(false);
        } catch (err) {
            toast({ 
                title: "Save Failed", 
                description: err instanceof Error ? err.message : "An unknown error occurred.",
                variant: "destructive"
            });
        } finally {
            setIsSaving(false);
        }
    };
    
    const handleCancel = () => {
        setName(originalValues.name);
        setEmail(originalValues.email);
        setAddress(originalValues.address);
        setIsEditing(false);
    };
    
    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold">Shipping Details</h3>
                {!isEditing && !isLoading && (
                     <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
                        <Edit className="mr-2 h-4 w-4" />
                        Edit
                    </Button>
                )}
            </div>
            
            {isLoading ? (
                 <div className="space-y-2">
                    <Skeleton className="h-4 w-1/2" />
                    <Skeleton className="h-4 w-1/3" />
                    <Skeleton className="h-4 w-1/4" />
                    <Skeleton className="h-4 w-2/3" />
                </div>
            ) : isEditing ? (
                <Card>
                    <CardContent className="pt-6 space-y-4">
                        <div className="grid gap-2">
                            <Label htmlFor="name">Full Name</Label>
                            <Input id="name" value={name} onChange={e => setName(e.target.value)} disabled={isSaving} />
                        </div>
                         <div className="grid gap-2">
                            <Label htmlFor="email">Email</Label>
                            <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} disabled={isSaving} />
                        </div>
                         <div className="grid gap-2">
                            <Label htmlFor="address">Full Address</Label>
                            <Input id="address" value={address} onChange={e => setAddress(e.target.value)} disabled={isSaving} />
                        </div>
                        <div className="flex justify-end gap-2">
                            <Button variant="ghost" onClick={handleCancel} disabled={isSaving}>Cancel</Button>
                            <Button onClick={handleSave} disabled={isSaving}>
                                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Save
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            ) : (
                <div className="text-sm text-muted-foreground">
                    <p className="font-medium text-foreground">{name || 'No name provided'}</p>
                    <p>{email || 'No email provided'}</p>
                    <p>{verifiedPhone}</p>
                    <p>{address || 'No address provided'}</p>
                </div>
            )}
        </div>
    )
}
