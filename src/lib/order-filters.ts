// lib/order-filters.ts
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Order, UseOrdersFilters } from '@/types/order';
import { CustomStatus } from '@/types/order';

export async function applyClientSideFilters(
    orders: Order[],
    activeTab: CustomStatus | 'All Orders',
    filters: UseOrdersFilters,
    businessId: string
): Promise<Order[]> {
    let filtered = [...orders];

    // Client-side text search
    if (filters.searchQuery) {
        const searchValue = filters.searchQuery.trim().toLowerCase();
        const isNameSearch = /^#[\w-]+$/i.test(filters.searchQuery.trim());
        const isAwbSearch = /^[A-Z0-9]{10,}$/i.test(filters.searchQuery.trim());

        if (!isNameSearch && !isAwbSearch) {
            filtered = filtered.filter((order) => {
                const customerName =
                    (order.raw.shipping_address?.name ??
                    order.raw.billing_address?.name ??
                    order.raw.customer?.name ??
                    `${order.raw.shipping_address?.first_name || ''} ${order.raw.shipping_address?.last_name || ''}`.trim()) ||
                    `${order.raw.customer?.first_name || ''} ${order.raw.customer?.last_name || ''}`.trim() ||
                    order.email || '';

                const match =
                    order.name.toLowerCase().includes(searchValue) ||
                    (activeTab === 'All Orders' && order.customStatus.toLowerCase().includes(searchValue)) ||
                    customerName.toLowerCase().includes(searchValue) ||
                    (order.awb && order.awb.toLowerCase().includes(searchValue)) ||
                    (order.awb_reverse && order.awb_reverse.toLowerCase().includes(searchValue)) ||
                    String(order.orderId).toLowerCase().includes(searchValue) ||
                    (order.raw.line_items || []).some((item: any) =>
                        item.vendor && String(item.vendor).toLowerCase().includes(searchValue)
                    );

                return filters.invertSearch ? !match : match;
            });
        }
    }

    // Availability filter
    if (activeTab === 'Confirmed' && filters.availabilityFilter && filters.availabilityFilter !== 'all') {
        const nonCancelled = filtered.filter(o => !o?.raw?.cancelled_at);

        if (filters.availabilityFilter === 'picked up') {
            filtered = nonCancelled.filter(o => !!o.pickupReady);
        } else if (filters.availabilityFilter === 'unmapped') {
            const checks = await Promise.all(nonCancelled.map(async (order) => {
                for (const item of order.raw.line_items || []) {
                    const ref = doc(db, 'accounts', order.storeId, 'products', String(item.product_id));
                    const snap = await getDoc(ref);
                    const data = snap.data();
                    const mapping = data?.variantMappingDetails?.[item.variant_id] || data?.variantMappings?.[item.variant_id];
                    if (!snap.exists() || !data || !mapping) return true;
                    const mappedBiz = typeof mapping === 'object' ? mapping.businessId : mapping;
                    if (mappedBiz !== businessId) return true;
                }
                return false;
            }));
            filtered = nonCancelled.filter((_, i) => checks[i]);
        } else if (filters.availabilityFilter === 'eligible') {
            const checks = await Promise.all(nonCancelled.map(async (order) => {
                if (order.pickupReady) return false;
                const bpIds: [string, number][] = [];
                for (const item of order.raw.line_items || []) {
                    const ref = doc(db, 'accounts', order.storeId, 'products', String(item.product_id));
                    const snap = await getDoc(ref);
                    const data = snap.data();
                    const mapping = data?.variantMappingDetails?.[item.variant_id] || data?.variantMappings?.[item.variant_id];
                    if (!snap.exists() || !data || !mapping) return false;
                    const sku = typeof mapping === 'object' ? mapping.businessProductSku : mapping;
                    const mappedBiz = typeof mapping === 'object' ? mapping.businessId : mapping;
                    if (mappedBiz !== businessId) return false;
                    bpIds.push([String(sku), item.quantity]);
                }
                for (const [id, qty] of bpIds) {
                    const bpRef = doc(db, 'users', businessId, 'products', id);
                    const bpSnap = await getDoc(bpRef);
                    const data = bpSnap.data();
                    if (!bpSnap.exists() || !data || Number(data.inShelfQuantity || 0) < Number(qty)) return false;
                }
                return true;
            }));
            filtered = nonCancelled.filter((_, i) => checks[i]).map(o => ({ ...o, isEligibleForPickup: true }));
        } else if (filters.availabilityFilter === 'not eligible') {
            const checks = await Promise.all(nonCancelled.map(async (order) => {
                if (order.pickupReady) return false;
                const bpIds: [string, number][] = [];
                for (const item of order.raw.line_items || []) {
                    const ref = doc(db, 'accounts', order.storeId, 'products', String(item.product_id));
                    const snap = await getDoc(ref);
                    const data = snap.data();
                    const mapping = data?.variantMappingDetails?.[item.variant_id] || data?.variantMappings?.[item.variant_id];
                    if (!snap.exists() || !data || !mapping) return false;
                    const sku = typeof mapping === 'object' ? mapping.businessProductSku : mapping;
                    const mappedBiz = typeof mapping === 'object' ? mapping.businessId : mapping;
                    if (mappedBiz !== businessId) return false;
                    bpIds.push([String(sku), item.quantity]);
                }
                for (const [id, qty] of bpIds) {
                    const bpRef = doc(db, 'users', businessId, 'products', id);
                    const bpSnap = await getDoc(bpRef);
                    const data = bpSnap.data();
                    if (!bpSnap.exists() || !data || Number(data.inShelfQuantity || 0) < Number(qty)) return true;
                }
                return false;
            }));
            filtered = nonCancelled.filter((_, i) => checks[i]);
        } else if (filters.availabilityFilter === 'pending') {
            filtered = filtered.filter(o =>
                !o.tags_confirmed ||
                (Array.isArray(o.tags_confirmed) && o.tags_confirmed.length === 0) ||
                o.tags_confirmed?.includes('Pending')
            );
        } else if (filters.availabilityFilter === 'unavailable') {
            filtered = filtered.filter(o => o.tags_confirmed?.includes('Unavailable'));
        } else if (filters.availabilityFilter === 'available') {
            filtered = filtered.filter(o => o.tags_confirmed?.includes('Available'));
        }
    }

    // RTO In Transit filter
    if (activeTab === 'RTO In Transit' && filters.rtoInTransitFilter && filters.rtoInTransitFilter !== 'all') {
        if (filters.rtoInTransitFilter === 're-attempt') {
            filtered = filtered.filter(o => o.tags_rtoInTransit?.length === 1 && o.tags_rtoInTransit[0] === 'Re-attempt');
        } else if (filters.rtoInTransitFilter === 'refused') {
            filtered = filtered.filter(o => o.tags_rtoInTransit?.length === 1 && o.tags_rtoInTransit[0] === 'Refused');
        } else if (filters.rtoInTransitFilter === 'no-reply') {
            filtered = filtered.filter(o =>
                !o.tags_rtoInTransit || o.tags_rtoInTransit.length === 0 ||
                (!o.tags_rtoInTransit.includes('Re-attempt') && !o.tags_rtoInTransit.includes('Refused'))
            );
        }
    }

    // Packed filter
    if (activeTab === 'Ready To Dispatch' && filters.packedFilter && filters.packedFilter !== 'all') {
        filtered = filtered.filter(o => filters.packedFilter === 'packed' ? !!o.lastPackedAt : !o.lastPackedAt);
    }

    // Payment type filter
    if (filters.paymentTypeFilter && filters.paymentTypeFilter !== 'all') {
        filtered = filtered.filter(o =>
            filters.paymentTypeFilter === 'cod'
                ? o.financialStatus === 'pending'
                : o.financialStatus !== 'pending'
        );
    }

    // State filter
    if (filters.stateFilter && filters.stateFilter !== 'all') {
        filtered = filtered.filter(o => {
            const province = o.raw.shipping_address?.province || o.raw.billing_address?.province || null;
            return province === filters.stateFilter;
        });
    }

    return filtered;
}