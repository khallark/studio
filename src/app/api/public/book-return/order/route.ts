// src/app/api/public/book-return/order/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase-admin";
import { validateCustomerSession } from "@/lib/validateBookReturnSession";

// Helper to normalize phone numbers for comparison
function normalizePhoneNumber(phone: string): string {
    if (!phone) return '';
    // Removes non-digit characters and takes the last 10 digits
    const digitsOnly = phone.replace(/\D/g, '');
    return digitsOnly.slice(-10);
}

export async function POST(req: NextRequest) {
    try {
        const session = await validateCustomerSession(req);
        
        const { orderNumber, phoneNo } = await req.json();

        if (!orderNumber || !phoneNo) {
            return NextResponse.json({ error: 'Order Number and Phone Number are required.' }, { status: 400 });
        }
        
        const normalizedPhone = normalizePhoneNumber(phoneNo);
        if (!normalizedPhone) {
            return NextResponse.json({ error: 'A valid phone number is required.' }, { status: 400 });
        }

        // Query for the order by name within the correct account
        const ordersRef = db.collection('accounts').doc(session.storeId).collection('orders');
        const querySnapshot = await ordersRef.where(
            'name',
            '==',
            orderNumber.length >= 3
                ? orderNumber.substring(0, 2).toLowerCase() === 'mt'
                    ? `#OWR-${orderNumber.toUpperCase()}`
                    : `#OWR-MT${orderNumber}`
                : orderNumber
        ).limit(1).get();

        if (querySnapshot.empty) {
            return NextResponse.json({ error: 'Order not found. Please check the order number.' }, { status: 404 });
        }

        const orderDoc = querySnapshot.docs[0];
        const orderData = orderDoc.data();
        
        // Verify phone number
        const billingPhone = normalizePhoneNumber(orderData.raw?.billing_address?.phone || '');
        const shippingPhone = normalizePhoneNumber(orderData.raw?.shipping_address?.phone || '');
        const customerPhone = normalizePhoneNumber(orderData.raw?.customer?.phone || '');

        if (
            normalizedPhone !== billingPhone &&
            normalizedPhone !== shippingPhone &&
            normalizedPhone !== customerPhone
        ) {
            return NextResponse.json({ error: 'Phone number does not match our records for this order.' }, { status: 403 });
        }

        // Return curated order data
        return NextResponse.json({
            id: orderDoc.id,
            name: orderData.raw.name,
            awb: orderData.awb ?? '',
            awb_reverse: orderData.awb_reverse ?? '',
            status: orderData.customStatus,
            logs: orderData.customStatusesLogs || [], // Ensure it's an array
            payment_gateway_names: orderData.raw.payment_gateway_names,
            total_price: orderData.raw.total_price,
            total_outstanding: orderData.raw.total_outstanding,
            shipping_address: orderData.raw.shipping_address,
            items: orderData.raw.line_items?.map((item: any) => ({
                name: item.name,
                variant_id: item.variant_id,
                quantity: item.quantity,
                price: item.price
            })),
            returnItemsVariantIds: orderData.returnItemsVariantIds ?? null
        });

    } catch (error: any) {
        console.error('Order lookup error:', error.message);
        let status = 500;
        let message = 'An internal server error occurred.';

        switch (error.message) {
            case 'NO_SESSION_COOKIE':
            case 'NO_CSRF_TOKEN':
            case 'INVALID_SESSION':
            case 'CSRF_MISMATCH':
                status = 401;
                message = 'Your session is invalid. Please refresh the page.';
                break;
            case 'SESSION_EXPIRED':
                status = 401;
                message = 'Your session has expired. Please refresh the page.';
                break;
        }

        return NextResponse.json({ error: message, details: error.message }, { status });
    }
}