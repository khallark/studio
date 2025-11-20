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
      console.error('Missing or invalid authorization header');
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
      console.error('Invalid business ID');
      return NextResponse.json(
        { error: 'Invalid business ID' },
        { status: 400 }
      );
    }

    // Check if business/user exists
    const businessRef = db.collection('users').doc(businessId);
    const businessDoc = await businessRef.get();

    if (!businessDoc.exists) {
      console.error('Business not found');
      return NextResponse.json(
        { error: 'Business not found' },
        { status: 404 }
      );
    }

    // Check if current user is a member of this business
    const memberRef = businessRef.collection('members').doc(currentUserId);
    const memberDoc = await memberRef.get();
    const isAuthorized = (currentUserId === businessId) || (memberDoc && memberDoc.exists && memberDoc.data()?.status === 'active');

    if (!isAuthorized) {
      console.error('User is not a member of this business');
      return NextResponse.json(
        { error: 'User is not a member of this business' },
        { status: 403 }
      );
    }
    // Get the business data
    const userData = (await db.collection('users').doc(currentUserId).get()).data();
    const arr: string[] = userData?.businesses || []; // Default to empty array
    
    // Include current business and all joined businesses (removing duplicates)
    const businessIds = Array.from(new Set([currentUserId, ...arr]));
    
    let joinedBusinesses = await Promise.all(
      businessIds.map(async (id: string) => {
        const businessDoc = await db.collection('users').doc(id).get();
        if (businessDoc.exists) {
          const data = businessDoc.data();
          return {
            id,
            name: data?.primaryContact?.name || data?.profile?.displayName || 'Unnamed Business',
            currentlySelected: id === businessId, // Mark current as selected
          };
        }
        return null;
      })
    );
    
    // Filter out null values only
    joinedBusinesses = joinedBusinesses.filter((item): item is NonNullable<typeof item> => item !== null);
    const memberData = memberDoc.exists ? memberDoc.data() : null;
    
    // Get the list of stores (accounts) in this business
    const businessData = businessDoc.data();
    const stores = businessData?.stores || [];

    return NextResponse.json({
      authorized: true,
      businessId,
      userIsBusiness: businessId === currentUserId,
      member: memberData ? {
        id: memberDoc.id,
        permissions: memberData?.permissions || {},
      } : null,
      stores, // Array of store IDs
      joinedBusinesses,
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
      { error: `Business authorization check failed: ${error}` },
      { status: 500 }
    );
  }
}