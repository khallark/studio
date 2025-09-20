
import { NextRequest, NextResponse } from 'next/server';
import { db, auth as adminAuth } from '@/lib/firebase-admin';
import { PDFDocument, rgb, StandardFonts, PDFFont, PDFPage } from 'pdf-lib';
import bwip from 'bwip-js';
import { DocumentSnapshot } from 'firebase-admin/firestore';
import admin from 'firebase-admin';

/* -------------------- Auth -------------------- */
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





// --- Typography scale ---
// 1.00 = no change; 1.25 = +25% bigger everywhere
const FONT_SCALE = 1.32;
const S = (n: number) => Math.round(n * FONT_SCALE);


// Helper to sanitize text for WinAnsi encoding
function sanitizeText(text: string): string {
    if (!text) return '';
    // This regex matches characters outside the WinAnsi character set.
    // It's a simplified approach. A more accurate one would be to check character codes.
    // For pdf-lib's standard fonts, we need to ensure characters are within the subset it supports.
    // Let's replace any character that is not a standard ASCII character.
    return text.replace(/[^\x00-\x7F]/g, "?");
}

function ddmmyyyy(dateish: any): string {
  // Match sample: 11/9/2025 (no leading zero on month/day)
  const d = new Date(dateish || Date.now());
  const day = d.getDate();
  const month = d.getMonth() + 1;
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

// If you want strict typing for `page`, also:
// import type { PDFPage } from 'pdf-lib';

/** Split text into lines that fit within maxWidth for a given font+size. */
function wrapTextByWidth(
  text: string,
  maxWidth: number,
  font: PDFFont,
  size: number
): string[] {
  const out: string[] = [];
  const paras = String(text ?? '').split(/\r?\n/);

  const fits = (s: string) => font.widthOfTextAtSize(s, size) <= maxWidth;

  for (const para of paras) {
    if (!para) { out.push(''); continue; }

    const words = para.split(/\s+/);
    let line = '';

    for (let w of words) {
      // If a single word is too wide, hard-wrap it on characters
      if (!fits(w)) {
        let chunk = '';
        for (const ch of w) {
          if (fits(chunk + ch)) chunk += ch;
          else {
            if (line) { out.push(line); line = ''; }
            if (chunk) { out.push(chunk); chunk = ''; }
            // start new chunk with current char
            chunk = ch;
          }
        }
        if (chunk) {
          if (!line) line = chunk;
          else if (fits(line + ' ' + chunk)) line += ' ' + chunk;
          else { out.push(line); line = chunk; }
        }
        continue;
      }

      // Normal word flow
      if (!line) line = w;
      else if (fits(line + ' ' + w)) line += ' ' + w;
      else { out.push(line); line = w; }
    }
    if (line) out.push(line);
  }
  return out;
}

/** Draw wrapped text line-by-line; returns the new y after drawing. */
function drawWrappedText(
  page: any,                // or PDFPage
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  font: PDFFont,
  size: number,
  lineHeight = size * 1.5,
  color = rgb(0, 0, 0)
): number {
  const sanitizedText = sanitizeText(text);
  const lines = wrapTextByWidth(sanitizedText, maxWidth, font, size);
  for (const ln of lines) {
    page.drawText(ln, { x, y, font, size, color });
    y -= lineHeight;
  }
  return y;
}



async function createSlipPage(
  pdfDoc: PDFDocument,
  fonts: { regular: PDFFont; bold: PDFFont },
  order: any,
  sellerDetails: { name: string; gst: string; returnAddress: string }
): Promise<PDFPage> {
  const page = pdfDoc.addPage([595, 842]); // A4 size
  const { width, height } = page.getSize();
  const { regular, bold } = fonts;
  
  const margin = 30;
  const contentWidth = width - 2 * margin;
  let y = height - margin;
  
  const drawSanitizedText = (text: string, options: any) => {
    const o = { ...options };
    if (typeof o.size === 'number') o.size = S(o.size); // scale requested size
    page.drawText(sanitizeText(text), o);
  };

  // Helper function to draw a horizontal line
  const drawLine = (y: number, thickness = 1) => {
    page.drawLine({
      start: { x: margin, y },
      end: { x: width - margin, y },
      thickness,
      color: rgb(0, 0, 0),
    });
  };

  // Helper function to draw a rectangle
  const drawRect = (x: number, y: number, w: number, h: number, thickness = 1) => {
    page.drawRectangle({
      x,
      y,
      width: w,
      height: h,
      borderColor: rgb(0, 0, 0),
      borderWidth: thickness,
    });
  };

  // Main border
  drawRect(margin, margin, contentWidth, height - 2 * margin, 2);

  // Header section with Shipowr and DELHIVERY
  y -= 40;
  drawSanitizedText(String(order?.courier).toUpperCase(), {
    x: margin + 10,
    y,
    font: bold,
    size: 16,
    color: rgb(0, 0, 0),
  });

  // Horizontal line after header
  y -= 10;
  drawLine(y, 1);

  // AWB Number
  y -= 30;
  const awbNumber = order.awb || `276468${Date.now().toString().slice(-10)}`;
  drawSanitizedText(`AWB# ${awbNumber}`, {
    x: margin + 10,
    y,
    font: bold,
    size: 11,
    color: rgb(0, 0, 0),
  });

  // Generate barcode
  y -= 100;
  try {
    const barcodeBuffer = await bwip.toBuffer({
      bcid: 'code128',
      text: awbNumber,
      scaleX: 4,
      scaleY: 4,
      height: 15,
      includetext: true,
      textxalign: 'center',
    });
    
    const barcodeImage = await pdfDoc.embedPng(barcodeBuffer);
    const barcodeWidth = 260;
    const barcodeHeight = 60 + 20;
    
    page.drawImage(barcodeImage, {
      x: (width - barcodeWidth) / 2,
      y,
      width: barcodeWidth,
      height: barcodeHeight,
    });
  } catch (error) {
    console.error('Barcode generation failed:', error);
    const fallbackSize = S(14);
    const textW = bold.widthOfTextAtSize(awbNumber, fallbackSize);
    drawSanitizedText(awbNumber, {
      x: (width - textW) / 2,
      y: y + 30,
      font: bold,
      size: 14, // will be scaled inside drawSanitizedText
      color: rgb(0, 0, 0),
    });
  }

  // Ship to section
  y -= 40;
  const shipTo = order.raw.shipping_address || {};
  const customerName = shipTo.name || 'Customer';
  const addressLine1 = shipTo.address1 || '';
  const addressLine2 = shipTo.address2 || '';
  const city = shipTo.city || '';
  const state = shipTo.province || '';
  const country = shipTo.country || 'India';
  const pincode = shipTo.zip || '';

  drawSanitizedText(`Ship to - ${customerName}`, {
    x: margin + 10,
    y,
    font: bold,
    size: 12,
    color: rgb(0, 0, 0),
  });


  // COD/PREPAID INR - using drawWrappedText to prevent overflow
  const _rightColX = width - margin - 150;
  const _rightColMaxWidth = 140; // slightly less than 150 to ensure padding from border

  const paymentText = `${order.raw.payment_gateway_names.join(",").toLowerCase().includes("cod") ? "COD" : "Prepaid"} - ${order?.courier === 'Delhivery'
      ? order?.shippingMode || "Surface/Express"
      : (String(order?.courier || '').split(':')[1] || 'Express').trim()}`;

  y = drawWrappedText(
    page,
    paymentText,
    _rightColX,
    y,
    _rightColMaxWidth,
    regular,
    15,
    16 // line height
  );

  y -= 5; // small gap between payment type and amount

  y = drawWrappedText(
    page,
    `INR ${order.raw.total_price || '0'}`,
    _rightColX,
    y,
    _rightColMaxWidth,
    bold,
    15.5,
    18 // line height
  );

  // Address details (wrapped)
  y -= 20;

  // Right column (COD/Date) starts at this X in your layout:
  const rightColX = width - margin - 150;

  // We'll wrap address text so it never crosses into the right column.
  // Leave a small gutter between columns.
  const addrX = margin + 10;
  const addrMaxWidth = rightColX - addrX - 8;

  // Keep where the address block starts so we can place the Date
  // consistently on the right, regardless of address height.
  const addrStartY = y;

  const addressParts = [
    addressLine1,
    addressLine2,
    city,
    state && country ? `${state}, ${country}` : state || country,
  ].filter(Boolean);

  for (const line of addressParts) {
    y = drawWrappedText(page, line, addrX, y, addrMaxWidth, bold, 10 * 1.5, 17);
  }

  // PIN code (wrapped too, for consistency)
  if (pincode) {
    y = drawWrappedText(page, `PIN - ${pincode}`, addrX, y, addrMaxWidth, bold, 10 * 1.5, 17);
  }

  // Date on the right
  const orderDate = order.createdAt;
  drawSanitizedText('Date', {
    x: width - margin - 150,
    y: y + 30,
    font: regular,
    size: 10,
    color: rgb(0, 0, 0),
  });
  drawSanitizedText(ddmmyyyy(orderDate), {
    x: width - margin - 150,
    y: y + 15,
    font: bold,
    size: 10,
    color: rgb(0, 0, 0),
  });

  // Horizontal line before seller section
  y -= 30;
  drawLine(y, 1);

  // Seller details section
  y -= 25;
  drawSanitizedText(`Seller: ${sellerDetails.name}`, {
    x: margin + 10,
    y,
    font: regular,
    size: 11,
    color: rgb(0, 0, 0),
  });

  // Order number on the right
  const orderNumber = order.name || `#${order.orderId || 'N/A'}`;
  drawSanitizedText(orderNumber, {
    x: width - margin - 150,
    y,
    font: bold,
    size: 12,
    color: rgb(0, 0, 0),
  });

  // GST number
  y -= 20;
  drawSanitizedText(`GST: 03AAQCM9385B1Z8`, {
    x: margin + 10,
    y,
    font: regular,
    size: 10,
    color: rgb(0, 0, 0),
  });

  // Horizontal line before product table
  y -= 15;
  drawLine(y, 1);

  // Product table header
  y -= 25;
  const tableHeaders = ['Product Name', 'HSN', 'Qty.', 'Taxable Price', 'Taxes', 'Total'];
  const colWidths = [200, 60, 40, 80, 60, 60];
  let xPos = margin + 10;

  // Draw table header
  tableHeaders.forEach((header, i) => {
    drawSanitizedText(header, {
      x: xPos,
      y,
      font: bold,
      size: 10 * 0.85,
      color: rgb(0, 0, 0),
    });
    xPos += colWidths[i];
  });

  // Horizontal line after header
  y -= 15;
  drawLine(y, 0.5);

  // Product items
  const lineItems = order.raw.line_items || [];
  y -= 20;
  
  lineItems.forEach((item: any) => {
    xPos = margin + 10;
    
    const productName = item.name || item.title || 'Product';
    const quantity = item.quantity || 1;
    const hsn = item.hsn || '6109';
    const total = (parseFloat(item.price) * quantity).toFixed(2);
    const price = (Number(total) * (100/105)).toFixed(); // assuming 5% tax inclusive
    const taxAmount = Number(total) - Number(price);

    function truncateKeepTailAfterHyphen(name: string, max = 30): string {
      const s = String(name ?? '');
      if (s.length <= max) return s;

      const hyphen = s.lastIndexOf('-');
      if (hyphen === -1) {
        // No hyphen → regular ellipsis trim
        return s.slice(0, Math.max(0, max - 3)) + '...';
      }

      const tail = s.slice(hyphen); // includes the hyphen itself
      const headRoom = max - 3 - tail.length;

      if (headRoom > 0) {
        // Enough room for some head + "..." + full tail
        return s.slice(0, headRoom) + '...' + tail;
      }

      // Tail alone is too long → show as much of the tail (starting at the hyphen) as fits
      return '...' + tail.slice(0, max - 3);
    }

    const rowData = [
      truncateKeepTailAfterHyphen(productName, 25),
      hsn,
      quantity.toString(),
      price,
      taxAmount.toFixed(2),
      total,
    ];

    rowData.forEach((data, i) => {
      drawSanitizedText(data, {
        x: xPos,
        y,
        font: regular,
        size: 10,
        color: rgb(0, 0, 0),
      });
      xPos += colWidths[i];
    });
    
    y -= 20;
  });

  // Return address at bottom (wrap to fit inside the outer border)
  y = margin + 100;

  const padX = 10; // left/right padding inside the border
  const xText = margin + padX;
  const maxTextWidth = contentWidth - padX * 2; // outer box width minus padding

  y = drawWrappedText(
    page,
    `Return Address: ${sellerDetails.returnAddress || 'Majime Productions, Udhyog Vihar Bhattian, Bahadarke Road, Ludhiana, Punjab, 141008'}`,
    xText,
    y,
    maxTextWidth,
    regular,
    11
  );

  return page;
}



















/* -------------------- Handler -------------------- */
export async function POST(req: NextRequest) {
  try {
    const { shop, orderIds } = await req.json();

    if (!shop || !Array.isArray(orderIds) || orderIds.length === 0) {
      return NextResponse.json({ error: 'Shop and a non-empty array of orderIds are required' }, { status: 400 });
    }

    const userId = await getUserIdFromToken(req);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const accountRef = db.collection('accounts').doc(shop);
    const accountDoc = await accountRef.get();
    if (!accountDoc.exists) {
      return NextResponse.json({ error: 'Shop not found' }, { status: 404 });
    }
    const accountData = accountDoc.data() || {};

    const sellerDetails = {
      name:
        accountData?.companyName ||
        accountData?.businessName ||
        accountData?.primaryContact?.name ||
        'Majime Technologies', // sensible default
      gst: accountData?.gstin || accountData?.gst || 'NOT_CONFIGURED',
      returnAddress: [
        accountData?.companyAddress?.address,
        accountData?.companyAddress?.city,
        accountData?.companyAddress?.state,
        accountData?.companyAddress?.pincode,
        accountData?.companyAddress?.country,
      ]
        .filter(Boolean)
        .join(', '),
    };

    const ordersColRef = accountRef.collection('orders');
    // The request sends Firestore document IDs, which are strings.
    const stringIds = orderIds.map(String);

    // Chunking logic to handle Firestore's 30-item limit for 'in' queries
    const chunks: string[][] = [];
    for (let i = 0; i < stringIds.length; i += 30) {
      chunks.push(stringIds.slice(i, i + 30));
    }

    const allDocs: DocumentSnapshot[] = [];
    for (const chunk of chunks) {
      // Use where clause with documentId() to query by ID
      const snapshot = await ordersColRef.where(admin.firestore.FieldPath.documentId(), 'in', chunk).get();
      snapshot.forEach(doc => allDocs.push(doc));
    }

    // Re-sort the documents to match the original orderIds array from the frontend
    allDocs.sort((a, b) => stringIds.indexOf(a.id) - stringIds.indexOf(b.id));

    if (allDocs.length === 0) {
      return NextResponse.json({ error: 'No matching orders found' }, { status: 404 });
    }

    const pdfDoc = await PDFDocument.create();
    const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const pages: PDFPage[] = [];
    for (const d of allDocs) {
      const order = d.data();
      const page = await createSlipPage(pdfDoc, { regular, bold }, order, sellerDetails);
      pages.push(page);
    }


    const pdfBytes = await pdfDoc.save();

    return new NextResponse(pdfBytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="shipping-slips-${Date.now()}.pdf"`,
      },
    });
  } catch (error) {
    console.error('Error generating shipping slips:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ error: 'Failed to generate slips', details: errorMessage }, { status: 500 });
  }
}
