// types/order.ts

import { Timestamp } from 'firebase/firestore';
import { DateRange } from 'react-day-picker';

// ============================================================
// ORDER STATUSES
// ============================================================

export type CustomStatus =
  | 'New'
  | 'Confirmed'
  | 'Ready To Dispatch'
  | 'Dispatched'
  | 'In Transit'
  | 'Out For Delivery'
  | 'Delivered'
  | 'RTO In Transit'
  | 'RTO Delivered'
  | 'DTO Requested'
  | 'DTO Booked'
  | 'DTO In Transit'
  | 'DTO Delivered'
  | 'Pending Refunds'
  | 'Lost'
  | 'Closed'
  | 'RTO Closed'
  | 'Cancellation Requested'
  | 'Cancelled';

// ============================================================
// ORDER INTERFACES
// ============================================================

export interface CustomStatusLog {
  status: string;
  createdAt: Timestamp;
  remarks: string;
}

export interface Order {
  id: string;
  orderId: number;
  name: string;
  createdAt: string;
  lastStatusUpdate: Timestamp;
  email: string;
  totalPrice: number;
  currency: string;
  financialStatus: string;
  fulfillmentStatus: string;
  customStatus: CustomStatus;
  awb?: string;
  awb_reverse?: string;
  courier?: string;
  courierProvider?: string;
  courier_reverse?: string;
  isDeleted?: boolean;
  tags_confirmed?: string[];
  tags_rtoInTransit?: string[];
  customStatusesLogs?: CustomStatusLog[];
  booked_return_reason?: string;
  booked_return_images?: string[];
  returnItemsVariantIds?: (string | number)[];
  vendorName?: string;
  raw: {
    cancelled_at: string | null;
    customer?: {
      name?: string;
      first_name?: string;
      last_name?: string;
      phone?: string;
    };
    line_items: any[];
    contact_email?: string;
    billing_address?: {
      name?: string;
      first_name?: string;
      last_name?: string;
      phone?: string;
      address1: string;
      address2: string;
      city: string;
      province: string;
      zip: string;
      country: string;
    };
    shipping_address?: {
      name?: string;
      first_name?: string;
      last_name?: string;
      phone?: string;
      address1: string;
      address2: string;
      city: string;
      zip: string;
      province: string;
      country: string;
    };
    total_discounts?: number;
    total_outstanding?: string;
  };
}

// ============================================================
// FILTER & COUNT TYPES
// ============================================================

export interface UseOrdersFilters {
  searchQuery?: string;
  invertSearch?: boolean;
  dateRange?: DateRange;
  courierFilter?: string;
  vendorName?: string;
  availabilityFilter?: 'all' | 'pending' | 'available' | 'unavailable';
  rtoInTransitFilter?: 'all' | 're-attempt' | 'refused' | 'no-reply';
  sortKey?: 'name' | 'createdAt';
  sortDirection?: 'asc' | 'desc';
}

export type StatusCounts = Record<CustomStatus | 'All Orders', number>;

export interface AvailabilityCounts {
  pending: number;
  available: number;
  unavailable: number;
}

export interface RtoInTransitCounts {
  reAttempt: number;
  refused: number;
  noReply: number;
}

// ============================================================
// SORT TYPES
// ============================================================

export type SortKey = 'name' | 'createdAt';
export type SortDirection = 'asc' | 'desc';