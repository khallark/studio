import {
  BOM,
  DraftLotInput,
  Lot,
  LotBOMStage,
  LotStage,
  ProductionStageConfig,
} from "@/types/b2b";
import { db } from "./firebase-admin";
import { Timestamp } from "firebase-admin/firestore";

// ============================================================================
// COUNTER HELPERS
// ============================================================================

export async function generateLotNumber(businessId: string): Promise<string> {
  const counterRef = db.doc(`users/${businessId}/counters/lots`);
  const result = await db.runTransaction(async (tx) => {
    const doc = await tx.get(counterRef);
    const current = doc.exists ? (doc.data()!.count as number) : 800;
    tx.set(counterRef, { count: current + 1 }, { merge: true });
    return current + 1;
  });
  return String(result);
}

export async function generateOrderNumber(businessId: string): Promise<string> {
  const counterRef = db.doc(`users/${businessId}/counters/orders`);
  const result = await db.runTransaction(async (tx) => {
    const doc = await tx.get(counterRef);
    const current = doc.exists ? (doc.data()!.count as number) : 0;
    tx.set(counterRef, { count: current + 1 }, { merge: true });
    return current + 1;
  });
  const year = new Date().getFullYear();
  return `ORD-${year}-${String(result).padStart(4, "0")}`;
}

// ============================================================================
// DELAY COMPUTATION
// ============================================================================

export function computeDelayStatus(stages: LotStage[]): { isDelayed: boolean; delayDays: number } {
  const now = Timestamp.now().toDate();
  let maxDelay = 0;
  for (const stage of stages) {
    if (stage.status === "PENDING" || stage.status === "IN_PROGRESS") {
      const planned = stage.plannedDate.toDate();
      const diff = Math.floor((now.getTime() - planned.getTime()) / (1000 * 60 * 60 * 24));
      if (diff > 0) maxDelay = Math.max(maxDelay, diff);
    }
  }
  return { isDelayed: maxDelay > 0, delayDays: maxDelay };
}

// ============================================================================
// STAGE VALIDATION
// ============================================================================

export async function getConfiguredStageNames(businessId: string): Promise<Set<string>> {
  const snap = await db.collection(`users/${businessId}/production_stage_config`).get();
  return new Set(snap.docs.map((d) => (d.data() as ProductionStageConfig).name));
}

export function validateStageName(
  stage: string,
  configured: Set<string>,
  context?: string,
): string | null {
  if (!configured.has(stage)) {
    const label = context ? `${context}: ` : "";
    return `${label}Stage "${stage}" is not configured for this business. Add it in Stage Config before using it.`;
  }
  return null;
}

export function validateStageNames(
  stages: string[],
  configured: Set<string>,
  context?: string,
): string | null {
  for (const stage of stages) {
    const err = validateStageName(stage, configured, context);
    if (err) return err;
  }
  return null;
}

// ============================================================================
// LOT BUILDER
//
// Replaces the old buildLotsAndReservations.  No stock reservations are
// created.  Each lot gets a bomSnapshot captured from the chosen BOM (or
// from the inline customBOM the user provided).
// ============================================================================

export async function buildLots(
  businessId: string,
  orderId: string,
  orderNumber: string,
  buyerId: string,
  buyerName: string,
  shipDate: Timestamp,
  createdBy: string,
  lotInputs: DraftLotInput[],
): Promise<{ lotDocs: Lot[] }> {
  const lotDocs: Lot[] = [];

  for (const lotInput of lotInputs) {
    const lotNumber = await generateLotNumber(businessId);
    const lotId = db.collection(`users/${businessId}/lots`).doc().id;

    const builtStages: LotStage[] = lotInput.stages.map((s, i) => ({
      sequence: i + 1,
      stage: s.stage,
      plannedDate: Timestamp.fromDate(new Date(s.plannedDate)),
      actualDate: null,
      status: i === 0 ? "IN_PROGRESS" : "PENDING",
      isOutsourced: s.isOutsourced,
      outsourceVendorName: s.outsourceVendorName ?? null,
      outsourceSentAt: null,
      outsourceReturnedAt: null,
      completedBy: null,
      note: null,
    }));

    // ── Resolve BOM snapshot ────────────────────────────────────────────
    let bomId: string | null = null;
    let bomSnapshot: LotBOMStage[] = [];

    if (lotInput.bomId) {
      // Predefined BOM — fetch and snapshot
      const bomDoc = await db.doc(`users/${businessId}/bom/${lotInput.bomId}`).get();
      if (!bomDoc.exists) throw new Error(`bom_not_found:${lotInput.bomId}`);
      const bom = bomDoc.data() as BOM;
      if (!bom.isActive) throw new Error(`bom_inactive:${lotInput.bomId}`);
      bomId = bom.id;
      bomSnapshot = bom.stages.map((stage) => ({
        stage: stage.stage,
        materials: stage.materials.map((m) => ({
          materialId: m.materialId,
          materialName: m.materialName,
          materialUnit: m.materialUnit,
          quantityPerPiece: m.quantityPerPiece,
          wastagePercent: m.wastagePercent,
          totalQuantity:
            Math.round(
              lotInput.quantity *
              m.quantityPerPiece *
              (1 + m.wastagePercent / 100) *
              100,
            ) / 100,
        })),
      }));
    } else if (lotInput.customBOM && lotInput.customBOM.length > 0) {
      // User-supplied inline BOM
      bomSnapshot = lotInput.customBOM;
    }
    // If neither — lot has no material tracking. bomSnapshot stays [].

    lotDocs.push({
      id: lotId,
      lotNumber,
      orderId,
      orderNumber,
      buyerId,
      buyerName,
      productId: lotInput.productId,
      productName: lotInput.productName,
      productSku: lotInput.productSku,
      color: lotInput.color,
      size: lotInput.size ?? null,
      quantity: lotInput.quantity,
      stages: builtStages,
      currentStage: builtStages[0].stage,
      currentSequence: 1,
      totalStages: builtStages.length,
      shipDate,
      isDelayed: false,
      delayDays: 0,
      bomId,
      bomSnapshot,
      status: "ACTIVE",
      createdBy,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
  }

  return { lotDocs };
}

// ============================================================================
// PAYLOAD INTERFACES  (used by API routes for type-safe body parsing)
// ============================================================================

export interface SaveDraftOrderPayload {
  businessId: string;
  buyerId: string;
  buyerName: string;
  buyerContact: string;
  shipDate: string;
  deliveryAddress: string;
  note?: string;
  createdBy: string;
  lots: DraftLotInput[];
}

export interface ConfirmOrderPayload {
  businessId: string;
  orderId: string;
  confirmedBy: string;
  lots?: DraftLotInput[];
}

export interface CreateOrderPayload {
  businessId: string;
  buyerId: string;
  buyerName: string;
  buyerContact: string;
  shipDate: string;
  deliveryAddress: string;
  note?: string;
  createdBy: string;
  lots: DraftLotInput[];
}

export interface AdvanceLotStagePayload {
  businessId: string;
  lotId: string;
  completedBy: string;
  note?: string;
}

export interface AddStockPayload {
  businessId: string;
  materialId: string;
  quantity: number;
  referenceId: string;
  note?: string;
  createdBy: string;
}

export interface AdjustStockPayload {
  businessId: string;
  materialId: string;
  quantity: number;
  note: string;
  createdBy: string;
}