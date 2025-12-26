// app/providers.tsx
'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { useState, useEffect } from 'react';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30 * 1000,
        gcTime: 5 * 60 * 1000,
        refetchOnMount: true,
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
        refetchInterval: 30 * 1000,
        retry: 1,
        retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
        networkMode: 'online',
      },
      mutations: {
        retry: 0,
        networkMode: 'online',
      },
    },
  }));

  // Fix Radix UI pointer-events bug
  useEffect(() => {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (
          mutation.type === 'attributes' &&
          mutation.attributeName === 'style'
        ) {
          const body = document.body;
          const hasPointerEventsNone = body.style.pointerEvents === 'none';

          const hasOpenPortal = document.querySelector(
            '[data-state="open"][role="dialog"], [data-state="open"][role="alertdialog"], [data-radix-popper-content-wrapper]'
          );

          if (hasPointerEventsNone && !hasOpenPortal) {
            setTimeout(() => {
              const stillHasOpenPortal = document.querySelector(
                '[data-state="open"][role="dialog"], [data-state="open"][role="alertdialog"], [data-radix-popper-content-wrapper]'
              );

              if (!stillHasOpenPortal) {
                body.style.pointerEvents = '';
              }
            }, 100);
          }
        }
      });
    });

    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['style'],
    });

    const intervalId = setInterval(() => {
      const body = document.body;
      if (body.style.pointerEvents === 'none') {
        const hasOpenPortal = document.querySelector(
          '[data-state="open"][role="dialog"], [data-state="open"][role="alertdialog"], [data-radix-popper-content-wrapper]'
        );

        if (!hasOpenPortal) {
          body.style.pointerEvents = '';
        }
      }
    }, 500);

    return () => {
      observer.disconnect();
      clearInterval(intervalId);
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      {children}

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