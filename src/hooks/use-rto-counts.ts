// hooks/use-rto-counts.ts
'use client';

import { useQuery } from '@tanstack/react-query';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';

const SHARED_STORE_ID = process.env.NEXT_PUBLIC_SHARED_STORE_ID!;
const SUPER_ADMIN_ID = process.env.NEXT_PUBLIC_SUPER_ADMIN_ID!;

export function useRtoInTransitCounts(businessId: string | null, stores: string[], vendorName: string | null | undefined) {
  return useQuery({
    queryKey: ['rtoInTransitCounts', businessId, stores],

    queryFn: async () => {
      if (!businessId) throw new Error('No business ID provided');
      if (!stores || stores.length === 0) {
        return { reAttempt: 0, refused: 0, noReply: 0 };
      }

      let totalReAttempt = 0;
      let totalRefused = 0;
      let totalNoReply = 0;

      // Query each store in parallel
      const storeQueries = stores.map(async (storeId) => {
        const ordersRef = collection(db, 'accounts', storeId, 'orders');

        let q = query(
          ordersRef,
          where('customStatus', '==', 'RTO In Transit')
        );

        if (storeId === SHARED_STORE_ID && businessId !== SUPER_ADMIN_ID && vendorName) {
          q = query(q, where("vendors", "array-contains", vendorName));
        }

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
      });

      // Wait for all stores
      const results = await Promise.all(storeQueries);

      // Aggregate results
      results.forEach(({ reAttempt, refused, noReply }) => {
        totalReAttempt += reAttempt;
        totalRefused += refused;
        totalNoReply += noReply;
      });

      return {
        reAttempt: totalReAttempt,
        refused: totalRefused,
        noReply: totalNoReply,
      };
    },

    enabled: !!businessId && stores.length > 0,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchInterval: 60 * 1000,
  });
}