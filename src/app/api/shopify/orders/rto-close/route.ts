import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { authUserForBusinessAndStore } from '@/lib/authoriseUser';

const ALLOWED_CURRENT_STATUSES = ['RTO In Transit', 'RTO Delivered'];

function normalizeVariantId(value: unknown): string | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return String(value);
    }

    if (typeof value === 'string' && value.trim() !== '') {
        return value.trim();
    }

    return null;
}

function normalizeQuantity(value: unknown): number {
    const quantity = Number(value);
    return Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
}

type UpcDocInfo = {
    ref: FirebaseFirestore.DocumentReference;
    id: string;
    data: FirebaseFirestore.DocumentData;
};

type VariantUpcGroup = {
    variantId: string;
    expectedQuantity: number;
    lineItemNames: string[];
    upcs: UpcDocInfo[];
};

async function fetchProductDocsByIds(params: {
    businessId: string;
    productIds: string[];
}) {
    const { businessId, productIds } = params;

    const productDocs = new Map<string, FirebaseFirestore.DocumentData>();

    await Promise.all(
        productIds.map(async (productId) => {
            const productDoc = await db
                .collection('users')
                .doc(businessId)
                .collection('products')
                .doc(productId)
                .get();

            if (productDoc.exists) {
                productDocs.set(productId, productDoc.data()!);
            }
        })
    );

    return productDocs;
}

function getMappedVariantIdFromBusinessProduct(params: {
    productData: FirebaseFirestore.DocumentData;
    shop: string;
    validOrderVariantIds: Set<string>;
}): string | null {
    const { productData, shop, validOrderVariantIds } = params;

    const mappedVariants = Array.isArray(productData.mappedVariants)
        ? productData.mappedVariants
        : [];

    for (const mappedVariant of mappedVariants) {
        const mappedStoreId = mappedVariant?.storeId;
        const mappedVariantId = normalizeVariantId(mappedVariant?.variantId);

        if (
            mappedStoreId === shop &&
            mappedVariantId &&
            validOrderVariantIds.has(mappedVariantId)
        ) {
            return mappedVariantId;
        }
    }

    return null;
}

function buildExpectedVariantGroups(lineItems: any[]) {
    const expectedByVariant = new Map<string, VariantUpcGroup>();

    for (const item of lineItems) {
        const variantId = normalizeVariantId(item?.variant_id);

        if (!variantId) {
            continue;
        }

        const quantity = normalizeQuantity(item?.quantity);

        if (!expectedByVariant.has(variantId)) {
            expectedByVariant.set(variantId, {
                variantId,
                expectedQuantity: 0,
                lineItemNames: [],
                upcs: [],
            });
        }

        const group = expectedByVariant.get(variantId)!;
        group.expectedQuantity += quantity;
        group.lineItemNames.push(item?.name || item?.title || `Variant ${variantId}`);
    }

    return expectedByVariant;
}

async function buildPerfectUpcMappingOrThrow(params: {
    businessId: string;
    shop: string;
    orderId: string;
    lineItems: any[];
}) {
    const { businessId, shop, orderId, lineItems } = params;

    const expectedByVariant = buildExpectedVariantGroups(lineItems);
    const validOrderVariantIds = new Set(expectedByVariant.keys());

    if (expectedByVariant.size === 0) {
        throw new Error('No valid variant IDs found in order line items.');
    }

    const upcsSnapshot = await db
        .collection('users')
        .doc(businessId)
        .collection('upcs')
        .where('orderId', '==', String(orderId))
        .get();

    if (upcsSnapshot.empty) {
        throw new Error(
            'No UPCs are associated with this order. Cannot safely close RTO order with item-level receiving.'
        );
    }

    const upcs: UpcDocInfo[] = upcsSnapshot.docs.map((doc) => ({
        ref: doc.ref,
        id: doc.id,
        data: doc.data(),
    }));

    const uniqueProductIds = [
        ...new Set(
            upcs
                .map((upc) => typeof upc.data.productId === 'string' ? upc.data.productId.trim() : '')
                .filter(Boolean)
        ),
    ];

    if (uniqueProductIds.length === 0) {
        throw new Error(
            'Associated UPCs do not contain valid productId values. Cannot map UPCs to order line items.'
        );
    }

    const productDocs = await fetchProductDocsByIds({
        businessId,
        productIds: uniqueProductIds,
    });

    const missingProductIds = uniqueProductIds.filter(
        (productId) => !productDocs.has(productId)
    );

    if (missingProductIds.length > 0) {
        throw new Error(
            `Some UPC productId values do not exist in users/${businessId}/products: ${missingProductIds.join(', ')}`
        );
    }

    const productIdToVariantId = new Map<string, string>();
    const unmappedProductIds: string[] = [];

    for (const productId of uniqueProductIds) {
        const productData = productDocs.get(productId)!;

        const mappedVariantId = getMappedVariantIdFromBusinessProduct({
            productData,
            shop,
            validOrderVariantIds,
        });

        if (!mappedVariantId) {
            unmappedProductIds.push(productId);
            continue;
        }

        productIdToVariantId.set(productId, mappedVariantId);
    }

    if (unmappedProductIds.length > 0) {
        throw new Error(
            `Some UPC productIds could not be mapped to this order's line items for store ${shop}: ${unmappedProductIds.join(', ')}`
        );
    }

    for (const upc of upcs) {
        const productId = String(upc.data.productId || '').trim();
        const variantId = productIdToVariantId.get(productId);

        if (!variantId) {
            throw new Error(
                `UPC ${upc.id} could not be mapped to any order line item.`
            );
        }

        const group = expectedByVariant.get(variantId);

        if (!group) {
            throw new Error(
                `UPC ${upc.id} maps to variant ${variantId}, but that variant is not present in this order.`
            );
        }

        group.upcs.push(upc);
    }

    const quantityMismatches = [...expectedByVariant.values()].filter(
        (group) => group.upcs.length !== group.expectedQuantity
    );

    if (quantityMismatches.length > 0) {
        const details = quantityMismatches
            .map((group) => {
                const itemName = group.lineItemNames.join(', ');
                return `${itemName} / variant ${group.variantId}: expected ${group.expectedQuantity} UPC(s), found ${group.upcs.length}`;
            })
            .join(' | ');

        throw new Error(
            `Perfect UPC mapping was not found for this order. ${details}`
        );
    }

    const expectedTotalQuantity = [...expectedByVariant.values()].reduce(
        (sum, group) => sum + group.expectedQuantity,
        0
    );

    if (upcs.length !== expectedTotalQuantity) {
        throw new Error(
            `UPC count mismatch. Order expects ${expectedTotalQuantity} UPC(s), but ${upcs.length} UPC(s) are associated with this order.`
        );
    }

    return expectedByVariant;
}

export async function POST(req: NextRequest) {
    try {
        const {
            businessId,
            shop,
            orderId,
            receivedVariantIds,
        } = await req.json();

        if (!businessId || typeof businessId !== 'string') {
            return NextResponse.json(
                { error: 'Business ID is required.' },
                { status: 400 }
            );
        }

        if (!shop || typeof shop !== 'string') {
            return NextResponse.json(
                { error: 'Shop is required.' },
                { status: 400 }
            );
        }

        if (!orderId || typeof orderId !== 'string') {
            return NextResponse.json(
                { error: 'Order ID is required.' },
                { status: 400 }
            );
        }

        if (!Array.isArray(receivedVariantIds)) {
            return NextResponse.json(
                { error: 'receivedVariantIds must be an array.' },
                { status: 400 }
            );
        }

        const result = await authUserForBusinessAndStore({
            businessId,
            shop,
            req,
        });

        if (!result.authorised) {
            return NextResponse.json(
                { error: result.error },
                { status: result.status || 403 }
            );
        }

        const normalizedReceivedVariantIds = [
            ...new Set(
                receivedVariantIds
                    .map(normalizeVariantId)
                    .filter((id: string | null): id is string => id !== null)
            ),
        ];

        const receivedVariantIdSet = new Set(normalizedReceivedVariantIds);

        const orderRef = db
            .collection('accounts')
            .doc(shop)
            .collection('orders')
            .doc(orderId);

        const orderDoc = await orderRef.get();

        if (!orderDoc.exists) {
            return NextResponse.json(
                { error: 'Order not found.' },
                { status: 404 }
            );
        }

        const orderData = orderDoc.data()!;
        const currentStatus = orderData.customStatus;

        if (!ALLOWED_CURRENT_STATUSES.includes(currentStatus)) {
            return NextResponse.json(
                {
                    error: `Only ${ALLOWED_CURRENT_STATUSES.join(' or ')} orders can be RTO closed from this action.`,
                },
                { status: 400 }
            );
        }

        const lineItems = Array.isArray(orderData.raw?.line_items)
            ? orderData.raw.line_items
            : [];

        if (lineItems.length === 0) {
            return NextResponse.json(
                { error: 'Order has no line items.' },
                { status: 400 }
            );
        }

        const rtoReceivedForStorage = lineItems
            .filter((item: any) => {
                const variantId = normalizeVariantId(item?.variant_id);
                return !!variantId && receivedVariantIdSet.has(variantId);
            })
            .map((item: any) => item.variant_id)
            .filter((variantId: unknown) => variantId !== undefined && variantId !== null);

        const validOrderVariantIds = new Set(
            lineItems
                .map((item: any) => normalizeVariantId(item?.variant_id))
                .filter((id: string | null): id is string => id !== null)
        );

        const invalidVariantIds = normalizedReceivedVariantIds.filter(
            (id) => !validOrderVariantIds.has(id)
        );

        if (invalidVariantIds.length > 0) {
            return NextResponse.json(
                {
                    error: 'One or more received items do not belong to this order.',
                    invalidVariantIds,
                },
                { status: 400 }
            );
        }

        /**
         * This is the important safety check:
         * Do not close the order unless existing UPCs perfectly map to line items.
         * No UPCs are created here.
         */
        const variantUpcGroups = await buildPerfectUpcMappingOrThrow({
            businessId,
            shop,
            orderId,
            lineItems,
        });

        const updatedLineItems = lineItems.map((item: any) => {
            const variantId = normalizeVariantId(item?.variant_id);
            const isReceived = !!variantId && receivedVariantIdSet.has(variantId);

            return {
                ...item,
                rtoReceived: isReceived,
            };
        });

        const log = {
            status: 'RTO Closed',
            createdAt: Timestamp.now(),
            remarks:
                normalizedReceivedVariantIds.length === validOrderVariantIds.size
                    ? 'This RTO order was closed manually. All items were marked as received.'
                    : `This RTO order was closed manually. ${normalizedReceivedVariantIds.length} of ${validOrderVariantIds.size} line item variant(s) were marked as received.`,
        };

        let upcsUpdated = 0;
        const batch = db.batch();

        for (const variantId of normalizedReceivedVariantIds) {
            const group = variantUpcGroups.get(variantId);

            if (!group) {
                return NextResponse.json(
                    {
                        error: `No UPC group found for received variant ${variantId}.`,
                    },
                    { status: 400 }
                );
            }

            for (const upc of group.upcs) {
                if (upc.data.putAway !== 'inbound') {
                    batch.update(upc.ref, {
                        putAway: 'inbound',
                        updatedAt: Timestamp.now(),
                        updatedBy: result.userId || null,
                    });

                    upcsUpdated++;
                }
            }
        }

        batch.update(orderRef, {
            customStatus: 'RTO Closed',
            'raw.line_items': updatedLineItems,
            rtoReceived: rtoReceivedForStorage,
            rtoReceivedUpdatedAt: Timestamp.now(),
            rtoReceivedUpdatedBy: result.userId,
            rtoReceivedMode: 'manual-selected-items',
            customStatusesLogs: FieldValue.arrayUnion(log),
        });

        await batch.commit();

        return NextResponse.json({
            success: true,
            message: 'RTO order closed successfully.',
            details: {
                orderId,
                totalLineItemVariants: validOrderVariantIds.size,
                receivedVariantIds: rtoReceivedForStorage,
                receivedCount: normalizedReceivedVariantIds.length,
                upcsUpdated,
                upcsCreated: 0,
            },
        });

    } catch (error) {
        console.error('RTO close failed:', error);

        const message = error instanceof Error ? error.message : String(error);

        const isMappingOrValidationError =
            message.includes('No UPCs are associated') ||
            message.includes('Cannot safely close') ||
            message.includes('Associated UPCs do not contain') ||
            message.includes('Some UPC productId values do not exist') ||
            message.includes('could not be mapped') ||
            message.includes('Perfect UPC mapping was not found') ||
            message.includes('UPC count mismatch') ||
            message.includes('No valid variant IDs found');

        return NextResponse.json(
            {
                error: isMappingOrValidationError
                    ? 'Cannot close this RTO order.'
                    : 'Failed to close RTO order.',
                details: message,
            },
            { status: isMappingOrValidationError ? 400 : 500 }
        );
    }
}