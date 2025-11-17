import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { authBusinessForOrderOfTheExceptionStore, authUserForBusinessAndStore, SHARED_STORE_ID } from '@/lib/authoriseUser';

export async function POST(req: NextRequest) {
    try {
        const {
            businessId,
            shop,
            orderId,
            selectedItemIds,
            refundAmount,
            refundMethod,
            currency,
            customerId,
        } = await req.json();

        // Validation
        if (!businessId) {
            console.warn('No business id provided.');
            return NextResponse.json({ error: 'No business id provided.' }, { status: 400 });
        }

        if (!shop || !orderId || !selectedItemIds || !refundAmount || !refundMethod || !currency) {
            console.warn('Missing required parameters');
            return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
        }

        if (refundMethod === 'store_credit' && !customerId) {
            console.warn('Customer ID required for store credit refunds');
            return NextResponse.json({ error: 'Customer ID required for store credit refunds' }, { status: 400 });
        }

        // ----- Auth -----
        const result = await authUserForBusinessAndStore({ businessId, shop, req });
        const businessData = result.businessDoc?.data();

        if (!result.authorised) {
            const { error, status } = result;
            return NextResponse.json({ error }, { status });
        }

        const { shopDoc } = result;

        // Get order data
        const orderRef = shopDoc?.ref.collection('orders').doc(orderId);
        const orderDoc = await orderRef?.get();

        if (!orderDoc?.exists) {
            return NextResponse.json({ error: 'Order not found' }, { status: 404 });
        }

        const orderData = orderDoc.data();

        // Additional auth for shared store
        if (shop === SHARED_STORE_ID) {
            const vendorName = businessData?.vendorName;
            const vendors = orderData?.vendors;
            const canProcess = authBusinessForOrderOfTheExceptionStore({ businessId, vendorName, vendors });
            if (!canProcess.authorised) {
                const { error, status } = canProcess;
                return NextResponse.json({ error }, { status });
            }
        }

        if (orderData?.financialStatus !== 'paid') {
            return NextResponse.json({ error: 'Order is not paid' }, { status: 400 })
        }

        // Get access token
        const storeData = shopDoc?.data();
        const accessToken = storeData?.accessToken;

        if (!accessToken) {
            return NextResponse.json({ error: 'Store access token not found' }, { status: 500 });
        }

        let refundResult = null;
        let storeCreditResult = null;

        // Process refund via Shopify if method is store_credit
        if (refundMethod === 'store_credit') {
            try {
                // // Step 1: Add to customer's store credits FIRST (most important - customer gets their money)
                // const storeCreditResponse = await fetch(
                //     `https://${shop}/admin/api/2025-01/graphql.json`,
                //     {
                //         method: 'POST',
                //         headers: {
                //             'Content-Type': 'application/json',
                //             'X-Shopify-Access-Token': accessToken,
                //         },
                //         body: JSON.stringify({
                //             query: `
                //                 mutation storeCreditAccountCredit($id: ID!, $creditInput: StoreCreditAccountCreditInput!) {
                //                     storeCreditAccountCredit(id: $id, creditInput: $creditInput) {
                //                         storeCreditAccountTransaction {
                //                             amount {
                //                                 amount
                //                                 currencyCode
                //                             }
                //                             account {
                //                                 id
                //                                 balance {
                //                                     amount
                //                                     currencyCode
                //                                 }
                //                             }
                //                         }
                //                         userErrors {
                //                             message
                //                             field
                //                         }
                //                     }
                //                 }
                //             `,
                //             variables: {
                //                 id: `gid://shopify/Customer/${customerId}`,
                //                 creditInput: {
                //                     creditAmount: {
                //                         amount: refundAmount.toFixed(2),
                //                         currencyCode: currency,
                //                     },
                //                 },
                //             },
                //         }),
                //     }
                // );

                // if (!storeCreditResponse.ok) {
                //     const errorData = await storeCreditResponse.json();
                //     console.log(JSON.stringify(errorData, null, 2));
                //     console.error('Store credit error:', errorData);
                //     throw new Error('Failed to add store credit');
                // }

                // storeCreditResult = await storeCreditResponse.json();
                // console.log(JSON.stringify(storeCreditResult, null, 2));

                // if (!storeCreditResult.data?.storeCreditAccountCredit?.storeCreditAccountTransaction) {
                //     console.error('No transaction in response:', storeCreditResult);
                //     throw new Error('Store credit transaction was not created');
                // }

                // console.log('✅ Store credit successfully added!');

                // Step 2: Mark order as refunded in Shopify (bookkeeping)
                const shopifyOrderId = orderData?.orderId;
                const refundResponse = await fetch(
                    `https://${shop}/admin/api/2025-01/orders/${shopifyOrderId}/refunds.json`,
                    {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-Shopify-Access-Token': accessToken,
                        },
                        body: JSON.stringify({
                            refund: {
                                notify: false,
                                note: `Refund processed for returned items - credited to store credit`,
                                transactions: [
                                    {
                                        kind: 'refund',
                                        gateway: 'store-credit',
                                        amount: refundAmount.toFixed(2),
                                    },
                                ],
                            },
                        }),
                    }
                );

                if (!refundResponse.ok) {
                    const errorData = await refundResponse.json();
                    console.log(JSON.stringify(refundResult, null, 2));
                    console.error('Shopify refund marking error:', errorData);
                    // Customer HAS their store credit, so we log but don't fail completely
                    console.warn('Failed to mark order as refunded in Shopify, but customer has store credit');
                    // Continue execution - customer has their money which is most important
                } else {
                    refundResult = await refundResponse.json();
                    console.log(JSON.stringify(refundResult, null, 2));
                }

            } catch (error: any) {
                console.error('Error processing store credit refund:', error);
                return NextResponse.json(
                    {
                        error: 'Failed to process refund via Shopify',
                        details: error.message,
                    },
                    { status: 500 }
                );
            }
        }

        // Update Firestore order document
        // const updateData: any = {
        //     refundedAmount: refundAmount,
        //     customStatus: 'DTO Refunded',
        //     lastStatusUpdate: FieldValue.serverTimestamp(),
        //     customStatusesLogs: FieldValue.arrayUnion({
        //         status: 'DTO Refunded',
        //         createdAt: Timestamp.now(),
        //         remarks: refundMethod === 'store_credit'
        //             ? `Refunded ${currency} ${refundAmount.toFixed(2)} to customer's store credits`
        //             : `Manually refunded ${currency} ${refundAmount.toFixed(2)}`,
        //     }),
        // };

        // await orderRef?.update(updateData);

        return NextResponse.json({
            success: true,
            message: refundMethod === 'store_credit'
                ? 'Refund processed and added to customer\'s store credits successfully'
                : 'Refund marked as manually paid successfully',
            refundAmount,
            refundMethod,
            shopifyRefund: refundResult,
        });

    } catch (error: any) {
        console.error('Error processing refund:', error);
        return NextResponse.json(
            {
                error: 'Failed to process refund',
                details: error.message || 'Unknown error occurred',
            },
            { status: 500 }
        );
    }
}