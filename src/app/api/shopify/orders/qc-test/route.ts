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
    const formData = await req.formData();
    const videoFile = formData.get('video') as File;
    const shopId = formData.get('shopId') as string;
    const orderId = formData.get('orderId') as string;
    const qcStatusesJson = formData.get('qcStatuses') as string;

    if (!videoFile || !shopId || !orderId || !qcStatusesJson) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const userId = await getUserIdFromToken(req);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists || !userDoc.data()?.accounts?.includes(shopId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const qcStatuses = JSON.parse(qcStatusesJson);

    // Upload video to Firebase Storage
    const buffer = Buffer.from(await videoFile.arrayBuffer());
    const fileName = `unboxing_video_${Date.now()}.webm`;
    const filePath = `return-images/${shopId}/${orderId}/${fileName}`;
    
    const bucket = storage.bucket();
    await bucket.file(filePath).save(buffer, {
      contentType: videoFile.type,
      metadata: {
        contentType: videoFile.type,
      },
    });

    // Update order in Firestore
    const orderRef = db.collection('accounts').doc(shopId).collection('orders').doc(orderId);
    const orderDoc = await orderRef.get();

    if (!orderDoc.exists) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    const orderData = orderDoc.data();
    const updatedLineItems = orderData?.raw?.line_items?.map((item: any) => ({
      ...item,
      qc_status: qcStatuses[item.id] || null,
    })) || [];

    await orderRef.update({
      'raw.line_items': updatedLineItems,
      'unboxing_video_path': filePath,
      customStatus: 'Pending Refunds',
      customStatusesLogs: FieldValue.arrayUnion({
        status: 'Pending Refunds',
        createdAt: Timestamp.now(),
        remarks: 'QC submitted with unboxing video',
      }),
    });

    return NextResponse.json({ success: true, message: 'QC submitted successfully' });

  } catch (error) {
    console.error('QC submission error:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ error: 'QC submission failed', details: errorMessage }, { status: 500 });
  }
}