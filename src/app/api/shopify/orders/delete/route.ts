
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';

export async function POST(req: NextRequest) {
  try {
    const { shop, orderId } = await req.json();

    if (!shop || !orderId) {
      return NextResponse.json({ error: 'Shop and orderId are required' }, { status: 400 });
    }

    // --- Step 1: Get Access Token for the shop ---
    const accountRef = db.collection('accounts').doc(shop);
    const accountDoc = await accountRef.get();

    if (!accountDoc.exists) {
      return NextResponse.json({ error: 'Shop not found or not connected' }, { status: 404 });
    }
    const accessToken = accountDoc.data()?.accessToken;
    if (!accessToken) {
        return NextResponse.json({ error: 'Access token not found for this shop' }, { status: 500 });
    }

    // --- Step 2: Call Shopify API to delete the order ---
    const shopifyApiUrl = `https://${shop}/admin/api/2024-07/orders/${orderId}.json`;
    
    const shopifyResponse = await fetch(shopifyApiUrl, {
      method: 'DELETE',
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json',
      },
    });

    // Shopify returns 200 OK on successful deletion.
    // If the order is already deleted (404), we can consider it a success.
    if (!shopifyResponse.ok && shopifyResponse.status !== 404) {
      const errorData = await shopifyResponse.json();
      console.error('Shopify API delete failed:', errorData);
      return NextResponse.json({ error: 'Failed to delete order from Shopify', details: errorData.errors || 'Unknown Shopify API error' }, { status: shopifyResponse.status });
    }

    // --- Step 3: Rely on the `orders/delete` webhook to delete from Firestore ---
    // The webhook will handle the Firestore deletion, ensuring data consistency.

    return NextResponse.json({ message: 'Order successfully deleted from Shopify. Firestore will be updated via webhook.' });
  } catch (error) {
    console.error('Error deleting order:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ error: 'Failed to delete order', details: errorMessage }, { status: 500 });
  }
}
