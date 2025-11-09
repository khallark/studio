
import { NextRequest, NextResponse } from 'next/server';
import { db, auth as adminAuth } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { authUserForStore } from '@/lib/authoriseUserForStore';

async function getXpressbeesToken(email: string, password: string): Promise<string> {
    const response = await fetch('https://shipment.xpressbees.com/api/users/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
    });

    const data = await response.json();

    if (!response.ok || !data.data) {
        console.error('Xpressbees auth failed:', data);
        throw new Error(data.message || 'Incorrect email or password');
    }

    return data.data;
}

export async function POST(req: NextRequest) {
  try {
    const { shop, email, password } = await req.json();

    if (!shop) {
        return NextResponse.json({ error: 'No active shop selected.' }, { status: 400 });
    }

    // ----- Auth -----
    const result = await authUserForStore({ shop, req });
        
    if(!result.authorised) {
      const { error, status } = result;
      return NextResponse.json({ error }, { status });
    }

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }

    // Get Xpressbees token
    const token = await getXpressbeesToken(email, password);

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

    await targetRef.set({
      integrations: {
        couriers: {
          xpressbees: {
            email,
            password, // Storing password directly is not recommended in production. Use a secret manager.
            apiKey: token,
            lastUpdatedAt: FieldValue.serverTimestamp(),
          },
          priorityList: FieldValue.arrayUnion({name: 'xpressbees', mode: 'Surface'}),
        }
      },
    }, { merge: true });

    return NextResponse.json({ message: `Xpressbees integration successfully updated.` });
  } catch (error) {
    console.error('Error updating Xpressbees integration:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ error: 'Failed to update integration', details: errorMessage }, { status: 500 });
  }
}
