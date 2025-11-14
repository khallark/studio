
import { NextRequest, NextResponse } from 'next/server';
import { db, auth as adminAuth } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

interface ShopifyOrder {
  id: number;
  name: string;
  customer: { email?: string } | null;
  created_at: string;
  updated_at: string;
  financial_status: string;
  fulfillment_status: string | null;
  total_price: string;
  currency: string;
}

async function getUserIdFromToken(req: NextRequest): Promise<string | null> {
    const authHeader = req.headers.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
        const idToken = authHeader.split('Bearer ')[1];
        try {
            const decodedToken = await adminAuth.verifyIdToken(idToken);
            return decodedToken.uid;
        } catch (error) {
            console.error('Error verifying auth token:', error);
            return null;
        }
    }
    return null;
}

async function fetchWithPagination(
  shop: string,
  accessToken: string,
  url: string,
  allOrders: any[] = []
): Promise<any[]> {
  const response = await fetch(url, {
    headers: { 'X-Shopify-Access-Token': accessToken },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Shopify API request failed with status ${response.status}: ${text}`);
  }

  const data = await response.json();
  const orders = data.orders || [];
  allOrders.push(...orders);

  const linkHeader = response.headers.get('Link');
  if (linkHeader) {
    const links = linkHeader.split(',').reduce((acc, link) => {
      const match = link.match(/<([^>]+)>;\s*rel="([^"]+)"/);
      if (match) acc[match[2]] = match[1];
      return acc;
    }, {} as Record<string, string>);
    if (links.next) return fetchWithPagination(shop, accessToken, links.next, allOrders);
  }
  return allOrders;
}

export async function POST(req: NextRequest) {
  try {
    const { shop } = await req.json();
    if (!shop) return NextResponse.json({ error: 'Shop domain is required' }, { status: 400 });

    const userId = await getUserIdFromToken(req);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized: Could not identify user.' }, { status: 401 });
    }

    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists || !userDoc.data()?.stores.includes(shop)) {
      return NextResponse.json({ error: 'Forbidden: User is not authorized for this shop.' }, { status: 403 });
    }

    const accountRef = db.collection('accounts').doc(shop);
    const accountDoc = await accountRef.get();
    if (!accountDoc.exists) {
      return NextResponse.json({ error: 'Shop not found or not connected' }, { status: 404 });
    }

    const accessToken = accountDoc.data()?.accessToken as string | undefined;
    if (!accessToken) {
      return NextResponse.json({ error: 'Access token not found for this shop' }, { status: 500 });
    }

    // 1) Pull all orders from Shopify
    const initialUrl = `https://${shop}/admin/api/2024-04/orders.json?status=any&limit=50`;
    const allOrders = (await fetchWithPagination(shop, accessToken, initialUrl)) as ShopifyOrder[];

    // 2) Preload existing Firestore doc IDs (cheap, no reads of document data)
    const ordersCol = accountRef.collection('orders');
    const existingRefs = await ordersCol.listDocuments(); // Admin SDK
    const existingIds = new Set(existingRefs.map((r) => r.id));

    // 3) Prepare batched writes (chunked at 500)
    const BATCH_LIMIT = 500;
    let batch = db.batch();
    let ops = 0;
    let created = 0;
    let updated = 0;

    const commitAndReset = async () => {
      if (ops > 0) {
        await batch.commit();
        batch = db.batch();
        ops = 0;
      }
    };

    for (const order of allOrders) {
      const orderRef = ordersCol.doc(String(order.id));
      const commonData = {
        orderId: order.id,
        name: order.name,
        email: order.customer?.email ?? 'N/A',
        createdAt: order.created_at,
        updatedAt: order.updated_at,
        financialStatus: order.financial_status,
        fulfillmentStatus: order.fulfillment_status ?? 'unfulfilled',
        totalPrice: parseFloat(order.total_price),
        currency: order.currency,
        raw: order, // ⚠️ watch doc size; consider storing a subset if needed
        receivedAt: FieldValue.serverTimestamp(),
      };

      if (existingIds.has(String(order.id))) {
        // Existing → UPDATE/MERGE (do NOT touch customStatus or isDeleted)
        batch.set(orderRef, commonData, { merge: true });
        updated++;
      } else {
        // New → CREATE with defaults (fails if somehow exists; but we checked)
        batch.create(orderRef, {
          ...commonData,
          isDeleted: false,
          customStatus: 'New',
        });
        created++;
      }

      ops++;
      if (ops === BATCH_LIMIT) await commitAndReset();
    }

    await commitAndReset();

    return NextResponse.json({
      message: `Backfill complete. Created: ${created}, Updated: ${updated}.`,
    });
  } catch (error) {
    console.error('Error during order backfill:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json(
      { error: 'Failed to backfill orders', details: errorMessage },
      { status: 500 }
    );
  }
}
