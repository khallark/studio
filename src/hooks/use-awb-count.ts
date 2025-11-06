// hooks/use-awb-count.ts
'use client';

import { useQuery } from '@tanstack/react-query';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';

// ============================================================
// HOOK
// ============================================================

export function useAwbCount(storeId: string | null) {
  return useQuery({
    // Query key
    queryKey: ['awbCount', storeId],

    // Query function
    queryFn: async () => {
      if (!storeId) throw new Error('No store ID provided');

      const awbsRef = collection(db, 'accounts', storeId, 'unused_awbs');
      const snapshot = await getDocs(awbsRef);

      // Return the count of unused AWBs
      return snapshot.size;
    },

    // Query options
    enabled: !!storeId, // Only run when storeId exists
    staleTime: 30 * 1000, // Fresh for 30 seconds
    gcTime: 5 * 60 * 1000, // Keep in cache for 5 minutes
    refetchInterval: 60 * 1000, // Refetch every minute
    refetchOnWindowFocus: true, // Refetch when returning to tab
  });
}