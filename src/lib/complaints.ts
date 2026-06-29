// apps/web/src/lib/complaints.ts
//
// Small shared helpers for the Complaints sub-system. Pure functions + constants
// only — no Firestore handles here, so this is safe to import from any route.

import type { Complaint } from '@/types/complaint';

/** Max rows accepted in a single bulk-create call. Tune freely. */
export const MAX_BULK_COMPLAINTS = 400;

/** Field on the business doc (users/{businessId}) holding the running counter. */
export const COMPLAINT_COUNT_FIELD = 'complaintCount';

/** Subcollection name under the business doc. */
export const COMPLAINTS_COLLECTION = 'complaints';

/** Firestore caps writes at 500 ops/batch; stay safely under it. */
export const WRITE_CHUNK_SIZE = 450;

/** "CMP-00042" — bump the pad width here if you ever exceed 99,999. */
export function formatComplaintNumber(n: number): string {
  return `CMP-${String(n).padStart(5, '0')}`;
}

/**
 * Coerce an arbitrary value into a trimmed non-empty string, or null.
 * Used for every OPTIONAL field so the doc never stores "" or undefined.
 */
export function toOptionalString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s.length > 0 ? s : null;
}

/**
 * Coerce a REQUIRED field. Returns the trimmed string, or null if missing/empty
 * (caller decides how to reject).
 */
export function toRequiredString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s.length > 0 ? s : null;
}

/** Normalize a sheet header cell: lowercase, collapse spaces/underscores. */
export function normalizeHeader(raw: unknown): string {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '');
}

/**
 * Accepted header aliases → canonical input key.
 * Add aliases here without touching the route.
 */
export const HEADER_ALIASES: Record<string, keyof BulkParsedRow> = {
  subject: 'subject',
  title: 'subject',
  description: 'description',
  desc: 'description',
  details: 'description',
  ordernumber: 'orderNumber',
  orderno: 'orderNumber',
  order: 'orderNumber',
  awb: 'awb',
  awbnumber: 'awb',
  tracking: 'awb',
  trackingnumber: 'awb',
};

export interface BulkParsedRow {
  subject: string | null;
  description: string | null;
  orderNumber: string | null;
  awb: string | null;
}

/**
 * The exact shape written for a brand-new OPEN complaint, minus the
 * serverTimestamp + complaintNumber the route stamps inside its transaction.
 * Centralized so create and bulk-create can't drift apart.
 */
export function buildOpenComplaintBody(args: {
  subject: string;
  description: string;
  orderNumber: string | null;
  awb: string | null;
  createdBy: string;
  source: Complaint['source'];
}): Omit<Complaint, 'id' | 'complaintNumber' | 'createdAt'> {
  return {
    subject: args.subject,
    description: args.description,
    orderNumber: args.orderNumber,
    awb: args.awb,
    status: 'open',
    source: args.source,
    closingDescription1: null,
    closingDescription2: null,
    createdBy: args.createdBy,
    closedAt: null,
    closedBy: null,
  };
}