// /api/business/b2b/create-order

import { authUserForBusiness } from "@/lib/authoriseUser";
import { buildLots, generateOrderNumber, getConfiguredStageNames, validateStageNames } from "@/lib/b2b_helpers";
import { db } from "@/lib/firebase-admin";
import { Buyer, DraftLotInput, Order, Product } from "@/types/b2b";
import { Timestamp } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { businessId, buyerId, buyerName, buyerContact, shipDate, deliveryAddress, note, createdBy, lots }: {
            businessId: string;
            buyerId: string;
            buyerName: string;
            buyerContact: string;
            shipDate: string;
            deliveryAddress: string;
            note?: string;
            createdBy: string;
            lots: DraftLotInput[];
        } = body;

        if (!businessId || !buyerId || !buyerName || !buyerContact || !shipDate || !deliveryAddress || !createdBy || !lots) {
            return NextResponse.json(
                { error: "businessId, buyerId, buyerName, buyerContact, shipDate, deliveryAddress, createdBy, lots are required." },
                { status: 400 },
            );
        }
        if (!lots.length) {
            return NextResponse.json({ error: "at_least_one_lot_required" }, { status: 400 });
        }

        const result = await authUserForBusiness({ businessId, req });
        if (!result.authorised) {
            return NextResponse.json({ error: result.error }, { status: result.status });
        }

        // ── Validate buyer ──────────────────────────────────────────────────
        const buyerDoc = await db.doc(`users/${businessId}/buyers/${buyerId}`).get();
        if (!buyerDoc.exists) {
            return NextResponse.json({ error: "buyer_not_found" }, { status: 404 });
        }
        if (!(buyerDoc.data() as Buyer).isActive) {
            return NextResponse.json(
                { error: "buyer_inactive", message: "Cannot create an order for an inactive buyer." },
                { status: 400 },
            );
        }

        // ── Validate lots ────────────────────────────────────────────────────
        const configuredStages = await getConfiguredStageNames(businessId);
        if (configuredStages.size === 0) {
            return NextResponse.json(
                { error: "no_stages_configured", message: "No production stages configured. Add stages in Stage Config first." },
                { status: 400 },
            );
        }

        for (const lot of lots) {
            if (!lot.productId) {
                return NextResponse.json({ error: "lot_missing_product" }, { status: 400 });
            }
            if (!lot.quantity || lot.quantity <= 0) {
                return NextResponse.json({ error: "lot_invalid_quantity" }, { status: 400 });
            }
            if (!lot.stages?.length) {
                return NextResponse.json({ error: "lot_missing_stages" }, { status: 400 });
            }
            const productDoc = await db.doc(`users/${businessId}/b2bProducts/${lot.productId}`).get();
            if (!productDoc.exists) {
                return NextResponse.json({ error: "product_not_found", message: `Product ${lot.productId} does not exist.` }, { status: 404 });
            }
            if (!(productDoc.data() as Product).isActive) {
                return NextResponse.json({ error: "product_inactive", message: `Product "${lot.productName}" is inactive.` }, { status: 400 });
            }
            const stageError = validateStageNames(lot.stages.map(s => s.stage), configuredStages, `Lot "${lot.productName}"`);
            if (stageError) {
                return NextResponse.json({ error: "invalid_stage", message: stageError }, { status: 400 });
            }
            if (lot.bomId) {
                const bomDoc = await db.doc(`users/${businessId}/bom/${lot.bomId}`).get();
                if (!bomDoc.exists) {
                    return NextResponse.json({ error: "bom_not_found", message: `BOM ${lot.bomId} not found.` }, { status: 404 });
                }
            }
        }

        // ── Generate IDs and build lots ─────────────────────────────────────
        const orderNumber = await generateOrderNumber(businessId);
        const orderId = db.collection(`users/${businessId}/orders`).doc().id;
        const shipTimestamp = Timestamp.fromDate(new Date(shipDate));

        const { lotDocs } = await buildLots(
            businessId, orderId, orderNumber,
            buyerId, buyerName, shipTimestamp,
            createdBy, lots,
        );

        const batch = db.batch();
        const orderRef = db.doc(`users/${businessId}/orders/${orderId}`);

        batch.set(orderRef, {
            id: orderId,
            orderNumber,
            buyerId,
            buyerName,
            buyerContact,
            shipDate: shipTimestamp,
            deliveryAddress,
            draftLots: null,
            totalLots: lotDocs.length,
            totalQuantity: lotDocs.reduce((s, l) => s + l.quantity, 0),
            lotsCompleted: 0,
            lotsInProduction: lotDocs.length,
            lotsDelayed: 0,
            status: "IN_PRODUCTION",
            note: note ?? null,
            createdBy,
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
        } satisfies Order);

        for (const lot of lotDocs) {
            batch.set(db.doc(`users/${businessId}/lots/${lot.id}`), lot);
        }

        await batch.commit();
        return NextResponse.json({ orderId, orderNumber, lotCount: lotDocs.length }, { status: 200 });

    } catch (error) {
        console.error("createOrder error:", error);
        return NextResponse.json({ error: "internal", message: (error as Error).message }, { status: 500 });
    }
}