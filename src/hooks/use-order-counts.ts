// hooks/use-order-counts.ts
'use client';

import { useQuery } from '@tanstack/react-query';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { StatusCounts } from '@/types/order';
import { CustomStatus } from './use-orders';

// ============================================================
// HOOK
// ============================================================

export function useOrderCounts(storeId: string | null) {
  return useQuery({
    // Query key
    queryKey: ['orderCounts', storeId],

    // Query function
    queryFn: async (): Promise<StatusCounts> => {
      if (!storeId) throw new Error('No store ID provided');

      // ✅ TRY TO READ FROM METADATA FIRST (FAST!)
      try {
        const metadataRef = doc(db, 'accounts', storeId, 'metadata', 'orderCounts');
        const metadataDoc = await getDoc(metadataRef);

        if (metadataDoc.exists()) {
          const data = metadataDoc.data();
          console.log('✅ Loaded counts from metadata (fast path)');
          return data.counts as StatusCounts;
        }
      } catch (error) {
        console.warn('⚠️ Could not load from metadata, falling back to calculation:', error);
      }

      // ⚠️ FALLBACK: CALCULATE ON-THE-FLY (SLOWER)
      // This only runs if metadata document doesn't exist yet
      console.log('⚠️ Calculating counts from all orders (slow path)...');

      const ordersRef = collection(db, 'accounts', storeId, 'orders');
      const snapshot = await getDocs(ordersRef);

      // Initialize counts
      const counts: StatusCounts = {
        'All Orders': 0,
        'New': 0,
        'Confirmed': 0,
        'Ready To Dispatch': 0,
        'Dispatched': 0,
        'In Transit': 0,
        'Out For Delivery': 0,
        'Delivered': 0,
        'RTO In Transit': 0,
        'RTO Delivered': 0,
        'DTO Requested': 0,
        'DTO Booked': 0,
        'DTO In Transit': 0,
        'DTO Delivered': 0,
        'Pending Refunds': 0,
        'Lost': 0,
        'Closed': 0,
        'RTO Closed': 0,
        'Cancellation Requested': 0,
        'Cancelled': 0,
      };

      let allOrdersCount = 0;

      // Count orders by status
      snapshot.docs.forEach((doc) => {
        const order = doc.data();
        const isShopifyCancelled = !!order.raw?.cancelled_at;

        if (isShopifyCancelled) {
          counts['Cancelled']++;
        } else {
          allOrdersCount++;
          const status = (order.customStatus || 'New') as CustomStatus;

          if (counts[status] !== undefined) {
            counts[status]++;
          }
        }
      });

      counts['All Orders'] = allOrdersCount;

      return counts;
    },

    // Query options
    enabled: !!storeId, // Only run when storeId exists
    staleTime: 5 * 60 * 1000, // ✅ Changed: Counts fresh for 5 minutes (metadata is fast)
    gcTime: 30 * 60 * 1000, // ✅ Changed: Keep in cache for 30 minutes
    refetchInterval: 2 * 60 * 1000, // ✅ Changed: Auto-refetch every 2 minutes (less aggressive)
    refetchOnWindowFocus: false, // ✅ Changed: Don't refetch on focus (metadata updates automatically)
  });
}

// ============================================================
// EXPORT TYPE
// ============================================================

export type { StatusCounts, CustomStatus };