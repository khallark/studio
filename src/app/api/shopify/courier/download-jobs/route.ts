import { NextRequest, NextResponse } from 'next/server';
import { db, auth as adminAuth } from '@/lib/firebase-admin';
import ExcelJS from 'exceljs';
import { authUserForBusiness, authUserForBusinessAndStore } from '@/lib/authoriseUser';

export async function POST(req: NextRequest) {
  try {
    const { businessId, batchId, status, collectionName } = await req.json();

    if (!businessId) {
      return NextResponse.json({ error: 'No business id provided.' }, { status: 400 });
    }

    if (!businessId || !batchId || !status || !collectionName) {
      return NextResponse.json({ error: 'Missing params in payload' }, { status: 400 });
    }

    // ----- Auth -----
    const result = await authUserForBusiness({ businessId, req });

    if (!result.authorised) {
      const { error, status } = result;
      return NextResponse.json({ error }, { status });
    }

    if (typeof status !== 'string' || !['success', 'failed'].includes(status)) {
      return NextResponse.json({ error: 'Wrong status value (only "success" or "failed")' }, { status: 400 });
    }

    // Fetch batch document to check courier type
    const batchRef = db.collection('users').doc(businessId).collection(collectionName).doc(batchId);
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

    // Build column definitions dynamically
    const columns: { header: string; key: string; width: number }[] = [
      { header: 'Order Id', key: 'orderId', width: 15 },
    ];

    if (isPriority) {
      columns.push({ header: 'Courier', key: 'courier', width: 15 });
    }

    if (status === 'failed') {
      columns.push({ header: 'Error Reason', key: 'errorReason', width: 40 });
    }

    if (hasRemarks) {
      columns.push({ header: 'Remarks', key: 'remarks', width: 30 });
    }

    // Build report data
    const reportData = jobsSnapshot.docs.map(doc => {
      const data = doc.data();
      const row: Record<string, string> = {
        orderId: data.orderName || doc.id,
      };

      if (isPriority) {
        row.courier = data.courier || 'N/A';
      }

      if (status === 'failed') {
        row.errorReason = data.errorMessage || 'No error message provided';
      }

      if (hasRemarks) {
        row.remarks = data.errorMessage || '';
      }

      return row;
    });

    // Create workbook and worksheet
    const workbook = new ExcelJS.Workbook();
    const sheetName = status === 'success' ? 'Successful Jobs' : 'Failed Jobs';
    const worksheet = workbook.addWorksheet(sheetName);

    // Set columns
    worksheet.columns = columns;

    // Add rows
    worksheet.addRows(reportData);

    // Make header row bold
    worksheet.getRow(1).font = { bold: true };

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer();

    return new NextResponse(new Uint8Array(buffer as ArrayBuffer), {
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