
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
    const { shop, courierName } = await req.json();

    if (!shop) {
        return NextResponse.json({ error: 'No active shop selected.' }, { status: 400 });
    }
    
    // ----- Auth -----
    const shopRef = db.collection('accounts').doc(shop)
    const shopDoc = await shopRef.get();
    if (!shopDoc.exists) {
        return NextResponse.json({ error: 'Shop Not Found' }, { status: 401 });
    }
    const userId = await getUserIdFromToken(req);
    if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const memberRef = db.collection('accounts').doc(shop).collection('members').doc(userId);
    const member = await memberRef.get();
    const isAuthorized = member.exists && member.data()?.status === 'active';
    if (!isAuthorized) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    
    if (!courierName) {
      return NextResponse.json({ error: 'courierName is required' }, { status: 400 });
    }

    const memberRole = member.data()?.role;
    if(!memberRole) {
      return NextResponse.json({error: 'No member role assigned, assign the member a role.'}, { status: 403});
    }
    
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
        const vendorData = member.data();
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
