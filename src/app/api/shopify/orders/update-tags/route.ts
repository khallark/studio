
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
    const { shop, orderId, tag, action } = await req.json();

    if (!shop || !orderId || !tag || !action) {
      return NextResponse.json({ error: 'Shop, orderId, tag, and action are required' }, { status: 400 });
    }
    if (action !== 'add' && action !== 'remove') {
      return NextResponse.json({ error: 'Invalid action specified. Use "add" or "remove".' }, { status: 400 });
    }

    const userId = await getUserIdFromToken(req);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized: Could not identify user.' }, { status: 401 });
    }

    const orderRef = db.collection('accounts').doc(shop).collection('orders').doc(String(orderId));
    
    const updateData = {
        tags_confirmed: action === 'add' ? FieldValue.arrayUnion(tag) : FieldValue.arrayRemove(tag),
        lastUpdatedAt: FieldValue.serverTimestamp(),
    };

    await orderRef.update(updateData);

    return NextResponse.json({ message: `Tag '${tag}' successfully ${action === 'add' ? 'added to' : 'removed from'} order.` });

  } catch (error) {
    console.error('Error updating order tags:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ error: 'Failed to update order tags', details: errorMessage }, { status: 500 });
  }
}
