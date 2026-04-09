// POST /api/business/warehouse/credit-notes/dispatch-upcs
//
// Sets putAway → null on outbound UPCs that have a creditNoteRef.
// This is the "physical removal" step for credit note UPCs — the equivalent
// of courier pickup for order UPCs.
//
// onUpcWritten fires for each UPC (outbound → null):
//   creditNoteRef present → inventory.deduction++  (no blockedStock touch)
//
// Validates:
//   - UPC exists
//   - UPC is putAway: 'outbound'
//   - UPC has a creditNoteRef (i.e. it belongs to a credit note, not an order)
//
// Body:
//   businessId: string
//   upcIds: string[] — max 500

import { NextRequest, NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { db } from '@/lib/firebase-admin';
import { authUserForBusiness } from '@/lib/authoriseUser';
import { UPC } from '@/types/warehouse';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { businessId, upcIds } = body;

        // ── Validation ────────────────────────────────────────────────────
        if (!businessId) {
            return NextResponse.json({ error: 'Business ID is required' }, { status: 400 });
        }
        if (!upcIds || !Array.isArray(upcIds) || upcIds.length === 0 || upcIds.length > 100) {
            return NextResponse.json(
                { error: 'upcIds must be a non-empty array of length at most 100' },
                { status: 400 },
            );
        }

        // ── Auth ──────────────────────────────────────────────────────────
        const result = await authUserForBusiness({ businessId, req: request });
        if (!result.authorised) {
            return NextResponse.json({ error: result.error }, { status: result.status });
        }

        const { userId } = result;
        if (!userId) {
            return NextResponse.json({ error: 'User not logged in' }, { status: 401 });
        }

        const businessRef = db.collection('users').doc(businessId);
        const uniqueUpcIds: string[] = [...new Set(upcIds)];

        // ── Fetch UPC docs ────────────────────────────────────────────────
        const upcDocs = await Promise.all(
            uniqueUpcIds.map(id => businessRef.collection('upcs').doc(id).get()),
        );

        // ── Missing UPCs ──────────────────────────────────────────────────
        const missingUpcs = upcDocs.filter(d => !d.exists).map(d => d.id);
        if (missingUpcs.length > 0) {
            return NextResponse.json({ error: 'Some UPCs do not exist', missingUpcs }, { status: 404 });
        }

        // ── Validate each UPC is outbound with a creditNoteRef ────────────
        const invalidUpcs: { id: string; reason: string }[] = [];
        for (const upcDoc of upcDocs) {
            const data = upcDoc.data() as UPC;
            if (data.putAway !== 'outbound') {
                invalidUpcs.push({ id: upcDoc.id, reason: `putAway is '${data.putAway}', expected 'outbound'` });
            } else if (!data.creditNoteRef) {
                invalidUpcs.push({ id: upcDoc.id, reason: 'no creditNoteRef — not a credit note UPC' });
            }
        }

        if (invalidUpcs.length > 0) {
            return NextResponse.json({ error: 'Some UPCs cannot be dispatched', invalidUpcs }, { status: 400 });
        }

        // ── Set putAway → null ────────────────────────────────────────────
        // onUpcWritten detects outbound → null with creditNoteRef present
        // and increments inventory.deduction.
        const now = Timestamp.now();
        const batch = db.batch();

        for (const upcDoc of upcDocs) {
            batch.update(upcDoc.ref, {
                putAway: null,
                updatedAt: now,
                updatedBy: userId,
            } as Partial<UPC>);
        }

        await batch.commit();

        return NextResponse.json({
            success: true,
            count: uniqueUpcIds.length,
            message: `Successfully dispatched ${uniqueUpcIds.length} credit note UPC(s)`,
        });

    } catch (error) {
        console.error('❌ Error dispatching credit note UPCs:', error);
        return NextResponse.json({ error: 'Error dispatching credit note UPCs' }, { status: 500 });
    }
}