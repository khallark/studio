import { NextRequest, NextResponse } from 'next/server';
import { db, auth as adminAuth } from '@/lib/firebase-admin';
import PDFDocument from 'pdfkit';

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
    const { shop, vendor, poNumber } = await req.json();

    if (!shop || !vendor || !poNumber) {
      return NextResponse.json(
        { error: 'Shop, vendor, and poNumber are required' },
        { status: 400 }
      );
    }

    const userId = await getUserIdFromToken(req);
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized: Could not identify user.' },
        { status: 401 }
      );
    }

    const accountRef = db.collection('accounts').doc(shop);
    const ordersSnapshot = await accountRef
      .collection('orders')
      .where('customStatus', '==', 'Confirmed')
      .get();

    const itemsMap = new Map<string, { name: string; quantity: number }>();

    ordersSnapshot.forEach((doc) => {
      const order = doc.data();
      if (order.isDeleted) return;
      
      if (order.raw?.line_items) {
        order.raw.line_items.forEach((item: any) => {
          if (item.vendor === vendor) {
            const name = item.name || item.title || 'Unknown Item';
            const qty = item.quantity || 0;

            if (itemsMap.has(name)) {
              const existing = itemsMap.get(name)!;
              existing.quantity += qty;
            } else {
              itemsMap.set(name, { name, quantity: qty });
            }
          }
        });
      }
    });

    const items = Array.from(itemsMap.values()).sort((a, b) => a.name.localeCompare(b.name));

    if (items.length === 0) {
      return NextResponse.json(
        { error: 'No items found for the selected vendor' },
        { status: 404 }
      );
    }

    const totalPcs = items.reduce((sum, item) => sum + item.quantity, 0);

    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: any) => chunks.push(chunk));

    doc.rect(50, 50, doc.page.width - 100, 40).fillAndStroke('#4472C4', '#000000');
    doc.fillColor('#FFFFFF').fontSize(20).font('Helvetica-Bold');
    doc.text('Purchase Order', 50, 63, { align: 'center', width: doc.page.width - 100 });

    doc.fillColor('#000000');

    const tableTop = 110;
    const col1X = 50;
    const col2X = 300;
    const rowHeight = 25;

    doc.strokeColor('#000000').lineWidth(1);

    doc.rect(col1X, tableTop, 250, rowHeight).stroke();
    doc.rect(col2X, tableTop, doc.page.width - col2X - 50, rowHeight).stroke();
    doc.fontSize(12).font('Helvetica-Bold').text('Po. No.', col1X + 5, tableTop + 7);
    doc.font('Helvetica').text(`Ghamand-${poNumber}`, col2X + 5, tableTop + 7);

    doc.rect(col1X, tableTop + rowHeight, 250, rowHeight).stroke();
    doc.rect(col2X, tableTop + rowHeight, doc.page.width - col2X - 50, rowHeight).stroke();
    doc.font('Helvetica-Bold').text('Date', col1X + 5, tableTop + rowHeight + 7);
    doc.font('Helvetica').text(new Date().toLocaleDateString('en-GB'), col2X + 5, tableTop + rowHeight + 7);

    doc.rect(col1X, tableTop + rowHeight * 2, 250, rowHeight).stroke();
    doc.rect(col2X, tableTop + rowHeight * 2, doc.page.width - col2X - 50, rowHeight).stroke();
    doc.font('Helvetica-Bold').text('Total Pcs', col1X + 5, tableTop + rowHeight * 2 + 7);
    doc.font('Helvetica').text(totalPcs.toString(), col2X + 5, tableTop + rowHeight * 2 + 7);

    const signRowTop = tableTop + rowHeight * 3;
    doc.rect(col1X, signRowTop, doc.page.width - 100, rowHeight).stroke();
    doc.font('Helvetica-Bold').text('Sign.', doc.page.width - 100, signRowTop + 7, { align: 'right' });

    const itemsTableTop = signRowTop + rowHeight + 10;
    const srNoWidth = 60;
    const itemNameWidth = doc.page.width - 100 - srNoWidth - 80;
    const qtyWidth = 80;

    doc.rect(col1X, itemsTableTop, srNoWidth, rowHeight).stroke();
    doc.rect(col1X + srNoWidth, itemsTableTop, itemNameWidth, rowHeight).stroke();
    doc.rect(col1X + srNoWidth + itemNameWidth, itemsTableTop, qtyWidth, rowHeight).stroke();

    doc.fillColor('#000000').font('Helvetica-Bold').fontSize(11);
    doc.text('Sr. No.', col1X + 5, itemsTableTop + 7, { width: srNoWidth - 10 });
    doc.text('Item Name', col1X + srNoWidth + 5, itemsTableTop + 7, { width: itemNameWidth - 10 });
    doc.text('Qty', col1X + srNoWidth + itemNameWidth + 5, itemsTableTop + 7, { width: qtyWidth - 10 });

    let currentY = itemsTableTop + rowHeight;
    doc.font('Helvetica').fontSize(10);

    items.forEach((item, index) => {
      if (currentY + rowHeight > doc.page.height - 50) {
        doc.addPage();
        currentY = 50;
      }

      doc.rect(col1X, currentY, srNoWidth, rowHeight).stroke();
      doc.rect(col1X + srNoWidth, currentY, itemNameWidth, rowHeight).stroke();
      doc.rect(col1X + srNoWidth + itemNameWidth, currentY, qtyWidth, rowHeight).stroke();

      doc.text((index + 1).toString(), col1X + 5, currentY + 7, { width: srNoWidth - 10 });
      doc.text(item.name, col1X + srNoWidth + 5, currentY + 7, { width: itemNameWidth - 10 });
      doc.text(item.quantity.toString(), col1X + srNoWidth + itemNameWidth + 5, currentY + 7, { width: qtyWidth - 10 });

      currentY += rowHeight;
    });

    doc.end();

    await new Promise<void>((resolve) => {
      doc.on('end', () => resolve());
    });

    const pdfBuffer = Buffer.concat(chunks);

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="PO-Ghamand-${poNumber}-${vendor}.pdf"`,
      },
    });
  } catch (error) {
    console.error('Error generating purchase order:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json(
      { error: 'Failed to generate purchase order', details: errorMessage },
      { status: 500 }
    );
  }
}