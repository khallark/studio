// apps/web/src/app/api/business/complaints/delete/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { authUserForBusiness } from '@/lib/authoriseUser';
import { COMPLAINTS_COLLECTION } from '@/lib/complaints';
import type { Complaint } from '@/types/complaint';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { businessId, complaintId } = body as {
      businessId?: string;
      complaintId?: string;
    };

    if (!businessId || typeof businessId !== 'string') {
      return NextResponse.json({ error: 'businessId is required.' }, { status: 400 });
    }
    if (!complaintId || typeof complaintId !== 'string') {
      return NextResponse.json({ error: 'complaintId is required.' }, { status: 400 });
    }

    // ── Auth ─────────────────────────────────────────────────────────────
    const result = await authUserForBusiness({ businessId, req });
    if (!result.authorised) {
      const { error, status } = result;
      return NextResponse.json({ error }, { status });
    }
    const { businessDoc } = result;

    const complaintRef = businessDoc!.ref
      .collection(COMPLAINTS_COLLECTION)
      .doc(complaintId);

    const snap = await complaintRef.get();
    if (!snap.exists) {
      return NextResponse.json({ error: 'Complaint not found.' }, { status: 404 });
    }

    const data = snap.data() as Complaint;
    if (data.status !== 'closed') {
      return NextResponse.json(
        { error: 'Only closed complaints can be deleted. Close it first.' },
        { status: 409 },
      );
    }

    await complaintRef.delete();

    return NextResponse.json({ message: 'Complaint deleted.' }, { status: 200 });
  } catch (error) {
    console.error('delete complaint error:', error);
    const details = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: 'Failed to delete complaint.', details },
      { status: 500 },
    );
  }
}