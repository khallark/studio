// hooks/use-awb-count.ts
'use client';

import { useQuery } from '@tanstack/react-query';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';

// ============================================================
// BUSINESS-LEVEL AWB COUNT HOOK
// ============================================================

/**
 * Fetches the count of unused AWBs at the BUSINESS level.
 * AWBs are shared across all stores in a business.
 */
export function useAwbCount(businessId: string | null) {
  return useQuery({
    // Query key
    queryKey: ['awbCount', businessId],

    // Query function
    queryFn: async () => {
      if (!businessId) throw new Error('No business ID provided');

      // ✅ Fetch from business level, not store level
      const awbsRef = collection(db, 'users', businessId, 'unused_awbs');
      const snapshot = await getDocs(awbsRef);

      // Return the count of unused AWBs
      return snapshot.size;
    },

    // Query options
    enabled: !!businessId, // Only run when businessId exists
    staleTime: 30 * 1000, // Fresh for 30 seconds
    gcTime: 5 * 60 * 1000, // Keep in cache for 5 minutes
    refetchInterval: 60 * 1000, // Refetch every minute
    refetchOnWindowFocus: true, // Refetch when returning to tab
  });
}