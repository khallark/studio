
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

const VALID_SERVICES = ['bookReturnPage'];

export async function POST(req: NextRequest) {
  try {
    const { shop, serviceName, isEnabled } = await req.json();

    if (!shop || !serviceName || isEnabled === undefined) {
      return NextResponse.json({ error: 'Shop, serviceName, and isEnabled are required' }, { status: 400 });
    }

    if (!VALID_SERVICES.includes(serviceName)) {
      return NextResponse.json({ error: 'Invalid service name provided' }, { status: 400 });
    }

    const userId = await getUserIdFromToken(req);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized: Could not identify user.' }, { status: 401 });
    }

    // Verify user authorization for the shop
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists || !userDoc.data()?.accounts.includes(shop)) {
      return NextResponse.json({ error: 'Forbidden: User is not authorized to modify this shop.' }, { status: 403 });
    }
    
    const accountRef = db.collection('accounts').doc(shop);
    
    // Using dot notation to update a nested field
    const updatePath = `customerServices.${serviceName}.enabled`;
    
    await accountRef.set({
      customerServices: {
        [serviceName]: {
          enabled: isEnabled,
        }
      },
      lastUpdatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    
    return NextResponse.json({ message: `Service '${serviceName}' successfully ${isEnabled ? 'enabled' : 'disabled'}.` });
  } catch (error) {
    console.error('Error toggling service:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ error: 'Failed to update service status', details: errorMessage }, { status: 500 });
  }
}
