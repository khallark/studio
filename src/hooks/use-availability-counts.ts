// hooks/use-availability-counts.ts
'use client';

import { useQuery } from '@tanstack/react-query';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export function useAvailabilityCounts(businessId: string | null, stores: string[]) {
  return useQuery({
    queryKey: ['availabilityCounts', businessId, stores],
    
    queryFn: async () => {
      if (!businessId) throw new Error('No business ID provided');
      if (!stores || stores.length === 0) {
        return { pending: 0, available: 0, unavailable: 0 };
      }

      let totalAvailable = 0;
      let totalUnavailable = 0;
      let totalPending = 0;

      // Query each store in parallel
      const storeQueries = stores.map(async (storeId) => {
        const ordersRef = collection(db, 'accounts', storeId, 'orders');
        
        const q = query(
          ordersRef,
          where('customStatus', '==', 'Confirmed')
        );
        
        const snapshot = await getDocs(q);

        let available = 0;
        let unavailable = 0;
        let pending = 0;

        snapshot.docs.forEach((doc) => {
          const order = doc.data();
          
          // Skip Shopify-cancelled orders
          if (order.raw?.cancelled_at) return;

          if (order.tags_confirmed?.includes('Available')) {
            available++;
          } else if (order.tags_confirmed?.includes('Unavailable')) {
            unavailable++;
          } else {
            pending++;
          }
        });

        return { available, unavailable, pending };
      });

      // Wait for all stores
      const results = await Promise.all(storeQueries);
      
      // Aggregate results
      results.forEach(({ available, unavailable, pending }) => {
        totalAvailable += available;
        totalUnavailable += unavailable;
        totalPending += pending;
      });

      return {
        pending: totalPending,
        available: totalAvailable,
        unavailable: totalUnavailable,
      };
    },

    enabled: !!businessId && stores.length > 0,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchInterval: 60 * 1000,
  });
}