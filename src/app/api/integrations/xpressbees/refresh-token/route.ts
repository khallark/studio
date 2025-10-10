
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

async function getXpressbeesToken(email: string, password: string): Promise<string> {
    const response = await fetch('https://shipment.xpressbees.com/api/users/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
    });

    const data = await response.json();

    if (!response.ok || !data.data) {
        console.error('Xpressbees auth failed:', data);
        throw new Error(data.message || 'Incorrect email or password');
    }

    return data.data;
}

export async function POST(req: NextRequest) {
  try {
    const { shop } = await req.json();
    if (!shop) {
      return NextResponse.json({ error: 'Shop is required' }, { status: 400 });
    }
    
    const userId = await getUserIdFromToken(req);
    if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const accountRef = db.collection('accounts').doc(shop);
    const accountDoc = await accountRef.get();

    if (!accountDoc.exists) {
        return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    const xpressbeesCreds = accountDoc.data()?.integrations?.couriers?.xpressbees;
    if (!xpressbeesCreds?.email || !xpressbeesCreds?.password) {
        return NextResponse.json({ error: 'Xpressbees credentials not found for this account.' }, { status: 400 });
    }

    const newToken = await getXpressbeesToken(xpressbeesCreds.email, xpressbeesCreds.password);

    await accountRef.update({
        'integrations.couriers.xpressbees.apiKey': newToken,
        'integrations.couriers.xpressbees.lastUpdatedAt': FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ message: 'Xpressbees token refreshed successfully.' });
  } catch (error) {
    console.error('Error refreshing Xpressbees token:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ error: 'Failed to refresh token', details: errorMessage }, { status: 500 });
  }
}
