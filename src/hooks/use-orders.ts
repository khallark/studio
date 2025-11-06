// hooks/use-orders.ts
'use client';

import { useQuery } from '@tanstack/react-query';
import { collection, query, where, orderBy, limit, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { DateRange } from 'react-day-picker';
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
            // FIRESTORE QUERY - Server-side filtering
            // ============================================================

            let q = query(ordersRef, where('raw.cancelled_at', '==', null));

            // Filter by status tab
            if (activeTab === 'Cancelled') {
                q = query(q, where('raw.cancelled_at', '!=', null));
                console.log(1);
            } else if (activeTab !== 'All Orders') {
                q = query(q, where('customStatus', '==', activeTab));
                console.log(2);
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

            // Limit - fetch more than needed for client-side pagination
            // We'll fetch extra to handle client-side filters
            const fetchLimit = Math.max(rowsPerPage * 3, 100); // Fetch 3x or minimum 100
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

            // Search filter
            if (filters.searchQuery) {
                const lowercasedQuery = filters.searchQuery.toLowerCase().trim();
                orders = orders.filter((order) => {
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
                        order.name.toLowerCase().includes(lowercasedQuery) ||
                        (activeTab === 'All Orders' &&
                            order.customStatus.toLowerCase().includes(lowercasedQuery)) ||
                        customerName.toLowerCase().includes(lowercasedQuery) ||
                        (order.awb && order.awb.toLowerCase().includes(lowercasedQuery)) ||
                        (order.awb_reverse &&
                            order.awb_reverse.toLowerCase().includes(lowercasedQuery)) ||
                        String(order.orderId).toLowerCase().includes(lowercasedQuery) ||
                        (() => {
                            const line_items = order.raw.line_items;
                            if (!line_items) return false;
                            for (let i = 0; i < line_items.length; ++i) {
                                if (
                                    line_items[i].vendor &&
                                    String(line_items[i].vendor)
                                        .toLowerCase()
                                        .includes(lowercasedQuery)
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

            // RTO In Transit filter
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
        refetchInterval: 30 * 1000, // Auto-refetch every 30 seconds
        refetchOnWindowFocus: true, // Refetch when user returns to tab
    });
}

// ============================================================
// EXPORT TYPE (for use in components)
// ============================================================

export type { Order, CustomStatus, UseOrdersFilters };