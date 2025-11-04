
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
    const { key, value } = await req.json();

    const userId = await getUserIdFromToken(req);
    if (!userId) {
        return NextResponse.json({ error: 'Unauthorized: Could not identify user.' }, { status: 401 });
    }
    
    const userDoc = await db.collection('users').doc(userId).get();
    const shop = userDoc.data()?.activeAccountId;

    if (!shop) {
        return NextResponse.json({ error: 'No active shop selected.' }, { status: 400 });
    }

    if (!key || !value) {
      return NextResponse.json({ error: 'Key and value are required' }, { status: 400 });
    }

    if (key !== 'apiKey' && key !== 'webhookKey') {
      return NextResponse.json({ error: 'Invalid key specified' }, { status: 400 });
    }

    const memberDoc = await db.collection('accounts').doc(shop).collection('members').doc(userId).get();
    if (!memberDoc.exists || memberDoc.data()?.role === 'Vendor') {
        return NextResponse.json({ error: 'Forbidden: User is not authorized to edit these settings.' }, { status: 403 });
    }

    const accountRef = db.collection('accounts').doc(shop);
    
    await accountRef.set({
      integrations: {
        communication: {
          interakt: {
            [key]: value
          }
        }
      },
      lastUpdatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    return NextResponse.json({ message: `Interakt integration successfully updated.` });
  } catch (error) {
    console.error('Error updating Interakt integration:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ error: 'Failed to update integration', details: errorMessage }, { status: 500 });
  }
}
