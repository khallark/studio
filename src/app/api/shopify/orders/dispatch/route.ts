import { NextRequest, NextResponse } from 'next/server';
import { auth as adminAuth, db } from '@/lib/firebase-admin';

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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { shop, orderIds } = body ?? {};

    if (!shop || !Array.isArray(orderIds) || orderIds.length === 0) {
      return NextResponse.json({ error: 'Shop and a non-empty array of orderIds are required' }, { status: 400 });
    }

    const userId = await getUserIdFromToken(req);
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // OPTIONAL: verify the shop exists & has an accessToken (early fail fast)
    const accountSnap = await db.collection('accounts').doc(shop).get();
    if (!accountSnap.exists) return NextResponse.json({ error: 'Shop not found' }, { status: 404 });

    // Call the Firebase HTTPS function that enqueues the work and returns immediately
    const url = process.env.ENQUEUE_FUNCTION_URL_2!;
    const secret = process.env.ENQUEUE_FUNCTION_SECRET!;
    if (!url || !secret) {
      return NextResponse.json({ error: 'Server not configured (FIREBASE_FUNCTIONS_BASE/TASKS_SECRET)' }, { status: 500 });
    }

    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': secret,
      },
      body: JSON.stringify({ shop, orderIds, requestedBy: userId }),
    });

    const json = await resp.json();
    if (!resp.ok) {
      return NextResponse.json({ error: 'Failed to start batch', details: json }, { status: 500 });
    }

    // Respond quickly with the batch/summary id for UI polling
    return NextResponse.json({ summaryId: json.summaryId, total: json.total }, { status: 202 });
  } catch (error) {
    console.error('Error starting fulfillment batch:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
