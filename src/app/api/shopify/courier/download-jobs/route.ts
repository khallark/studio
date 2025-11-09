import { NextRequest, NextResponse } from 'next/server';
import { db, auth as adminAuth } from '@/lib/firebase-admin';
import * as xlsx from 'xlsx';
import { authUserForStore } from '@/lib/authoriseUserForStore';

export async function POST(req: NextRequest) {
  try {
    const { shop, batchId, status, collectionName } = await req.json();

    if (!shop || !batchId || !status || !collectionName) {
      return NextResponse.json({ error: 'Missing params in payload' }, { status: 400 });
    }

    
    // ----- Auth -----
    const result = await authUserForStore({ shop, req });
    
    if(!result.authorised) {
      const { error, status } = result;
      return NextResponse.json({ error }, { status });
    }

    if(typeof status !== 'string' || !['success', 'failed'].includes(status)) {
      return NextResponse.json({ error: 'Wrong status value (only "success" or "failed")' }, { status: 400 });
    }

    // Fetch batch document to check courier type
    const batchRef = db.collection('accounts').doc(shop).collection(collectionName).doc(batchId);
    const batchDoc = await batchRef.get();
    
    if (!batchDoc.exists) {
      return NextResponse.json({ error: 'Batch not found' }, { status: 404 });
    }

    const batchData = batchDoc.data();
    const isPriority = batchData?.courier === 'Priority';

    const jobsRef = batchRef.collection('jobs');
    const jobsSnapshot = await jobsRef.where('status', '==', status).get();

    if (jobsSnapshot.empty) {
        return NextResponse.json({ error: `No ${status} jobs found for this batch.` }, { status: 404 });
    }

    // Check if any successful job has an errorMessage (for Remarks column)
    const hasRemarks = status === 'success' && jobsSnapshot.docs.some(doc => doc.data().errorMessage);

    const reportData = jobsSnapshot.docs.map(doc => {
        const data = doc.data();
        const row: Record<string, string> = {
            'Order Id': data.orderName || doc.id,
        };

        // Add Courier column if batch is Priority
        if (isPriority) {
            row['Courier'] = data.courier || 'N/A';
        }

        // Add Error Reason for failed jobs
        if (status === 'failed') {
            row['Error Reason'] = data.errorMessage || 'No error message provided';
        }

        // Add Remarks for successful jobs if any job has an errorMessage
        if (hasRemarks) {
            row['Remarks'] = data.errorMessage || '';
        }

        return row;
    });

    const worksheet = xlsx.utils.json_to_sheet(reportData);
    const workbook = xlsx.utils.book_new();
    const sheetName = status === 'success' ? 'Successful Jobs' : 'Failed Jobs';
    xlsx.utils.book_append_sheet(workbook, worksheet, sheetName);
    
    const buf = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${status}-jobs-${batchId}.xlsx"`,
      },
    });

  } catch (error) {
    console.error('Error exporting jobs:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ error: 'Failed to export jobs', details: errorMessage }, { status: 500 });
  }
}