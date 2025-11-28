// app/business/[businessId]/page.tsx
'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useBusinessContext } from './layout';

export default function BusinessPage() {
  const router = useRouter();
  const { isAuthorized, loading, businessId } = useBusinessContext();

  useEffect(() => {
    if (!loading) {
      // Redirect to dashboard if authorized
      if (isAuthorized) {
        router.replace(`/business/${businessId}/dashboard`);
      } else {
        router.replace(`/login?redirect=/business/${businessId}/dashboard`);
      }
    }
  }, [loading, isAuthorized, businessId, router]);

  // Loading state
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground">Verifying access...</p>
      </div>
    );
  }

  // Not authorized - show 404
  if (!isAuthorized) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-4">
        <div className="text-center">
          <h1 className="text-6xl font-bold text-gray-900 mb-4">404</h1>
          <h2 className="text-2xl font-semibold text-gray-700 mb-2">Page Not Found</h2>
          <p className="text-gray-500 mb-8">
            The business you're looking for doesn't exist or you don't have access to it.
          </p>
          <button
            onClick={() => router.push('/')}
            className="px-6 py-2 bg-primary text-white rounded-md hover:bg-primary/90 transition-colors"
          >
            Go Home
          </button>
        </div>
      </div>
    );
  }

  // This will show briefly before redirect
  return (
    <div className="flex items-center justify-center min-h-screen">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}