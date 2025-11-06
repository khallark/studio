// hooks/use-order-counts.ts
'use client';

import { useQuery } from '@tanstack/react-query';
import { collection, query, where, getDocs } from 'firebase/firestore';
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
    queryFn: async () => {
      if (!storeId) throw new Error('No store ID provided');

      const ordersRef = collection(db, 'accounts', storeId, 'orders');
      
      // Fetch all non-deleted orders (we need counts for all statuses)
      const q = query(ordersRef);
      const snapshot = await getDocs(q);

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
          // Shopify-cancelled orders go to "Cancelled" tab
          counts['Cancelled']++;
        } else {
          // All other orders
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
    staleTime: 30 * 1000, // Counts are fresh for 30 seconds (don't change as frequently)
    gcTime: 5 * 60 * 1000, // Keep in cache for 5 minutes
    refetchInterval: 60 * 1000, // Auto-refetch every minute (less aggressive than orders)
    refetchOnWindowFocus: true, // Refetch when user returns to tab
  });
}

// ============================================================
// EXPORT TYPE
// ============================================================

export type { StatusCounts, CustomStatus };