
'use client';

import React, { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '@/lib/firebase';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import Link from 'next/link';
import Image from 'next/image';
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
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';

interface UserData {
  activeAccountId: string | null;
  accounts: string[];
}

interface AccountData {
    integrations?: {
        couriers?: {
            delhivery?: {
                apiKey: string;
            }
        }
    }
}

export default function AppsSettingsPage() {
  const [user, loading] = useAuthState(auth);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [accountData, setAccountData] = useState<AccountData | null>(null);
  const [dataLoading, setDataLoading] = useState(true);
  const { toast } = useToast();

  const [delhiveryApiKey, setDelhiveryApiKey] = useState('');
  const [isEditingDelhivery, setIsEditingDelhivery] = useState(false);
  const [isSubmittingDelhivery, setIsSubmittingDelhivery] = useState(false);
  
  useEffect(() => {
    if (loading) return;

    const fetchInitialData = async () => {
        if (user) {
            const userRef = doc(db, 'users', user.uid);
            const userDoc = await getDoc(userRef);
            if (userDoc.exists()) {
                const fetchedUserData = userDoc.data() as UserData;
                setUserData(fetchedUserData);
                
                if (fetchedUserData.activeAccountId) {
                    const accountRef = doc(db, 'accounts', fetchedUserData.activeAccountId);
                    const accountDoc = await getDoc(accountRef);
                    if (accountDoc.exists()) {
                        setAccountData(accountDoc.data() as AccountData);
                    }
                }
            }
        }
        setDataLoading(false);
    };
    
    fetchInitialData();

    if (user && userData?.activeAccountId) {
        const accountRef = doc(db, 'accounts', userData.activeAccountId);
        const unsubscribe = onSnapshot(accountRef, (doc) => {
            if (doc.exists()) {
                setAccountData(doc.data() as AccountData);
            }
        });
        return () => unsubscribe();
    }

  }, [user, loading, userData?.activeAccountId]);

  const hasConnectedStore = userData?.activeAccountId;
  const hasDelhiveryKey = !!accountData?.integrations?.couriers?.delhivery?.apiKey;

  const handleDisconnect = () => {
    toast({
      title: "Store Disconnected",
      description: "Your Shopify store has been disconnected.",
    });
    setUserData(prev => prev ? { ...prev, activeAccountId: null } : null);
    setAccountData(null);
  };
  
  const handleSaveDelhiveryKey = async () => {
      if (!userData?.activeAccountId || !user || !delhiveryApiKey) {
          toast({ title: "API Key is required", variant: "destructive"});
          return;
      };

      setIsSubmittingDelhivery(true);
      try {
          const idToken = await user.getIdToken();
          const response = await fetch('/api/integrations/courier/update', {
              method: 'POST',
              headers: { 
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${idToken}`
              },
              body: JSON.stringify({
                  shop: userData.activeAccountId,
                  courierName: 'delhivery',
                  apiKey: delhiveryApiKey,
              })
          });

          const result = await response.json();
          if (!response.ok) throw new Error(result.details || 'Failed to save API key');

          toast({ title: 'API Key Saved', description: 'Delhivery integration has been updated.' });
          setIsEditingDelhivery(false);
          setDelhiveryApiKey('');

      } catch (error) {
          toast({ title: 'Save Failed', description: error instanceof Error ? error.message : 'An unknown error occurred.', variant: 'destructive' });
      } finally {
          setIsSubmittingDelhivery(false);
      }
  };

  return (
    <div className="flex justify-center items-start h-full p-4 md:p-6">
      <Card className="w-full max-w-4xl">
        <CardHeader>
          <CardTitle className="text-2xl font-headline">Apps & Integrations</CardTitle>
          <CardDescription>Manage your connected applications and courier service integrations.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-8">
            {/* Apps Section */}
            <section>
                <h2 className="text-lg font-semibold mb-4 text-primary">Connected Apps</h2>
                <div className="rounded-lg border p-6">
                    {dataLoading ? (
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                        <Skeleton className="w-16 h-16 rounded-md" />
                        <div className="space-y-2">
                            <Skeleton className="h-6 w-24" />
                            <Skeleton className="h-4 w-48" />
                        </div>
                        </div>
                        <div className="flex items-center gap-4">
                        <Skeleton className="h-6 w-20 rounded-full" />
                        <Skeleton className="h-10 w-28" />
                        </div>
                    </div>
                    ) : (
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <Image src="https://picsum.photos/64/64" alt="Shopify Logo" width={64} height={64} className="rounded-md" data-ai-hint="shopify logo" />
                        <div>
                            <h3 className="text-xl font-semibold">Shopify</h3>
                            <p className="text-sm text-muted-foreground">Sync your orders and products from Shopify.</p>
                        </div>
                        </div>
                        <div className="flex items-center gap-4">
                        {hasConnectedStore ? (
                            <>
                            <Badge variant="default">Connected</Badge>
                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                <Button variant="destructive">Disconnect</Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                    This will disconnect your Shopify store. You will need to reconnect to continue syncing orders.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={handleDisconnect}>
                                    Yes, Disconnect
                                    </AlertDialogAction>
                                </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                            </>
                        ) : (
                            <>
                            <Badge variant="secondary">Not Connected</Badge>
                            <Button asChild>
                                <Link href="/dashboard/connect">Connect</Link>
                            </Button>
                            </>
                        )}
                        </div>
                    </div>
                    )}
                </div>
            </section>

            <Separator />
            
            {/* Courier Integrations Section */}
            <section>
                 <h2 className="text-lg font-semibold mb-4 text-primary">Courier Services</h2>
                 <div className="rounded-lg border">
                    <div className="p-6 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div>
                                <h3 className="text-xl font-semibold">Delhivery</h3>
                                <p className="text-sm text-muted-foreground">Integrate with your Delhivery account.</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-4">
                            {hasDelhiveryKey && !isEditingDelhivery ? (
                                <>
                                    <Badge variant="default">Provided</Badge>
                                    <Button variant="outline" onClick={() => setIsEditingDelhivery(true)}>Change Key</Button>
                                </>
                            ) : (
                                <Badge variant="secondary">Not Integrated</Badge>
                            )}
                        </div>
                    </div>

                    {(isEditingDelhivery || !hasDelhiveryKey) && hasConnectedStore && (
                        <div className="border-t bg-muted/50 p-6">
                             <div className="flex items-end gap-4">
                                <div className="grid gap-1.5 flex-1">
                                    <label className="text-sm font-medium">Delhivery API Key</label>
                                    <Input 
                                        type="password"
                                        placeholder="Enter your API Key from Delhivery"
                                        value={delhiveryApiKey}
                                        onChange={(e) => setDelhiveryApiKey(e.target.value)}
                                        disabled={isSubmittingDelhivery}
                                    />
                                </div>
                                <div className="flex gap-2">
                                     {isEditingDelhivery && <Button variant="secondary" onClick={() => setIsEditingDelhivery(false)} disabled={isSubmittingDelhivery}>Cancel</Button>}
                                     <Button onClick={handleSaveDelhiveryKey} disabled={isSubmittingDelhivery}>
                                        {isSubmittingDelhivery ? 'Saving...' : 'Save Key'}
                                    </Button>
                                </div>
                             </div>
                        </div>
                    )}

                 </div>
            </section>

        </CardContent>
      </Card>
    </div>
  )
}
