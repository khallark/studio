'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

export default function ConnectStorePage() {
  const [storeName, setStoreName] = useState('');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeName) {
      toast({
        title: 'Store name required',
        description: 'Please enter your Shopify store name.',
        variant: 'destructive',
      });
      return;
    }
    setLoading(true);
    // Here you would typically initiate the OAuth flow with Shopify
    // For now, we'll just simulate a loading state
    console.log(`Connecting to ${storeName}.myshopify.com`);

    setTimeout(() => {
      setLoading(false);
      toast({
        title: 'Connection in progress',
        description: 'You will be redirected to Shopify to complete the connection.',
      });
    }, 2000);
  };

  return (
    <main className="flex flex-1 flex-col items-center justify-center p-4 md:p-6">
      <Card className="w-full max-w-md">
        <form onSubmit={handleConnect}>
          <CardHeader>
            <CardTitle>Connect to Shopify</CardTitle>
            <CardDescription>
              Enter your store name to begin the connection process.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="store-name">Store Name</Label>
                <div className="flex items-center">
                  <Input
                    id="store-name"
                    placeholder="your-store"
                    value={storeName}
                    onChange={(e) => setStoreName(e.target.value)}
                    required
                    disabled={loading}
                    className="rounded-r-none"
                  />
                  <span className="flex h-10 items-center rounded-r-md border border-l-0 border-input bg-muted px-3 text-sm text-muted-foreground">
                    .myshopify.com
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
          <CardFooter>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Connecting...' : 'Connect to Shopify'}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </main>
  );
}
