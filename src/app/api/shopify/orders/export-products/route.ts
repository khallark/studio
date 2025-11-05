
import { NextRequest, NextResponse } from 'next/server';
import { db, auth as adminAuth } from '@/lib/firebase-admin';
import * as xlsx from 'xlsx';
import { DocumentSnapshot } from 'firebase-admin/firestore';
import admin from 'firebase-admin';

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
    const { shop, orderIds } = await req.json();

    if (!shop || !Array.isArray(orderIds) || orderIds.length === 0) {
      return NextResponse.json({ error: 'Shop and a non-empty array of orderIds are required' }, { status: 400 });
    }

    // ----- Auth -----
    const shopRef = db.collection('accounts').doc(shop)
    const shopDoc = await shopRef.get();
    if (!shopDoc.exists) {
      return NextResponse.json({ error: 'Shop Not Found' }, { status: 401 });
    }
    const userId = await getUserIdFromToken(req);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const member = await db.collection('accounts').doc(shop).collection('members').doc(userId).get();
    const isAuthorized = member.exists && member.data()?.status === 'active';
    if (!isAuthorized) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const ordersColRef = shopRef.collection('orders');
    
    // Firestore 'in' query has a limit of 30 values. We need to chunk them.
    const chunks: string[][] = [];
    for (let i = 0; i < orderIds.length; i += 30) {
        chunks.push(orderIds.slice(i, i + 30));
    }

    let allDocs: DocumentSnapshot[] = [];
    for (const chunk of chunks) {
        const snapshot = await ordersColRef.where(admin.firestore.FieldPath.documentId(), 'in', chunk).get();
        snapshot.forEach(doc => allDocs.push(doc));
    }
    
    allDocs.sort((a, b) => orderIds.indexOf(a.id) - orderIds.indexOf(b.id));

    const flattenedData: any[] = [];
    let serialNumber = 1;
    
    allDocs.forEach(doc => {
      const order = doc.data();
       if (!order) return;
       
      if (order.raw.line_items && order.raw.line_items.length > 0) {
        order.raw.line_items.forEach((item: any) => {
           flattenedData.push({
                "Sr. No.": serialNumber++,
                "Item SKU": item.sku || 'N/A',
                "Item Qty": item.quantity,
                "Vendor": item.vendor || 'N/A',
                "Order Name": order.name,
                "Availabity": "", // Blank as requested
              });
        });
      }
    });

    const worksheet = xlsx.utils.json_to_sheet(flattenedData);

    // Apply black borders to all cells
    const range = xlsx.utils.decode_range(worksheet['!ref']!);
    const border = {
        top: { style: 'thin', color: { rgb: '000000' } },
        bottom: { style: 'thin', color: { rgb: '000000' } },
        left: { style: 'thin', color: { rgb: '000000' } },
        right: { style: 'thin', color: { rgb: '000000' } },
    };

    for (let R = range.s.r; R <= range.e.r; ++R) {
        for (let C = range.s.c; C <= range.e.c; ++C) {
            const cell_address = { c: C, r: R };
            const cell_ref = xlsx.utils.encode_cell(cell_address);
            if (!worksheet[cell_ref]) continue;
            if (!worksheet[cell_ref].s) worksheet[cell_ref].s = {};
            worksheet[cell_ref].s.border = border;
        }
    }

    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, 'Products');
    
    const buf = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    return new NextResponse(buf, {
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
