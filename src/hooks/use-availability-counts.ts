// hooks/use-availability-counts.ts
'use client';

import { useQuery } from '@tanstack/react-query';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Order } from './use-orders';

const SHARED_STORE_ID = process.env.NEXT_PUBLIC_SHARED_STORE_ID!;
const SUPER_ADMIN_ID = process.env.NEXT_PUBLIC_SUPER_ADMIN_ID!;

export function useAvailabilityCounts(businessId: string | null, stores: string[], vendorName: string | null | undefined) {
  return useQuery({
    queryKey: ['availabilityCounts', businessId, stores],
    
    queryFn: async () => {
      if (!businessId) throw new Error('No business ID provided');
      if (!stores || stores.length === 0) {
        return { 
          pending: 0, 
          available: 0, 
          unavailable: 0,
          eligible: 0,
          notEligible: 0,
          pickedUp: 0,
          unmapped: 0
        };
      }

      let totalAvailable = 0;
      let totalUnavailable = 0;
      let totalPending = 0;
      let totalEligible = 0;
      let totalNotEligible = 0;
      let totalPickedUp = 0;
      let totalUnmapped = 0;

      // Query each store in parallel
      const storeQueries = stores.map(async (storeId) => {
        const ordersRef = collection(db, 'accounts', storeId, 'orders');
        
        let q = query(
          ordersRef,
          where('customStatus', '==', 'Confirmed')
        );

        if(storeId === SHARED_STORE_ID && businessId !== SUPER_ADMIN_ID && vendorName) {
          q = query(q, where("vendors", "array-contains", vendorName));
        }
        
        const snapshot = await getDocs(q);

        let available = 0;
        let unavailable = 0;
        let pending = 0;
        let eligible = 0;
        let notEligible = 0;
        let pickedUp = 0;
        let unmapped = 0;

        // Collect all orders for eligibility checks
        const orders = snapshot.docs.map(doc => ({
          id: doc.id,
          storeId,
          ...doc.data()
        } as Order));

        // Check eligibility for all orders
        const eligibilityChecks = await Promise.all(
          orders.map(async (order) => {
            // Skip Shopify-cancelled orders
            if (order?.raw?.cancelled_at) return null;

            const lineItems = order?.raw?.line_items || [];
            const businessProductIds: Array<[string, number]> = [];

            // Check if unmapped
            let isUnmapped = false;
            for (const item of lineItems) {
              const storeProductRef = doc(db, 'accounts', storeId, 'products', String(item.product_id));
              const storeProductDoc = await getDoc(storeProductRef);
              const docData = storeProductDoc.data();

              if (
                !storeProductDoc.exists() ||
                !docData ||
                !docData.variantMappings?.[item.variant_id]
              ) {
                isUnmapped = true;
                break;
              }

              businessProductIds.push([
                String(docData.variantMappings[item.variant_id]),
                item.quantity,
              ]);
            }

            // Check if eligible (has enough inventory)
            let isEligible = true;
            if (!isUnmapped) {
              for (const [id, quantity] of businessProductIds) {
                const businessProductRef = doc(db, 'users', businessId, 'products', id);
                const businessProductDoc = await getDoc(businessProductRef);
                const docData = businessProductDoc.data();
                
                if (!businessProductDoc.exists() ||
                    !docData ||
                    docData.inShelfQuantity < quantity
                ) {
                  isEligible = false;
                  break;
                }
              }
            }

            return {
              order,
              isUnmapped,
              isEligible: !isUnmapped && isEligible,
              isNotEligible: !isUnmapped && !isEligible,
              isPickedUp: !!order.pickupReady
            };
          })
        );

        // Count each category
        eligibilityChecks.forEach((check) => {
          if (!check) return; // Skip cancelled orders

          const { order, isUnmapped, isEligible, isNotEligible, isPickedUp } = check;

          // Tags-based counts
          if (order.tags_confirmed?.includes('Available')) {
            available++;
          } else if (order.tags_confirmed?.includes('Unavailable')) {
            unavailable++;
          } else {
            pending++;
          }

          // Eligibility-based counts
          if (isUnmapped) {
            unmapped++;
          } else if (isEligible) {
            eligible++;
          } else if (isNotEligible) {
            notEligible++;
          }

          // Picked up count
          if (isPickedUp) {
            pickedUp++;
          }
        });

        return { available, unavailable, pending, eligible, notEligible, pickedUp, unmapped };
      });

      // Wait for all stores
      const results = await Promise.all(storeQueries);
      
      // Aggregate results
      results.forEach(({ available, unavailable, pending, eligible, notEligible, pickedUp, unmapped }) => {
        totalAvailable += available;
        totalUnavailable += unavailable;
        totalPending += pending;
        totalEligible += eligible;
        totalNotEligible += notEligible;
        totalPickedUp += pickedUp;
        totalUnmapped += unmapped;
      });

      return {
        available: totalAvailable,
        unavailable: totalUnavailable,
        pending: totalPending,
        eligible: totalEligible,
        notEligible: totalNotEligible,
        pickedUp: totalPickedUp,
        unmapped: totalUnmapped,
      };
    },

    enabled: !!businessId && stores.length > 0,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchInterval: 60 * 1000,
  });
}