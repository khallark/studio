import { NextRequest, NextResponse } from 'next/server';
import { db, auth as adminAuth, storage } from '@/lib/firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { authBusinessForOrderOfTheExceptionStore, authUserForBusinessAndStore, SHARED_STORE_ID } from '@/lib/authoriseUser';

export async function POST(req: NextRequest) {
  try {
    // Parse JSON body instead of FormData
    const body = await req.json();
    const { businessId, shop, orderId, qcStatuses, videoPath } = body;

    // Validate required fields
    if (!shop || !orderId || !qcStatuses || !videoPath) {
      return NextResponse.json({
        error: 'Missing required fields',
        details: 'shopId, orderId, qcStatuses, and videoPath are all required'
      }, { status: 400 });
    }

    const result = await authUserForBusinessAndStore({ businessId, shop, req })

    const businessData = result.businessDoc?.data();

    if (!result.authorised) {
      const { error, status } = result;
      return NextResponse.json({ error }, { status });
    }

    // Validate qcStatuses is an object
    if (typeof qcStatuses !== 'object' || Array.isArray(qcStatuses)) {
      return NextResponse.json({
        error: 'Invalid qcStatuses format',
        details: 'qcStatuses must be an object'
      }, { status: 400 });
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
    const orderRef = db.collection('accounts').doc(shop).collection('orders').doc(orderId);
    const orderDoc = await orderRef.get();

    if (!orderDoc.exists) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    const orderData = orderDoc.data();

    if (shop === SHARED_STORE_ID) {
      const vendorName = businessData?.vendorName;
      const vendors = orderData?.vendors;
      const canProcess = authBusinessForOrderOfTheExceptionStore({ businessId, vendorName, vendors });
      if (!canProcess.authorised) {
        const { error, status } = canProcess;
        return NextResponse.json({ error }, { status });
      }
    }

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