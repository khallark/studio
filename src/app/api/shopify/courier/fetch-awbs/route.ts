
import { NextRequest, NextResponse } from 'next/server';
import { db, auth as adminAuth } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

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
    const { shop, count } = await req.json();

    if (!shop || count === undefined) {
      return NextResponse.json({ error: 'Shop and count are required' }, { status: 400 });
    }
    if (typeof count !== 'number' || count < 0 || count > 500) {
      return NextResponse.json({ error: 'Count must be a number between 0 and 500' }, { status: 400 });
    }
    
    if (count === 0) {
      return NextResponse.json({ awbs: [], count: 0 });
    }

    const userId = await getUserIdFromToken(req);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized: Could not identify user.' }, { status: 401 });
    }

    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists || !userDoc.data()?.accounts.includes(shop)) {
      return NextResponse.json({ error: 'Forbidden: User is not authorized for this shop.' }, { status: 403 });
    }

    const accountRef = db.collection('accounts').doc(shop);
    const accountDoc = await accountRef.get();
    if (!accountDoc.exists) {
      return NextResponse.json({ error: 'Shop not found or not connected' }, { status: 404 });
    }
    
    const delhiveryApiKey = accountDoc.data()?.integrations?.couriers?.delhivery?.apiKey as string | undefined;
    if (!delhiveryApiKey) {
      return NextResponse.json({ error: 'Delhivery API key not found. Please configure it in settings.' }, { status: 412 });
    }

    const delhiveryApiUrl = `https://track.delhivery.com/waybill/api/bulk/json/?count=${count}`;

    const response = await fetch(delhiveryApiUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        "Authorization": `Token ${delhiveryApiKey}`
      },
    });

    if (!response.ok) {
        const errorData = await response.text();
        console.error('Delhivery API Error:', errorData);
        return NextResponse.json({ error: 'Failed to fetch AWBs from Delhivery', details: errorData }, { status: response.status });
    }

    const awbString = await response.text();
    const awbs = awbString.substring(1, awbString.length - 2).split(',').filter(Boolean);

    // Write AWBs to the unused_awbs collection
    const awbsRef = accountRef.collection('unused_awbs');
    const batch = db.batch();
    
    // OPTIMIZED: Remove individual 'get' calls inside the loop.
    // 'set' is idempotent; it will create a new doc or overwrite an existing one.
    // This is safe and much faster as it avoids N read operations.
    for (const awb of awbs) {
        const docRef = awbsRef.doc(awb);
        batch.set(docRef, {
            status: 'unused',
            createdAt: FieldValue.serverTimestamp(),
        });
    }

    await batch.commit();

    return NextResponse.json({ awbs, count: awbs.length });

  } catch (error) {
    console.error('Error fetching AWBs:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ error: 'Failed to fetch AWBs', details: errorMessage }, { status: 500 });
  }
}
