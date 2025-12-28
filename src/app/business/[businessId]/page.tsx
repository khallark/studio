// app/business/[businessId]/page.tsx
'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, ShieldX, Home, ArrowLeft, LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useBusinessContext } from './layout';

function LoadingState() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      {/* Ambient background effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-primary/5 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '700ms' }} />
      </div>

      {/* Main loader */}
      <div className="relative z-10 flex flex-col items-center">
        {/* Animated logo container */}
        <div className="relative mb-8">
          {/* Outer rotating ring */}
          <div
            className="absolute inset-0 w-20 h-20 rounded-full border-2 border-primary/20 border-t-primary animate-spin"
            style={{ animationDuration: '1.5s' }}
          />

          {/* Middle ring - counter rotation */}
          <div
            className="absolute inset-1.5 w-[68px] h-[68px] rounded-full border border-primary/10 border-b-primary/40 animate-spin"
            style={{ animationDuration: '2s', animationDirection: 'reverse' }}
          />

          {/* Inner pulsing circle */}
          <div className="absolute inset-3 w-14 h-14 rounded-full bg-primary/10 animate-pulse" />

          {/* Icon */}
          <div className="relative w-20 h-20 flex items-center justify-center">
            <Building2 className="h-7 w-7 text-primary" />
          </div>
        </div>

        {/* Text content */}
        <div className="text-center space-y-2">
          <h2 className="text-lg font-semibold text-foreground">
            Verifying Access
          </h2>
          <p className="text-sm text-muted-foreground">
            Please wait while we check your permissions...
          </p>
        </div>

        {/* Animated dots */}
        <div className="flex items-center gap-1.5 mt-6">
          <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '0ms' }} />
          <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '150ms' }} />
          <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    </div>
  );
}

function NotAuthorizedState({ businessId }: { businessId: string }) {
  const router = useRouter();

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-background via-background to-muted/30">
      {/* Subtle background pattern */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-muted/30 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 text-center space-y-8 max-w-md px-6">
        {/* 404 Display */}
        <div className="relative">
          {/* Large 404 background text */}
          <div className="text-[180px] font-bold text-muted/30 leading-none select-none">
            404
          </div>

          {/* Floating icon */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="relative">
              <div className="absolute inset-0 bg-primary/10 rounded-full blur-xl scale-150" />
              <div className="relative rounded-full bg-gradient-to-br from-muted to-muted/80 p-6 shadow-lg border border-border/50">
                <ShieldX className="h-12 w-12 text-muted-foreground" />
              </div>
            </div>
          </div>
        </div>

        {/* Text content */}
        <div className="space-y-3">
          <h1 className="text-2xl font-bold text-foreground">
            Access Denied
          </h1>
          <p className="text-muted-foreground leading-relaxed">
            You don't have permission to access this business. Please sign in with an authorized account or contact your administrator.
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Button
            variant="outline"
            onClick={() => router.push('/business')}
            className="gap-2 w-full sm:w-auto"
          >
            <ArrowLeft className="h-4 w-4" />
            My Businesses
          </Button>
          <Button
            onClick={() => router.push(`/login?redirect=/business/${businessId}/dashboard`)}
            className="gap-2 w-full sm:w-auto"
          >
            <LogIn className="h-4 w-4" />
            Sign In
          </Button>
        </div>

        {/* Help text */}
        <p className="text-xs text-muted-foreground pt-4">
          Need access? Ask your business administrator to invite you.
        </p>
      </div>
    </div>
  );
}

function RedirectingState() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      {/* Ambient background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/3 left-1/3 w-80 h-80 bg-primary/10 rounded-full blur-3xl animate-pulse" />
      </div>

      <div className="relative z-10 flex flex-col items-center">
        {/* Simple spinner */}
        <div className="relative mb-6">
          <div
            className="w-12 h-12 rounded-full border-2 border-primary/20 border-t-primary animate-spin"
            style={{ animationDuration: '1s' }}
          />
        </div>

        <p className="text-sm text-muted-foreground">
          Redirecting to dashboard...
        </p>
      </div>
    </div>
  );
}

export default function BusinessPage() {
  const router = useRouter();
  const { isAuthorized, loading, businessId } = useBusinessContext();

  useEffect(() => {
    if (!loading) {
      if (isAuthorized) {
        router.replace(`/business/${businessId}/dashboard`);
      } else {
        router.replace(`/login?redirect=/business/${businessId}/dashboard`);
      }
    }
  }, [loading, isAuthorized, businessId, router]);

  // Loading state
  if (loading) {
    return <LoadingState />;
  }

  // Not authorized - show styled 404
  if (!isAuthorized) {
    return <NotAuthorizedState businessId={businessId} />;
  }

  // This will show briefly before redirect
  return <RedirectingState />;
}