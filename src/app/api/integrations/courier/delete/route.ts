
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
    const { courierName } = await req.json();

    const userId = await getUserIdFromToken(req);
    if (!userId) {
        return NextResponse.json({ error: 'Unauthorized: Could not identify user.' }, { status: 401 });
    }
    
    const userDoc = await db.collection('users').doc(userId).get();
    const shop = userDoc.data()?.activeAccountId;
    
    if (!shop) {
        return NextResponse.json({ error: 'No active shop selected.' }, { status: 400 });
    }
    
    if (!courierName) {
      return NextResponse.json({ error: 'courierName is required' }, { status: 400 });
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
    
    const updatePayload: { [key: string]: any } = {
        [`integrations.couriers.${courierName}`]: FieldValue.delete(),
        'integrations.couriers.priorityList': FieldValue.arrayRemove(courierName),
        lastUpdatedAt: FieldValue.serverTimestamp(),
    };
    
    // For vendors, arrayRemove works differently. We need to fetch, filter, and write.
    if (memberRole === 'Vendor') {
        const vendorData = memberDoc.data();
        const currentPriority = vendorData?.integrations?.couriers?.priorityList || [];
        const newPriority = currentPriority.filter((p: any) => p.name !== courierName);
        updatePayload['integrations.couriers.priorityList'] = newPriority;
        await targetRef.update(updatePayload);
    } else {
        // For Admins, we need to remove the object from the array
        const accountDoc = await targetRef.get();
        const accountData = accountDoc.data();
        const currentPriority = accountData?.integrations?.couriers?.priorityList || [];
        const newPriority = currentPriority.filter((p: any) => p.name !== courierName);
        updatePayload['integrations.couriers.priorityList'] = newPriority;
        await targetRef.update(updatePayload);
    }


    return NextResponse.json({ message: `${courierName} integration successfully removed.` });
  } catch (error) {
    console.error('Error removing courier integration:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ error: 'Failed to remove integration', details: errorMessage }, { status: 500 });
  }
}
