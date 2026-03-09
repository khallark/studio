import { BOMEntry, DraftLotInput, Lot, LotStage, MaterialReservation, RawMaterial } from "@/types/b2b";
import { db } from "./firebase-admin";
import { Timestamp } from "firebase-admin/firestore";

// ============================================================================
// HELPERS
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

// Shared lot-building logic — used by both createOrder and confirmOrder
export async function buildLotsAndReservations(
  businessId: string,
  orderId: string,
  orderNumber: string,
  buyerId: string,
  buyerName: string,
  shipDate: Timestamp,
  createdBy: string,
  lotInputs: DraftLotInput[]
): Promise<{ lotDocs: Lot[]; reservationDocs: MaterialReservation[] }> {
  const lotDocs: Lot[] = [];
  const reservationDocs: MaterialReservation[] = [];

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
      status: "ACTIVE",
      createdBy,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });

    const bomSnap = await db.collection(`users/${businessId}/bom`)
      .where("productId", "==", lotInput.productId)
      .where("isActive", "==", true)
      .get();

    for (const bomDoc of bomSnap.docs) {
      const bom = bomDoc.data() as BOMEntry;
      const reservationId = db.collection(`users/${businessId}/material_reservations`).doc().id;
      const qtyRequired = lotInput.quantity * bom.quantityPerPiece * (1 + bom.wastagePercent / 100);

      reservationDocs.push({
        id: reservationId,
        lotId,
        lotNumber,
        orderId,
        orderNumber,
        materialId: bom.materialId,
        materialName: bom.materialName,
        materialUnit: bom.materialUnit,
        quantityRequired: Math.ceil(qtyRequired * 100) / 100,
        quantityConsumed: 0,
        consumedAtStage: bom.consumedAtStage,
        status: "RESERVED",
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
    }
  }

  return { lotDocs, reservationDocs };
}

// Shared stock check — used by both createOrder and confirmOrder
export async function checkStockShortfalls(
  businessId: string,
  reservationDocs: MaterialReservation[]
): Promise<string[]> {
  const materialTotals: Record<string, number> = {};
  for (const r of reservationDocs) {
    materialTotals[r.materialId] = (materialTotals[r.materialId] ?? 0) + r.quantityRequired;
  }

  const shortfalls: string[] = [];
  for (const [materialId, required] of Object.entries(materialTotals)) {
    const matDoc = await db.doc(`users/${businessId}/raw_materials/${materialId}`).get();
    if (!matDoc.exists) { shortfalls.push(materialId); continue; }
    const mat = matDoc.data() as RawMaterial;
    if (mat.availableStock < required) {
      shortfalls.push(`${mat.name} (need ${required} ${mat.unit}, have ${mat.availableStock})`);
    }
  }

  return shortfalls;
}

export interface SaveDraftOrderPayload {
  businessId: string;
  buyerId: string;
  buyerName: string;
  buyerContact: string;
  shipDate: string;               // ISO string
  deliveryAddress: string;
  note?: string;
  createdBy: string;
  lots: DraftLotInput[];
}

export interface ConfirmOrderPayload {
  businessId: string;
  orderId: string;
  confirmedBy: string;
  // Optional — pass updated lots if changes were made during review.
  // If omitted, the draftLots stored on the order doc are used.
  lots?: DraftLotInput[];
}

export interface CreateOrderPayload {
  businessId: string;
  buyerId: string;
  buyerName: string;
  buyerContact: string;
  shipDate: string;               // ISO string
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
  referenceId: string;    // PO number, GRN number, supplier invoice, etc.
  note?: string;
  createdBy: string;
}

export interface AdjustStockPayload {
  businessId: string;
  materialId: string;
  quantity: number;       // positive = add, negative = remove
  note: string;           // required for adjustments — must explain why
  createdBy: string;
}