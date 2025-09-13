
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

async function getShiprocketToken(email: string, password: string): Promise<string> {
    const response = await fetch('https://apiv2.shiprocket.in/v1/external/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
    });
    const data = await response.json();
    if (!response.ok || !data.token) {
        throw new Error('Failed to refresh Shiprocket token');
    }
    return data.token;
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

    if (!accountDoc.exists()) {
        return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    const shiprocketCreds = accountDoc.data()?.integrations?.couriers?.shiprocket;
    if (!shiprocketCreds?.email || !shiprocketCreds?.password) {
        return NextResponse.json({ error: 'Shiprocket credentials not found for this account.' }, { status: 400 });
    }

    const newToken = await getShiprocketToken(shiprocketCreds.email, shiprocketCreds.password);

    await accountRef.update({
        'integrations.couriers.shiprocket.apiKey': newToken,
        'integrations.couriers.shiprocket.lastUpdatedAt': FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ message: 'Shiprocket token refreshed successfully.' });
  } catch (error) {
    console.error('Error refreshing Shiprocket token:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ error: 'Failed to refresh token', details: errorMessage }, { status: 500 });
  }
}

    