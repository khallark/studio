
import { NextRequest, NextResponse } from 'next/server';
import { db, auth as adminAuth } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { authUserForStore } from '@/lib/authoriseUserForStore';

export async function POST(req: NextRequest) {
  try {
    const { shop, courierName } = await req.json();

    if (!shop) {
        return NextResponse.json({ error: 'No active shop selected.' }, { status: 400 });
    }
    
    // ----- Auth -----
    const result = await authUserForStore({ shop, req });
        
    if(!result.authorised) {
        const { error, status } = result;
        return NextResponse.json({ error }, { status });
    }
    
    if (!courierName) {
      return NextResponse.json({ error: 'courierName is required' }, { status: 400 });
    }

    const { memberDoc } = result;
    const memberRole = memberDoc?.data()?.role;
    if(!memberRole) {
      return NextResponse.json({error: 'No member role assigned, assign the member a role.'}, { status: 403});
    }
    
    let targetRef;
    if (memberRole === 'Vendor') {
        targetRef = memberDoc?.ref;
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
        const vendorData = memberDoc?.data();
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
