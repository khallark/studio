// hooks/use-availability-counts.ts
'use client';

import { useQuery } from '@tanstack/react-query';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export function useAvailabilityCounts(storeId: string | null) {
  return useQuery({
    queryKey: ['availabilityCounts', storeId],
    
    queryFn: async () => {
      if (!storeId) throw new Error('No store ID provided');

      const ordersRef = collection(db, 'accounts', storeId, 'orders');
      
      // Fetch only "Confirmed" orders
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

      return { pending, available, unavailable };
    },

    enabled: !!storeId,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchInterval: 60 * 1000,
  });
}