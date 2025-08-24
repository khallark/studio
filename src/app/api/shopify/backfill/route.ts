
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';

interface ShopifyOrder {
    id: number;
    name: string;
    // Customer data might be null due to permissions
    customer: {
        email?: string;
    } | null;
    created_at: string;
    updated_at: string;
    financial_status: string;
    fulfillment_status: string | null;
    total_price: string;
    currency: string;
    // Add other fields as necessary from the raw order
}

async function fetchWithPagination(shop: string, accessToken: string, url: string, allOrders: any[] = []): Promise<any[]> {
    const response = await fetch(url, {
        headers: { 'X-Shopify-Access-Token': accessToken }
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Shopify API request failed with status ${response.status}: ${text}`);
    }

    const data = await response.json();
    const orders = data.orders || [];
    allOrders.push(...orders);

    // Handle Shopify's link-based pagination
    const linkHeader = response.headers.get('Link');
    if (linkHeader) {
        const links = linkHeader.split(',').reduce((acc, link) => {
            const match = link.match(/<([^>]+)>;\s*rel="([^"]+)"/);
            if (match) {
                acc[match[2]] = match[1];
            }
            return acc;
        }, {} as Record<string, string>);

        if (links.next) {
            return fetchWithPagination(shop, accessToken, links.next, allOrders);
        }
    }

    return allOrders;
}


export async function POST(req: NextRequest) {
    try {
        const { shop } = await req.json();

        if (!shop) {
            return NextResponse.json({ error: 'Shop domain is required' }, { status: 400 });
        }
        
        // In a real app, you would verify the user has permission for this shop
        // For now, we trust the client has already done this check.

        const accountRef = db.collection('accounts').doc(shop);
        const accountDoc = await accountRef.get();

        if (!accountDoc.exists) {
            return NextResponse.json({ error: 'Shop not found or not connected' }, { status: 404 });
        }

        const accessToken = accountDoc.data()?.accessToken;
        if (!accessToken) {
            return NextResponse.json({ error: 'Access token not found for this shop' }, { status: 500 });
        }

        const initialUrl = `https://${shop}/admin/api/2024-04/orders.json?status=any&limit=50`;
        const allOrders = await fetchWithPagination(shop, accessToken, initialUrl);
        
        const batch = db.batch();
        let count = 0;

        allOrders.forEach((order: ShopifyOrder) => {
            const orderRef = accountRef.collection('orders').doc(String(order.id));
            const orderData = {
                orderId: order.id,
                name: order.name,
                email: order.customer?.email || 'N/A',
                createdAt: order.created_at,
                updatedAt: order.updated_at,
                financialStatus: order.financial_status,
                fulfillmentStatus: order.fulfillment_status || 'unfulfilled',
                totalPrice: parseFloat(order.total_price),
                currency: order.currency,
                raw: order,
                customStatus: 'New', // Default custom status
            };
            batch.set(orderRef, orderData, { merge: true });
            count++;
        });

        await batch.commit();

        return NextResponse.json({ message: `Successfully backfilled ${count} orders.` });

    } catch (error) {
        console.error('Error during order backfill:', error);
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
        return NextResponse.json({ error: 'Failed to backfill orders', details: errorMessage }, { status: 500 });
    }
}
