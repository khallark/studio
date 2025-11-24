// hooks/use-orders.ts
'use client';

import { useQuery } from '@tanstack/react-query';
import { collection, query, where, orderBy, limit, getDocs, and } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { addDays } from 'date-fns';
import { CustomStatus, Order, UseOrdersFilters } from '@/types/order';

// ============================================================
// HOOK - Now business-wide, not store-specific
// ============================================================

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
            const SHARED_STORE_ID = 'nfkjgp-sv.myshopify.com';
            const SUPER_ADMIN_ID = 'vD8UJMLtHNefUfkMgbcF605SNAm2';

            // Fetch orders from each store in parallel
            const storeQueries = storesToQuery.map(async (storeId) => {
                const ordersRef = collection(db, 'accounts', storeId, 'orders');

                let q = query(ordersRef);

                // ✅ NEW: Filter by vendor for shared store
                if (storeId === SHARED_STORE_ID && businessId !== SUPER_ADMIN_ID && vendorName) {
                    if (vendorName === 'OWR') {
                        const allPermutations = [
                            ["OWR"],
                            ["Ghamand"],
                            ["BBB"],
                            ["OWR", "Ghamand"],
                            ["Ghamand", "OWR"],
                            ["OWR", "BBB"],
                            ["BBB", "OWR"],
                            ["Ghamand", "BBB"],
                            ["BBB", "Ghamand"],
                            ["OWR", "Ghamand", "BBB"],
                            ["OWR", "BBB", "Ghamand"],
                            ["Ghamand", "OWR", "BBB"],
                            ["Ghamand", "BBB", "OWR"],
                            ["BBB", "OWR", "Ghamand"],
                            ["BBB", "Ghamand", "OWR"]
                        ];
                        q = query(q, where('vendors', 'in', allPermutations));
                    }
                    else {
                        q = query(q, where('vendors', 'array-contains', vendorName));
                    }
                }

                // Filter by status tab - use customStatus for all tabs
                const isSharedStoreNonSuperAdmin = storeId === SHARED_STORE_ID && businessId !== SUPER_ADMIN_ID;

                if (activeTab === 'All Orders') {
                    if (isSharedStoreNonSuperAdmin) {
                        q = query(q, where('customStatus', 'not-in', ['New', 'DTO Requested']));
                    }
                } else {
                    // For specific status tabs
                    if (isSharedStoreNonSuperAdmin && ['New', 'DTO Requested', 'Pending Refunds'].includes(activeTab)) {
                        // Hide these tabs for non-super-admin users on shared store
                        q = query(q, where('customStatus', '==', 'some-random-shit'));
                    } else {
                        q = query(q, where('customStatus', '==', activeTab));
                    }
                }

                // Server-side search
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
                    return snapshot.docs.map((doc) => ({
                        id: doc.id,
                        storeId, // Add store ID to each order
                        ...doc.data(),
                    })) as Order[];
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
                if (filters.availabilityFilter === 'available') {
                    filteredOrders = filteredOrders.filter((order) =>
                        order.tags_confirmed?.includes('Available')
                    );
                } else if (filters.availabilityFilter === 'unavailable') {
                    filteredOrders = filteredOrders.filter((order) =>
                        order.tags_confirmed?.includes('Unavailable')
                    );
                } else {
                    filteredOrders = filteredOrders.filter(
                        (order) =>
                            !order.tags_confirmed ||
                            (Array.isArray(order.tags_confirmed) &&
                                order.tags_confirmed.length === 0) ||
                            order.tags_confirmed?.includes('Pending')
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