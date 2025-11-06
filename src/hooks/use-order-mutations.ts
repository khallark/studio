// hooks/use-order-mutations.ts
'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { User } from 'firebase/auth';
import { useToast } from '@/hooks/use-toast';
import { CustomStatus } from './use-orders';

// ============================================================
// MUTATION 1: UPDATE ORDER STATUS
// ============================================================

export function useUpdateOrderStatus(storeId: string | null, user: User | null | undefined) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ orderId, status }: { orderId: string; status: CustomStatus }) => {
      if (!storeId || !user) throw new Error('Missing storeId or user');

      const idToken = await user.getIdToken();
      const response = await fetch('/api/shopify/orders/update-status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ shop: storeId, orderId, status }),
      });

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.details || 'Failed to update status');
      }

      return response.json();
    },

    onSuccess: () => {
      // Invalidate all order-related queries to refetch fresh data
      queryClient.invalidateQueries({ queryKey: ['orders', storeId] });
      queryClient.invalidateQueries({ queryKey: ['orderCounts', storeId] });

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

export function useRevertOrderStatus(storeId: string | null, user: User | null | undefined) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      orderId,
      revertTo,
    }: {
      orderId: string;
      revertTo: 'Confirmed' | 'Delivered';
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
        body: JSON.stringify({ shop: storeId, orderId }),
      });

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.details || `Failed to revert to ${revertTo}`);
      }

      return response.json();
    },

    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['orders', storeId] });
      queryClient.invalidateQueries({ queryKey: ['orderCounts', storeId] });

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

export function useDispatchOrders(storeId: string | null, user: User | null | undefined) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (orderIds: string[]) => {
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
        body: JSON.stringify({ shop: storeId, orderIds }),
      });

      if (!response.ok && response.status !== 207) {
        const result = await response.json();
        throw new Error(result.details || 'Failed to dispatch orders');
      }

      return response.json();
    },

    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['orders', storeId] });
      queryClient.invalidateQueries({ queryKey: ['orderCounts', storeId] });

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

export function useBulkUpdateStatus(storeId: string | null, user: User | null | undefined) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      orderIds,
      status,
    }: {
      orderIds: string[];
      status: CustomStatus;
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
        body: JSON.stringify({ shop: storeId, orderIds, status }),
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
      queryClient.invalidateQueries({ queryKey: ['orders', storeId] });
      queryClient.invalidateQueries({ queryKey: ['orderCounts', storeId] });

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

export function useOrderSplit(storeId: string | null, user: User | null | undefined) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (orderId: string) => {
      if (!storeId || !user || !orderId) throw new Error('Invalid parameters');

      const idToken = await user.getIdToken();
      const response = await fetch('/api/shopify/orders/split-order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ shop: storeId, orderId }),
      });

      if (!response.ok && response.status !== 207) {
        const result = await response.json();
        throw new Error(result.details || 'Failed to split order');
      }

      return response.json();
    },

    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['orders', storeId] });
      queryClient.invalidateQueries({ queryKey: ['orderCounts', storeId] });

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

export function useReturnBooking(storeId: string | null, user: User | null | undefined) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (orderIds: string[]) => {
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
          shop: storeId,
          orderIds,
          pickupName: 'Majime Productions 2',
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
      queryClient.invalidateQueries({ queryKey: ['orders', storeId] });
      queryClient.invalidateQueries({ queryKey: ['orderCounts', storeId] });

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

export function useDeleteOrder(storeId: string | null) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (orderId: string) => {
      if (!storeId) throw new Error('Missing storeId');

      const response = await fetch('/api/shopify/orders/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shop: storeId, orderId }),
      });

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.details || 'Failed to delete order');
      }

      return response.json();
    },

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders', storeId] });
      queryClient.invalidateQueries({ queryKey: ['orderCounts', storeId] });

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

export function useDownloadSlips(storeId: string | null, user: User | null | undefined) {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (orderIds: string[]) => {
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
        body: JSON.stringify({ shop: storeId, orderIds }),
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

export function useDownloadExcel(storeId: string | null, user: User | null | undefined) {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (orderIds: string[]) => {
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
        body: JSON.stringify({ shop: storeId, orderIds }),
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

export function useDownloadProductsExcel(storeId: string | null, user: User | null | undefined) {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (orderIds: string[]) => {
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
        body: JSON.stringify({ shop: storeId, orderIds }),
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

export function useUpdateShippedStatuses(storeId: string | null, user: User | null | undefined) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (orderIds: string[]) => {
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
        body: JSON.stringify({ shop: storeId, orderIds }),
      });

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || 'Failed to start status update process.');
      }

      return response.json();
    },

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders', storeId] });
      queryClient.invalidateQueries({ queryKey: ['orderCounts', storeId] });

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