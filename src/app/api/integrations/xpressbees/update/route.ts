
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
    const { email, password } = await req.json();

    const userId = await getUserIdFromToken(req);
    if (!userId) {
        return NextResponse.json({ error: 'Unauthorized: Could not identify user.' }, { status: 401 });
    }
    
    const userDoc = await db.collection('users').doc(userId).get();
    const shop = userDoc.data()?.activeAccountId;
    if (!shop) {
        return NextResponse.json({ error: 'No active shop selected.' }, { status: 400 });
    }

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }

    const memberDoc = await db.collection('accounts').doc(shop).collection('members').doc(userId).get();
    if (!memberDoc.exists) {
        return NextResponse.json({ error: 'Forbidden: User is not a member of this shop.' }, { status: 403 });
    }
    const memberRole = memberDoc.data()?.role;

    // Get Xpressbees token
    const token = await getXpressbeesToken(email, password);
    
    let targetRef;
    if (memberRole === 'Vendor') {
        targetRef = memberDoc.ref;
    } else {
        targetRef = db.collection('accounts').doc(shop);
    }

    await targetRef.set({
      integrations: {
        couriers: {
          xpressbees: {
            email,
            password, // Storing password directly is not recommended in production. Use a secret manager.
            apiKey: token,
            lastUpdatedAt: FieldValue.serverTimestamp(),
          },
          // For vendors, this will be on their own doc. For others, it's on the account doc.
          // This ensures vendors are automatically part of the courier pool for their own settings.
          priorityList: FieldValue.arrayUnion("xpressbees") 
        }
      },
    }, { merge: true });

    return NextResponse.json({ message: `Xpressbees integration successfully updated.` });
  } catch (error) {
    console.error('Error updating Xpressbees integration:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ error: 'Failed to update integration', details: errorMessage }, { status: 500 });
  }
}
