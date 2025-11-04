
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
    const { enabled, priorityList } = await req.json();

    const userId = await getUserIdFromToken(req);
    if (!userId) {
        return NextResponse.json({ error: 'Unauthorized: Could not identify user.' }, { status: 401 });
    }
    
    const userDoc = await db.collection('users').doc(userId).get();
    const shop = userDoc.data()?.activeAccountId;
    
    if (!shop) {
        return NextResponse.json({ error: 'No active shop selected.' }, { status: 400 });
    }

    if (enabled === undefined || !Array.isArray(priorityList)) {
      return NextResponse.json({ error: 'Enabled status and priorityList are required' }, { status: 400 });
    }

    const memberRef = db.collection('accounts').doc(shop).collection('members').doc(userId);
    const memberDoc = await memberRef.get();
    if (!memberDoc.exists) {
        return NextResponse.json({ error: 'Forbidden: User is not a member of this shop.' }, { status: 403 });
    }
    const memberRole = memberDoc.data()?.role;

    let targetRef;
    if (memberRole === 'Vendor') {
        targetRef = memberRef;
    } else {
        targetRef = db.collection('accounts').doc(shop);
    }
    
    await targetRef.set({
      integrations: {
        couriers: {
          priorityEnabled: enabled,
          priorityList: priorityList,
        }
      },
      lastUpdatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    return NextResponse.json({ message: 'Courier priority settings successfully updated.' });
  } catch (error) {
    console.error('Error updating courier priority:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ error: 'Failed to update settings', details: errorMessage }, { status: 500 });
  }
}
