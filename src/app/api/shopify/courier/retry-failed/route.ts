import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const { shop, batchId } = await req.json();
  if (!shop || !batchId) {
    return NextResponse.json({ error: 'shop and batchId required' }, { status: 400 });
  }

  const jobsSnap = await db
    .collection('accounts').doc(shop)
    .collection('shipment_batches').doc(batchId)
    .collection('jobs')
    .where('status', '==', 'failed')
    .get();

  const jobIds = jobsSnap.docs.map((d) => d.id);
  if (jobIds.length === 0) return NextResponse.json({ ok: true, enqueued: 0 });

  const url = process.env.ENQUEUE_FUNCTION_URL!;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': process.env.ENQUEUE_FUNCTION_SECRET!,
    },
    body: JSON.stringify({ shop, batchId, jobIds }),
  });

  if (!res.ok) {
    const t = await res.text();
    return NextResponse.json({ error: 'enqueue failed', details: t }, { status: 502 });
  }
  return NextResponse.json({ ok: true, enqueued: jobIds.length });
}
