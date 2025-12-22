// hooks/use-order-mutations.ts
'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { User } from 'firebase/auth';
import { useToast } from '@/hooks/use-toast';
import { CustomStatus } from './use-orders';

/**
 * Order mutations for business context
 * 
 * Changes from store-level version:
 * - Takes businessId for cache invalidation (instead of storeId)
 * - All API calls still work the same way
 * - Cache invalidation now uses businessId to refresh all stores
 */

// ============================================================
// MUTATION 1: UPDATE ORDER STATUS
// ============================================================

export function useUpdateOrderStatus(
  businessId: string | null,
  user: User | null | undefined
) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      orderId,
      status,
      storeId
    }: {
      orderId: string;
      status: CustomStatus;
      storeId: string | null;
    }) => {
      if (!storeId || !user || !orderId) {
        throw new Error('Missing storeId or user or orderId');
      }

      const idToken = await user.getIdToken();
      const response = await fetch('/api/shopify/orders/bulk-update-status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ businessId, shop: storeId, orderIds: [orderId], status }),
      });

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.details || 'Failed to update status');
      }

      return response.json();
    },

    onMutate: (variables) => {
      toast({
        title: 'Update in Progress',
        description: `Updating order to "${variables.status}". Please wait.`,
      });
    },

    onSuccess: () => {
      // ✅ Changed: Invalidate business-level queries instead of store-level
      queryClient.invalidateQueries({ queryKey: ['orders', businessId] });
      queryClient.invalidateQueries({ queryKey: ['orderCounts', businessId] });

      toast({
        title: 'Status Updated',
        description: 'Order status has been updated successfully.',
      });
    },

    onError: (error: Error) => {
      toast({
        title: 'Update Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// ============================================================
// MUTATION 2: REVERT ORDER STATUS
// ============================================================

export function useRevertOrderStatus(
  businessId: string | null,
  user: User | null | undefined
) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      orderId,
      revertTo,
      storeId
    }: {
      orderId: string;
      revertTo: 'Confirmed' | 'Delivered';
      storeId: string | null;
    }) => {
      if (!storeId || !user) throw new Error('Missing storeId or user');

      const endpoint =
        revertTo === 'Confirmed'
          ? '/api/shopify/orders/revert-to-confirmed'
          : '/api/shopify/orders/revert-to-delivered';

      const idToken = await user.getIdToken();
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ businessId, shop: storeId, orderId }),
      });

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.details || `Failed to revert to ${revertTo}`);
      }

      return response.json();
    },

    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['orders', businessId] });
      queryClient.invalidateQueries({ queryKey: ['orderCounts', businessId] });

      toast({
        title: 'Status Reverted',
        description: `Order status changed back to ${variables.revertTo}.`,
      });
    },

    onError: (error: Error) => {
      toast({
        title: 'Revert Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// ============================================================
// MUTATION 3: DISPATCH ORDERS
// ============================================================

export function useDispatchOrders(
  businessId: string | null,
  user: User | null | undefined
) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ orderIds, storeId, }: {
      orderIds: string[];
      storeId: string | null;
    }) => {
      if (!storeId || !user || orderIds.length === 0) {
        throw new Error('Invalid parameters');
      }

      const idToken = await user.getIdToken();
      const response = await fetch('/api/shopify/orders/dispatch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ businessId, shop: storeId, orderIds }),
      });

      if (!response.ok && response.status !== 207) {
        const result = await response.json();
        throw new Error(result.details || 'Failed to dispatch orders');
      }

      return response.json();
    },

    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['orders', businessId] });
      queryClient.invalidateQueries({ queryKey: ['orderCounts', businessId] });

      toast({
        title: 'Dispatch Process Started',
        description: data.message,
      });

      if (data.errors && data.errors.length > 0) {
        toast({
          title: 'Some Dispatches Failed',
          description: `Check the console for details on ${data.errors.length} failed orders.`,
          variant: 'destructive',
        });
        console.error('Dispatch failures:', data.errors);
      }
    },

    onError: (error: Error) => {
      toast({
        title: 'Dispatch Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// ============================================================
// MUTATION 4: BULK UPDATE STATUS
// ============================================================

export function useBulkUpdateStatus(
  businessId: string | null,
  user: User | null | undefined
) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      orderIds,
      status,
      storeId,
    }: {
      orderIds: string[];
      status: CustomStatus;
      storeId: string | null;
    }) => {
      if (!storeId || !user || orderIds.length === 0) {
        throw new Error('Invalid parameters');
      }

      const idToken = await user.getIdToken();
      const response = await fetch('/api/shopify/orders/bulk-update-status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ businessId, shop: storeId, orderIds, status }),
      });

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.details || `Failed to update ${orderIds.length} orders`);
      }

      return response.json();
    },

    onMutate: (variables) => {
      toast({
        title: 'Bulk Update in Progress',
        description: `Updating ${variables.orderIds.length} order(s) to "${variables.status}". Please wait.`,
      });
    },

    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['orders', businessId] });
      queryClient.invalidateQueries({ queryKey: ['orderCounts', businessId] });

      toast({
        title: 'Bulk Update Successful',
        description: data.message,
      });
    },

    onError: (error: Error) => {
      toast({
        title: 'Bulk Update Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// ============================================================
// MUTATION 5: ORDER SPLIT
// ============================================================

export function useOrderSplit(
  businessId: string | null,
  user: User | null | undefined
) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ orderId, storeId }: { orderId: string; storeId: string | null; }) => {
      if (!storeId || !user || !orderId) throw new Error('Invalid parameters');

      const idToken = await user.getIdToken();
      const response = await fetch('/api/shopify/orders/split-order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ businessId, shop: storeId, orderId }),
      });

      if (!response.ok && response.status !== 207) {
        const result = await response.json();
        throw new Error(result.error || 'Failed to split order');
      }

      return response.json();
    },

    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['orders', businessId] });
      queryClient.invalidateQueries({ queryKey: ['orderCounts', businessId] });

      toast({
        title: 'Order Splitting Process Started',
        description: data.message,
      });

      if (data.errors && data.errors.length > 0) {
        toast({
          title: 'Order Splitting Failed',
          description: 'Something wrong happened, check the function logs.',
          variant: 'destructive',
        });
        console.error('Order Split failure:', data.error);
      }
    },

    onError: (error: Error) => {
      toast({
        title: 'Order Splitting Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// ============================================================
// MUTATION 6: RETURN BOOKING
// ============================================================

export function useReturnBooking(
  businessId: string | null,
  user: User | null | undefined
) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ orderIds, storeId }: { orderIds: string[]; storeId: string | null; }) => {
      if (!storeId || !user || orderIds.length === 0) {
        throw new Error('Invalid parameters');
      }

      toast({
        title: 'Processing orders',
        description: 'Please wait...',
      });

      const idToken = await user.getIdToken();
      const response = await fetch('/api/shopify/courier/bulk-book-return', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          businessId,
          shop: storeId,
          orderIds,
          shippingMode: 'Surface',
        }),
      });

      if (!response.ok && response.status !== 207) {
        const result = await response.json();
        throw new Error(result.details || 'Failed to book return for orders');
      }

      return response.json();
    },

    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['orders', businessId] });
      queryClient.invalidateQueries({ queryKey: ['orderCounts', businessId] });

      toast({
        title: 'Return booking Process Started',
        description: data.message,
      });

      if (data.errors && data.errors.length > 0) {
        toast({
          title: 'Some Bookings Failed',
          description: `Check the console for details on ${data.errors.length} failed orders.`,
          variant: 'destructive',
        });
        console.error('Return Booking failures:', data.errors);
      }
    },

    onError: (error: Error) => {
      toast({
        title: 'Return Booking Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// ============================================================
// MUTATION 7: DELETE ORDER
// ============================================================

export function useDeleteOrder(businessId: string | null, storeId: string | null) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (orderId: string) => {
      if (!storeId) throw new Error('Missing storeId');

      const response = await fetch('/api/shopify/orders/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessId, shop: storeId, orderId }),
      });

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.details || 'Failed to delete order');
      }

      return response.json();
    },

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders', businessId] });
      queryClient.invalidateQueries({ queryKey: ['orderCounts', businessId] });

      toast({
        title: 'Order Deletion Initiated',
        description: 'Order will be removed shortly.',
      });
    },

    onError: (error: Error) => {
      toast({
        title: 'Delete Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// ============================================================
// MUTATION 8: DOWNLOAD SLIPS
// ============================================================

export function useDownloadSlips(
  businessId: string | null,
  user: User | null | undefined
) {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ orderIds, storeId }: { orderIds: string[]; storeId: string | null; }) => {
      if (!storeId || !user || orderIds.length === 0) {
        throw new Error('Invalid parameters');
      }

      toast({
        title: 'Generating Slips',
        description: 'Your PDF will begin downloading shortly. This may take a moment.',
      });

      const idToken = await user.getIdToken();
      const response = await fetch('/api/shopify/orders/download-slips', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ businessId, shop: storeId, orderIds }),
      });

      if (!response.ok) {
        let msg = 'Failed to download slips';
        try {
          const err = await response.json();
          msg = err?.details || err?.error || msg;
        } catch {
          msg = await response.text().catch(() => msg);
        }
        throw new Error(msg);
      }

      return response.blob();
    },

    onSuccess: (blob) => {
      // Trigger download
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `shipping-slips-${Date.now()}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    },

    onError: (error: Error) => {
      toast({
        title: 'Download Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// ============================================================
// MUTATION 9: DOWNLOAD EXCEL
// ============================================================

export function useDownloadExcel(
  businessId: string | null,
  user: User | null | undefined
) {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ orderIds, storeId }: { orderIds: string[]; storeId: string | null; }) => {
      if (!storeId || !user || orderIds.length === 0) {
        throw new Error('Invalid parameters');
      }

      toast({
        title: 'Generating Excel File',
        description: 'Your download will begin automatically. Please wait.',
      });

      const idToken = await user.getIdToken();
      const response = await fetch('/api/shopify/orders/export', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ businessId, shop: storeId, orderIds }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.details || 'Failed to generate Excel file.');
      }

      return response.blob();
    },

    onSuccess: (blob) => {
      // Trigger download
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `orders-export-${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    },

    onError: (error: Error) => {
      toast({
        title: 'Export Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// ============================================================
// MUTATION 10: DOWNLOAD PRODUCTS EXCEL
// ============================================================

export function useDownloadProductsExcel(
  businessId: string | null,
  user: User | null | undefined
) {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ orderIds, storeId }: { orderIds: string[]; storeId: string | null; }) => {
      if (!storeId || !user || orderIds.length === 0) {
        throw new Error('Invalid parameters');
      }

      toast({
        title: 'Generating Products Excel',
        description: 'Your file will download shortly.',
      });

      const idToken = await user.getIdToken();
      const response = await fetch('/api/shopify/orders/export-products', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ businessId, shop: storeId, orderIds }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.details || 'Failed to generate file.');
      }

      return response.blob();
    },

    onSuccess: (blob) => {
      // Trigger download
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `products-export-${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    },

    onError: (error: Error) => {
      toast({
        title: 'Export Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// ============================================================
// MUTATION 11: UPDATE SHIPPED STATUSES
// ============================================================

export function useUpdateShippedStatuses(
  businessId: string | null,
  user: User | null | undefined
) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ orderIds, storeId }: { orderIds: string[]; storeId: string | null; }) => {
      if (!storeId || !user || orderIds.length === 0) {
        throw new Error('Invalid parameters');
      }

      toast({
        title: 'Updating...',
        description: `Requesting latest statuses for ${orderIds.length} selected order(s).`,
      });

      const idToken = await user.getIdToken();
      const response = await fetch('/api/shopify/courier/update-shipped-statuses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ businessId, shop: storeId, orderIds }),
      });

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || 'Failed to start status update process.');
      }

      return response.json();
    },

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders', businessId] });
      queryClient.invalidateQueries({ queryKey: ['orderCounts', businessId] });

      toast({
        title: 'Status Update Started',
        description: 'The system will now fetch the latest tracking statuses in the background.',
      });
    },

    onError: (error: Error) => {
      toast({
        title: 'Update Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// ============================================================
// MUTATION 12: PROCESS REFUND
// ============================================================

export function useProcessRefund(
  businessId: string | null,
  user: User | null | undefined
) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      orderId,
      storeId,
      selectedItemIds,
      refundAmount,
      refundMethod,
      currency,
      customerId,
    }: {
      orderId: string;
      storeId: string | null;
      selectedItemIds: (string | number)[];
      refundAmount: number;
      refundMethod: 'store_credit' | 'manual';
      currency: string;
      customerId?: number;
    }) => {
      if (!storeId || !user) {
        throw new Error('Invalid parameters');
      }

      const idToken = await user.getIdToken();
      const response = await fetch('/api/shopify/orders/refund', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          businessId,
          shop: storeId,
          orderId,
          selectedItemIds,
          refundAmount,
          refundMethod,
          currency,
          customerId,
        }),
      });

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || result.details || 'Failed to process refund');
      }

      return response.json();
    },

    onMutate: () => {
      toast({
        title: 'Processing Refund',
        description: 'Please wait while we process the refund...',
      });
    },

    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['orders', businessId] });
      queryClient.invalidateQueries({ queryKey: ['orderCounts', businessId] });

      toast({
        title: 'Refund Processed',
        description: data.message || 'The refund has been processed successfully.',
      });
    },

    onError: (error: Error) => {
      toast({
        title: 'Refund Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}