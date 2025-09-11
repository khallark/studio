import { useEffect, useMemo, useState } from 'react';
import {
  collection, onSnapshot, orderBy, query, limit, Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

export type ShipmentBatch = {
  id: string;
  createdAt?: Timestamp;
  createdBy?: string;
  status: 'running' | 'completed' | 'failed' | 'paused';
  total: number;
  queued: number;
  processing: number;
  success: number;
  failed: number;
  carrier?: string;
};

export function useShipmentBatches(shop?: string, max = 50) {
  const [batches, setBatches] = useState<ShipmentBatch[]>([]);

  useEffect(() => {
    if (!shop) return;
    const ref = collection(db, 'accounts', shop, 'shipment_batches');
    const q = query(ref, orderBy('createdAt', 'desc'), limit(max));
    const unsub = onSnapshot(q, (snap) => {
      setBatches(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
    });
    return unsub;
  }, [shop, max]);

  const ongoing = useMemo(
    () => batches.filter((b) => b.status === 'running' || (b.success + b.failed) < b.total),
    [batches],
  );
  const completed = useMemo(
    () => batches.filter((b) => (b.success + b.failed) >= b.total),
    [batches],
  );

  return { batches, ongoing, completed };
}
