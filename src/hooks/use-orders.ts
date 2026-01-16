// hooks/use-orders.ts
'use client';

import { useQuery } from '@tanstack/react-query';
import { collection, query, where, orderBy, limit, getDocs, and, doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { addDays } from 'date-fns';
import { CustomStatus, Order, UseOrdersFilters } from '@/types/order';
import { SHARED_STORE_IDS, SUPER_ADMIN_ID } from '@/lib/shared-constants';

// ============================================================
// HOOK - Now business-wide, not store-specific
// ============================================================

/**
 * Check if order should be excluded from availability filters
 */
function shouldSkipOrder(order: Order): boolean {
    // Skip Shopify-cancelled orders
    return !!order?.raw?.cancelled_at;
}

export function useOrders(
    businessId: string | null,
    stores: string[], // All stores in the business
    vendorName: string | null,
    activeTab: CustomStatus | 'All Orders',
    currentPage: number,
    rowsPerPage: number,
    filters: UseOrdersFilters = {}
) {
    return useQuery({
        // Query key - cache is based on these parameters
        queryKey: ['orders', businessId, stores, activeTab, currentPage, rowsPerPage, filters],

        // Query function - fetches and processes data from multiple stores
        queryFn: async () => {
            if (!businessId) throw new Error('No business ID provided');
            if (!stores || stores.length === 0) {
                console.warn('No stores available in business');
                return { orders: [], totalCount: 0, hasMore: false };
            }

            // Determine which stores to query based on filter
            const storesToQuery = filters.storeFilter && filters.storeFilter.length > 0
                ? stores.filter(s => filters.storeFilter!.includes(s))
                : stores;

            if (storesToQuery.length === 0) {
                return { orders: [], totalCount: 0, hasMore: false };
            }

            console.log(`📦 Querying ${storesToQuery.length} stores:`, storesToQuery);

            // ============================================================
            // DETERMINE SEARCH TYPE
            // ============================================================

            let searchType: 'none' | 'name' | 'awb' | 'clientSide' = 'none';
            let searchValue = '';

            if (filters.searchQuery) {
                const query = filters.searchQuery.trim();

                if (/^#[\w-]+$/i.test(query)) {
                    searchType = 'name';
                    searchValue = query.toUpperCase();
                }
                else if (/^[A-Z0-9]{10,}$/i.test(query)) {
                    searchType = 'awb';
                    searchValue = query.toUpperCase();
                }
                else {
                    searchType = 'clientSide';
                    searchValue = query.toLowerCase();
                }
            }

            // ============================================================
            // QUERY EACH STORE AND AGGREGATE RESULTS
            // ============================================================

            const allOrders: Order[] = [];

            // Fetch orders from each store in parallel
            const storeQueries = storesToQuery.map(async (storeId) => {
                const ordersRef = collection(db, 'accounts', storeId, 'orders');

                let q = query(ordersRef);

                // Track if we need client-side status filtering
                let needsClientSideStatusFilter = false;
                const excludedStatuses = ['New', 'DTO Requested', 'Pending Refunds'];

                // ✅ NEW: Filter by vendor for shared store
                if (SHARED_STORE_IDS.includes(storeId) && businessId !== SUPER_ADMIN_ID && vendorName) {
                    if (vendorName === 'OWR') {
                        q = query(q, where('vendors', 'array-contains-any', ['OWR', 'BBB', 'Ghamand']));
                        
                        // ✅ FIX: Force client-side status filtering for OWR
                        if (activeTab === 'All Orders') {
                            needsClientSideStatusFilter = true;
                        }
                    }
                    else {
                        q = query(q, where('vendors', 'array-contains', vendorName));
                    }
                }

                // Filter by status tab - use customStatus for all tabs
                const isSharedStoreNonSuperAdmin = SHARED_STORE_IDS.includes(storeId) && businessId !== SUPER_ADMIN_ID;

                // Server-side search
                const hasSearch = searchType === 'name' || searchType === 'awb';

                if (activeTab === 'All Orders') {
                    if (isSharedStoreNonSuperAdmin) {
                        // ✅ Only use not-in if there's no search query
                        // Firestore doesn't allow not-in with other where clauses on different fields
                        if (!hasSearch) {
                            q = query(q, where('customStatus', 'not-in', excludedStatuses));
                        } else {
                            // Will filter on client-side after fetching
                            needsClientSideStatusFilter = true;
                        }
                    }
                } else {
                    // For specific status tabs
                    if (isSharedStoreNonSuperAdmin && excludedStatuses.includes(activeTab)) {
                        // Hide these tabs for non-super-admin users on shared store
                        q = query(q, where('customStatus', '==', 'some-random-shit'));
                    } else {
                        q = query(q, where('customStatus', '==', activeTab));
                    }
                }

                if (searchType === 'name') {
                    q = query(q, where('name', '==', searchValue));
                } else if (searchType === 'awb') {
                    q = query(
                        q,
                        where('awb', '>=', searchValue),
                        where('awb', '<=', searchValue + '\uf8ff')
                    );
                }

                // Date range filter
                if (filters.dateRange?.from) {
                    const toDate = filters.dateRange.to
                        ? addDays(filters.dateRange.to, 1)
                        : addDays(filters.dateRange.from, 1);

                    q = query(
                        q,
                        where('createdAt', '>=', filters.dateRange.from.toISOString()),
                        where('createdAt', '<', toDate.toISOString())
                    );
                }

                // Courier filter
                if (
                    !['New', 'Confirmed', 'Cancelled'].includes(activeTab) &&
                    filters.courierFilter &&
                    filters.courierFilter !== 'all'
                ) {
                    if (filters.courierFilter === 'Delhivery') {
                        q = query(q, where('courierProvider', '==', 'Delhivery'));
                    } else if (filters.courierFilter === 'Shiprocket') {
                        q = query(q, where('courierProvider', '==', 'Shiprocket'));
                    } else if (filters.courierFilter === 'Xpressbees') {
                        q = query(q, where('courierProvider', '==', 'Xpressbees'));
                    }
                }

                if (filters.vendorName) {
                    q = query(q, where('vendors', 'array-contains', filters.vendorName));
                }

                // Sorting - always by time for business-wide view
                if (activeTab === 'RTO Delivered') {
                    q = query(q, orderBy('lastStatusUpdate', 'desc'));
                } else {
                    q = query(q, orderBy('createdAt', 'desc')); // Time-wise sorting
                }

                const fetchLimit = searchType === 'clientSide'
                    ? Math.max(rowsPerPage * 3, 100)
                    : rowsPerPage * 2;

                q = query(q, limit(fetchLimit));

                try {
                    const snapshot = await getDocs(q);
                    let orders = snapshot.docs.map((doc) => ({
                        ...doc.data(),
                        id: doc.id,
                        storeId, // Add store ID to each order
                    })) as Order[];

                    // ✅ Apply client-side status filter if needed
                    if (needsClientSideStatusFilter) {
                        orders = orders.filter(order => !excludedStatuses.includes(order.customStatus));
                    }

                    return orders;
                } catch (error: any) {
                    console.error(`Error fetching orders from store ${storeId}:`, error);

                    if (error.message.includes("The query requires an index.")) {
                        try {
                            await fetch('/api/test', {
                                method: "POST",
                                body: JSON.stringify({ str: error.message })
                            });
                        } catch { }
                    }

                    return [];
                }
            });

            // Wait for all store queries to complete
            const storeResults = await Promise.all(storeQueries);

            // Flatten results from all stores
            storeResults.forEach(storeOrders => {
                allOrders.push(...storeOrders);
            });

            // ============================================================
            // SORT AGGREGATED RESULTS BY TIME
            // ============================================================

            allOrders.sort((a, b) => {
                const timeA = new Date(a.createdAt || 0).getTime();
                const timeB = new Date(b.createdAt || 0).getTime();
                return timeB - timeA; // Newest first
            });

            // ============================================================
            // CLIENT-SIDE FILTERING
            // ============================================================

            let filteredOrders = allOrders;

            // Client-side search
            if (searchType === 'clientSide' && searchValue) {
                filteredOrders = filteredOrders.filter((order) => {
                    const customerName =
                        (
                            order.raw.shipping_address?.name ??
                            order.raw.billing_address?.name ??
                            order.raw.customer?.name
                        ) ||
                        `${order.raw.shipping_address?.first_name || ''} ${order.raw.shipping_address?.last_name || ''}`.trim() ||
                        `${order.raw.billing_address?.first_name || ''} ${order.raw.billing_address?.last_name || ''}`.trim() ||
                        `${order.raw.customer?.first_name || ''} ${order.raw.customer?.last_name || ''}`.trim() ||
                        order.email ||
                        '';

                    const match =
                        order.name.toLowerCase().includes(searchValue) ||
                        (activeTab === 'All Orders' &&
                            order.customStatus.toLowerCase().includes(searchValue)) ||
                        customerName.toLowerCase().includes(searchValue) ||
                        (order.awb && order.awb.toLowerCase().includes(searchValue)) ||
                        (order.awb_reverse &&
                            order.awb_reverse.toLowerCase().includes(searchValue)) ||
                        String(order.orderId).toLowerCase().includes(searchValue) ||
                        (() => {
                            const line_items = order.raw.line_items;
                            if (!line_items) return false;
                            for (let i = 0; i < line_items.length; ++i) {
                                if (
                                    line_items[i].vendor &&
                                    String(line_items[i].vendor)
                                        .toLowerCase()
                                        .includes(searchValue)
                                ) {
                                    return true;
                                }
                            }
                            return false;
                        })();

                    return filters.invertSearch ? !match : match;
                });
            }

            // Availability filter (Confirmed tab only)
            if (activeTab === 'Confirmed' && filters.availabilityFilter !== 'all') {
                // ✅ FIX: Filter out cancelled orders first
                const nonCancelledOrders = filteredOrders.filter(order => !shouldSkipOrder(order));

                if (filters.availabilityFilter === 'eligible') {
                    const availabilityChecks = await Promise.all(
                        nonCancelledOrders.map(async (order) => {
                            const lineItems = order.raw.line_items;
                            if (order.pickupReady) return false;

                            const businessProductIds: string[][] = [];

                            for (const item of lineItems) {
                                const storeProductRef = doc(db, 'accounts', order.storeId, 'products', String(item.product_id));
                                const storeProductDoc = await getDoc(storeProductRef);
                                const docData = storeProductDoc.data();

                                // ✅ FIX: Use variantMappingDetails or variantMappings
                                const variantMapping = docData?.variantMappingDetails?.[item.variant_id]
                                    || docData?.variantMappings?.[item.variant_id];

                                if (
                                    !storeProductDoc.exists() ||
                                    !docData ||
                                    !variantMapping
                                ) return false; // unmapped → do not treat as available

                                // Extract business product SKU
                                const businessProductSku = typeof variantMapping === 'object'
                                    ? variantMapping.businessProductSku
                                    : variantMapping;

                                businessProductIds.push([
                                    String(businessProductSku),
                                    item.quantity,
                                ]);
                            }

                            for (const [id, quantity] of businessProductIds) {
                                const businessProductRef = doc(db, 'users', businessId, 'products', id);
                                const businessProductDoc = await getDoc(businessProductRef);
                                const docData = businessProductDoc.data();
                                if (!businessProductDoc.exists() ||
                                    !docData ||
                                    Number(docData.inShelfQuantity || 0) < Number(quantity)
                                ) return false;
                            }

                            return true;
                        })
                    );
                    filteredOrders = nonCancelledOrders.filter((_, i) => availabilityChecks[i]).map(item => {
                        return {
                            ...item,
                            isEligibleForPickup: true
                        }
                    });
                } else if (filters.availabilityFilter === 'not eligible') {
                    const unavailabilityChecks = await Promise.all(
                        nonCancelledOrders.map(async (order) => {
                            const lineItems = order.raw.line_items;
                            if (order.pickupReady) return false;

                            const businessProductIds: string[][] = [];

                            for (const item of lineItems) {
                                const storeProductRef = doc(db, 'accounts', order.storeId, 'products', String(item.product_id));
                                const storeProductDoc = await getDoc(storeProductRef);
                                const docData = storeProductDoc.data();

                                // ✅ FIX: Use variantMappingDetails or variantMappings
                                const variantMapping = docData?.variantMappingDetails?.[item.variant_id]
                                    || docData?.variantMappings?.[item.variant_id];

                                if (
                                    !storeProductDoc.exists() ||
                                    !docData ||
                                    !variantMapping
                                ) return false; // unmapped → do not treat as unavailable

                                // Extract business product SKU
                                const businessProductSku = typeof variantMapping === 'object'
                                    ? variantMapping.businessProductSku
                                    : variantMapping;

                                businessProductIds.push([
                                    String(businessProductSku),
                                    item.quantity,
                                ]);
                            }

                            for (const [id, quantity] of businessProductIds) {
                                const businessProductRef = doc(db, 'users', businessId, 'products', id);
                                const businessProductDoc = await getDoc(businessProductRef);
                                const docData = businessProductDoc.data();
                                if (!businessProductDoc.exists() ||
                                    !docData ||
                                    Number(docData.inShelfQuantity || 0) < Number(quantity)
                                ) return true;
                            }

                            return false;
                        })
                    );
                    filteredOrders = nonCancelledOrders.filter((_, i) => unavailabilityChecks[i]);
                } else if (filters.availabilityFilter === 'picked up') {
                    const pickUpReadyCheck = nonCancelledOrders.map(order => !!order.pickupReady);
                    filteredOrders = nonCancelledOrders.filter((_, i) => pickUpReadyCheck[i]);
                } else if (filters.availabilityFilter === 'unmapped') {
                    const unmappedChecks = await Promise.all(
                        nonCancelledOrders.map(async (order) => {
                            const lineItems = order.raw.line_items;

                            for (const item of lineItems) {
                                const storeProductRef = doc(db, 'accounts', order.storeId, 'products', String(item.product_id));
                                const storeProductDoc = await getDoc(storeProductRef);
                                const docData = storeProductDoc.data();

                                // ✅ FIX: Use variantMappingDetails or variantMappings
                                const variantMapping = docData?.variantMappingDetails?.[item.variant_id]
                                    || docData?.variantMappings?.[item.variant_id];

                                if (
                                    !storeProductDoc.exists() ||
                                    !docData ||
                                    !variantMapping
                                ) return true; // unmapped → treat as unmapped
                            }

                            return false;
                        })
                    );

                    filteredOrders = nonCancelledOrders.filter((_, i) => unmappedChecks[i]);
                } else if (filters.availabilityFilter === 'pending') {
                    filteredOrders = nonCancelledOrders.filter(
                        (order) =>
                            !order.tags_confirmed ||
                            (Array.isArray(order.tags_confirmed) &&
                                order.tags_confirmed.length === 0) ||
                            order.tags_confirmed?.includes('Pending')
                    );
                } else if (filters.availabilityFilter === 'unavailable') {
                    filteredOrders = nonCancelledOrders.filter((order) =>
                        order.tags_confirmed?.includes('Unavailable')
                    );
                } else if (filters.availabilityFilter === 'available') {
                    filteredOrders = nonCancelledOrders.filter((order) =>
                        order.tags_confirmed?.includes('Available')
                    );
                }
            }

            // RTO In Transit filter
            if (
                activeTab === 'RTO In Transit' &&
                filters.rtoInTransitFilter !== 'all'
            ) {
                if (filters.rtoInTransitFilter === 're-attempt') {
                    filteredOrders = filteredOrders.filter(
                        (order) =>
                            order.tags_rtoInTransit?.length === 1 &&
                            order.tags_rtoInTransit[0] === 'Re-attempt'
                    );
                } else if (filters.rtoInTransitFilter === 'refused') {
                    filteredOrders = filteredOrders.filter(
                        (order) =>
                            order.tags_rtoInTransit?.length === 1 &&
                            order.tags_rtoInTransit[0] === 'Refused'
                    );
                } else if (filters.rtoInTransitFilter === 'no-reply') {
                    filteredOrders = filteredOrders.filter(
                        (order) =>
                            !order.tags_rtoInTransit ||
                            order.tags_rtoInTransit.length === 0 ||
                            (!order.tags_rtoInTransit.includes('Re-attempt') &&
                                !order.tags_rtoInTransit.includes('Refused'))
                    );
                }
            }

            // ============================================================
            // CLIENT-SIDE PAGINATION
            // ============================================================

            const startIndex = (currentPage - 1) * rowsPerPage;
            const endIndex = startIndex + rowsPerPage;
            const paginatedOrders = filteredOrders.slice(startIndex, endIndex);

            return {
                orders: paginatedOrders,
                totalCount: filteredOrders.length,
                hasMore: allOrders.length >= (rowsPerPage * storesToQuery.length), // Rough estimate
            };
        },

        // Query options
        enabled: !!businessId && stores.length > 0,
        staleTime: 10 * 1000,
        gcTime: 5 * 60 * 1000,
        refetchInterval: 60 * 1000,
        refetchOnWindowFocus: true,
    });
}

export type { Order, CustomStatus, UseOrdersFilters };