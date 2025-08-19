'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Logo } from '@/components/logo';
import { auth } from '@/lib/firebase';
import { 
  isSignInWithEmailLink, 
  signInWithEmailLink,
  updatePassword,
  AuthError
} from 'firebase/auth';
import { useToast } from '@/hooks/use-toast';

export default function VerifyPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [verificationSuccess, setVerificationSuccess] = useState(false);

  useEffect(() => {
    const verifyEmailLink = async () => {
      if (isSignInWithEmailLink(auth, window.location.href)) {
        setLoading(true);
        let emailFromStorage = window.localStorage.getItem('emailForSignIn');
        if (!emailFromStorage) {
          // User opened the link on a different device. To prevent session fixation
          // attacks, ask the user to provide the email again. For simplicity,
          // we'll show an error here. A real app might have a form for this.
          toast({
            title: 'Error',
            description: 'Verification failed. Please try signing up again from the same device.',
            variant: 'destructive',
          });
          setError('Could not find email for verification. Please sign up again.');
          setLoading(false);
          return;
        }
        setEmail(emailFromStorage);
        
        try {
          const result = await signInWithEmailLink(auth, emailFromStorage, window.location.href);
          window.localStorage.removeItem('emailForSignIn');
          if (result.user) {
            setVerificationSuccess(true);
            toast({
              title: 'Email Verified!',
              description: 'Your email has been successfully verified. Please set your password.',
            });
          }
        } catch (err) {
          const authError = err as AuthError;
          setError(authError.message);
          toast({ title: 'Error', description: authError.message, variant: 'destructive' });
        } finally {
          setLoading(false);
        }
      } else {
        // If the page is accessed directly without the link, check storage
        const emailFromStorage = window.localStorage.getItem('emailForSignIn');
        if(emailFromStorage) {
            setEmail(emailFromStorage);
        }
      }
    };
    verifyEmailLink();
  }, [toast]);

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }
    if (!auth.currentUser) {
        setError("You are not signed in. Please verify your email first.");
        return;
    }

    setLoading(true);
    setError(null);

    try {
      await updatePassword(auth.currentUser, password);
      toast({
        title: 'Success!',
        description: 'Your password has been set and you are now signed up.',
      });
      router.push('/');
    } catch (err) {
      const authError = err as AuthError;
      setError(authError.message);
      toast({ title: 'Error', description: authError.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };
  
  if (loading && !verificationSuccess) {
    return (
       <div className="flex items-center justify-center min-h-screen bg-secondary/50 p-4">
         <Card className="mx-auto max-w-sm w-full">
            <CardHeader className="space-y-4 text-center">
              <Logo className="justify-center" />
              <CardTitle className="text-2xl font-headline">Verifying your email...</CardTitle>
              <CardDescription>Please wait while we verify your email address.</CardDescription>
            </CardHeader>
         </Card>
       </div>
    )
  }

  if (!verificationSuccess) {
     return (
       <div className="flex items-center justify-center min-h-screen bg-secondary/50 p-4">
         <Card className="mx-auto max-w-sm w-full">
            <CardHeader className="space-y-4 text-center">
              <Logo className="justify-center" />
              <CardTitle className="text-2xl font-headline">Check your email</CardTitle>
              <CardDescription>A sign-in link has been sent to <strong>{email || 'your email'}</strong>. Click the link to continue.</CardDescription>
            </CardHeader>
             {error && <CardContent><p className="text-destructive text-sm text-center">{error}</p></CardContent>}
         </Card>
       </div>
    )
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-secondary/50 p-4">
      <Card className="mx-auto max-w-sm w-full">
        <CardHeader className="space-y-4 text-center">
          <Logo className="justify-center" />
          <div className="space-y-1">
            <CardTitle className="text-2xl font-headline">Set Your Password</CardTitle>
            <CardDescription>
              Your email is verified. Now create a password for your account.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSetPassword}>
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="password">Password</Label>
                <Input 
                  id="password" 
                  type="password" 
                  required 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="confirm-password">Confirm Password</Label>
                <Input 
                  id="confirm-password" 
                  type="password" 
                  required 
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={loading}
                />
              </div>
              {error && <p className="text-destructive text-sm">{error}</p>}
              <Button type="submit" className="w-full" disabled={loading}>
                 {loading ? 'Saving...' : 'Save Password and Sign Up'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
