
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
import { doc, getDoc } from 'firebase/firestore';
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

interface UserData {
  activeAccountId: string | null;
}

export default function AppsSettingsPage() {
  const [user, loading] = useAuthState(auth);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [dataLoading, setDataLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    const fetchUserData = async () => {
      if (user) {
        try {
          const userRef = doc(db, 'users', user.uid);
          const userDoc = await getDoc(userRef);
          if (userDoc.exists()) {
            setUserData(userDoc.data() as UserData);
          }
        } catch (error) {
          console.error("Error fetching user data:", error);
          toast({
            title: "Error",
            description: "Could not fetch user data.",
            variant: "destructive"
          });
        }
      }
      setDataLoading(false);
    };

    if (!loading) {
      fetchUserData();
    }
  }, [user, loading, toast]);

  const hasConnectedStore = userData?.activeAccountId;

  const handleDisconnect = () => {
    // In a real app, you would call an API endpoint to:
    // 1. Remove the account from the user's 'accounts' array in Firestore.
    // 2. Set user's 'activeAccountId' and 'primaryAccountId' to null if this was the only account.
    // 3. Delete the shop's access token from the 'accounts' collection in Firestore.
    // 4. Optionally call Shopify's API to revoke the access token.
    toast({
      title: "Store Disconnected",
      description: "Your Shopify store has been disconnected.",
    });
    // For this prototype, we'll just simulate the change on the client.
    setUserData({ activeAccountId: null });
  };

  return (
    <div className="flex justify-center items-start h-full p-4 md:p-6">
      <Card className="w-full max-w-4xl">
        <CardHeader>
          <CardTitle className="text-2xl font-headline">Apps</CardTitle>
          <CardDescription>Manage your connected applications and integrations.</CardDescription>
        </CardHeader>
        <CardContent>
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
                  {/* <Image src="https://picsum.photos/64/64" alt="Shopify Logo" width={64} height={64} className="rounded-md" data-ai-hint="shopify logo" /> */}
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
        </CardContent>
      </Card>
    </div>
  )
}
