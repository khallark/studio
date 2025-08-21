
'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
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
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '@/lib/firebase';
import Cookies from 'js-cookie';

export default function ConnectStorePage() {
  const [storeName, setStoreName] = useState('');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const [user] = useAuthState(auth);

  useEffect(() => {
    // Store user UID in a cookie to be accessed by the server-side callback
    if (user) {
      Cookies.set('user_uid', user.uid, { expires: 1 }); // Expires in 1 day
    }
  }, [user]);

  useEffect(() => {
    const error = searchParams.get('error');
    if (error) {
      let title = 'Connection Failed';
      let description = 'An unknown error occurred. Please try again.';
      if (error === 'invalid_callback') {
        description = 'The callback from Shopify was invalid. Please try reconnecting.';
      } else if (error === 'token_exchange_failed') {
        description = 'Could not verify the connection with Shopify. Please ensure your store name is correct and try again.';
      } else if (error === 'internal_error') {
        description = 'An internal error occurred. Please try again later.';
      } else if (error === 'config_error') {
          description = 'Server configuration error. Please contact support.'
      }

      toast({
        title,
        description,
        variant: 'destructive',
      });
    }
  }, [searchParams, toast]);

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

    try {
      const response = await fetch('/api/shopify/auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ shop: storeName }),
      });

      if (!response.ok) {
          throw new Error('Failed to initiate authorization');
      }

      const { redirectUrl } = await response.json();
      // Redirect the user to the Shopify authorization URL
      window.location.href = redirectUrl;

    } catch (error) {
        console.error('Connection error:', error);
        toast({
            title: 'Connection Error',
            description: 'Could not connect to the server. Please try again.',
            variant: 'destructive',
        });
        setLoading(false);
    }
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
                    onChange={(e) => setStoreName(e.target.value.replace(/\s+/g, '-'))}
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
              {loading ? 'Redirecting to Shopify...' : 'Connect to Shopify'}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </main>
  );
}
