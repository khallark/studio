import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';

export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const shop = searchParams.get('shop');
        const order = searchParams.get('order');
        console.log('Received request for shop:', shop, 'order:', order);
        if (!shop || !order) {
            return NextResponse.json(
                { error: 'Missing required parameters. Both shop and order are required.' },
                { status: 400 }
            );
        }

        // Fetch shop document
        const shopDoc = await db.collection('accounts').doc(shop).get();
        if (!shopDoc.exists) {
            return NextResponse.json(
                { error: 'Shop not found' },
                { status: 404 }
            );
        }

        // Fetch order document
        const orderDocQuery = await shopDoc.ref.collection('orders').where('name', '==', order).limit(1).get();
        if(orderDocQuery.empty) {
            return NextResponse.json(
                { error: 'Order not found' },
                { status: 404 }
            );
        }
        const orderDoc = orderDocQuery.docs[0];

        const orderData = orderDoc.data();
        
        // Return only the necessary tracking data
        return NextResponse.json({
            awb: orderData?.awb || null,
            awb_reverse: orderData?.awb_reverse || null,
            courierProvider: orderData?.courierProvider || null,
            courierReverseProvider: orderData?.courierReverseProvider || null,
        });

    } catch (error) {
        console.error('Error fetching order data:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}