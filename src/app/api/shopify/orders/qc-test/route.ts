import { NextRequest, NextResponse } from 'next/server';
import { db, auth as adminAuth, storage } from '@/lib/firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

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
    // Parse JSON body instead of FormData
    const body = await req.json();
    const { shopId, orderId, qcStatuses, videoPath } = body;

    // Validate required fields
    if (!shopId || !orderId || !qcStatuses || !videoPath) {
      return NextResponse.json({ 
        error: 'Missing required fields',
        details: 'shopId, orderId, qcStatuses, and videoPath are all required' 
      }, { status: 400 });
    }

    // Validate qcStatuses is an object
    if (typeof qcStatuses !== 'object' || Array.isArray(qcStatuses)) {
      return NextResponse.json({ 
        error: 'Invalid qcStatuses format',
        details: 'qcStatuses must be an object' 
      }, { status: 400 });
    }

    // Authenticate user
    const userId = await getUserIdFromToken(req);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify user has access to this shop
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists || !userDoc.data()?.accounts?.includes(shopId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Verify the video exists in Firebase Storage (security check)
    const bucket = storage.bucket();
    try {
      const [exists] = await bucket.file(videoPath).exists();
      if (!exists) {
        return NextResponse.json({ 
          error: 'Video not found in storage',
          details: 'The uploaded video could not be verified' 
        }, { status: 400 });
      }
    } catch (storageError) {
      console.error('Error checking video existence:', storageError);
      return NextResponse.json({ 
        error: 'Failed to verify video',
        details: 'Could not verify the uploaded video' 
      }, { status: 500 });
    }

    // Get order from Firestore
    const orderRef = db.collection('accounts').doc(shopId).collection('orders').doc(orderId);
    const orderDoc = await orderRef.get();

    if (!orderDoc.exists) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    const orderData = orderDoc.data();
    
    // Update line items with QC statuses
    const updatedLineItems = orderData?.raw?.line_items?.map((item: any) => ({
      ...item,
      qc_status: qcStatuses[item.id] || null,
    })) || [];

    // Update order in Firestore
    await orderRef.update({
      'raw.line_items': updatedLineItems,
      'unboxing_video_path': videoPath,
      customStatus: 'Pending Refunds',
      lastStatusUpdate: FieldValue.serverTimestamp(),
      customStatusesLogs: FieldValue.arrayUnion({
        status: 'Pending Refunds',
        createdAt: Timestamp.now(),
        remarks: 'QC submitted with unboxing video',
      }),
    });

    console.log(`QC submitted for order ${orderId}, video path: ${videoPath}`);

    return NextResponse.json({ 
      success: true, 
      message: 'QC submitted successfully',
      videoPath 
    });

  } catch (error) {
    console.error('QC submission error:', error);
    
    // Handle JSON parsing errors specifically
    if (error instanceof SyntaxError) {
      return NextResponse.json({ 
        error: 'Invalid JSON format',
        details: 'The request body must be valid JSON' 
      }, { status: 400 });
    }

    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ 
      error: 'QC submission failed', 
      details: errorMessage 
    }, { status: 500 });
  }
}