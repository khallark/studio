// hooks/use-orders.ts
'use client';

import { useQuery } from '@tanstack/react-query';
import {
    collection,
    query,
    where,
    orderBy,
    limit,
    getDocs,
    doc,
    getDoc,
    startAfter,
    QueryConstraint,
    DocumentData,
    QueryDocumentSnapshot,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { addDays } from 'date-fns';
import { CustomStatus, Order, UseOrdersFilters } from '@/types/order';
import { SHARED_STORE_IDS, SUPER_ADMIN_ID } from '@/lib/shared-constants';

// ============================================================
// HOOK - Business-wide cursor pagination
// ============================================================

/**
 * Check if order should be excluded from availability filters
 */
function shouldSkipOrder(order: Order): boolean {
    // Skip Shopify-cancelled orders
    return !!order?.raw?.cancelled_at;
}

type StoreCursorMap = Record<string, QueryDocumentSnapshot<DocumentData> | null>;

type OrderWithDocSnap = Order & {
    __docSnap: QueryDocumentSnapshot<DocumentData>;
};

type StoreQueryResult = {
    storeId: string;
    orders: OrderWithDocSnap[];
    lastDoc: QueryDocumentSnapshot<DocumentData> | null;
    hasMore: boolean;
};

function toMillis(value: unknown): number {
    if (!value) return 0;

    if (typeof value === 'string') {
        const time = new Date(value).getTime();
        return Number.isNaN(time) ? 0 : time;
    }

    if (typeof value === 'number') return value;

    if (value instanceof Date) return value.getTime();

    if (
        typeof value === 'object' &&
        value !== null &&
        'toDate' in value &&
        typeof (value as { toDate: () => Date }).toDate === 'function'
    ) {
        return (value as { toDate: () => Date }).toDate().getTime();
    }

    return 0;
}

export function useOrders(
    businessId: string | null,
    stores: string[],
    vendorName: string | null,
    activeTab: CustomStatus | 'All Orders',
    currentPage: number,
    rowsPerPage: number,
    filters: UseOrdersFilters = {},
    pageCursor?: StoreCursorMap
) {
    return useQuery({
        // Query key - cache is based on these parameters
        // Do not put QueryDocumentSnapshot objects in the key; currentPage represents the cursor state.
        queryKey: [
            'orders',
            businessId,
            stores,
            activeTab,
            currentPage,
            rowsPerPage,
            filters,
            Object.keys(pageCursor || {}).join('|'),
        ],

        // Query function - fetches and processes data from multiple stores
        queryFn: async () => {
            if (!businessId) throw new Error('No business ID provided');

            if (!stores || stores.length === 0) {
                console.warn('No stores available in business');
                return {
                    orders: [],
                    totalCount: undefined,
                    hasMore: false,
                    nextCursor: {},
                    availableProvinces: [],
                };
            }

            // Determine which stores to query based on filter
            const storesToQuery = filters.storeFilter && filters.storeFilter.length > 0
                ? stores.filter(s => filters.storeFilter!.includes(s))
                : stores;

            if (storesToQuery.length === 0) {
                return {
                    orders: [],
                    totalCount: undefined,
                    hasMore: false,
                    nextCursor: {},
                    availableProvinces: [],
                };
            }

            console.log(`📦 Querying ${storesToQuery.length} stores:`, storesToQuery);

            // ============================================================
            // DETERMINE SEARCH TYPE
            // ============================================================

            type InternalSearchType =
                | 'none'
                | 'forwardAwb'
                | 'orderNumber'
                | 'reverseAwb'
                | 'general';

            let searchType: InternalSearchType = 'none';
            let searchValue = '';

            const rawSearchQuery = filters.searchQuery?.trim() || '';

            if (rawSearchQuery) {
                searchType = filters.searchMode || 'general';

                if (
                    searchType === 'forwardAwb' ||
                    searchType === 'reverseAwb' ||
                    searchType === 'orderNumber'
                ) {
                    searchValue = rawSearchQuery.toUpperCase();
                } else {
                    searchValue = rawSearchQuery.toLowerCase();
                }
            }

            const sortField =
                activeTab === 'RTO Delivered' || activeTab === 'RTO Closed'
                    ? 'lastStatusUpdate'
                    : 'createdAt';

            // ============================================================
            // QUERY EACH STORE
            // ============================================================

            const storeQueries = storesToQuery.map(async (storeId): Promise<StoreQueryResult> => {
                const ordersRef = collection(db, 'accounts', storeId, 'orders');
                const constraints: QueryConstraint[] = [];

                const excludedStatuses = ['New', 'DTO Requested', 'Pending Refunds'];

                // Vendor visibility for shared stores
                if (
                    SHARED_STORE_IDS.includes(storeId) &&
                    businessId !== SUPER_ADMIN_ID &&
                    vendorName
                ) {
                    constraints.push(where('vendors', 'array-contains', vendorName));
                }

                const isSharedStoreNonSuperAdmin = SHARED_STORE_IDS.includes(storeId) && businessId !== SUPER_ADMIN_ID;

                const selectedStatuses =
                    activeTab === 'All Orders'
                        ? (filters.statusFilter || [])
                        : [];

                const visibleSelectedStatuses =
                    isSharedStoreNonSuperAdmin
                        ? selectedStatuses.filter(status => !excludedStatuses.includes(status))
                        : selectedStatuses;

                // Filter by status tab / All Orders status filter
                if (activeTab === 'All Orders') {
                    if (visibleSelectedStatuses.length > 0) {
                        if (visibleSelectedStatuses.length === 1) {
                            constraints.push(where('customStatus', '==', visibleSelectedStatuses[0]));
                        } else {
                            constraints.push(where('customStatus', 'in', visibleSelectedStatuses.slice(0, 10)));
                        }
                    } else if (selectedStatuses.length > 0) {
                        // User selected only statuses that are hidden for this vendor.
                        constraints.push(where('customStatus', '==', '__NO_MATCH__'));
                    } else if (isSharedStoreNonSuperAdmin) {
                        constraints.push(where('customStatus', 'not-in', excludedStatuses));
                    }
                } else {
                    if (isSharedStoreNonSuperAdmin && excludedStatuses.includes(activeTab)) {
                        constraints.push(where('customStatus', '==', '__NO_MATCH__'));
                    } else {
                        constraints.push(where('customStatus', '==', activeTab));
                    }
                }

                // Server-side search
                if (searchType === 'orderNumber') {
                    const orderNameSearchValue = searchValue.startsWith('#')
                        ? searchValue
                        : `#${searchValue}`;
                    constraints.push(where('name', '>=', orderNameSearchValue));
                    constraints.push(where('name', '<=', orderNameSearchValue + '\uf8ff'));
                } else if (searchType === 'forwardAwb') {
                    constraints.push(where('awb', '>=', searchValue));
                    constraints.push(where('awb', '<=', searchValue + '\uf8ff'));
                } else if (searchType === 'reverseAwb') {
                    constraints.push(where('awb_reverse', '>=', searchValue));
                    constraints.push(where('awb_reverse', '<=', searchValue + '\uf8ff'));
                }

                // Date range filter
                if (filters.dateRange?.from) {
                    const toDate = filters.dateRange.to
                        ? addDays(filters.dateRange.to, 1)
                        : addDays(filters.dateRange.from, 1);

                    constraints.push(
                        where('createdAt', '>=', filters.dateRange.from.toISOString().slice(0, 19) + 'Z'),
                        where('createdAt', '<', toDate.toISOString().slice(0, 19) + 'Z')
                    );
                }

                // Courier filter
                if (
                    !['New', 'Confirmed', 'Cancelled'].includes(activeTab) &&
                    filters.courierFilter &&
                    filters.courierFilter !== 'all'
                ) {
                    constraints.push(where('courierProvider', '==', filters.courierFilter));
                }

                if (filters.vendorName) {
                    constraints.push(where('vendors', 'array-contains', filters.vendorName));
                }

                if (filters.stateFilter && filters.stateFilter !== 'all') {
                    constraints.push(where('shippingOrBillingState', '==', filters.stateFilter));
                }

                if (filters.paymentTypeFilter && filters.paymentTypeFilter !== 'all') {
                    if (filters.paymentTypeFilter === 'prepaid') {
                        constraints.push(where('paymentStatus', '==', 'Prepaid'));
                    } else if (filters.paymentTypeFilter === 'cod') {
                        constraints.push(where('paymentStatus', '==', 'COD'));
                    }
                }

                if (
                    activeTab === 'Ready To Dispatch' &&
                    filters.packedFilter &&
                    filters.packedFilter !== 'all'
                ) {
                    if (filters.packedFilter === 'packed') {
                        constraints.push(where('isPacked', '==', true));
                    } else if (filters.packedFilter === 'unpacked') {
                        constraints.push(where('isPacked', '==', false));
                    }
                }

                if (
                    activeTab === 'RTO In Transit' &&
                    filters.rtoInTransitFilter &&
                    filters.rtoInTransitFilter !== 'all'
                ) {
                    if (filters.rtoInTransitFilter === 're-attempt') {
                        constraints.push(where('tags_rtoInTransit', '==', ['Re-attempt']));
                    } else if (filters.rtoInTransitFilter === 'refused') {
                        constraints.push(where('tags_rtoInTransit', '==', ['Refused']));
                    }
                }

                // Sorting - always by time for business-wide view
                constraints.push(orderBy(sortField, 'desc'));

                // Cursor for this store/page
                if (pageCursor?.[storeId]) {
                    constraints.push(startAfter(pageCursor[storeId]));
                }

                // Fetch slightly extra per store so client-side filters and merge sorting still have enough candidates.
                const hasClientSideFilters =
                    searchType === 'general' ||
                    (
                        activeTab === 'Confirmed' &&
                        !!filters.availabilityFilter &&
                        filters.availabilityFilter !== 'all'
                    );

                const perStoreFetchLimit = hasClientSideFilters
                    ? Math.max(rowsPerPage * 5, 50)
                    : rowsPerPage + 1;

                constraints.push(limit(perStoreFetchLimit));

                try {
                    const snapshot = await getDocs(query(ordersRef, ...constraints));

                    let orders = snapshot.docs.map((docSnap) => ({
                        ...docSnap.data(),
                        id: docSnap.id,
                        storeId,
                        __docSnap: docSnap,
                    })) as OrderWithDocSnap[];

                    return {
                        storeId,
                        orders,
                        lastDoc: snapshot.docs[snapshot.docs.length - 1] ?? null,
                        hasMore: snapshot.docs.length === perStoreFetchLimit,
                    };
                } catch (error: any) {
                    console.error(`Error fetching orders from store ${storeId}:`, error);
                    return {
                        storeId,
                        orders: [],
                        lastDoc: null,
                        hasMore: false,
                    };
                }
            });

            const storeResults = await Promise.all(storeQueries);

            // ============================================================
            // MERGE + GLOBAL SORT
            // ============================================================

            const allOrders = storeResults.flatMap(result => result.orders);

            allOrders.sort((a, b) => {
                const timeA = toMillis(
                    sortField === 'lastStatusUpdate'
                        ? (a.lastStatusUpdate || a.createdAt)
                        : a.createdAt
                );

                const timeB = toMillis(
                    sortField === 'lastStatusUpdate'
                        ? (b.lastStatusUpdate || b.createdAt)
                        : b.createdAt
                );

                return timeB - timeA;
            });

            // ============================================================
            // CLIENT-SIDE FILTERING
            // ============================================================

            let filteredOrders: OrderWithDocSnap[] = allOrders;

            // Client-side search
            if (searchType === 'general' && searchValue) {
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
                            const condition = (field: string, index: number) => {
                                const item = line_items[index] as any;
                                return (
                                    item?.[field] &&
                                    String(item[field])
                                        .toLowerCase()
                                        .includes(searchValue)
                                );
                            };
                            for (let i = 0; i < line_items.length; ++i) {
                                if (
                                    condition('name', i) ||
                                    condition('sku', i) ||
                                    condition('title', i) ||
                                    condition('variant_id', i) ||
                                    condition('product_id', i) ||
                                    condition('vendor', i)
                                ) {
                                    return true;
                                }
                            }
                            return false;
                        })();

                    return match;
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

                                // Extract business id
                                const mappedBusinessId = typeof variantMapping === 'object'
                                    ? variantMapping.businessId
                                    : variantMapping;

                                if (mappedBusinessId !== businessId) return false // unmapped for this business account

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

                                // Extract business id
                                const mappedBusinessId = typeof variantMapping === 'object'
                                    ? variantMapping.businessId
                                    : variantMapping;

                                if (mappedBusinessId !== businessId) return false // unmapped for this business account

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

                                // Extract business id
                                const mappedBusinessId = typeof variantMapping === 'object'
                                    ? variantMapping.businessId
                                    : variantMapping;

                                if (mappedBusinessId !== businessId) return false // unmapped for this business account
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

            // ============================================================
            // CURSOR PAGINATION
            // ============================================================

            const pageOrders = filteredOrders.slice(0, rowsPerPage);
            const nextCursor: StoreCursorMap = {};

            for (const result of storeResults) {
                const lastReturnedOrderFromThisStore = [...pageOrders]
                    .reverse()
                    .find(order => order.storeId === result.storeId);

                nextCursor[result.storeId] =
                    lastReturnedOrderFromThisStore?.__docSnap ||
                    pageCursor?.[result.storeId] ||
                    null;
            }

            const availableProvinces = Array.from(
                new Set(
                    filteredOrders
                        .map((order) =>
                            order.raw.shipping_address?.province ||
                            order.raw.billing_address?.province ||
                            order.raw.customer?.default_address?.province ||
                            null
                        )
                        .filter((p): p is string => !!p)
                )
            ).sort();

            return {
                orders: pageOrders.map(({ __docSnap, ...order }) => order),
                totalCount: undefined,
                hasMore: storeResults.some(result => result.hasMore) || filteredOrders.length > rowsPerPage,
                nextCursor,
                availableProvinces,
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
