// app/api/stores/[storeId]/authorize/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth as adminAuth, db } from '@/lib/firebase-admin';
import { prefixmyshopifycom } from '@/lib/prefix-myshopifycom';

export async function GET(
  request: NextRequest,
  { params }: { params: { storeId: string } }
) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Missing or invalid authorization header' },
        { status: 401 }
      );
    }

    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await adminAuth.verifyIdToken(token);
    const uid = decodedToken.uid;

    const { storeId } = params;

    if (!storeId || storeId === 'undefined') {
      return NextResponse.json(
        { error: 'Invalid store ID' },
        { status: 400 }
      );
    }

    const prefixedStoreId = prefixmyshopifycom(storeId);

    // Check if store exists
    const storeRef = db.collection('accounts').doc(prefixedStoreId);
    const storeDoc = await storeRef.get();

    if (!storeDoc.exists) {
      return NextResponse.json(
        { error: 'Store not found' },
        { status: 404 }
      );
    }

    // Check if user is a member
    const memberRef = storeRef.collection('members').doc(uid);
    const memberDoc = await memberRef.get();

    if (!memberDoc.exists) {
      return NextResponse.json(
        { error: 'User is not a member of this store' },
        { status: 403 }
      );
    }

    // Return the full member document data
    const memberData = memberDoc.data();

    return NextResponse.json({
      authorized: true,
      member: {
        id: memberDoc.id,
        ...memberData,
      },
      storeId: prefixedStoreId,
      uid,
    });
  } catch (error) {
    console.error('Authorization error:', error);
    
    if (error instanceof Error) {
      if (error.message.includes('auth/id-token-expired')) {
        return NextResponse.json(
          { error: 'Token expired' },
          { status: 401 }
        );
      }
      if (error.message.includes('auth/argument-error')) {
        return NextResponse.json(
          { error: 'Invalid token' },
          { status: 401 }
        );
      }
    }

    return NextResponse.json(
      { error: 'Authorization check failed' },
      { status: 500 }
    );
  }
}