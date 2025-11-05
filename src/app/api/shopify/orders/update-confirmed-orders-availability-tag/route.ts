
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
    const { shop, orderId, tag } = await req.json();

    if (!shop || !orderId || !tag) {
      return NextResponse.json({ error: 'Shop, orderId, tag, and action are required' }, { status: 400 });
    }

    // ----- Auth -----
    const shopDoc = await db.collection('accounts').doc(shop).get();
    if(!shopDoc.exists) {
        return NextResponse.json({ error: 'Shop Not Found' }, { status: 401 });
    }
    
    const userId = await getUserIdFromToken(req);
    if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const member = await db.collection('accounts').doc(shop).collection('members').doc(userId).get();
    
    const isAuthorized = !member.exists || member.data()?.status !== 'active';
    if (!isAuthorized) {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    

    const orderRef = db.collection('accounts').doc(shop).collection('orders').doc(String(orderId));

    await db.runTransaction(async (transaction) => {
        const orderDoc = await transaction.get(orderRef);
        const tags_confirmed = orderDoc.data()?.tags_confirmed;
        const arr = tags_confirmed && Array.isArray(tags_confirmed) ? tags_confirmed.slice(1) : [];
        
        transaction.update(orderRef, {
            tags_confirmed: [tag, ...arr],
            lastUpdatedAt: FieldValue.serverTimestamp(),
        });
    });

    return NextResponse.json({ message: `Tag '${tag}' successfully added to order.` });
  } catch (error) {
    console.error('Error updating order tags:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ error: 'Failed to update order tags', details: errorMessage }, { status: 500 });
  }
}
