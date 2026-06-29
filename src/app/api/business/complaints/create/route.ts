// apps/web/src/app/api/business/complaints/create/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { authUserForBusiness } from '@/lib/authoriseUser';
import {
  COMPLAINT_COUNT_FIELD,
  COMPLAINTS_COLLECTION,
  buildOpenComplaintBody,
  formatComplaintNumber,
  toOptionalString,
  toRequiredString,
} from '@/lib/complaints';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { businessId } = body as { businessId?: string };

    // ── Cheap rejects before any DB hit ──────────────────────────────────
    if (!businessId || typeof businessId !== 'string') {
      return NextResponse.json(
        { error: 'businessId is required.' },
        { status: 400 },
      );
    }

    const subject = toRequiredString(body.subject);
    const description = toRequiredString(body.description);
    const awb = toRequiredString(body.awb);
    const orderNumber = toOptionalString(body.orderNumber);

    if (!subject) {
      return NextResponse.json({ error: 'Subject is required.' }, { status: 400 });
    }
    if (!description) {
      return NextResponse.json({ error: 'Description is required.' }, { status: 400 });
    }
    if (!awb) {
      return NextResponse.json({ error: 'AWB is required.' }, { status: 400 });
    }

    // ── Auth ─────────────────────────────────────────────────────────────
    const result = await authUserForBusiness({ businessId, req });
    if (!result.authorised) {
      const { error, status } = result;
      return NextResponse.json({ error }, { status });
    }
    const { userId, businessDoc } = result;
    const bizRef = businessDoc!.ref;

    // ── Allocate number + write doc atomically ───────────────────────────
    const complaintRef = bizRef.collection(COMPLAINTS_COLLECTION).doc();

    const number = await db.runTransaction(async (tx) => {
      const snap = await tx.get(bizRef);
      const current = (snap.data()?.[COMPLAINT_COUNT_FIELD] as number) || 0;
      const next = current + 1;

      tx.update(bizRef, { [COMPLAINT_COUNT_FIELD]: next });
      tx.set(complaintRef, {
        ...buildOpenComplaintBody({
          subject,
          description,
          orderNumber,
          awb,
          createdBy: userId!,
          source: 'manual',
        }),
        complaintNumber: formatComplaintNumber(next),
        createdAt: FieldValue.serverTimestamp(),
      });

      return next;
    });

    return NextResponse.json(
      {
        message: 'Complaint opened.',
        complaintId: complaintRef.id,
        complaintNumber: formatComplaintNumber(number),
      },
      { status: 201 },
    );
  } catch (error) {
    console.error('create complaint error:', error);
    const details = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: 'Failed to open complaint.', details },
      { status: 500 },
    );
  }
}