// hooks/use-order-counts.ts
'use client';

import { useState, useEffect } from 'react';
import { doc, onSnapshot, collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { StatusCounts } from '@/types/order';
import { CustomStatus } from './use-orders';

// ============================================================
// HOOK WITH REAL-TIME UPDATES - Business-wide aggregation
// ============================================================

export function useOrderCounts(businessId: string | null, stores: string[]) {
  const [counts, setCounts] = useState<StatusCounts>({
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
    'DTO Refunded': 0,
    'Lost': 0,
    'Closed': 0,
    'RTO Closed': 0,
    'Cancellation Requested': 0,
    'Cancelled': 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!businessId || !stores || stores.length === 0) {
      setIsLoading(false);
      return;
    }

    console.log(`📊 Setting up real-time listeners for ${stores.length} stores`);

    // Create unsubscribe functions for each store
    const unsubscribes: (() => void)[] = [];

    // Map to store each store's counts
    const storeCounts = new Map<string, StatusCounts>();

    // Function to aggregate all store counts
    const aggregateCounts = () => {
      const aggregated: StatusCounts = {
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
        'DTO Refunded': 0,
        'Lost': 0,
        'Closed': 0,
        'RTO Closed': 0,
        'Cancellation Requested': 0,
        'Cancelled': 0,
      };

      storeCounts.forEach((storeCounts) => {
        (Object.keys(aggregated) as Array<keyof StatusCounts>).forEach((key) => {
          aggregated[key] += storeCounts[key] || 0;
        });
      });

      setCounts(aggregated);
      setIsLoading(false);
    };

    // Set up listener for each store
    stores.forEach((storeId) => {
      const metadataRef = doc(db, 'accounts', storeId, 'metadata', 'orderCounts');

      const unsubscribe = onSnapshot(
        metadataRef,

        async (snapshot) => {
          if (snapshot.exists()) {
            const data = snapshot.data();
            storeCounts.set(storeId, data.counts as StatusCounts);
            console.log(`✅ Counts update from store: ${storeId}`);
          } else {
            // Fallback: calculate counts for this store
            console.warn(`⚠️ Metadata missing for store: ${storeId}, calculating...`);
            try {
              const calculatedCounts = await calculateCounts(storeId);
              storeCounts.set(storeId, calculatedCounts);
            } catch (err) {
              console.error(`❌ Failed to calculate counts for ${storeId}:`, err);
              // Set zeros for this store to avoid blocking other stores
              storeCounts.set(storeId, {
                'All Orders': 0, 'New': 0, 'Confirmed': 0, 'Ready To Dispatch': 0,
                'Dispatched': 0, 'In Transit': 0, 'Out For Delivery': 0, 'Delivered': 0,
                'RTO In Transit': 0, 'RTO Delivered': 0, 'DTO Requested': 0, 'DTO Booked': 0,
                'DTO In Transit': 0, 'DTO Delivered': 0, 'Pending Refunds': 0, 'DTO Refunded': 0, 'Lost': 0,
                'Closed': 0, 'RTO Closed': 0, 'Cancellation Requested': 0, 'Cancelled': 0,
              });
            }
          }

          // Aggregate after each store update
          aggregateCounts();
          setError(null);
        },

        (err) => {
          console.error(`❌ Error listening to counts for ${storeId}:`, err);
          setError(err as Error);
        }
      );

      unsubscribes.push(unsubscribe);
    });

    // Cleanup all listeners on unmount
    return () => {
      console.log('🧹 Cleaning up order counts listeners');
      unsubscribes.forEach(unsub => unsub());
    };
  }, [businessId, stores]);

  return { data: counts, isLoading, error };
}

// ============================================================
// FALLBACK: CALCULATE COUNTS FOR A SINGLE STORE
// ============================================================

async function calculateCounts(storeId: string): Promise<StatusCounts> {
  const ordersRef = collection(db, 'accounts', storeId, 'orders');
  const snapshot = await getDocs(ordersRef);

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
    'DTO Refunded': 0,
    'Lost': 0,
    'Closed': 0,
    'RTO Closed': 0,
    'Cancellation Requested': 0,
    'Cancelled': 0,
  };

  let allOrdersCount = 0;

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
}

export type { StatusCounts, CustomStatus };