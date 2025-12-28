// app/business/layout.tsx
'use client';

import { useRouter } from 'next/navigation';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '@/lib/firebase';
import { useEffect } from 'react';
import { Building2 } from 'lucide-react';

export default function BusinessRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user, loading] = useAuthState(auth);
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login?redirect=/business');
    }
  }, [loading, user, router]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
        {/* Ambient background effects */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl animate-pulse" />
          <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-primary/5 rounded-full blur-3xl animate-pulse delay-700" />
        </div>

        {/* Main loader */}
        <div className="relative z-10 flex flex-col items-center">
          {/* Animated logo container */}
          <div className="relative mb-8">
            {/* Outer rotating ring */}
            <div className="absolute inset-0 w-20 h-20 rounded-full border-2 border-primary/20 border-t-primary animate-spin" style={{ animationDuration: '1.5s' }} />

            {/* Inner pulsing circle */}
            <div className="absolute inset-2 w-16 h-16 rounded-full bg-primary/10 animate-pulse" />

            {/* Icon */}
            <div className="relative w-20 h-20 flex items-center justify-center">
              <Building2 className="h-8 w-8 text-primary animate-pulse" />
            </div>
          </div>

          {/* Text content */}
          <div className="text-center space-y-2">
            <h2 className="text-lg font-semibold text-foreground">
              Authenticating
            </h2>
            <p className="text-sm text-muted-foreground">
              Verifying your credentials...
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

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
        <div className="relative">
          <div className="absolute inset-0 w-16 h-16 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
          <div className="w-16 h-16 flex items-center justify-center">
            <Building2 className="h-6 w-6 text-primary/50" />
          </div>
        </div>
        <p className="mt-4 text-sm text-muted-foreground">Redirecting to login...</p>
      </div>
    );
  }

  return <>{children}</>;
}