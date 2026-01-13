// /api/shopify/orders/export-products/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { db, auth as adminAuth } from '@/lib/firebase-admin';
import ExcelJS from 'exceljs';
import { DocumentSnapshot } from 'firebase-admin/firestore';
import admin from 'firebase-admin';
import { authBusinessForOrderOfTheExceptionStore, authUserForBusinessAndStore } from '@/lib/authoriseUser';
import { SHARED_STORE_IDS } from '@/lib/shared-constants';

export async function POST(req: NextRequest) {
  try {
    const { businessId, shop, orderIds } = await req.json();

    if (!businessId) {
      return NextResponse.json({ error: 'No business id provided.' }, { status: 400 });
    }

    if (!shop || !Array.isArray(orderIds) || orderIds.length === 0) {
      return NextResponse.json({ error: 'Shop and a non-empty array of orderIds are required' }, { status: 400 });
    }

    // ----- Auth -----
    const result = await authUserForBusinessAndStore({ businessId, shop, req });

    const businessData = result.businessDoc?.data();

    if (!result.authorised) {
      const { error, status } = result;
      return NextResponse.json({ error }, { status });
    }

    const { shopDoc } = result;
    const ordersColRef = shopDoc?.ref.collection('orders');

    // Firestore 'in' query has a limit of 30 values. We need to chunk them.
    const chunks: string[][] = [];
    for (let i = 0; i < orderIds.length; i += 30) {
      chunks.push(orderIds.slice(i, i + 30));
    }

    let allDocs: DocumentSnapshot[] = [];
    for (const chunk of chunks) {
      const snapshot = await ordersColRef?.where(admin.firestore.FieldPath.documentId(), 'in', chunk).get();
      snapshot?.forEach(doc => allDocs.push(doc));
    }

    allDocs.sort((a, b) => orderIds.indexOf(a.id) - orderIds.indexOf(b.id));

    const flattenedData: any[] = [];
    let serialNumber = 1;

    allDocs.forEach(doc => {
      const order = doc.data();
      if (!order) return;

      if (SHARED_STORE_IDS.includes(shop)) {
        const vendorName = businessData?.vendorName;
        const vendors = order?.vendors;
        const canProcess = authBusinessForOrderOfTheExceptionStore({ businessId, vendorName, vendors });
        if (!canProcess.authorised) {
          return;
        }
      }

      if (order.raw.line_items && order.raw.line_items.length > 0) {
        order.raw.line_items.forEach((item: any) => {
          flattenedData.push({
            srNo: serialNumber++,
            itemSku: item.sku || 'N/A',
            itemQty: item.quantity,
            vendor: item.vendor || 'N/A',
            orderName: order.name,
            availability: '', // Blank as requested
          });
        });
      }
    });

    // Create workbook and worksheet
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Products');

    // Define columns
    worksheet.columns = [
      { header: 'Sr. No.', key: 'srNo', width: 10 },
      { header: 'Item SKU', key: 'itemSku', width: 20 },
      { header: 'Item Qty', key: 'itemQty', width: 10 },
      { header: 'Vendor', key: 'vendor', width: 15 },
      { header: 'Order Name', key: 'orderName', width: 15 },
      { header: 'Availabity', key: 'availability', width: 12 },
    ];

    // Add rows
    worksheet.addRows(flattenedData);

    // Apply black borders to all cells
    const borderStyle: Partial<ExcelJS.Borders> = {
      top: { style: 'thin', color: { argb: '000000' } },
      bottom: { style: 'thin', color: { argb: '000000' } },
      left: { style: 'thin', color: { argb: '000000' } },
      right: { style: 'thin', color: { argb: '000000' } },
    };

    worksheet.eachRow((row) => {
      row.eachCell((cell) => {
        cell.border = borderStyle;
      });
    });

    // Make header row bold
    worksheet.getRow(1).font = { bold: true };

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer();

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="products-export-${Date.now()}.xlsx"`,
      },
    });

  } catch (error) {
    console.error('Error exporting products:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ error: 'Failed to export products', details: errorMessage }, { status: 500 });
  }
}