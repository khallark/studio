
'use client';

import React, { useState, useEffect } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '@/lib/firebase';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { MessageCircle, Settings } from 'lucide-react';

interface UserData {
  activeAccountId: string | null;
}

interface AccountData {
    integrations?: {
        communication?: {
          interakt?: {
            apiKey?: string;
            webhookKey?: string;
          }
        }
    }
}

export default function InteraktPage() {
  const [user, userLoading] = useAuthState(auth);
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null);
  const [accountData, setAccountData] = useState<AccountData | null>(null);
  const [loading, setLoading] = useState(true);

  // 1. Fetch User's Active Account ID
  useEffect(() => {
    if (userLoading) return;
    const fetchUserData = async () => {
      if (user) {
        const userRef = doc(db, 'users', user.uid);
        const userDoc = await getDoc(userRef);
        if (userDoc.exists()) {
          setActiveAccountId(userDoc.data().activeAccountId || null);
        }
      }
    };
    fetchUserData();
  }, [user, userLoading]);

  // 2. Listen for real-time updates on the Account document
  useEffect(() => {
    if (activeAccountId === null && !userLoading) {
      setLoading(false);
      return;
    }
    if (!activeAccountId) return;
    
    setLoading(true);
    const accountRef = doc(db, 'accounts', activeAccountId);
    const unsubscribe = onSnapshot(accountRef, (docSnap) => {
        if (docSnap.exists()) {
            setAccountData(docSnap.data() as AccountData);
        } else {
            setAccountData(null);
        }
        setLoading(false);
    }, (error) => {
        console.error("Error fetching account data:", error);
        setLoading(false);
    });

    return () => unsubscribe();
  }, [activeAccountId, userLoading]);

  const isInteraktConnected = !!accountData?.integrations?.communication?.interakt?.apiKey && !!accountData?.integrations?.communication?.interakt?.webhookKey;

  const renderContent = () => {
    if (loading || userLoading) {
      return (
        <Card className="w-full max-w-4xl">
            <CardHeader>
                <Skeleton className="h-8 w-48" />
                <Skeleton className="h-4 w-72" />
            </CardHeader>
            <CardContent>
                <Skeleton className="h-40 w-full" />
            </CardContent>
        </Card>
      );
    }

    if (!activeAccountId) {
         return (
             <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm min-h-[400px]">
                <div className="flex flex-col items-center gap-2 text-center p-4">
                    <h3 className="text-2xl font-bold tracking-tight">
                        No store connected
                    </h3>
                    <p className="text-sm text-muted-foreground">
                        Please connect a Shopify store to use the Interakt integration.
                    </p>
                </div>
            </div>
        )
    }

    if (!isInteraktConnected) {
      return (
        <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm min-h-[400px]">
            <div className="flex flex-col items-center gap-2 text-center p-4">
                <div className="flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
                    <MessageCircle className="h-10 w-10 text-primary" />
                </div>
                <h3 className="text-2xl font-bold tracking-tight font-headline">
                    Connect Interakt
                </h3>
                <p className="text-sm text-muted-foreground max-w-sm">
                    To get started, you need to add your Interakt API and Webhook Secret Keys in the settings.
                </p>
                <Button className="mt-4" asChild>
                    <Link href="/settings/apps">
                        <Settings className="mr-2 h-4 w-4"/>
                        Go to Settings
                    </Link>
                </Button>
            </div>
        </div>
      );
    }

    // Main content when Interakt is connected
    return (
      <Card className="w-full max-w-4xl">
        <CardHeader>
          <CardTitle>Interakt Dashboard</CardTitle>
          <CardDescription>Manage your WhatsApp communications.</CardDescription>
        </CardHeader>
        <CardContent>
          <p>Your Interakt integration is connected!</p>
          {/* Future Interakt features will go here */}
        </CardContent>
      </Card>
    );
  };

  return (
    <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-6 items-center justify-center">
      {renderContent()}
    </main>
  );
}
