'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '@/lib/firebase';
import { useRouter } from 'next/navigation';
import { Loader2, Building2 } from 'lucide-react';
import { Logo } from '@/components/logo';

export default function RequestJoinPage() {
    const [user, loadingAuth] = useAuthState(auth);
    const { toast } = useToast();
    const router = useRouter();

    const [vendorName, setVendorName] = useState('');
    const [message, setMessage] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Redirect to login if user is not logged in
    useEffect(() => {
        if (!loadingAuth && !user) {
            router.push('/login?redirect=/join-majime');
        }
    }, [loadingAuth, user, router]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!user) {
            toast({
                title: "Please Sign In",
                description: "You need to be logged in to request to join.",
                variant: "destructive"
            });
            router.push(`/login?redirect=/request-join`);
            return;
        }

        if (!vendorName.trim()) {
            toast({
                title: "Vendor Name Required",
                description: "Please enter your vendor/business name.",
                variant: "destructive"
            });
            return;
        }

        setIsSubmitting(true);

        try {
            const idToken = await user.getIdToken();
            const response = await fetch('/api/business/members/request-join', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`
                },
                body: JSON.stringify({ vendorName: vendorName.trim(), message: message.trim() })
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Failed to send join request');
            }

            toast({
                title: "Request Sent Successfully!",
                description: result.message || "Your request has been sent to MAJIME. You'll be notified once it's reviewed.",
            });

            // Clear form
            setVendorName('');
            setMessage('');

            // Redirect after a delay
            setTimeout(() => {
                router.push('/');
            }, 2000);

        } catch (error) {
            toast({
                title: "Request Failed",
                description: error instanceof Error ? error.message : 'An unknown error occurred.',
                variant: "destructive"
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    // Show loading state while checking auth
    if (loadingAuth) {
        return (
            <main className="flex flex-1 flex-col items-center justify-center min-h-screen bg-muted/40 p-4">
                <Card className="w-full max-w-lg">
                    <div className="p-8 flex flex-col items-center text-center">
                        <Logo className="mb-8" />
                        <Loader2 className="h-12 w-12 animate-spin text-primary" />
                        <CardTitle className="mt-6 text-2xl">Loading...</CardTitle>
                        <CardDescription>Please wait a moment.</CardDescription>
                    </div>
                </Card>
            </main>
        );
    }

    // Don't render form if user is not logged in (will redirect)
    if (!user) {
        return null;
    }

    return (
        <main className="flex flex-1 flex-col items-center justify-center min-h-screen bg-muted/40 p-4">
            <Card className="w-full max-w-lg">
                <CardHeader className="text-center space-y-4">
                    <div className="flex justify-center">
                        <Logo />
                    </div>
                    <div className="flex justify-center">
                        <Building2 className="h-12 w-12 text-primary" />
                    </div>
                    <CardTitle className="text-2xl">Request to Join MAJIME</CardTitle>
                    <CardDescription>
                        Fill out the form below to request access to MAJIME's business platform.
                        Our team will review your request and get back to you.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="space-y-2">
                            <Label htmlFor="vendorName">
                                Vendor/Business Name <span className="text-destructive">*</span>
                            </Label>
                            <Input
                                id="vendorName"
                                placeholder="e.g., ABC Suppliers"
                                value={vendorName}
                                onChange={(e) => setVendorName(e.target.value)}
                                required
                                disabled={isSubmitting}
                            />
                            <p className="text-xs text-muted-foreground">
                                Enter your company or business name
                            </p>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="message">Message (Optional)</Label>
                            <Textarea
                                id="message"
                                placeholder="Tell us about your business and why you'd like to join..."
                                value={message}
                                onChange={(e) => setMessage(e.target.value)}
                                rows={5}
                                disabled={isSubmitting}
                            />
                            <p className="text-xs text-muted-foreground">
                                Add any additional information that might help your request
                            </p>
                        </div>

                        <Button
                            type="submit"
                            className="w-full"
                            disabled={isSubmitting || !vendorName.trim()}
                        >
                            {isSubmitting ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Sending Request...
                                </>
                            ) : (
                                'Request to Join MAJIME'
                            )}
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </main>
    );
}