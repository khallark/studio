// apps/web/src/app/api/business/complaints/close/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { authUserForBusiness } from '@/lib/authoriseUser';
import {
  COMPLAINTS_COLLECTION,
  toOptionalString,
  toRequiredString,
} from '@/lib/complaints';
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

    const description1 = toRequiredString(body.description1);
    const description2 = toOptionalString(body.description2);

    if (!description1) {
      return NextResponse.json(
        { error: 'A closing description is required.' },
        { status: 400 },
      );
    }

    // ── Auth ─────────────────────────────────────────────────────────────
    const result = await authUserForBusiness({ businessId, req });
    if (!result.authorised) {
      const { error, status } = result;
      return NextResponse.json({ error }, { status });
    }
    const { userId, businessDoc } = result;

    const complaintRef = businessDoc!.ref
      .collection(COMPLAINTS_COLLECTION)
      .doc(complaintId);

    const snap = await complaintRef.get();
    if (!snap.exists) {
      return NextResponse.json({ error: 'Complaint not found.' }, { status: 404 });
    }

    const data = snap.data() as Complaint;
    if (data.status === 'closed') {
      return NextResponse.json(
        { error: 'This complaint is already closed.' },
        { status: 409 },
      );
    }

    await complaintRef.update({
      status: 'closed',
      closingDescription1: description1,
      closingDescription2: description2,
      closedAt: FieldValue.serverTimestamp(),
      closedBy: userId!,
    });

    return NextResponse.json({ message: 'Complaint closed.' }, { status: 200 });
  } catch (error) {
    console.error('close complaint error:', error);
    const details = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: 'Failed to close complaint.', details },
      { status: 500 },
    );
  }
}