// hooks/use-rto-counts.ts
'use client';

import { useQuery } from '@tanstack/react-query';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export function useRtoInTransitCounts(storeId: string | null) {
  return useQuery({
    queryKey: ['rtoInTransitCounts', storeId],
    
    queryFn: async () => {
      if (!storeId) throw new Error('No store ID provided');

      const ordersRef = collection(db, 'accounts', storeId, 'orders');
      
      // Fetch only "RTO In Transit" orders
      const q = query(
        ordersRef,
        where('customStatus', '==', 'RTO In Transit')
      );
      
      const snapshot = await getDocs(q);

      let reAttempt = 0;
      let refused = 0;
      let noReply = 0;

      snapshot.docs.forEach((doc) => {
        const order = doc.data();
        
        // Skip Shopify-cancelled orders
        if (order.raw?.cancelled_at) return;

        if (
          order.tags_rtoInTransit?.length === 1 &&
          order.tags_rtoInTransit[0] === 'Re-attempt'
        ) {
          reAttempt++;
        } else if (
          order.tags_rtoInTransit?.length === 1 &&
          order.tags_rtoInTransit[0] === 'Refused'
        ) {
          refused++;
        } else {
          noReply++;
        }
      });

      return { reAttempt, refused, noReply };
    },

    enabled: !!storeId,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchInterval: 60 * 1000,
  });
}