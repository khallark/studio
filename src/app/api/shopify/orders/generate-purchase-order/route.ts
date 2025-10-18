import { NextRequest, NextResponse } from 'next/server';
import { db, auth as adminAuth } from '@/lib/firebase-admin';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

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
    const { shop, vendor, poNumber, orderIds } = await req.json();

    if (!shop || !vendor || !poNumber || !Array.isArray(orderIds) || orderIds.length === 0) {
      return NextResponse.json(
        { error: 'Shop, vendor, poNumber, and orderIds are required' },
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
    const ordersColRef = accountRef.collection('orders');
    
    // Firestore 'in' query has a limit of 30 values. We need to chunk them.
    const chunks: string[][] = [];
    for (let i = 0; i < orderIds.length; i += 30) {
      chunks.push(orderIds.slice(i, i + 30));
    }

    let allDocs: any[] = [];
    for (const chunk of chunks) {
      const snapshot = await ordersColRef.where('__name__', 'in', chunk).get();
      snapshot.forEach((doc: any) => allDocs.push({ id: doc.id, ...doc.data() }));
    }

    const itemsMap = new Map<string, { name: string; quantity: number }>();

    allDocs.forEach((order) => {
      if (order.isDeleted) return;
      
      if (order.raw?.line_items) {
        order.raw.line_items.forEach((item: any) => {
          if (item.vendor === vendor) {
            const sku = item.sku || 'N/A';
            const qty = item.quantity || 0;

            if (itemsMap.has(sku)) {
              const existing = itemsMap.get(sku)!;
              existing.quantity += qty;
            } else {
              itemsMap.set(sku, { name: sku, quantity: qty });
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

    // Create PDF with pdf-lib
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    
    let page = pdfDoc.addPage([595.28, 841.89]); // A4 size
    const { width, height } = page.getSize();
    
    const margin = 50;
    const tableWidth = width - (margin * 2);
    
    // Blue header
    page.drawRectangle({
      x: margin,
      y: height - 90,
      width: tableWidth,
      height: 40,
      color: rgb(0.267, 0.447, 0.769), // #4472C4
      borderColor: rgb(0, 0, 0),
      borderWidth: 1,
    });
    
    page.drawText('Purchase Order', {
      x: margin + tableWidth / 2 - boldFont.widthOfTextAtSize('Purchase Order', 20) / 2,
      y: height - 77,
      size: 20,
      font: boldFont,
      color: rgb(1, 1, 1),
    });
    
    // Info table
    const tableTop = height - 110;
    const rowHeight = 25;
    const col1Width = 250;
    const col2Width = tableWidth - col1Width;
    
    // Po. No. row
    page.drawRectangle({ x: margin, y: tableTop - rowHeight, width: col1Width, height: rowHeight, borderColor: rgb(0, 0, 0), borderWidth: 1 });
    page.drawRectangle({ x: margin + col1Width, y: tableTop - rowHeight, width: col2Width, height: rowHeight, borderColor: rgb(0, 0, 0), borderWidth: 1 });
    page.drawText('Po. No.', { x: margin + 5, y: tableTop - rowHeight + 7, size: 12, font: boldFont, color: rgb(0, 0, 0) });
    page.drawText(`${vendor}-${poNumber}`, { x: margin + col1Width + 5, y: tableTop - rowHeight + 7, size: 12, font: font, color: rgb(0, 0, 0) });
    
    // Date row
    page.drawRectangle({ x: margin, y: tableTop - rowHeight * 2, width: col1Width, height: rowHeight, borderColor: rgb(0, 0, 0), borderWidth: 1 });
    page.drawRectangle({ x: margin + col1Width, y: tableTop - rowHeight * 2, width: col2Width, height: rowHeight, borderColor: rgb(0, 0, 0), borderWidth: 1 });
    page.drawText('Date', { x: margin + 5, y: tableTop - rowHeight * 2 + 7, size: 12, font: boldFont, color: rgb(0, 0, 0) });
    page.drawText(new Date().toLocaleDateString('en-GB'), { x: margin + col1Width + 5, y: tableTop - rowHeight * 2 + 7, size: 12, font: font, color: rgb(0, 0, 0) });
    
    // Total Pcs row
    page.drawRectangle({ x: margin, y: tableTop - rowHeight * 3, width: col1Width, height: rowHeight, borderColor: rgb(0, 0, 0), borderWidth: 1 });
    page.drawRectangle({ x: margin + col1Width, y: tableTop - rowHeight * 3, width: col2Width, height: rowHeight, borderColor: rgb(0, 0, 0), borderWidth: 1 });
    page.drawText('Total Pcs', { x: margin + 5, y: tableTop - rowHeight * 3 + 7, size: 12, font: boldFont, color: rgb(0, 0, 0) });
    page.drawText(totalPcs.toString(), { x: margin + col1Width + 5, y: tableTop - rowHeight * 3 + 7, size: 12, font: font, color: rgb(0, 0, 0) });
    
    // Sign row
    const signRowY = tableTop - rowHeight * 4;
    page.drawRectangle({ x: margin, y: signRowY, width: tableWidth, height: rowHeight, borderColor: rgb(0, 0, 0), borderWidth: 1 });
    const signText = 'Sign.';
    const signTextWidth = boldFont.widthOfTextAtSize(signText, 12);
    page.drawText(signText, { x: width - margin - signTextWidth - 5, y: signRowY + 7, size: 12, font: boldFont, color: rgb(0, 0, 0) });
    
    // Items table header
    const itemsTableTop = signRowY - 10;
    const srNoWidth = 60;
    const qtyWidth = 80;
    const itemNameWidth = tableWidth - srNoWidth - qtyWidth;
    
    page.drawRectangle({ x: margin, y: itemsTableTop - rowHeight, width: srNoWidth, height: rowHeight, borderColor: rgb(0, 0, 0), borderWidth: 1 });
    page.drawRectangle({ x: margin + srNoWidth, y: itemsTableTop - rowHeight, width: itemNameWidth, height: rowHeight, borderColor: rgb(0, 0, 0), borderWidth: 1 });
    page.drawRectangle({ x: margin + srNoWidth + itemNameWidth, y: itemsTableTop - rowHeight, width: qtyWidth, height: rowHeight, borderColor: rgb(0, 0, 0), borderWidth: 1 });
    
    page.drawText('Sr. No.', { x: margin + 5, y: itemsTableTop - rowHeight + 7, size: 11, font: boldFont, color: rgb(0, 0, 0) });
    page.drawText('Item SKU', { x: margin + srNoWidth + 5, y: itemsTableTop - rowHeight + 7, size: 11, font: boldFont, color: rgb(0, 0, 0) });
    page.drawText('Qty', { x: margin + srNoWidth + itemNameWidth + 5, y: itemsTableTop - rowHeight + 7, size: 11, font: boldFont, color: rgb(0, 0, 0) });
    
    // Items rows
    let currentY = itemsTableTop - rowHeight;
    
    items.forEach((item, index) => {
      if (currentY - rowHeight < margin) {
        page = pdfDoc.addPage([595.28, 841.89]);
        currentY = height - margin;
      }
      
      currentY -= rowHeight;
      
      page.drawRectangle({ x: margin, y: currentY, width: srNoWidth, height: rowHeight, borderColor: rgb(0, 0, 0), borderWidth: 1 });
      page.drawRectangle({ x: margin + srNoWidth, y: currentY, width: itemNameWidth, height: rowHeight, borderColor: rgb(0, 0, 0), borderWidth: 1 });
      page.drawRectangle({ x: margin + srNoWidth + itemNameWidth, y: currentY, width: qtyWidth, height: rowHeight, borderColor: rgb(0, 0, 0), borderWidth: 1 });
      
      page.drawText((index + 1).toString(), { x: margin + 5, y: currentY + 7, size: 10, font: font, color: rgb(0, 0, 0) });
      
      // Truncate long item names
      let itemName = item.name;
      const maxWidth = itemNameWidth - 10;
      let textWidth = font.widthOfTextAtSize(itemName, 10);
      if (textWidth > maxWidth) {
        while (textWidth > maxWidth && itemName.length > 0) {
          itemName = itemName.slice(0, -1);
          textWidth = font.widthOfTextAtSize(itemName + '...', 10);
        }
        itemName = itemName + '...';
      }
      
      page.drawText(itemName, { x: margin + srNoWidth + 5, y: currentY + 7, size: 10, font: font, color: rgb(0, 0, 0) });
      page.drawText(item.quantity.toString(), { x: margin + srNoWidth + itemNameWidth + 5, y: currentY + 7, size: 10, font: font, color: rgb(0, 0, 0) });
    });
    
    const pdfBytes = await pdfDoc.save();
    const buffer = Buffer.from(pdfBytes);

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="PO-${vendor}-${poNumber}-${vendor}.pdf"`,
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