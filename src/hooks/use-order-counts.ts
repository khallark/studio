// hooks/use-order-counts.ts
'use client';

import { useState, useEffect } from 'react';
import { doc, onSnapshot, getDoc, collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { StatusCounts } from '@/types/order';
import { CustomStatus } from './use-orders';

// ============================================================
// HOOK WITH REAL-TIME UPDATES
// ============================================================

export function useOrderCounts(storeId: string | null) {
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
    'Lost': 0,
    'Closed': 0,
    'RTO Closed': 0,
    'Cancellation Requested': 0,
    'Cancelled': 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!storeId) {
      setIsLoading(false);
      return;
    }

    console.log('🔄 Setting up real-time listener for order counts');
    const metadataRef = doc(db, 'accounts', storeId, 'metadata', 'orderCounts');

    // ✅ Real-time listener
    const unsubscribe = onSnapshot(
      metadataRef,
      
      // Success callback
      async (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          console.log('✅ Real-time counts update from metadata');
          setCounts(data.counts as StatusCounts);
          setError(null);
        } else {
          // ⚠️ Metadata doesn't exist yet - calculate on the fly
          console.warn('⚠️ Metadata document missing, calculating counts...');
          try {
            const calculatedCounts = await calculateCounts(storeId);
            setCounts(calculatedCounts);
            setError(null);
          } catch (err) {
            console.error('❌ Failed to calculate counts:', err);
            setError(err as Error);
          }
        }
        setIsLoading(false);
      },
      
      // Error callback
      (err) => {
        console.error('❌ Error listening to order counts:', err);
        setError(err as Error);
        setIsLoading(false);
      }
    );

    // ✅ Cleanup listener on unmount
    return () => {
      console.log('🧹 Cleaning up order counts listener');
      unsubscribe();
    };
  }, [storeId]);

  return { data: counts, isLoading, error };
}

// ============================================================
// FALLBACK: CALCULATE COUNTS (ONLY IF METADATA MISSING)
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

// ============================================================
// EXPORTS
// ============================================================

export type { StatusCounts, CustomStatus };