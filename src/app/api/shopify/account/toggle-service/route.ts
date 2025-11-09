
import { NextRequest, NextResponse } from 'next/server';
import { db, auth as adminAuth } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { authUserForStore } from '@/lib/authoriseUserForStore';

const VALID_SERVICES = ['bookReturnPage'];

export async function POST(req: NextRequest) {
  try {
    const { shop, serviceName, isEnabled } = await req.json();

    if (!shop) {
        return NextResponse.json({ error: 'No active shop selected.' }, { status: 400 });
    }

    // ----- Auth -----
    const result = await authUserForStore({ shop, req });
        
    if(!result.authorised) {
      const { error, status } = result;
      return NextResponse.json({ error }, { status });
    }

    if (!serviceName || isEnabled === undefined) {
      return NextResponse.json({ error: 'serviceName, and isEnabled are required' }, { status: 400 });
    }

    if (!VALID_SERVICES.includes(serviceName)) {
      return NextResponse.json({ error: 'Invalid service name provided' }, { status: 400 });
    }
    
    const { memberDoc } = result;
    const memberRole = memberDoc?.data()?.role;
    if(!memberRole) {
      return NextResponse.json({error: 'No member role assigned, assign the member a role.'}, { status: 403});
    }
    if(memberRole === 'Vendor' || memberRole === 'Staff') {
        return NextResponse.json({ error: 'Forbidden: Insufficient permissions.' }, { status: 403 });
    }
    
    const accountRef = db.collection('accounts').doc(shop);
    
    await accountRef.set({
      customerServices: {
        [serviceName]: {
          enabled: isEnabled,
        }
      },
      lastUpdatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    
    return NextResponse.json({ message: `Service '${serviceName}' successfully ${isEnabled ? 'enabled' : 'disabled'}.` });
  } catch (error) {
    console.error('Error toggling service:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ error: 'Failed to update service status', details: errorMessage }, { status: 500 });
  }
}
