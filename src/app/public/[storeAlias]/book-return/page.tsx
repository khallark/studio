'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Terminal } from 'lucide-react';

type PageStatus = 'loading' | 'service_unavailable' | 'session_error' | 'ready' | 'invalid_alias';

interface SessionData {
  sessionId: string;
  csrfToken: string;
  storeAlias: string;
  expiresAt: string;
}

export default function BookReturnPage() {
  const params = useParams();
  const storeAlias = params.storeAlias as string;

  const [status, setStatus] = useState<PageStatus>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [session, setSession] = useState<SessionData | null>(null);

  useEffect(() => {
    if (!storeAlias) {
      setStatus('invalid_alias');
      setErrorMessage('No store alias provided in the URL.');
      return;
    }

    const initializeSession = async () => {
      try {
        setStatus('loading');
        
        const response = await fetch('/api/public/book-return/start-session', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include', // Important for cookies
          body: JSON.stringify({ storeAlias }),
        });

        const data = await response.json();

        if (!response.ok) {
          if (response.status === 404) {
              setStatus('invalid_alias');
              setErrorMessage(data.error || 'The store you are looking for does not exist.');
          } else if (response.status === 403) {
              setStatus('service_unavailable');
              setErrorMessage(data.error || 'This service is not available for this store.');
          } else {
              throw new Error(data.error || 'Failed to initialize session');
          }
          return;
        }

        setSession(data);
        localStorage.setItem('csrfToken', data.csrfToken);
        setStatus('ready');

      } catch (error) {
        console.error('Session initialization failed:', error);
        setStatus('session_error');
        setErrorMessage(error instanceof Error ? error.message : 'An unknown error occurred.');
      }
    };

    initializeSession();
    
    // Cleanup csrfToken on component unmount
    return () => {
        localStorage.removeItem('csrfToken');
    };

  }, [storeAlias]);

  const renderContent = () => {
    switch (status) {
      case 'loading':
        return (
          <div className="flex flex-col items-center justify-center text-center gap-2">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-muted-foreground">Initializing secure session...</p>
          </div>
        );
      case 'invalid_alias':
      case 'service_unavailable':
      case 'session_error':
        return (
          <Alert variant="destructive">
            <Terminal className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        );
      case 'ready':
        return (
          <div>
            <h2 className="text-xl font-semibold text-center">Start Your Return</h2>
            <p className="text-muted-foreground text-center mt-2">
              Please enter your order details below to begin the return process.
            </p>
            {/* The next part of the form will go here */}
            <div className="mt-6 p-8 border-2 border-dashed rounded-lg text-center text-muted-foreground">
                Order details form coming soon...
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-secondary/50 p-4">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle className="text-center font-headline text-3xl">Book a Return</CardTitle>
          <CardDescription className="text-center">
            Start the return process for your order from {storeAlias}.
          </CardDescription>
        </CardHeader>
        <CardContent className="min-h-[200px] flex items-center justify-center">
          {renderContent()}
        </CardContent>
      </Card>
    </div>
  );
}
