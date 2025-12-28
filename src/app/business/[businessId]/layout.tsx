// app/business/[businessId]/layout.tsx
'use client';

import { useParams, usePathname, useRouter } from 'next/navigation';
import { useBusinessAuthorization } from '@/hooks/use-business-authorization';
import { createContext, useContext, useEffect } from 'react';
import { Building2, ShieldX, Home, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Create context to share with child pages
export const BusinessContext = createContext<ReturnType<typeof useBusinessAuthorization> | null>(null);

export function useBusinessContext() {
  const context = useContext(BusinessContext);
  if (!context) throw new Error('useBusinessContext must be used within BusinessLayout');
  return context;
}

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
            Loading Business
          </h2>
          <p className="text-sm text-muted-foreground">
            Verifying your access permissions...
          </p>
        </div>

        {/* Animated progress bar */}
        <div className="mt-6 w-48 h-1 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full"
            style={{
              animation: 'progress 1.5s ease-in-out infinite',
            }}
          />
        </div>
      </div>

      <style jsx>{`
        @keyframes progress {
          0% { width: 0%; margin-left: 0%; }
          50% { width: 60%; margin-left: 20%; }
          100% { width: 0%; margin-left: 100%; }
        }
      `}</style>
    </div>
  );
}

function NotAuthorizedState() {
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
            Business Not Found
          </h1>
          <p className="text-muted-foreground leading-relaxed">
            The business you're looking for doesn't exist or you don't have permission to access it.
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Button
            variant="outline"
            onClick={() => router.back()}
            className="gap-2 w-full sm:w-auto"
          >
            <ArrowLeft className="h-4 w-4" />
            Go Back
          </Button>
          <Button
            onClick={() => router.push('/business')}
            className="gap-2 w-full sm:w-auto"
          >
            <Home className="h-4 w-4" />
            My Businesses
          </Button>
        </div>

        {/* Help text */}
        <p className="text-xs text-muted-foreground pt-4">
          If you believe this is an error, please contact your administrator.
        </p>
      </div>
    </div>
  );
}

export default function BusinessLayout({
  children
}: {
  children: React.ReactNode
}) {
  const params = useParams();
  const router = useRouter();
  const pathname = usePathname();
  const businessId = params?.businessId as string;

  const businessAuth = useBusinessAuthorization(businessId);
  const { isAuthorized, loading } = businessAuth;

  useEffect(() => {
    if (loading) return;
    if (isAuthorized && pathname === `/business/${businessId}`) {
      router.push(`/business/${businessId}/dashboard/orders`);
    }
  }, [isAuthorized, loading, businessId, pathname, router]);

  // Loading state
  if (loading) {
    return <LoadingState />;
  }

  // Not authorized - show 404
  if (!isAuthorized) {
    return <NotAuthorizedState />;
  }

  // Provide business context to all children
  return (
    <BusinessContext.Provider value={businessAuth}>
      {children}
    </BusinessContext.Provider>
  );
}