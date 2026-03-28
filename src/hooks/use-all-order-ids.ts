// hooks/use-all-order-ids.ts
'use client';

import { useQuery } from '@tanstack/react-query';
import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { addDays } from 'date-fns';
import { CustomStatus, UseOrdersFilters, Order } from '@/types/order';
import { SHARED_STORE_IDS, SUPER_ADMIN_ID } from '@/lib/shared-constants';
import { applyClientSideFilters } from '@/lib/order-filters';

// Large enough to cover any realistic "select all" scenario.
// Increase if you have businesses with more orders per status.
const ALL_IDS_FETCH_LIMIT = 2000;

export function useAllOrderIds(
    businessId: string | null,
    stores: string[],
    vendorName: string | null,
    activeTab: CustomStatus | 'All Orders',
    filters: UseOrdersFilters,
    enabled: boolean   // only fires when user clicks "Select all N orders"
) {
    return useQuery({
        queryKey: ['allOrderIds', businessId, stores, activeTab, filters],
        queryFn: async (): Promise<string[]> => {
            if (!businessId || !stores.length) return [];

            const storesToQuery = filters.storeFilter?.length
                ? stores.filter(s => filters.storeFilter!.includes(s))
                : stores;

            if (!storesToQuery.length) return [];

            let searchType: 'none' | 'name' | 'awb' | 'clientSide' = 'none';
            let searchValue = '';
            if (filters.searchQuery) {
                const q = filters.searchQuery.trim();
                if (/^#[\w-]+$/i.test(q)) { searchType = 'name'; searchValue = q.toUpperCase(); }
                else if (/^[A-Z0-9]{10,}$/i.test(q)) { searchType = 'awb'; searchValue = q.toUpperCase(); }
                else { searchType = 'clientSide'; searchValue = q.toLowerCase(); }
            }

            const excludedStatuses = ['New', 'DTO Requested', 'Pending Refunds'];

            const storeResults = await Promise.all(storesToQuery.map(async (storeId) => {
                const ordersRef = collection(db, 'accounts', storeId, 'orders');
                let q = query(ordersRef);
                let needsClientSideStatusFilter = false;

                const isSharedNonAdmin = SHARED_STORE_IDS.includes(storeId) && businessId !== SUPER_ADMIN_ID;

                if (isSharedNonAdmin && vendorName) {
                    if (vendorName === 'OWR') {
                        q = query(q, where('vendors', 'array-contains-any', ['OWR', 'BBB', 'Ghamand']));
                        if (activeTab === 'All Orders') needsClientSideStatusFilter = true;
                    } else {
                        q = query(q, where('vendors', 'array-contains', vendorName));
                    }
                }

                if (activeTab === 'All Orders') {
                    if (isSharedNonAdmin && searchType !== 'name' && searchType !== 'awb') {
                        q = query(q, where('customStatus', 'not-in', excludedStatuses));
                    } else if (isSharedNonAdmin) {
                        needsClientSideStatusFilter = true;
                    }
                } else {
                    q = query(q,
                        where('customStatus', '==',
                            isSharedNonAdmin && excludedStatuses.includes(activeTab)
                                ? 'some-random-shit'
                                : activeTab
                        )
                    );
                }

                if (searchType === 'name') q = query(q, where('name', '==', searchValue));
                else if (searchType === 'awb') q = query(q, where('awb', '>=', searchValue), where('awb', '<=', searchValue + '\uf8ff'));

                if (filters.dateRange?.from) {
                    const to = filters.dateRange.to ? addDays(filters.dateRange.to, 1) : addDays(filters.dateRange.from, 1);
                    q = query(q, where('createdAt', '>=', filters.dateRange.from.toISOString()), where('createdAt', '<', to.toISOString()));
                }

                if (!['New', 'Confirmed', 'Cancelled'].includes(activeTab) && filters.courierFilter && filters.courierFilter !== 'all') {
                    q = query(q, where('courierProvider', '==', filters.courierFilter));
                }

                q = query(q,
                    orderBy(activeTab === 'RTO Delivered' || activeTab === 'RTO Closed' ? 'lastStatusUpdate' : 'createdAt', 'desc'),
                    limit(ALL_IDS_FETCH_LIMIT)
                );

                try {
                    const snapshot = await getDocs(q);
                    let orders = snapshot.docs.map(d => ({ ...d.data(), id: d.id, storeId })) as Order[];
                    if (needsClientSideStatusFilter) {
                        orders = orders.filter(o => !excludedStatuses.includes(o.customStatus));
                    }
                    return orders;
                } catch {
                    return [];
                }
            }));

            let allOrders = storeResults.flat();

            // Sort
            allOrders.sort((a, b) =>
                new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
            );

            // Apply all the same client-side filters (search, payment, state, packed, etc.)
            const filtered = await applyClientSideFilters(allOrders, activeTab, filters, businessId);

            return filtered.map(o => o.id);
        },
        enabled: enabled && !!businessId && stores.length > 0,
        staleTime: 30_000,
        gcTime: 60_000,
    });
}