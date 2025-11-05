// src/app/store/[storeId]/dashboard/page.tsx
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
import React, { useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useStoreAuthorization } from '@/hooks/use-store-authorization';

export default function Dashboard() {
  const params = useParams();
  const nonPrefixedStoreId = params?.storeId as string;
  const { isAuthorized, memberRole, loading: authLoading, user, storeId } = useStoreAuthorization(nonPrefixedStoreId);

  useEffect(() => {
    document.title = "Dashboard";
  }, [])

  // Show loading while checking authorization
  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  // If not authorized, hook handles redirect
  if (!isAuthorized) {
    return null;
  }

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
            <div className="text-2xl font-bold">$45,231.89</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Sales</CardTitle>
            <span className="text-muted-foreground">📦</span>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">+1,203</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">New Customers</CardTitle>
            <span className="text-muted-foreground">😊</span>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">+573</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Orders</CardTitle>
            <span className="text-muted-foreground">🚚</span>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">42</div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-1 items-center justify-center rounded-lg border bg-card shadow-sm min-h-[400px]">
        <div className="flex flex-col items-center gap-2 text-center p-4">
          <h3 className="text-2xl font-bold tracking-tight font-headline">
            Store Dashboard
          </h3>
          <p className="text-sm text-muted-foreground max-w-sm">
            You are viewing data for store: {storeId}
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            Role: {memberRole}
          </p>
          <Button className="mt-4" asChild>
            <Link href={`/store/${storeId}/dashboard/orders`}>View Orders</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}