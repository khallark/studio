
import { NextRequest, NextResponse } from 'next/server';
import { db, auth as adminAuth } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { authUserForBusiness, authUserForBusinessAndStore } from '@/lib/authoriseUser';

async function getShiprocketToken(email: string, password: string): Promise<string> {
  const response = await fetch('https://apiv2.shiprocket.in/v1/external/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  const data = await response.json();

  if (!response.ok || !data.token) {
    console.error('Shiprocket auth failed:', data);
    throw new Error('Incorrect email or password');
  }

  return data.token;
}

export async function POST(req: NextRequest) {
  try {
    const { businessId, email, password } = await req.json();

    if (!businessId) {
      return NextResponse.json({ error: 'No business id provided.' }, { status: 400 });
    }

    // ----- Auth -----
    const result = await authUserForBusiness({ businessId, req });

    if (!result.authorised) {
      const { error, status } = result;
      return NextResponse.json({ error }, { status });
    }

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }

    // Get Shiprocket token to validate credentials
    const token = await getShiprocketToken(email, password);

    const { businessDoc } = result;
    // const memberRole = memberDoc?.data()?.role;
    // if (!memberRole) {
    //   return NextResponse.json({ error: 'No member role assigned, assign the member a role.' }, { status: 403 });
    // }

    // let targetRef;
    // if (memberRole === 'Vendor') {
    //   targetRef = memberDoc?.ref;
    // } else {
    //   targetRef = db.collection('accounts').doc(shop);
    // }

    await businessDoc?.ref.set({
      integrations: {
        couriers: {
          shiprocket: {
            email,
            password, // Storing password directly is not recommended in production. Use a secret manager.
            apiKey: token,
            lastUpdatedAt: FieldValue.serverTimestamp(),
          },
          priorityList: FieldValue.arrayUnion({ name: "shiprocket", mode: "Surface" }),
        }
      },
    }, { merge: true });

    return NextResponse.json({ message: `Shiprocket integration successfully updated.` });
  } catch (error) {
    console.error('Error updating Shiprocket integration:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ error: 'Failed to update integration', details: errorMessage }, { status: 500 });
  }
}
