'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle } from 'lucide-react';

type PageStatus = 'loading' | 'service_unavailable' | 'session_error' | 'ready' | 'invalid_store';

interface PageProps {
  params: { storeId: string };
}

export default function BookReturnPage({ params }: PageProps) {
  const { storeId } = params;
  const [status, setStatus] = useState<PageStatus>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [session, setSession] = useState<any | null>(null);

  useEffect(() => {
    if (!storeId) {
      setStatus('invalid_store');
      return;
    }

    const initializeSession = async () => {
      try {
        const response = await fetch('/api/public/book-return/start-session', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include', // Include cookies
          body: JSON.stringify({
            storeId: storeId,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          if (errorData.error === 'SERVICE_DISABLED') {
            setStatus('service_unavailable');
          } else {
            setErrorMessage(errorData.error || 'Failed to initialize session');
            setStatus('session_error');
          }
          return;
        }

        const sessionData = await response.json();
        setSession(sessionData);

        // Store CSRF token for future API calls
        if (typeof window !== 'undefined') {
          localStorage.setItem('csrfToken', sessionData.csrfToken);
        }
        setStatus('ready');

      } catch (error) {
        console.error('Session start error:', error);
        setErrorMessage(error instanceof Error ? error.message : 'An unknown error occurred.');
        setStatus('session_error');
      }
    };

    initializeSession();
  }, [storeId]);


  const renderContent = () => {
    switch (status) {
      case 'loading':
        return (
          <div className="flex flex-col items-center gap-2 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <h3 className="text-xl font-semibold">Initializing Secure Session...</h3>
            <p className="text-muted-foreground">Please wait a moment.</p>
          </div>
        );
      case 'invalid_store':
      case 'service_unavailable':
        return (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Service Not Available</AlertTitle>
            <AlertDescription>
              The return booking service is not available for this store. Please contact customer support for assistance.
            </AlertDescription>
          </Alert>
        );
      case 'session_error':
        return (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Session Error</AlertTitle>
            <AlertDescription>
              Could not start a secure session. Please try again later.
              {errorMessage && <p className="mt-2 text-xs">Details: {errorMessage}</p>}
            </AlertDescription>
          </Alert>
        );
      case 'ready':
        return (
          <div>
            <p className="text-center text-muted-foreground">
              Session is ready. The next steps for the return process will be shown here.
            </p>
          </div>
        );
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Book a Return</CardTitle>
          <CardDescription>Start the return process for your order.</CardDescription>
        </CardHeader>
        <CardContent>
          {renderContent()}
        </CardContent>
      </Card>
    </main>
  );
}
