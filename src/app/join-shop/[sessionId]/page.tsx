
'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { auth, db } from '@/lib/firebase';
import { useAuthState } from 'react-firebase-hooks/auth';
import { doc, getDoc } from 'firebase/firestore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Check, UserPlus, XCircle, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Logo } from '@/components/logo';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

type SessionData = {
  shopId: string;
  shopName: string;
  role: 'Admin' | 'Staff' | 'Vendor';
  permissions: Record<string, any>;
  expiresAt: { toDate: () => Date };
  createdBy: string;
  used: boolean;
};

type PageStatus = 'loading' | 'valid' | 'invalid' | 'expired' | 'used' | 'error' | 'joining' | 'joined';

export default function JoinShopPage() {
  const { sessionId } = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const [user, loadingAuth] = useAuthState(auth);

  const [status, setStatus] = useState<PageStatus>('loading');
  const [sessionData, setSessionData] = useState<SessionData | null>(null);

  useEffect(() => {
    document.title = "Join Shop";

    if (!sessionId) {
      setStatus('invalid');
      return;
    }

    const fetchSession = async () => {
      try {
        const sessionRef = doc(db, 'join-a-shop', Array.isArray(sessionId) ? sessionId[0] : sessionId);
        const sessionDoc = await getDoc(sessionRef);

        if (!sessionDoc.exists()) {
          setStatus('invalid');
          return;
        }

        const data = sessionDoc.data() as SessionData;

        if (data.used) {
          setStatus('used');
          return;
        }

        if (data.expiresAt.toDate() < new Date()) {
          setStatus('expired');
          return;
        }
        
        setSessionData(data);
        setStatus('valid');
      } catch (err) {
        console.error("Error fetching session:", err);
        setStatus('error');
      }
    };

    fetchSession();
  }, [sessionId]);
  
  const handleJoin = async () => {
    if (!user) {
        toast({
            title: "Please Sign In",
            description: "You need to be logged in to join a shop.",
            variant: "destructive"
        });
        // Optional: Redirect to login with a callback URL
        // router.push(`/login?redirect=/join-shop/${sessionId}`);
        return;
    }
    
    if (!sessionData) {
        toast({ title: "Session Error", description: "Invalid session data.", variant: "destructive" });
        return;
    }
    
    setStatus('joining');

    try {
        const idToken = await user.getIdToken();
        const response = await fetch('/api/shops/members/join', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
            body: JSON.stringify({ sessionId: Array.isArray(sessionId) ? sessionId[0] : sessionId })
        });
        
        const result = await response.json();
        if(!response.ok) {
            throw new Error(result.error || "Failed to join shop.");
        }
        
        setStatus('joined');
        toast({ title: "Successfully Joined!", description: `You are now a ${sessionData.role} of ${sessionData.shopName}.` });
        
        // Redirect to dashboard after a delay
        setTimeout(() => {
            router.push('/dashboard');
        }, 3000);

    } catch (error) {
        console.error("Error joining shop:", error);
        toast({ title: "Join Failed", description: error instanceof Error ? error.message : "An unknown error occurred.", variant: "destructive" });
        setStatus('valid'); // Revert to valid status to allow retry
    }
  }

  const renderContent = () => {
    switch (status) {
      case 'loading':
      case 'joining':
        return (
          <>
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            <CardTitle className="mt-6 text-2xl">
              {status === 'loading' ? 'Verifying Invitation...' : 'Joining Shop...'}
            </CardTitle>
            <CardDescription>Please wait a moment.</CardDescription>
          </>
        );
      case 'joined':
        return (
          <>
            <Check className="h-12 w-12 text-green-500" />
            <CardTitle className="mt-6 text-2xl">Welcome Aboard!</CardTitle>
            <CardDescription>You have successfully joined the shop. Redirecting you to the dashboard...</CardDescription>
          </>
        );
      case 'invalid':
      case 'expired':
      case 'used':
      case 'error':
        return (
          <>
            <XCircle className="h-12 w-12 text-destructive" />
            <CardTitle className="mt-6 text-2xl">Invitation Invalid</CardTitle>
            <CardDescription>
              {status === 'invalid' && 'This invitation link is not valid.'}
              {status === 'expired' && 'This invitation link has expired.'}
              {status === 'used' && 'This invitation link has already been used.'}
              {status === 'error' && 'An error occurred while verifying the invitation.'}
              <br />
              Please request a new link from the shop owner.
            </CardDescription>
            <Button onClick={() => router.push('/')} className="mt-6">Go to Homepage</Button>
          </>
        );
      case 'valid':
        if (!sessionData) return null;
        return (
          <>
            <CardHeader className="items-center text-center">
                <UserPlus className="h-12 w-12 text-primary mb-4" />
                <CardTitle>You're Invited!</CardTitle>
                <CardDescription>You have been invited to join the shop <span className="font-bold text-foreground">{sessionData.shopName}</span>.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="p-4 border rounded-lg space-y-4">
                    <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Your Role:</span>
                        <Badge>{sessionData.role}</Badge>
                    </div>
                    <div>
                        <span className="text-muted-foreground text-sm">Permissions:</span>
                        <ul className="list-disc list-inside mt-1 text-sm pl-2">
                           {sessionData.role === 'Admin' ? (
                            <>
                                <li>{sessionData.permissions.canManageMembers ? 'Can manage members' : 'Cannot manage members'}</li>
                                <li>{sessionData.permissions.canChangeSettings ? 'Can change shop settings' : 'Read-only access to settings'}</li>
                            </>
                           ) : (
                               <li>Can view orders with status: {sessionData.permissions.viewableStatuses?.join(', ') || 'None'}</li>
                           )}
                           <li>Full dashboard access based on the permissions above.</li>
                        </ul>
                    </div>
                </div>
                 <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Important</AlertTitle>
                    <AlertDescription>
                        By accepting this invitation, your user account will be associated with this shop.
                    </AlertDescription>
                </Alert>
                <Button onClick={handleJoin} className="w-full" disabled={loadingAuth}>
                    {loadingAuth ? <Loader2 className="animate-spin mr-2" /> : <Check className="mr-2 h-4 w-4" />}
                    Accept Invitation & Join Shop
                </Button>
                {!user && <p className="text-center text-sm text-muted-foreground">Please <a href="/login" className="underline">log in</a> or <a href="/signup" className="underline">sign up</a> to accept.</p>}
            </CardContent>
          </>
        );
    }
  };

  return (
    <main className="flex flex-1 flex-col items-center justify-center min-h-screen bg-muted/40 p-4">
      <Card className="w-full max-w-md">
        <div className="p-8 flex flex-col items-center text-center">
            <Logo className="mb-8" />
            {renderContent()}
        </div>
      </Card>
    </main>
  );
}
