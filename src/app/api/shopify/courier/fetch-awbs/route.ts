
import { NextRequest, NextResponse } from 'next/server';
import { db, auth as adminAuth } from '@/lib/firebase-admin';

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

    if (!shop || !count) {
      return NextResponse.json({ error: 'Shop and count are required' }, { status: 400 });
    }
    if (typeof count !== 'number' || count <= 0 || count > 100) {
      return NextResponse.json({ error: 'Count must be a number between 1 and 100' }, { status: 400 });
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
    if (!accountDoc.exists()) {
      return NextResponse.json({ error: 'Shop not found or not connected' }, { status: 404 });
    }
    
    const delhiveryApiKey = accountDoc.data()?.integrations?.couriers?.delhivery?.apiKey as string | undefined;
    if (!delhiveryApiKey) {
      return NextResponse.json({ error: 'Delhivery API key not found for this shop. Please configure it in settings.' }, { status: 412 });
    }

    const delhiveryApiUrl = `https://staging-express.delhivery.com/waybill/api/bulk/json/?count=${count}`;

    const response = await fetch(delhiveryApiUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Token ${delhiveryApiKey}`,
        'Accept': 'application/json'
      },
    });

    if (!response.ok) {
        const errorData = await response.text();
        console.error('Delhivery API Error:', errorData);
        return NextResponse.json({ error: 'Failed to fetch AWBs from Delhivery', details: errorData }, { status: response.status });
    }

    // The API returns a single comma-separated string in the response body.
    const awbString = await response.text();
    const awbs = awbString.split(',').filter(Boolean);

    return NextResponse.json({ awbs });

  } catch (error) {
    console.error('Error fetching AWBs:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ error: 'Failed to fetch AWBs', details: errorMessage }, { status: 500 });
  }
}
