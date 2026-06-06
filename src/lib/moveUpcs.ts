import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { db } from "./firebase-admin";
import { Placement, Shelf, UPC } from "@/types/warehouse";


const MOVE_CHUNK = 300; // keep each txn comfortably under the 500-write limit

export async function moveUpcs(
  businessId: string,
  userId: string,
  upcIds: string[],
  destShelfId: string,
) {
  // 1. Validate dest shelf, derive the canonical parent chain from it.
  const shelfSnap = await db.doc(`users/${businessId}/shelves/${destShelfId}`).get();
  if (!shelfSnap.exists) throw new Error("Destination shelf not found");
  const destShelf = shelfSnap.data() as Shelf;
  if (destShelf.isDeleted) throw new Error("Destination shelf is deleted");

  const dest = {
    warehouseId: destShelf.warehouseId,
    zoneId: destShelf.zoneId,
    rackId: destShelf.rackId,
    shelfId: destShelfId,
  };

  // One id ties every resulting movement/log together as a single logical move.
  const moveId = db.collection(`users/${businessId}/movements`).doc().id;
  const summary = { moveId, moved: 0, skipped: 0, failed: [] as { upcId: string; reason: string }[] };

  // 2. Chunk; each chunk is ONE atomic transaction.
  for (let i = 0; i < upcIds.length; i += MOVE_CHUNK) {
    const chunk = upcIds.slice(i, i + MOVE_CHUNK);

    await db.runTransaction(async (tx) => {
      // ---------- READS ----------
      const upcRefs = chunk.map((id) => db.doc(`users/${businessId}/upcs/${id}`));
      const upcSnaps = await tx.getAll(...upcRefs);

      const placementDelta = new Map<string, number>();          // placementId -> +/- count
      const destProductOf = new Map<string, string>();           // dest placementId -> productId
      const toUpdate: { ref: FirebaseFirestore.DocumentReference; productId: string }[] = [];

      for (const snap of upcSnaps) {
        if (!snap.exists) { summary.failed.push({ upcId: snap.id, reason: "not_found" }); continue; }
        const upc = snap.data() as UPC;
        if (upc.putAway !== "none") {
          summary.failed.push({ upcId: snap.id, reason: `not_movable (putAway=${upc.putAway})` });
          continue;
        }
        if (upc.shelfId === destShelfId) { summary.skipped++; continue; } // already there

        const srcPid = upc.placementId!;
        const destPid = `${upc.productId}_${destShelfId}`;
        placementDelta.set(srcPid, (placementDelta.get(srcPid) ?? 0) - 1);
        placementDelta.set(destPid, (placementDelta.get(destPid) ?? 0) + 1);
        destProductOf.set(destPid, upc.productId);
        toUpdate.push({ ref: snap.ref, productId: upc.productId });
      }

      if (toUpdate.length === 0) return;

      // Which dest placements already exist?
      const destPids = [...destProductOf.keys()];
      const destSnaps = await tx.getAll(...destPids.map((id) => db.doc(`users/${businessId}/placements/${id}`)));
      const destExists = new Map(destSnaps.map((s) => [s.id, s.exists]));

      // ---------- WRITES ----------
      const now = Timestamp.now();

      for (const { ref, productId } of toUpdate) {
        tx.update(ref, { ...dest, placementId: `${productId}_${destShelfId}`, updatedAt: now, updatedBy: userId });
      }

      for (const [pid, delta] of placementDelta) {
        const ref = db.doc(`users/${businessId}/placements/${pid}`);
        if (destProductOf.has(pid) && !destExists.get(pid)) {
          const newPlacement: Placement = {
            id: pid, productId: destProductOf.get(pid)!, ...dest,
            quantity: delta, createUPCs: false,             // CRITICAL: false, or it spawns new UPCs
            createdAt: now, updatedAt: now, createdBy: userId, updatedBy: userId,
            lastMovementReason: "UPC move (in)", lastMovementReference: moveId,
          };
          tx.set(ref, newPlacement);
        } else {
          tx.update(ref, {
            quantity: FieldValue.increment(delta), updatedAt: now, updatedBy: userId,
            lastMovementReason: delta > 0 ? "UPC move (in)" : "UPC move (out)",
            lastMovementReference: moveId,
          });
        }
      }

      summary.moved += toUpdate.length;
    });
  }

  return summary;
}