// apps/web/src/types/complaint.ts
//
// Shared, RIGID document contract for the Complaints sub-system.
// Convention: every absent value is modelled as `T | null`, never `field?: T`.
// A doc read from Firestore must satisfy this shape exactly — no undefined keys.
//
// NOTE ON NAMING: the spec's "description1 / description2" (collected at close)
// are stored as `closingDescription1 / closingDescription2` so they don't collide
// with the opening `description`. If you prefer the raw names, rename in this one
// file and the four routes — nothing else depends on the literal keys.

export type ComplaintStatus = 'open' | 'closed';
export type ComplaintSource = 'manual' | 'bulk';

/**
 * Canonical complaint document.
 * Path: users/{businessId}/complaints/{complaintId}
 *
 * Timestamps are typed against the Firestore global namespace so the same
 * interface is valid server-side (admin Timestamp) and when cast from a
 * client-SDK snapshot. They are type-only references — no runtime import.
 */
export interface Complaint {
  /** Firestore doc id. Hydrated on read; not part of the stored body. */
  id: string;

  /** Human-readable reference, e.g. "CMP-00042". Null only mid-transaction. */
  complaintNumber: string | null;

  // ── Opening fields (creation) ──────────────────────────────────────────
  subject: string;
  description: string;
  orderNumber: string | null;
  awb: string | null;

  // ── Lifecycle ──────────────────────────────────────────────────────────
  status: ComplaintStatus;
  source: ComplaintSource;

  // ── Closing fields ─────────────────────────────────────────────────────
  closingDescription1: string | null;
  closingDescription2: string | null;

  // ── Bookkeeping ────────────────────────────────────────────────────────
  createdAt: FirebaseFirestore.Timestamp | null;
  createdBy: string | null;
  closedAt: FirebaseFirestore.Timestamp | null;
  closedBy: string | null;
}

/** Body for POST /api/business/complaints/create */
export interface CreateComplaintInput {
  businessId: string;
  subject: string;
  description: string;
  orderNumber: string | null;
  awb: string | null;
}

/** Body for POST /api/business/complaints/close */
export interface CloseComplaintInput {
  businessId: string;
  complaintId: string;
  description1: string;
  description2: string | null;
}

/** Body for POST /api/business/complaints/delete */
export interface DeleteComplaintInput {
  businessId: string;
  complaintId: string;
}

/** Per-row outcome produced by the bulk-create route (also written to the result sheet). */
export interface BulkRowResult {
  row: number; // 1-based row number in the source sheet (header = row 1)
  subject: string | null;
  awb: string | null;
  result: 'created' | 'failed';
  complaintNumber: string | null;
  error: string | null;
}