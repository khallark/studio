// hooks/use-availability-counts.ts
'use client';

import { useQuery } from '@tanstack/react-query';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Order } from './use-orders';
import { SHARED_STORE_IDS, SUPER_ADMIN_ID } from '@/lib/shared-constants';

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

        if (SHARED_STORE_IDS.includes(storeId) && businessId !== SUPER_ADMIN_ID && vendorName) {
          if (vendorName !== 'OWR') {
            q = query(q, where("vendors", "array-contains", vendorName));
          } else {
            q = query(q, where("vendors", "array-contains-any", ['OWR', 'BBB', 'Ghamand']));
          }
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
            // ✅ FIX 1: Skip Shopify-cancelled orders
            if (order?.raw?.cancelled_at) return null;

            const lineItems = order?.raw?.line_items || [];
            const businessProductIds: Array<[string, number]> = [];

            // Check if unmapped
            let isUnmapped = false;
            for (const item of lineItems) {
              const storeProductRef = doc(db, 'accounts', storeId, 'products', String(item.product_id));
              const storeProductDoc = await getDoc(storeProductRef);
              const docData = storeProductDoc.data();

              // ✅ FIX 2: Use variantMappingDetails (or variantMappings - confirm which is correct!)
              // Change this line based on your actual field name:
              const variantMapping = docData?.variantMappingDetails?.[item.variant_id]
                || docData?.variantMappings?.[item.variant_id];

              if (
                !storeProductDoc.exists() ||
                !docData ||
                !variantMapping
              ) {
                isUnmapped = true;
                break;
              }

              // If using variantMappingDetails, extract the SKU:
              const businessProductSku = typeof variantMapping === 'object'
                ? variantMapping.businessProductSku
                : variantMapping;

              // Extract business id
              const mappedBusinessId = typeof variantMapping === 'object'
                ? variantMapping.businessId
                : variantMapping;

              if (
                mappedBusinessId !== businessId
              ) {
                isUnmapped = true;
                break;
              }

              businessProductIds.push([
                String(businessProductSku),
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
                  Number(docData.inShelfQuantity || 0) < Number(quantity)
                ) {
                  isEligible = false;
                  break;
                }
              }
            }

            return {
              order,
              isUnmapped,
              // ✅ FIX 3: Exclude picked up orders from eligible count
              isEligible: !isUnmapped && isEligible && !order.pickupReady,
              isNotEligible: !isUnmapped && !isEligible && !order.pickupReady,
              isPickedUp: !!order.pickupReady
            };
          })
        );

        // Count each category (now mutually exclusive except for picked up)
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

          // Eligibility-based counts (mutually exclusive)
          if (isUnmapped) {
            unmapped++;
          } else if (isEligible) {
            eligible++;
          } else if (isNotEligible) {
            notEligible++;
          }

          // Picked up count (independent category)
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