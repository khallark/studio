// lib/whatsapp.ts

import { FieldValue } from 'firebase-admin/firestore';
import { db } from '@/lib/firebase-admin';

// Helper to normalize phone numbers for comparison
function normalizePhoneNumber(phone: string): string {
    if (!phone) return '';
    // Removes non-digit characters and takes the last 10 digits
    const digitsOnly = phone.replace(/\D/g, '');
    return digitsOnly.slice(-10);
}

/**
 * Get product image from Shopify
 */
async function getProductImage(shop: any, productId: any): Promise<string> {
    try {
        const response = await fetch(
            `https://${shop.shopName}/admin/api/2024-10/products/${productId}.json`,
            {
                headers: {
                    'X-Shopify-Access-Token': shop.accessToken,
                },
            }
        );

        if (!response.ok) {
            throw new Error('Failed to fetch product from Shopify');
        }

        const data = await response.json();

        if (data.product?.images?.[0]?.src) {
            return data.product.images[0].src;
        }

        return 'https://owr.life/cdn/shop/files/One_Who_Rules_Banner.jpg';
    } catch (error) {
        console.error('Error fetching product image:', error);
        return 'https://owr.life/cdn/shop/files/One_Who_Rules_Banner.jpg';
    }
}

/**
 * Extract customer name from order
 */
function getCustomerName(order: any): string {
    return (
        order?.raw?.shipping_address?.name ||
        order?.raw?.billing_address?.name ||
        `${order?.raw?.customer?.first_name || ''} ${order?.raw?.customer?.last_name || ''}`.trim() ||
        'Customer'
    );
}

/**
 * Extract phone number from order
 */
function getCustomerPhone(order: any): string {
    const phone =
        order?.raw?.shipping_address?.phone ||
        order?.raw?.billing_address?.phone ||
        order?.raw?.customer?.phone ||
        '';

    return phone.replace(/[^\d+]/g, '');
}

/**
 * Format date
 */
function formatDate(date: Date): string {
    return new Intl.DateTimeFormat('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    }).format(new Date(date));
}

/**
 * Send WhatsApp new order notification
 */
export async function sendNewOrderWhatsAppMessage(
    shop: any,
    order: any,
) {
    try {
        const customerName = getCustomerName(order)
        const customerPhone = String("91" + normalizePhoneNumber(getCustomerPhone(order)));
        const orderName = order.name;
        const totalPrice = String(order?.raw?.total_price);
        
        // Format line items into string with line breaks
        const productsList = order.raw.line_items
            ?.map((item: any) => `${item.name} x ${item.quantity}`)
            .join(',') || 'No items';

        if (!customerPhone) {
            console.error('No phone number found for order:', orderName);
            return null;
        }

        let productImageUrl = 'https://owr.life/cdn/shop/files/One_Who_Rules_Banner.jpg';

        if (order.raw.line_items && order.raw.line_items.length > 0) {
            const firstProduct = order.raw.line_items[0];
            productImageUrl = await getProductImage(shop, firstProduct.product_id);
        }

        const payload = {
            messaging_product: 'whatsapp',
            to: customerPhone,
            type: 'template',
            template: {
                name: 'new_order_1',
                language: {
                    code: 'en',
                },
                components: [
                    {
                        type: 'header',
                        parameters: [
                            {
                                type: 'image',
                                image: {
                                    link: productImageUrl,
                                },
                            },
                        ],
                    },
                    {
                        type: 'body',
                        parameters: [
                            {
                                type: 'text',
                                text: customerName,
                            },
                            {
                                type: 'text',
                                text: orderName,
                            },
                            {
                                type: 'text',
                                text: totalPrice,
                            },
                            {
                                type: 'text',
                                text: productsList,
                            },
                        ],
                    },
                ],
            },
        };

        const response = await fetch(
            `https://graph.facebook.com/v24.0/${shop.whatsappPhoneNumberId}/messages`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${shop.whatsappAccessToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            }
        );

        if (!response.ok) {
            const error = await response.json();
            console.error('WhatsApp API error:', error);
            return null;
        }

        const result = await response.json();
        const messageId = result.messages[0].id;
        const sentTo = result.contacts[0].input;

        const messageDoc = {
            orderName: orderName,
            forStatus: "New",
            orderId: order.orderId,
            shopName: shop.shopName,
            sentAt: FieldValue.serverTimestamp(),
            messageStatus: 'sent',
            sentTo: sentTo,
            messageId: messageId,
        };

        await db
            .collection('whatsapp_messages')
            .doc(messageId)
            .set(messageDoc);

        await db
            .collection('accounts')
            .doc(shop.shopName)
            .collection('orders')
            .doc(String(order.orderId))
            .update({
                whatsapp_messages: FieldValue.arrayUnion(messageId),
            });

        console.log(`✅ WhatsApp message sent for order ${orderName}`);
        console.log(`   Message ID: ${messageId}`);
        console.log(`   Sent to: ${sentTo}`);

        return {
            success: true,
            messageId,
            sentTo,
        };
    } catch (error) {
        console.error('Error sending WhatsApp message:', error);
        return null;
    }
}

/**
 * Send WhatsApp order confirmation message
 */
export async function sendConfirmOrderWhatsAppMessage(
    shop: any,
    order: any,
) {
    try {
        const customerName = getCustomerName(order)
        const customerPhone = String("91" + normalizePhoneNumber(getCustomerPhone(order)));
        const orderName = order.name;

        if (!customerPhone) {
            console.error('No phone number found for order:', orderName);
            return null;
        }

        const payload = {
            messaging_product: 'whatsapp',
            to: customerPhone,
            type: 'template',
            template: {
                name: 'confirm_order_1',
                language: {
                    code: 'en',
                },
                components: [
                    {
                        type: 'body',
                        parameters: [
                            {
                                type: 'text',
                                text: customerName,
                            },
                            {
                                type: 'text',
                                text: orderName,
                            },
                        ],
                    },
                ],
            },
        };

        const response = await fetch(
            `https://graph.facebook.com/v24.0/${shop.whatsappPhoneNumberId}/messages`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${shop.whatsappAccessToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            }
        );

        if (!response.ok) {
            const error = await response.json();
            console.error('WhatsApp API error:', error);
            return null;
        }

        const result = await response.json();
        const messageId = result.messages[0].id;
        const sentTo = result.contacts[0].input;

        const messageDoc = {
            orderName: orderName,
            forStatus: "Confirmed",
            orderId: order.orderId,
            shopName: shop.shopName,
            sentAt: FieldValue.serverTimestamp(),
            messageStatus: 'sent',
            sentTo: sentTo,
            messageId: messageId,
        };

        await db
            .collection('whatsapp_messages')
            .doc(messageId)
            .set(messageDoc);

        await db
            .collection('accounts')
            .doc(shop.shopName)
            .collection('orders')
            .doc(String(order.orderId))
            .update({
                whatsapp_messages: FieldValue.arrayUnion(messageId),
            });

        console.log(`✅ Order confirmation message sent for order ${orderName}`);

        return {
            success: true,
            messageId,
            sentTo,
        };
    } catch (error) {
        console.error('Error sending confirmation message:', error);
        return null;
    }
}

/**
 * Send WhatsApp order cancellation message
 */
export async function sendCancelOrderWhatsAppMessage(
    shop: any,
    order: any,
) {
    try {
        const customerName = getCustomerName(order)
        const customerPhone = String("91" + normalizePhoneNumber(getCustomerPhone(order)));
        const orderName = order.name;

        if (!customerPhone) {
            console.error('No phone number found for order:', orderName);
            return null;
        }

        const payload = {
            messaging_product: 'whatsapp',
            to: customerPhone,
            type: 'template',
            template: {
                name: 'cancel_order_1',
                language: {
                    code: 'en',
                },
                components: [
                    {
                        type: 'body',
                        parameters: [
                            {
                                type: 'text',
                                text: customerName,
                            },
                            {
                                type: 'text',
                                text: orderName,
                            },
                        ],
                    },
                ],
            },
        };

        const response = await fetch(
            `https://graph.facebook.com/v24.0/${shop.whatsappPhoneNumberId}/messages`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${shop.whatsappAccessToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            }
        );

        if (!response.ok) {
            const error = await response.json();
            console.error('WhatsApp API error:', error);
            return null;
        }

        const result = await response.json();
        const messageId = result.messages[0].id;
        const sentTo = result.contacts[0].input;

        const messageDoc = {
            orderName: orderName,
            forStatus: "Cancellation Requested",
            orderId: order.orderId,
            shopName: shop.shopName,
            sentAt: FieldValue.serverTimestamp(),
            messageStatus: 'sent',
            sentTo: sentTo,
            messageId: messageId,
        };

        await db
            .collection('whatsapp_messages')
            .doc(messageId)
            .set(messageDoc);

        await db
            .collection('accounts')
            .doc(shop.shopName)
            .collection('orders')
            .doc(String(order.orderId))
            .update({
                whatsapp_messages: FieldValue.arrayUnion(messageId),
            });

        console.log(`✅ Order cancellation message sent for order ${orderName}`);

        return {
            success: true,
            messageId,
            sentTo,
        };
    } catch (error) {
        console.error('Error sending cancellation message:', error);
        return null;
    }
}

/**
 * Send WhatsApp order dispatched notification
 */
export async function sendDispatchedOrderWhatsAppMessage(
    shop: any,
    order: any,
) {
    try {
        const customerName = getCustomerName(order)
        const customerPhone = String("91" + normalizePhoneNumber(getCustomerPhone(order)));
        const orderName = order.name;
        const orderAWB = String(order?.awb) ?? "NOT AVAILABLE"
        const orderCourierProvider = String(order?.courierProvider ?? order.courier);
        const shopName = encodeURIComponent(shop.shopName);
        const queryString = `?shop=${shopName}&order=${encodeURIComponent(orderName)}`;

        if (!customerPhone) {
            console.error('No phone number found for order:', orderName);
            return null;
        }

        const payload = {
            messaging_product: 'whatsapp',
            to: customerPhone,
            type: 'template',
            template: {
                name: 'dipatched_order_1',
                language: {
                    code: 'en',
                },
                components: [
                    {
                        type: 'body',
                        parameters: [
                            {
                                type: 'text',
                                text: customerName,
                            },
                            {
                                type: 'text',
                                text: orderName,
                            },
                            {
                                type: 'text',
                                text: orderAWB,
                            },
                            {
                                type: 'text',
                                text: orderCourierProvider,
                            },
                        ],
                    },
                    {
                        type: 'button',
                        sub_type: 'url',
                        index: '0',
                        parameters: [
                            {
                                type: 'text',
                                text: queryString, // "?shop=onewhorules&order=%23OWR-MT2342"
                            },
                        ],
                    },
                ],
            },
        };

        const response = await fetch(
            `https://graph.facebook.com/v24.0/${shop.whatsappPhoneNumberId}/messages`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${shop.whatsappAccessToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            }
        );

        if (!response.ok) {
            const error = await response.json();
            console.error('WhatsApp API error:', error);
            return null;
        }

        const result = await response.json();
        const messageId = result.messages[0].id;
        const sentTo = result.contacts[0].input;

        const messageDoc = {
            orderName: orderName,
            forStatus: "Dispatched",
            orderId: order.orderId,
            shopName: shop.shopName,
            sentAt: FieldValue.serverTimestamp(),
            messageStatus: 'sent',
            sentTo: sentTo,
            messageId: messageId,
        };

        await db
            .collection('whatsapp_messages')
            .doc(messageId)
            .set(messageDoc);

        await db
            .collection('accounts')
            .doc(shop.shopName)
            .collection('orders')
            .doc(String(order.orderId))
            .update({
                whatsapp_messages: FieldValue.arrayUnion(messageId),
            });

        console.log(`✅ WhatsApp message sent for order ${orderName}`);
        console.log(`   Message ID: ${messageId}`);
        console.log(`   Sent to: ${sentTo}`);

        return {
            success: true,
            messageId,
            sentTo,
        };
    } catch (error) {
        console.error('Error sending WhatsApp message:', error);
        return null;
    }
}

/**
 * Send WhatsApp order in transit notification
 */
export async function sendInTransitOrderWhatsAppMessage(
    shop: any,
    order: any,
) {
    try {
        const customerName = getCustomerName(order)
        const customerPhone = String("91" + normalizePhoneNumber(getCustomerPhone(order)));
        const orderName = order.name;
        const orderAWB = String(order?.awb) ?? "NOT AVAILABLE"
        const orderCourierProvider = String(order?.courierProvider ?? order.courier);
        const shopName = encodeURIComponent(shop.shopName);
        const queryString = `?shop=${shopName}&order=${encodeURIComponent(orderName)}`;

        if (!customerPhone) {
            console.error('No phone number found for order:', orderName);
            return null;
        }
        
        const payload = {
            messaging_product: 'whatsapp',
            to: customerPhone,
            type: 'template',
            template: {
                name: 'intransit_order_1',
                language: {
                    code: 'en',
                },
                components: [
                    {
                        type: 'body',
                        parameters: [
                            {
                                type: 'text',
                                text: customerName,
                            },
                            {
                                type: 'text',
                                text: orderName,
                            },
                            {
                                type: 'text',
                                text: orderAWB,
                            },
                            {
                                type: 'text',
                                text: orderCourierProvider,
                            },
                        ],
                    },
                    {
                        type: 'button',
                        sub_type: 'url',
                        index: '0',
                        parameters: [
                            {
                                type: 'text',
                                text: queryString, // "?shop=onewhorules&order=%23OWR-MT2342"
                            },
                        ],
                    },
                ],
            },
        };

        const response = await fetch(
            `https://graph.facebook.com/v24.0/${shop.whatsappPhoneNumberId}/messages`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${shop.whatsappAccessToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            }
        );

        if (!response.ok) {
            const error = await response.json();
            console.error('WhatsApp API error:', error);
            return null;
        }

        const result = await response.json();
        const messageId = result.messages[0].id;
        const sentTo = result.contacts[0].input;

        const messageDoc = {
            orderName: orderName,
            forStatus: "In Transit",
            orderId: order.orderId,
            shopName: shop.shopName,
            sentAt: FieldValue.serverTimestamp(),
            messageStatus: 'sent',
            sentTo: sentTo,
            messageId: messageId,
        };

        await db
            .collection('whatsapp_messages')
            .doc(messageId)
            .set(messageDoc);

        await db
            .collection('accounts')
            .doc(shop.shopName)
            .collection('orders')
            .doc(String(order.orderId))
            .update({
                whatsapp_messages: FieldValue.arrayUnion(messageId),
            });

        console.log(`✅ WhatsApp message sent for order ${orderName}`);
        console.log(`   Message ID: ${messageId}`);
        console.log(`   Sent to: ${sentTo}`);

        return {
            success: true,
            messageId,
            sentTo,
        };
    } catch (error) {
        console.error('Error sending WhatsApp message:', error);
        return null;
    }
}

/**
 * Send WhatsApp order out for delivery notification
 */
export async function sendOutForDeliveryOrderWhatsAppMessage(
    shop: any,
    order: any,
) {
    try {
        const customerName = getCustomerName(order)
        const customerPhone = String("91" + normalizePhoneNumber(getCustomerPhone(order)));
        const orderName = order.name;
        const orderAWB = String(order?.awb) ?? "NOT AVAILABLE"
        const orderCourierProvider = String(order?.courierProvider ?? order.courier);
        const shopName = encodeURIComponent(shop.shopName);
        const queryString = `?shop=${shopName}&order=${encodeURIComponent(orderName)}`;

        if (!customerPhone) {
            console.error('No phone number found for order:', orderName);
            return null;
        }
        
        const payload = {
            messaging_product: 'whatsapp',
            to: customerPhone,
            type: 'template',
            template: {
                name: 'outfordelivery_order_1',
                language: {
                    code: 'en',
                },
                components: [
                    {
                        type: 'body',
                        parameters: [
                            {
                                type: 'text',
                                text: customerName,
                            },
                            {
                                type: 'text',
                                text: orderName,
                            },
                            {
                                type: 'text',
                                text: orderAWB,
                            },
                            {
                                type: 'text',
                                text: orderCourierProvider,
                            },
                        ],
                    },
                    {
                        type: 'button',
                        sub_type: 'url',
                        index: '0',
                        parameters: [
                            {
                                type: 'text',
                                text: queryString, // "?shop=onewhorules&order=%23OWR-MT2342"
                            },
                        ],
                    },
                ],
            },
        };

        const response = await fetch(
            `https://graph.facebook.com/v24.0/${shop.whatsappPhoneNumberId}/messages`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${shop.whatsappAccessToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            }
        );

        if (!response.ok) {
            const error = await response.json();
            console.error('WhatsApp API error:', error);
            return null;
        }

        const result = await response.json();
        const messageId = result.messages[0].id;
        const sentTo = result.contacts[0].input;

        const messageDoc = {
            orderName: orderName,
            forStatus: "Out For Delivery",
            orderId: order.orderId,
            shopName: shop.shopName,
            sentAt: FieldValue.serverTimestamp(),
            messageStatus: 'sent',
            sentTo: sentTo,
            messageId: messageId,
        };

        await db
            .collection('whatsapp_messages')
            .doc(messageId)
            .set(messageDoc);

        await db
            .collection('accounts')
            .doc(shop.shopName)
            .collection('orders')
            .doc(String(order.orderId))
            .update({
                whatsapp_messages: FieldValue.arrayUnion(messageId),
            });

        console.log(`✅ WhatsApp message sent for order ${orderName}`);
        console.log(`   Message ID: ${messageId}`);
        console.log(`   Sent to: ${sentTo}`);

        return {
            success: true,
            messageId,
            sentTo,
        };
    } catch (error) {
        console.error('Error sending WhatsApp message:', error);
        return null;
    }
}

/**
 * Send WhatsApp order delivered notification
 */
export async function sendDeliveredOrderWhatsAppMessage(
    shop: any,
    order: any,
) {
    try {
        const customerName = getCustomerName(order)
        const customerPhone = String("91" + normalizePhoneNumber(getCustomerPhone(order)));
        const orderName = order.name;
        const deliveredDate = order.lastStatusUpdate.toDate 
            ? formatDate(order.lastStatusUpdate.toDate())  // Firestore Timestamp
            : formatDate(new Date(order.lastStatusUpdate)); // Already a Date/number

        if (!customerPhone) {
            console.error('No phone number found for order:', orderName);
            return null;
        }
        
        const payload = {
            messaging_product: 'whatsapp',
            to: customerPhone,
            type: 'template',
            template: {
                name: 'delivered_order_1',
                language: {
                    code: 'en',
                },
                components: [
                    {
                        type: 'body',
                        parameters: [
                            {
                                type: 'text',
                                text: customerName,
                            },
                            {
                                type: 'text',
                                text: orderName,
                            },
                            {
                                type: 'text',
                                text: deliveredDate
                            }
                        ],
                    },
                ],
            },
        };

        const response = await fetch(
            `https://graph.facebook.com/v24.0/${shop.whatsappPhoneNumberId}/messages`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${shop.whatsappAccessToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            }
        );

        if (!response.ok) {
            const error = await response.json();
            console.error('WhatsApp API error:', error);
            return null;
        }

        const result = await response.json();
        const messageId = result.messages[0].id;
        const sentTo = result.contacts[0].input;

        const messageDoc = {
            orderName: orderName,
            forStatus: "Delivered",
            orderId: order.orderId,
            shopName: shop.shopName,
            sentAt: FieldValue.serverTimestamp(),
            messageStatus: 'sent',
            sentTo: sentTo,
            messageId: messageId,
        };

        await db
            .collection('whatsapp_messages')
            .doc(messageId)
            .set(messageDoc);

        await db
            .collection('accounts')
            .doc(shop.shopName)
            .collection('orders')
            .doc(String(order.orderId))
            .update({
                whatsapp_messages: FieldValue.arrayUnion(messageId),
            });

        console.log(`✅ WhatsApp message sent for order ${orderName}`);
        console.log(`   Message ID: ${messageId}`);
        console.log(`   Sent to: ${sentTo}`);

        return {
            success: true,
            messageId,
            sentTo,
        };
    } catch (error) {
        console.error('Error sending WhatsApp message:', error);
        return null;
    }
}

/**
 * Send WhatsApp order dto requested notification
 */
export async function sendDTORequestedOrderWhatsAppMessage(
    shop: any,
    order: any,
) {
    try {
        const customerName = getCustomerName(order)
        const customerPhone = String("91" + normalizePhoneNumber(getCustomerPhone(order)));
        const orderName = order.name;

        if (!customerPhone) {
            console.error('No phone number found for order:', orderName);
            return null;
        }
        
        const payload = {
            messaging_product: 'whatsapp',
            to: customerPhone,
            type: 'template',
            template: {
                name: 'dtorequested_order_1',
                language: {
                    code: 'en',
                },
                components: [
                    {
                        type: 'body',
                        parameters: [
                            {
                                type: 'text',
                                text: customerName,
                            },
                            {
                                type: 'text',
                                text: orderName,
                            },
                        ],
                    },
                ],
            },
        };

        const response = await fetch(
            `https://graph.facebook.com/v24.0/${shop.whatsappPhoneNumberId}/messages`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${shop.whatsappAccessToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            }
        );

        if (!response.ok) {
            const error = await response.json();
            console.error('WhatsApp API error:', error);
            return null;
        }

        const result = await response.json();
        const messageId = result.messages[0].id;
        const sentTo = result.contacts[0].input;

        const messageDoc = {
            orderName: orderName,
            forStatus: "DTO Requested",
            orderId: order.orderId,
            shopName: shop.shopName,
            sentAt: FieldValue.serverTimestamp(),
            messageStatus: 'sent',
            sentTo: sentTo,
            messageId: messageId,
        };

        await db
            .collection('whatsapp_messages')
            .doc(messageId)
            .set(messageDoc);

        await db
            .collection('accounts')
            .doc(shop.shopName)
            .collection('orders')
            .doc(String(order.orderId))
            .update({
                whatsapp_messages: FieldValue.arrayUnion(messageId),
            });

        console.log(`✅ WhatsApp message sent for order ${orderName}`);
        console.log(`   Message ID: ${messageId}`);
        console.log(`   Sent to: ${sentTo}`);

        return {
            success: true,
            messageId,
            sentTo,
        };
    } catch (error) {
        console.error('Error sending WhatsApp message:', error);
        return null;
    }
}

/**
 * Send WhatsApp order dto requested cancellation confirmation notification
 */
export async function sendDTORequestedCancelledWhatsAppMessage(
    shop: any,
    order: any,
) {
    try {
        const customerName = getCustomerName(order)
        const customerPhone = String("91" + normalizePhoneNumber(getCustomerPhone(order)));
        const orderName = order.name;

        if (!customerPhone) {
            console.error('No phone number found for order:', orderName);
            return null;
        }
        
        const payload = {
            messaging_product: 'whatsapp',
            to: customerPhone,
            type: 'template',
            template: {
                name: 'dtorequestedcancelled_order_1',
                language: {
                    code: 'en',
                },
                components: [
                    {
                        type: 'body',
                        parameters: [
                            {
                                type: 'text',
                                text: customerName,
                            },
                            {
                                type: 'text',
                                text: orderName,
                            },
                        ],
                    },
                ],
            },
        };

        const response = await fetch(
            `https://graph.facebook.com/v24.0/${shop.whatsappPhoneNumberId}/messages`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${shop.whatsappAccessToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            }
        );

        if (!response.ok) {
            const error = await response.json();
            console.error('WhatsApp API error:', error);
            return null;
        }

        const result = await response.json();
        const messageId = result.messages[0].id;
        const sentTo = result.contacts[0].input;

        const messageDoc = {
            orderName: orderName,
            forStatus: "DTO Requested to Delivered",
            orderId: order.orderId,
            shopName: shop.shopName,
            sentAt: FieldValue.serverTimestamp(),
            messageStatus: 'sent',
            sentTo: sentTo,
            messageId: messageId,
        };

        await db
            .collection('whatsapp_messages')
            .doc(messageId)
            .set(messageDoc);

        await db
            .collection('accounts')
            .doc(shop.shopName)
            .collection('orders')
            .doc(String(order.orderId))
            .update({
                whatsapp_messages: FieldValue.arrayUnion(messageId),
            });

        console.log(`✅ WhatsApp message sent for order ${orderName}`);
        console.log(`   Message ID: ${messageId}`);
        console.log(`   Sent to: ${sentTo}`);

        return {
            success: true,
            messageId,
            sentTo,
        };
    } catch (error) {
        console.error('Error sending WhatsApp message:', error);
        return null;
    }
}