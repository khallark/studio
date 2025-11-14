// app/api/business/[businessId]/authorize/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth as adminAuth, db } from '@/lib/firebase-admin';

export async function GET(
  request: NextRequest,
  { params }: { params: { businessId: string } }
) {
  try {
    // Verify authentication
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Missing or invalid authorization header' },
        { status: 401 }
      );
    }

    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await adminAuth.verifyIdToken(token);
    const currentUserId = decodedToken.uid;

    const { businessId } = params;

    if (!businessId || businessId === 'undefined') {
      return NextResponse.json(
        { error: 'Invalid business ID' },
        { status: 400 }
      );
    }

    // Check if business/user exists
    const businessRef = db.collection('users').doc(businessId);
    const businessDoc = await businessRef.get();

    if (!businessDoc.exists) {
      return NextResponse.json(
        { error: 'Business not found' },
        { status: 404 }
      );
    }

    // Check if current user is a member of this business
    const memberRef = businessRef.collection('members').doc(currentUserId);
    const memberDoc = await memberRef.get();

    if (!memberDoc.exists) {
      return NextResponse.json(
        { error: 'User is not a member of this business' },
        { status: 403 }
      );
    }

    // Get the business data
    const businessData = businessDoc.data();
    const memberData = memberDoc.data();

    // Get the list of stores (accounts) in this business
    const stores = businessData?.stores || [];

    return NextResponse.json({
      authorized: true,
      businessId,
      member: {
        id: memberDoc.id,
        permissions: memberData?.permissions || {},
      },
      stores, // Array of store IDs
      vendorName: businessData?.vendorName || null,
      currentUserId,
    });
  } catch (error) {
    console.error('Business authorization error:', error);
    
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
      { error: 'Business authorization check failed' },
      { status: 500 }
    );
  }
}