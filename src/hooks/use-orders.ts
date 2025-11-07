// hooks/use-orders.ts
'use client';

import { useQuery } from '@tanstack/react-query';
import { collection, query, where, orderBy, limit, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { addDays } from 'date-fns';
import { CustomStatus, Order, UseOrdersFilters } from '@/types/order';

// ============================================================
// HOOK
// ============================================================

export function useOrders(
    storeId: string | null,
    activeTab: CustomStatus | 'All Orders',
    currentPage: number,
    rowsPerPage: number,
    filters: UseOrdersFilters = {}
) {
    return useQuery({
        // Query key - cache is based on these parameters
        queryKey: ['orders', storeId, activeTab, currentPage, rowsPerPage, filters],

        // Query function - fetches and processes data
        queryFn: async () => {
            if (!storeId) throw new Error('No store ID provided');

            const ordersRef = collection(db, 'accounts', storeId, 'orders');

            // ============================================================
            // DETERMINE SEARCH TYPE
            // ============================================================

            let searchType: 'none' | 'name' | 'awb' | 'clientSide' = 'none';
            let searchValue = '';

            if (filters.searchQuery) {
                const query = filters.searchQuery.trim();

                // Check if it's an order name (starts with #, followed by optional prefix and number)
                // Matches: #1001, #ABC-123, #TEST-456, etc.
                if (/^#[\w-]+$/i.test(query)) {
                    searchType = 'name';
                    searchValue = query.toUpperCase(); // Normalize to uppercase for consistency
                }
                // Check if it looks like an AWB (alphanumeric, usually 10+ chars)
                else if (/^[A-Z0-9]{10,}$/i.test(query)) {
                    searchType = 'awb';
                    searchValue = query.toUpperCase();
                }
                // Otherwise, client-side search
                else {
                    searchType = 'clientSide';
                    searchValue = query.toLowerCase();
                }
            }

            // ============================================================
            // FIRESTORE QUERY - Server-side filtering
            // ============================================================

            let q = query(ordersRef, where('raw.cancelled_at', '==', null));

            // Filter by status tab
            if (activeTab === 'Cancelled') {
                q = query(ordersRef, where('raw.cancelled_at', '!=', null));
            } else if (activeTab !== 'All Orders') {
                q = query(q, where('customStatus', '==', activeTab));
            }

            // ✅ SERVER-SIDE SEARCH
            if (searchType === 'name') {
                // Search by order ID (exact match)
                q = query(q, where('name', '==', searchValue));

            } else if (searchType === 'awb') {
                // Search by AWB (prefix match for autocomplete)
                q = query(
                    q,
                    where('awb', '>=', searchValue),
                    where('awb', '<=', searchValue + '\uf8ff')
                );
            } else {
                // For client-side search, fetch more results
                // (we'll filter them client-side below)
            }

            // Date range filter (if specified)
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

            // Courier filter (only for shipped orders)
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

            // Sorting
            // const sortField = filters.sortKey === 'name' ? 'name' : 'createdAt';
            // const sortDir = filters.sortDirection === 'asc' ? 'asc' : 'desc';
            const sortField = 'name';
            const sortDir = 'desc';

            // Special case: RTO Delivered sorted by lastStatusUpdate
            if (activeTab === 'RTO Delivered') {
                q = query(q, orderBy('lastStatusUpdate', 'desc'));
            } else {
                q = query(q, orderBy(sortField, sortDir));
            }

            const fetchLimit = searchType === 'clientSide'
                ? Math.max(rowsPerPage * 3, 100) // Fetch more for client-side filtering
                : rowsPerPage * 2; // Fetch less for server-side search

            q = query(q, limit(fetchLimit));

            // Execute Firestore query
            let orders;
            try {
                const snapshot = await getDocs(q);
                orders = snapshot.docs.map((doc) => ({
                    id: doc.id,
                    ...doc.data(),
                })) as Order[];
            } catch (error) {
                console.error(error);
                return {};
            }

            // ============================================================
            // CLIENT-SIDE FILTERING
            // ============================================================

            // ✅ CLIENT-SIDE SEARCH (only if not handled server-side)
            if (searchType === 'clientSide' && searchValue) {
                orders = orders.filter((order) => {
                    const customerName =
                        (
                            order.raw.shipping_address?.name ??
                            order.raw.billing_address?.name ??
                            order.raw.customer?.name
                        ) ||
                        `${order.raw.shipping_address?.first_name || ''} ${order.raw.shipping_address?.last_name || ''
                            }`.trim() ||
                        `${order.raw.billing_address?.first_name || ''} ${order.raw.billing_address?.last_name || ''
                            }`.trim() ||
                        `${order.raw.customer?.first_name || ''} ${order.raw.customer?.last_name || ''
                            }`.trim() ||
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
                    orders = orders.filter((order) =>
                        order.tags_confirmed?.includes('Available')
                    );
                } else if (filters.availabilityFilter === 'unavailable') {
                    orders = orders.filter((order) =>
                        order.tags_confirmed?.includes('Unavailable')
                    );
                } else {
                    // pending
                    orders = orders.filter(
                        (order) =>
                            !order.tags_confirmed ||
                            (Array.isArray(order.tags_confirmed) &&
                                order.tags_confirmed.length === 0) ||
                            order.tags_confirmed?.includes('Pending')
                    );
                }
            }

            // ✅ RTO In Transit filter (all handled client-side now)
            if (
                activeTab === 'RTO In Transit' &&
                filters.rtoInTransitFilter !== 'all'
            ) {
                if (filters.rtoInTransitFilter === 're-attempt') {
                    orders = orders.filter(
                        (order) =>
                            order.tags_rtoInTransit?.length === 1 &&
                            order.tags_rtoInTransit[0] === 'Re-attempt'
                    );
                } else if (filters.rtoInTransitFilter === 'refused') {
                    orders = orders.filter(
                        (order) =>
                            order.tags_rtoInTransit?.length === 1 &&
                            order.tags_rtoInTransit[0] === 'Refused'
                    );
                } else if (filters.rtoInTransitFilter === 'no-reply') {
                    orders = orders.filter(
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
            const paginatedOrders = orders.slice(startIndex, endIndex);

            // Return both paginated orders and total count for pagination UI
            return {
                orders: paginatedOrders,
                totalCount: orders.length,
                hasMore: orders.length >= fetchLimit, // Indicates if there might be more data
            };
        },

        // Query options
        enabled: !!storeId, // Only run when storeId exists
        staleTime: 10 * 1000, // Data is fresh for 10 seconds
        gcTime: 5 * 60 * 1000, // Keep in cache for 5 minutes
        refetchInterval: 60 * 1000, // Auto-refetch every 30 seconds
        refetchOnWindowFocus: true, // Refetch when user returns to tab
    });
}

// ============================================================
// EXPORT TYPE (for use in components)
// ============================================================

export type { Order, CustomStatus, UseOrdersFilters };