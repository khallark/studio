// app/providers.tsx
'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { useState } from 'react';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        // === CACHING ===
        staleTime: 30 * 1000, // How long data is considered "fresh"
        gcTime: 5 * 60 * 1000, // How long to keep unused data in cache
        
        // === REFETCHING ===
        refetchOnMount: true, // Refetch when component mounts (if data is stale)
        refetchOnWindowFocus: false, // Don't refetch when tab regains focus
        refetchOnReconnect: true, // Refetch when internet reconnects
        refetchInterval: 30 * 1000, // Auto-refetch every 30 seconds
        
        // === ERROR HANDLING ===
        retry: 1, // Retry failed requests once
        retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000), // Exponential backoff
        
        // === LOADING STATES ===
        networkMode: 'online', // 'online' | 'always' | 'offlineFirst'
      },
      mutations: {
        retry: 0, // Don't retry mutations (user-triggered actions)
        networkMode: 'online',
      },
    },
  }));

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      
      {/* Development Tools */}
      {process.env.NODE_ENV === 'development' && (
        <ReactQueryDevtools 
          initialIsOpen={false}
          position="bottom"
          buttonPosition="bottom-right"
        />
      )}
    </QueryClientProvider>
  );
}