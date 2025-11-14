// app/business/[businessId]/layout.tsx
'use client';

import { useParams } from 'next/navigation';
import { useBusinessAuthorization } from '@/hooks/use-business-authorization';
import { createContext, useContext } from 'react';

// Create context to share with child pages
export const BusinessContext = createContext<ReturnType<typeof useBusinessAuthorization> | null>(null);

export function useBusiness() {
  const context = useContext(BusinessContext);
  if (!context) throw new Error('useBusiness must be used within BusinessLayout');
  return context;
}

export default function BusinessLayout({ 
  children 
}: { 
  children: React.ReactNode 
}) {
  const params = useParams();
  const businessId = params?.businessId as string;
  
  const businessAuth = useBusinessAuthorization(businessId);

  // Loading state
  if (businessAuth.loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-lg">Loading business...</div>
      </div>
    );
  }

  // Not authorized - show 404
  if (!businessAuth.isAuthorized) {
    return (
      <div className="flex flex-col items-center justify-center h-screen">
        <div className="text-center space-y-4">
          <h1 className="text-6xl font-bold text-gray-300">404</h1>
          <h2 className="text-2xl font-semibold text-gray-700">Business Not Found</h2>
          <p className="text-gray-500">You don't have access to this business.</p>
        </div>
      </div>
    );
  }

  // Provide business context to all children
  return (
    <BusinessContext.Provider value={businessAuth}>
      {children}
    </BusinessContext.Provider>
  );
}