import { NextRequest, NextResponse } from 'next/server';
import { db, auth as adminAuth } from '@/lib/firebase-admin';

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
    const { shop } = await req.json();

    if (!shop) {
      return NextResponse.json({ error: 'Shop is required' }, { status: 400 });
    }

    const userId = await getUserIdFromToken(req);
    if (!userId) {
        return NextResponse.json({ error: 'Unauthorized: Could not identify user.' }, { status: 401 });
    }
    
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists || !userDoc.data()?.accounts.includes(shop)) {
        return NextResponse.json({ error: 'Forbidden: User is not authorized to perform this action for this shop.' }, { status: 403 });
    }

    // In a real application, this is where you would trigger a background job or a cloud function.
    // For this prototype, we'll just log the request and return a success message.
    console.log(`Received request to update shipped order statuses for shop: ${shop} by user: ${userId}`);

    // You could add an entry to a 'tasks' collection in Firestore to be picked up by a worker.
    // Example:
    // await db.collection('accounts').doc(shop).collection('tasks').add({
    //   type: 'UPDATE_SHIPPED_STATUSES',
    //   requestedBy: userId,
    //   requestedAt: FieldValue.serverTimestamp(),
    //   status: 'pending'
    // });

    return NextResponse.json({ message: 'Status update process has been initiated in the background.' });

  } catch (error) {
    console.error('Error initiating shipped status update:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ error: 'Failed to initiate status update', details: errorMessage }, { status: 500 });
  }
}
