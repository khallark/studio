
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

export async function GET(req: NextRequest) {
  try {
    const userId = await getUserIdFromToken(req);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const activeAccountId = userDoc.data()?.activeAccountId;
    if (!activeAccountId) {
      return NextResponse.json({ error: 'No active account selected' }, { status: 400 });
    }

    const memberRef = db.collection('accounts').doc(activeAccountId).collection('members').doc(userId);
    const memberDoc = await memberRef.get();

    if (!memberDoc.exists) {
      return NextResponse.json({ error: 'You are not a member of this shop.' }, { status: 403 });
    }

    const memberData = memberDoc.data()!;
    const memberRole = memberData.role;

    let settingsData = null;

    if (memberRole === 'Vendor') {
      // Vendor's settings are their own member document
      settingsData = {
        companyAddress: memberData.companyAddress || null,
        primaryContact: memberData.primaryContact || null,
        // Vendors don't see main customer services
        customerServices: {}, 
      };
    } else {
      // SuperAdmin, Admin, and Staff see the main account settings
      const accountRef = db.collection('accounts').doc(activeAccountId);
      const accountDoc = await accountRef.get();
      if (accountDoc.exists) {
        const accountData = accountDoc.data()!;
        settingsData = {
          companyAddress: accountData.companyAddress || null,
          primaryContact: accountData.primaryContact || null,
          customerServices: accountData.customerServices || {},
        };
      }
    }

    if (!settingsData) {
        return NextResponse.json({ error: 'Could not load settings data.' }, { status: 404 });
    }

    return NextResponse.json({
      role: memberRole,
      settings: settingsData,
    });

  } catch (error) {
    console.error('Error getting settings details:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ error: 'Failed to get settings', details: errorMessage }, { status: 500 });
  }
}
