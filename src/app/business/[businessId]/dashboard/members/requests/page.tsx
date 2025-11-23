'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { Check, X, Mail, User, Calendar, ShieldAlert } from 'lucide-react';
import { useBusinessContext } from '../../../layout';
import { collection, onSnapshot, query, where, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useRouter } from 'next/navigation';

const SUPER_ADMIN_ID = process.env.NEXT_PUBLIC_SUPER_ADMIN_ID!;

interface JoinRequest {
    id: string;
    userId: string;
    email: string;
    requestedVendorName: string | null;
    displayName: string;
    photoURL: string | null;
    requestedAt: any;
    status: 'pending' | 'accepted' | 'declined';
    message?: string;
}

export default function JoinRequestsPage() {
    const { user, businessId, isAuthorized, loading: authLoading } = useBusinessContext();
    const { toast } = useToast();
    const router = useRouter();

    const [requests, setRequests] = useState<JoinRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());

    useEffect(() => {
        document.title = "Join Requests";
    }, []);

    useEffect(() => {
        if (!authLoading && isAuthorized && businessId) {
            // Check if user is super admin
            if (businessId !== SUPER_ADMIN_ID) {
                setLoading(false);
                return;
            }

            setLoading(true);

            const requestsRef = collection(db, 'users', businessId, 'join-requests');
            const q = query(
                requestsRef,
                where('status', '==', 'pending'),
                orderBy('requestedAt', 'desc')
            );

            const unsubscribe = onSnapshot(
                q,
                (snapshot) => {
                    const fetchedRequests = snapshot.docs.map(doc => ({
                        id: doc.id,
                        ...doc.data()
                    } as JoinRequest));
                    setRequests(fetchedRequests);
                    setLoading(false);
                },
                (error) => {
                    console.error("Error fetching requests:", error);
                    toast({
                        title: "Error fetching requests",
                        description: "Could not retrieve join requests.",
                        variant: "destructive",
                    });
                    setLoading(false);
                }
            );

            return () => unsubscribe();
        } else if (!authLoading && !isAuthorized) {
            setLoading(false);
        }
    }, [businessId, isAuthorized, authLoading, toast]);

    const handleAccept = async (requestId: string, requestUserId: string) => {
        if (!user) return;

        setProcessingIds(prev => new Set(prev).add(requestId));

        try {
            const idToken = await user.getIdToken();
            const response = await fetch('/api/business/members/accept-request', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`
                },
                body: JSON.stringify({ businessId, requestId, requestUserId })
            });

            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.error || 'Failed to accept request');
            }

            toast({
                title: "Request Accepted",
                description: "The user has been added to your business.",
            });
        } catch (error) {
            toast({
                title: "Accept Failed",
                description: error instanceof Error ? error.message : 'An unknown error occurred.',
                variant: "destructive"
            });
        } finally {
            setProcessingIds(prev => {
                const next = new Set(prev);
                next.delete(requestId);
                return next;
            });
        }
    };

    const handleDecline = async (requestId: string) => {
        if (!user) return;

        setProcessingIds(prev => new Set(prev).add(requestId));

        try {
            const idToken = await user.getIdToken();
            const response = await fetch('/api/business/members/decline-request', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`
                },
                body: JSON.stringify({ businessId, requestId })
            });

            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.error || 'Failed to decline request');
            }

            toast({
                title: "Request Declined",
                description: "The join request has been declined.",
            });
        } catch (error) {
            toast({
                title: "Decline Failed",
                description: error instanceof Error ? error.message : 'An unknown error occurred.',
                variant: "destructive"
            });
        } finally {
            setProcessingIds(prev => {
                const next = new Set(prev);
                next.delete(requestId);
                return next;
            });
        }
    };

    const getInitials = (name?: string, email?: string) => {
        if (name) {
            return name.split(' ').map(n => n[0]).join('').toUpperCase();
        }
        if (email) {
            return email.charAt(0).toUpperCase();
        }
        return 'U';
    };

    const formatDate = (timestamp: any) => {
        if (!timestamp) return 'Unknown';
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        return new Intl.DateTimeFormat('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        }).format(date);
    };

    if (authLoading) {
        return (
            <div className="flex items-center justify-center h-screen">
                <div className="text-lg">Loading...</div>
            </div>
        );
    }

    if (!isAuthorized) {
        return null;
    }

    // Check if user is super admin
    if (businessId !== SUPER_ADMIN_ID) {
        return (
            <div className="flex flex-col items-center justify-center h-screen">
                <div className="text-center space-y-4">
                    <ShieldAlert className="mx-auto h-16 w-16 text-destructive" />
                    <h1 className="text-4xl font-bold text-gray-700">Access Denied</h1>
                    <p className="text-muted-foreground max-w-md">
                        You don't have permission to view join requests. This page is only accessible to super administrators.
                    </p>
                    <Button onClick={() => router.push(`/business/${businessId}/dashboard/orders`)}>
                        Go to Dashboard
                    </Button>
                </div>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="flex flex-col p-4 md:p-6 gap-4 max-w-4xl mx-auto">
                <Skeleton className="h-8 w-48" />
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
            </div>
        );
    }

    return (
        <main className="flex flex-1 flex-col p-4 md:p-6">
            <div className="max-w-4xl mx-auto w-full space-y-6">
                <div>
                    <h1 className="text-3xl font-bold">Join Requests</h1>
                    <p className="text-muted-foreground mt-1">
                        Review and manage pending requests to join your business.
                    </p>
                </div>

                {requests.length === 0 ? (
                    <Card>
                        <CardContent className="pt-6">
                            <div className="text-center py-12">
                                <User className="mx-auto h-12 w-12 text-muted-foreground" />
                                <h3 className="mt-4 text-lg font-semibold">No pending requests</h3>
                                <p className="text-sm text-muted-foreground mt-1">
                                    There are no join requests at this time.
                                </p>
                            </div>
                        </CardContent>
                    </Card>
                ) : (
                    <div className="space-y-4">
                        {requests.map((request) => {
                            const isProcessing = processingIds.has(request.id);

                            return (
                                <Card key={request.id}>
                                    <CardContent className="p-6">
                                        <div className="flex items-start gap-4">
                                            <Avatar className="h-12 w-12">
                                                <AvatarImage src={request.photoURL || undefined} />
                                                <AvatarFallback>
                                                    {getInitials(request.displayName, request.email)}
                                                </AvatarFallback>
                                            </Avatar>

                                            <div className="flex-1 space-y-2">
                                                <div>
                                                    <h3 className="font-semibold text-lg">
                                                        {request.displayName || 'Unknown User'}
                                                    </h3>
                                                    <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                                                        <Mail className="h-4 w-4" />
                                                        <span>{request.email}</span>
                                                    </div>
                                                    <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                                                        <Calendar className="h-4 w-4" />
                                                        <span>Requested {formatDate(request.requestedAt)}</span>
                                                    </div>
                                                    {request.requestedVendorName && (
                                                        <div className="mt-2">
                                                            <Badge variant="secondary">
                                                                Vendor: {request.requestedVendorName}
                                                            </Badge>
                                                        </div>
                                                    )}
                                                </div>

                                                {request.message && (
                                                    <div className="p-3 bg-muted rounded-md">
                                                        <p className="text-sm">{request.message}</p>
                                                    </div>
                                                )}
                                            </div>

                                            <div className="flex gap-2">
                                                <Button
                                                    size="sm"
                                                    variant="default"
                                                    onClick={() => handleAccept(request.id, request.userId)}
                                                    disabled={isProcessing}
                                                >
                                                    <Check className="h-4 w-4 mr-2" />
                                                    Accept
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => handleDecline(request.id)}
                                                    disabled={isProcessing}
                                                >
                                                    <X className="h-4 w-4 mr-2" />
                                                    Decline
                                                </Button>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            );
                        })}
                    </div>
                )}
            </div>
        </main>
    );
}