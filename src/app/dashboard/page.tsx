
'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Zap } from 'lucide-react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';

interface UserData {
    activeAccountId: string | null;
}

export default function Dashboard() {
  const [user, loading] = useAuthState(auth);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    document.title = "Dashboard";
  })

  useEffect(() => {
    const fetchUserData = async () => {
      if (user) {
        const userRef = doc(db, 'users', user.uid);
        const userDoc = await getDoc(userRef);
        if (userDoc.exists()) {
          setUserData(userDoc.data() as UserData);
        }
      }
      setDataLoading(false);
    };

    if (!loading) {
      fetchUserData();
    }
  }, [user, loading]);

  const hasConnectedStore = !dataLoading && userData?.activeAccountId;

  return (
    <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-6">
       <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total Revenue
            </CardTitle>
            <span className="text-muted-foreground">$</span>
          </CardHeader>
          <CardContent>
            {hasConnectedStore ? (
               <div className="text-2xl font-bold">$45,231.89</div>
            ) : (
              <>
                <div className="text-2xl font-bold">$0.00</div>
                <p className="text-xs text-muted-foreground">
                  Connect your store to see data
                </p>
              </>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Sales</CardTitle>
            <span className="text-muted-foreground">📦</span>
          </CardHeader>
          <CardContent>
             {hasConnectedStore ? (
               <div className="text-2xl font-bold">+1,203</div>
             ) : (
                <>
                  <div className="text-2xl font-bold">0</div>
                  <p className="text-xs text-muted-foreground">
                    Connect your store to see data
                  </p>
                </>
             )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">New Customers</CardTitle>
             <span className="text-muted-foreground">😊</span>
          </CardHeader>
          <CardContent>
            {hasConnectedStore ? (
                <div className="text-2xl font-bold">+573</div>
            ) : (
                <>
                    <div className="text-2xl font-bold">+0</div>
                    <p className="text-xs text-muted-foreground">
                        Connect your store to see data
                    </p>
                </>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Orders</CardTitle>
             <span className="text-muted-foreground">🚚</span>
          </CardHeader>
          <CardContent>
            {hasConnectedStore ? (
                <div className="text-2xl font-bold">42</div>
            ) : (
                <>
                    <div className="text-2xl font-bold">0</div>
                    <p className="text-xs text-muted-foreground">
                        Connect your store to see data
                    </p>
                </>
            )}
          </CardContent>
        </Card>
      </div>
      
      {!hasConnectedStore && (
          <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm min-h-[400px]">
            <div className="flex flex-col items-center gap-2 text-center p-4">
                <div className="flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
                    <Zap className="h-10 w-10 text-primary" />
                </div>
                <h3 className="text-2xl font-bold tracking-tight font-headline">
                    Connect your Shopify store
                </h3>
                <p className="text-sm text-muted-foreground max-w-sm">
                    You have not connected any stores yet. Connect your store to start seeing your orders and analytics.
                </p>
                <Button className="mt-4" asChild>
                    <Link href="/dashboard/connect">Connect Store</Link>
                </Button>
            </div>
          </div>
      )}

      {hasConnectedStore && (
         <div className="flex flex-1 items-center justify-center rounded-lg border bg-card shadow-sm min-h-[400px]">
            <div className="flex flex-col items-center gap-2 text-center p-4">
                <h3 className="text-2xl font-bold tracking-tight font-headline">
                    Store Connected!
                </h3>
                <p className="text-sm text-muted-foreground max-w-sm">
                    Your store ({userData?.activeAccountId}) is connected. You can now view your orders and analytics.
                </p>
                 <Button className="mt-4" asChild>
                    <Link href="/dashboard/orders">View Orders</Link>
                </Button>
            </div>
         </div>
      )}

    </main>
  );
}
