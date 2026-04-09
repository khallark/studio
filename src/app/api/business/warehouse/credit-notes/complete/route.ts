// POST /api/business/warehouse/credit-notes/complete
//
// Single-step Credit Note confirmation — creates and completes atomically.
//
// Flow:
//   1. Pre-flight (outside transaction): fetch all UPC docs via getAll(), validate
//      each is putAway: 'none'. Fails fast before acquiring any transaction locks.
//   2. Transaction:
//      a. Increments users/{businessId}.creditNoteCount, generates creditNoteNumber.
//      b. Creates the CN doc with status: 'completed' and completedAt set immediately.
//         No draft state — the doc is born complete.
//      c. Sets each UPC putAway → 'outbound', tags creditNoteRef: cnId.
//         onUpcWritten fires for each (none→outbound): decrements inShelfQuantity + placement qty.
//         When put-away page later sets outbound→null, onUpcWritten checks creditNoteRef:
//           present  → inventory.deduction++          (credit note)
//           absent   → inventory.autoDeduction++, blockedStock--   (order dispatch)
//
// Body:
//   businessId:  string
//   partyId:     string
//   partyName:   string
//   warehouseId: string
//   reason:      string
//   notes:       string | null
//   items:       CreditNoteItem[]
//   totalItems:  number
//   totalValue:  number

import { NextRequest, NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { db } from '@/lib/firebase-admin';
import { authUserForBusiness } from '@/lib/authoriseUser';
import { CreditNote, CreditNoteItem } from '@/types/warehouse';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json() as {
            businessId: string;
            partyId: string;
            partyName: string;
            warehouseId: string;
            reason: string;
            notes: string | null;
            items: CreditNoteItem[];
            totalItems: number;
            totalValue: number;
        };

        const {
            businessId, partyId, partyName,
            warehouseId, reason, notes,
            items, totalItems, totalValue,
        } = body;

        // ── Basic validation ──────────────────────────────────────────────────
        if (!businessId || !partyId || !partyName || !warehouseId || !reason) {
            return NextResponse.json(
                { error: 'Missing required fields: businessId, partyId, partyName, warehouseId, reason' },
                { status: 400 },
            );
        }

        if (!items?.length) {
            return NextResponse.json({ error: 'At least one item is required' }, { status: 400 });
        }

        for (const item of items) {
            if (!item.productId || !item.sku || !item.upcs?.length || item.quantity <= 0) {
                return NextResponse.json(
                    { error: `Invalid item: ${item.productId} — missing fields or empty UPCs` },
                    { status: 400 },
                );
            }
            if (item.upcs.length !== item.quantity) {
                return NextResponse.json(
                    { error: `Item ${item.productId}: upcs.length must equal quantity` },
                    { status: 400 },
                );
            }
            if (item.unitPrice <= 0) {
                return NextResponse.json(
                    { error: `Item ${item.productId}: unitPrice must be greater than 0` },
                    { status: 400 },
                );
            }
        }

        // ── Auth ──────────────────────────────────────────────────────────────
        const result = await authUserForBusiness({ businessId, req });
        if (!result.authorised) {
            console.log(`${result.error}'\n'${result.status}`);
            return NextResponse.json({ error: result.error }, { status: result.status });
        }

        const { userId } = result;
        if (!userId) {
            console.log("Unauthorised: User not logged in\n404");
            return NextResponse.json({ error: "Unauthorised: User not logged in" }, { status: 401 });
        }

        const allUpcIds = items.flatMap((item) => item.upcs);

        // ── Pre-flight: validate all UPCs outside transaction ─────────────────
        // getAll() is a single batch read — fast, no transaction overhead.
        // Fail before acquiring any locks.
        const upcRefs = allUpcIds.map((id) => db.doc(`users/${businessId}/upcs/${id}`));
        const upcSnaps = await db.getAll(...upcRefs);

        for (let i = 0; i < upcSnaps.length; i++) {
            const snap = upcSnaps[i];
            const upcId = allUpcIds[i];
            if (!snap.exists) {
                return NextResponse.json({ error: `UPC ${upcId} does not exist` }, { status: 400 });
            }
            if (snap.data()?.putAway !== 'none') {
                return NextResponse.json(
                    { error: `UPC ${upcId} is not shelved (putAway: '${snap.data()?.putAway}') — cannot include in credit note` },
                    { status: 400 },
                );
            }
        }

        // ── Transaction: generate CN number + create doc + update UPCs ────────
        const businessRef = db.doc(`users/${businessId}`);
        const cnRef = db.collection(`users/${businessId}/credit_notes`).doc();
        const cnId = cnRef.id;
        const now = Timestamp.now();

        await db.runTransaction(async (tx) => {
            const businessSnap = await tx.get(businessRef);
            const currentCount = businessSnap.data()?.creditNoteCount ?? 0;
            const nextCount = currentCount + 1;
            const creditNoteNumber = `CN-${String(nextCount).padStart(3, '0')}`;

            tx.update(businessRef, { creditNoteCount: nextCount });

            const creditNote: CreditNote = {
                id: cnId,
                creditNoteNumber,
                businessId,
                storeId: businessSnap.data()?.defaultStoreId ?? '',
                partyId,
                partyName,
                warehouseId,
                reason,
                status: 'completed',
                items,
                totalItems,
                totalValue,
                notes: notes ?? null,
                createdBy: userId,
                createdAt: now,
                updatedAt: now,
                completedAt: now,
            };

            tx.set(cnRef, creditNote);

            for (const ref of upcRefs) {
                tx.update(ref, {
                    putAway: 'outbound',
                    creditNoteRef: cnId,
                    updatedAt: now,
                    updatedBy: result.userId,
                });
            }
        });

        return NextResponse.json({ id: cnId }, { status: 201 });

    } catch (err: any) {
        console.error('❌ /api/business/warehouse/credit-notes/complete:', err);
        return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
    }
}