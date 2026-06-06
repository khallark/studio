// app/api/warehouse/move-upcs/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { authUserForBusiness } from '@/lib/authoriseUser';
import { moveUpcs } from '@/lib/moveUpcs'; // the service fn from earlier

// Guardrail: cap a single request so one call can't fan out unboundedly.
const MAX_UPCS_PER_REQUEST = 5000;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { businessId, upcIds, destShelfId } = body as {
      businessId?: string;
      upcIds?: unknown;
      destShelfId?: string;
    };

    // ---- Input validation (before auth: cheap rejects, no DB hit) ----
    if (!businessId) {
      return NextResponse.json({ error: 'Business ID is required' }, { status: 400 });
    }
    if (!destShelfId || typeof destShelfId !== 'string') {
      return NextResponse.json({ error: 'destShelfId is required' }, { status: 400 });
    }
    if (!Array.isArray(upcIds) || upcIds.length === 0) {
      return NextResponse.json({ error: 'upcIds must be a non-empty array' }, { status: 400 });
    }
    if (!upcIds.every((id) => typeof id === 'string' && id.length > 0)) {
      return NextResponse.json({ error: 'upcIds must all be non-empty strings' }, { status: 400 });
    }

    // Dedupe — same UPC twice in one payload would otherwise double its delta.
    const uniqueUpcIds = [...new Set(upcIds as string[])];

    if (uniqueUpcIds.length > MAX_UPCS_PER_REQUEST) {
      return NextResponse.json(
        { error: `Cannot move more than ${MAX_UPCS_PER_REQUEST} UPCs in one request` },
        { status: 400 },
      );
    }

    // ---- Auth ----
    const result = await authUserForBusiness({ businessId, req: request });
    if (!result.authorised) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    const { userId } = result;
    if (!userId) {
      return NextResponse.json({ error: 'User not logged in' }, { status: 401 });
    }

    // ---- Main logic ----
    const summary = await moveUpcs(businessId, userId, uniqueUpcIds, destShelfId);

    // Partial success is normal (some skipped/failed) → still 200 with a breakdown.
    // Total failure (nothing moved, at least one failure) → 422 so the client can surface it.
    const nothingMoved = summary.moved === 0;
    const hadFailures = summary.failed.length > 0;
    const status = nothingMoved && hadFailures ? 422 : 200;

    return NextResponse.json(summary, { status });
  } catch (error) {
    console.error('Error moving upcs:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to move UPCs', detail: message },
      { status: 500 },
    );
  }
}