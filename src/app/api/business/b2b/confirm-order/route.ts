// /api/business/b2b/confirm-order

import { authUserForBusiness } from "@/lib/authoriseUser";
import { buildLots, getConfiguredStageNames, validateStageNames } from "@/lib/b2b_helpers";
import { db } from "@/lib/firebase-admin";
import { Buyer, DraftLotInput, Order, Product } from "@/types/b2b";
import { Timestamp } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { businessId, orderId, confirmedBy, lots: incomingLots }: {
            businessId: string;
            orderId: string;
            confirmedBy: string;
            lots?: DraftLotInput[];
        } = body;

        if (!businessId || !orderId || !confirmedBy) {
            return NextResponse.json(
                { error: "businessId, orderId, confirmedBy are required." },
                { status: 400 },
            );
        }

        const result = await authUserForBusiness({ businessId, req });
        if (!result.authorised) {
            return NextResponse.json({ error: result.error }, { status: result.status });
        }

        // ── Fetch order ─────────────────────────────────────────────────────
        const orderRef = db.doc(`users/${businessId}/orders/${orderId}`);
        const orderDoc = await orderRef.get();
        if (!orderDoc.exists) {
            return NextResponse.json({ error: "order_not_found" }, { status: 404 });
        }
        const order = orderDoc.data() as Order;
        if (order.status !== "DRAFT") {
            return NextResponse.json(
                { error: "order_not_draft", message: `Order is currently ${order.status}. Only DRAFT orders can be confirmed.` },
                { status: 400 },
            );
        }

        const lotInputs = incomingLots ?? order.draftLots;
        if (!lotInputs || lotInputs.length === 0) {
            return NextResponse.json({ error: "no_lots_defined" }, { status: 400 });
        }

        // ── Re-validate buyer ───────────────────────────────────────────────
        const buyerDoc = await db.doc(`users/${businessId}/buyers/${order.buyerId}`).get();
        if (!buyerDoc.exists) {
            return NextResponse.json({ error: "buyer_not_found" }, { status: 404 });
        }
        if (!(buyerDoc.data() as Buyer).isActive) {
            return NextResponse.json(
                { error: "buyer_inactive", message: "Cannot confirm an order for an inactive buyer." },
                { status: 400 },
            );
        }

        // ── Validate each lot ────────────────────────────────────────────────
        const configuredStages = await getConfiguredStageNames(businessId);
        if (configuredStages.size === 0) {
            return NextResponse.json(
                { error: "no_stages_configured", message: "No production stages have been configured for this business." },
                { status: 400 },
            );
        }

        for (const lot of lotInputs) {
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
            // If a predefined bomId was supplied, validate it exists and is active
            if (lot.bomId) {
                const bomDoc = await db.doc(`users/${businessId}/bom/${lot.bomId}`).get();
                if (!bomDoc.exists) {
                    return NextResponse.json({ error: "bom_not_found", message: `BOM ${lot.bomId} not found.` }, { status: 404 });
                }
            }
        }

        // ── All checks passed — create lots ─────────────────────────────────
        await orderRef.update({ status: "CONFIRMED", updatedAt: Timestamp.now() });

        const { lotDocs } = await buildLots(
            businessId, orderId, order.orderNumber,
            order.buyerId, order.buyerName, order.shipDate,
            confirmedBy, lotInputs,
        );

        const batch = db.batch();
        for (const lot of lotDocs) {
            batch.set(db.doc(`users/${businessId}/lots/${lot.id}`), lot);
        }
        batch.update(orderRef, {
            status: "IN_PRODUCTION",
            draftLots: null,
            totalLots: lotDocs.length,
            totalQuantity: lotDocs.reduce((s, l) => s + l.quantity, 0),
            lotsInProduction: lotDocs.length,
            updatedAt: Timestamp.now(),
        });

        await batch.commit();
        return NextResponse.json({ success: true, lotCount: lotDocs.length }, { status: 200 });

    } catch (error) {
        console.error("confirmOrder error:", error);
        return NextResponse.json({ error: "internal", message: (error as Error).message }, { status: 500 });
    }
}