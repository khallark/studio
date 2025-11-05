
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

const VALID_SERVICES = ['bookReturnPage'];

export async function POST(req: NextRequest) {
  try {
    const { shop, serviceName, isEnabled } = await req.json();

    if (!shop) {
        return NextResponse.json({ error: 'No active shop selected.' }, { status: 400 });
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
    const memberRef = db.collection('accounts').doc(shop).collection('members').doc(userId);
    const member = await memberRef.get();
    const isAuthorized = member.exists && member.data()?.status === 'active';
    if (!isAuthorized) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (!serviceName || isEnabled === undefined) {
      return NextResponse.json({ error: 'serviceName, and isEnabled are required' }, { status: 400 });
    }

    if (!VALID_SERVICES.includes(serviceName)) {
      return NextResponse.json({ error: 'Invalid service name provided' }, { status: 400 });
    }
    
    const memberRole = member.data()?.role;
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
