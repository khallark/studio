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
import { auth } from '@/lib/firebase';

export default function Dashboard() {
  const [user, loading] = useAuthState(auth);

  return (
    <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-6">
      {user && !loading && (
        <div className="border rounded-lg p-4 mb-4 bg-card">
          <h2 className="text-lg font-semibold text-card-foreground">User Information</h2>
          <p className="text-sm text-muted-foreground">
            Welcome, {user.displayName || 'User'}!
          </p>
          <p className="text-sm text-muted-foreground">
            Email: {user.email}
          </p>
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total Revenue
            </CardTitle>
            <span className="text-muted-foreground">$</span>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">$0.00</div>
            <p className="text-xs text-muted-foreground">
              Connect your store to see data
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Sales</CardTitle>
            <span className="text-muted-foreground">📦</span>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0</div>
             <p className="text-xs text-muted-foreground">
              Connect your store to see data
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">New Customers</CardTitle>
             <span className="text-muted-foreground">😊</span>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">+0</div>
             <p className="text-xs text-muted-foreground">
              Connect your store to see data
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Orders</CardTitle>
             <span className="text-muted-foreground">🚚</span>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0</div>
             <p className="text-xs text-muted-foreground">
              Connect your store to see data
            </p>
          </CardContent>
        </Card>
      </div>
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
    </main>
  );
}
