
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
        console.error('Shiprocket auth failed:', data);
        throw new Error('Incorrect email or password');
    }

    return data.token;
}

export async function POST(req: NextRequest) {
  try {
    const { shop, email, password } = await req.json();

    if (!shop || !email || !password) {
      return NextResponse.json({ error: 'Shop, email, and password are required' }, { status: 400 });
    }
    
    const userId = await getUserIdFromToken(req);
    if (!userId) {
        return NextResponse.json({ error: 'Unauthorized: Could not identify user.' }, { status: 401 });
    }
    
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists || !userDoc.data()?.accounts.includes(shop)) {
        return NextResponse.json({ error: 'Forbidden: User is not authorized to edit this shop.' }, { status: 403 });
    }

    // Get Shiprocket token
    const token = await getShiprocketToken(email, password);

    const accountRef = db.collection('accounts').doc(shop);

    await accountRef.set({
      integrations: {
        couriers: {
          shiprocket: {
            email,
            password, // Storing password directly is not recommended in production. Use a secret manager.
            apiKey: token,
            lastUpdatedAt: FieldValue.serverTimestamp(),
          }
        }
      },
    }, { merge: true });

    return NextResponse.json({ message: `Shiprocket integration successfully updated.` });
  } catch (error) {
    console.error('Error updating Shiprocket integration:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ error: 'Failed to update integration', details: errorMessage }, { status: 500 });
  }
}
    
