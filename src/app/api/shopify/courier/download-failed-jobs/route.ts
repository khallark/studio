
import { NextRequest, NextResponse } from 'next/server';
import { db, auth as adminAuth } from '@/lib/firebase-admin';
import * as xlsx from 'xlsx';

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
    const { shop, batchId } = await req.json();

    if (!shop || !batchId) {
      return NextResponse.json({ error: 'Shop and batchId are required' }, { status: 400 });
    }

    const userId = await getUserIdFromToken(req);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists || !userDoc.data()?.accounts.includes(shop)) {
        return NextResponse.json({ error: 'Forbidden: User is not authorized to access this shop.' }, { status: 403 });
    }

    const jobsRef = db.collection('accounts').doc(shop).collection('shipment_batches').doc(batchId).collection('jobs');
    const failedJobsSnapshot = await jobsRef.where('status', '==', 'failed').get();

    if (failedJobsSnapshot.empty) {
        return NextResponse.json({ error: 'No failed jobs found for this batch.' }, { status: 404 });
    }

    const reportData = failedJobsSnapshot.docs.map(doc => {
        const data = doc.data();
        return {
            'Order Id': data.orderName || doc.id,
            'Error Reason': data.errorMessage || 'No error message provided',
        };
    });

    const worksheet = xlsx.utils.json_to_sheet(reportData);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, 'Failed Jobs');
    
    const buf = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="failed-jobs-${batchId}.xlsx"`,
      },
    });

  } catch (error) {
    console.error('Error exporting failed jobs:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ error: 'Failed to export failed jobs', details: errorMessage }, { status: 500 });
  }
}
