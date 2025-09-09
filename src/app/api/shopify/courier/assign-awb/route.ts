
import { NextRequest, NextResponse } from 'next/server';
import { db, auth as adminAuth } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

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
    const { shop, orderId, pickupLocationId } = await req.json();

    if (!shop || !orderId || !pickupLocationId) {
      return NextResponse.json({ error: 'Shop, orderId, and pickupLocationId are required' }, { status: 400 });
    }

    const userId = await getUserIdFromToken(req);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const accountRef = db.collection('accounts').doc(shop);
    const awbsRef = accountRef.collection('unused_awbs');
    const orderRef = accountRef.collection('orders').doc(String(orderId));
    
    // This transaction ensures we atomically get one AWB and assign it.
    const awb = await db.runTransaction(async (transaction) => {
      // 1. Get one available AWB
      const awbQuery = awbsRef.limit(1);
      const awbSnapshot = await transaction.get(awbQuery);
      
      if (awbSnapshot.empty) {
        throw new Error('No available AWBs. Please fetch more.');
      }
      
      const awbDoc = awbSnapshot.docs[0];
      const assignedAwb = awbDoc.id;

      // 2. Delete the AWB from the unused pool
      transaction.delete(awbDoc.ref);
      
      // 3. Update the order with the AWB and new status
      transaction.update(orderRef, {
        awb: assignedAwb,
        pickupLocationId: pickupLocationId,
        customStatus: 'Ready To Dispatch',
        lastUpdatedAt: FieldValue.serverTimestamp(),
      });

      return assignedAwb;
    });

    return NextResponse.json({ message: `Successfully assigned AWB ${awb} to order ${orderId}` });

  } catch (error) {
    console.error('Error assigning AWB:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ error: 'Failed to assign AWB', details: errorMessage }, { status: 500 });
  }
}
