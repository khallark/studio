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
const FONT_SCALE = 1.32;
const S = (n: number) => Math.round(n * FONT_SCALE);

// Helper to sanitize text for WinAnsi encoding
function sanitizeText(text: string): string {
    if (!text) return '';
    return text.replace(/[^\x00-\x7F]/g, "?");
}

function ddmmyyyy(dateish: any): string {
  const d = new Date(dateish || Date.now());
  const day = d.getDate();
  const month = d.getMonth() + 1;
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

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
      if (!fits(w)) {
        let chunk = '';
        for (const ch of w) {
          if (fits(chunk + ch)) chunk += ch;
          else {
            if (line) { out.push(line); line = ''; }
            if (chunk) { out.push(chunk); chunk = ''; }
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
  page: any,
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
  const { bold } = fonts;
  
  const margin = 30;
  const contentWidth = width - 2 * margin;
  let y = height - margin;
  
  const drawSanitizedText = (text: string, options: any) => {
    const o = { ...options };
    if (typeof o.size === 'number') o.size = S(o.size);
    page.drawText(sanitizeText(text), o);
  };

  const drawLine = (y: number, thickness = 1) => {
    page.drawLine({
      start: { x: margin, y },
      end: { x: width - margin, y },
      thickness,
      color: rgb(0, 0, 0),
    });
  };

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

  // Header section with courier name
  y -= 40;
  drawSanitizedText(String(order?.courier).toUpperCase(), {
    x: margin + 10,
    y,
    font: bold,
    size: 16,
    color: rgb(0, 0, 0),
  });

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
      size: 14,
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

  const _rightColX = width - margin - 150;
  const _rightColMaxWidth = 140;

  const paymentText = `${order.raw.payment_gateway_names.join(",").toLowerCase().includes("cod") ? "COD" : "Prepaid"} - ${order?.courier === 'Delhivery'
      ? order?.shippingMode || "Surface/Express"
      : (String(order?.courier || '').split(':')[1] || 'Express').trim()}`;

  y = drawWrappedText(
    page,
    paymentText,
    _rightColX,
    y,
    _rightColMaxWidth,
    bold,
    15,
    16
  );

  y -= 5;

  y = drawWrappedText(
    page,
    `INR ${order.raw.total_price || '0'}`,
    _rightColX,
    y,
    _rightColMaxWidth,
    bold,
    15.5,
    18
  );

  // Address details
  y -= 20;

  const rightColX = width - margin - 150;
  const addrX = margin + 10;
  const addrMaxWidth = rightColX - addrX - 8;

  const addressParts = [
    addressLine1,
    addressLine2,
    city,
    state && country ? `${state}, ${country}` : state || country,
  ].filter(Boolean);

  for (const line of addressParts) {
    y = drawWrappedText(page, line, addrX, y, addrMaxWidth, bold, 10 * 1.5, 17);
  }

  if (pincode) {
    y = drawWrappedText(page, `PIN - ${pincode}`, addrX, y, addrMaxWidth, bold, 10 * 1.5, 17);
  }

  // Date on the right
  const orderDate = order.createdAt;
  drawSanitizedText('Date', {
    x: width - margin - 150,
    y: y + 30,
    font: bold,
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

  y -= 30;
  drawLine(y, 1);

  // Seller details section
  y -= 25;
  drawSanitizedText(`Seller: ${sellerDetails.name}`, {
    x: margin + 10,
    y,
    font: bold,
    size: 11,
    color: rgb(0, 0, 0),
  });

  const orderNumber = order.name || `#${order.orderId || 'N/A'}`;
  drawSanitizedText(orderNumber, {
    x: width - margin - 150,
    y,
    font: bold,
    size: 12,
    color: rgb(0, 0, 0),
  });

  y -= 20;
  drawSanitizedText(`GST: 03AAQCM9385B1Z8`, {
    x: margin + 10,
    y,
    font: bold,
    size: 10,
    color: rgb(0, 0, 0),
  });

  // ============================================
  // OPTION 3: Receipt-Style Product List
  // ============================================
  
  y -= 15;
  drawLine(y, 1);

  // Products section title
  y -= 25;
  drawSanitizedText('Products:', {
    x: margin + 10,
    y,
    font: bold,
    size: 11,
    color: rgb(0, 0, 0),
  });

  y -= 10;
  drawLine(y, 0.5);

  // Product items - receipt style
  const lineItems = order.raw.line_items || [];
  y -= 20;

  lineItems.forEach((item: any, index: number) => {
    const productName = item.name || item.title || 'Product';
    const quantity = item.quantity || 1;
    const hsn = item.hsn || '6109';
    const total = (parseFloat(item.price) * quantity).toFixed(2);
    const price = (Number(total) * (100/105)).toFixed();
    const taxAmount = Number(total) - Number(price);

    // Product name - full width, can wrap if needed
    const maxProductWidth = contentWidth - 20;
    y = drawWrappedText(
      page,
      `${index + 1}. ${productName}`,
      margin + 10,
      y,
      maxProductWidth,
      bold,
      10,
      15
    );
    
    // Details in one line below the product name
    y -= 18;
    const detailsText = `HSN: ${hsn} | Qty: ${quantity} | Price: Rs.${price} | Tax: Rs.${taxAmount.toFixed(2)} | Total: Rs.${total}`;
    drawSanitizedText(detailsText, {
      x: margin + 20,
      y,
      font: bold,
      size: 9,
      color: rgb(0.3, 0.3, 0.3),
    });
    
    // Spacing between products
    y -= 15;
    
    // Light separator line between products
    if (index < lineItems.length - 1) {
      drawLine(y + 5, 0.3);
      y -= 10;
    }
  });

  // Final line after products
  y -= 5;
  drawLine(y, 0.5);

  // ============================================
  // END OF OPTION 3
  // ============================================

  // Return address at bottom
  y = margin + 20;

  const padX = 10;
  const xText = margin + padX;
  const maxTextWidth = contentWidth - padX * 2;

  y = drawWrappedText(
    page,
    `Return Address: ${sellerDetails.returnAddress || 'Majime Productions, Udhyog Vihar Bhattian, Bahadarke Road, Ludhiana, Punjab, 141008'}`,
    xText,
    y,
    maxTextWidth,
    bold,
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
        'Majime Technologies',
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
    const stringIds = orderIds.map(String);

    const chunks: string[][] = [];
    for (let i = 0; i < stringIds.length; i += 30) {
      chunks.push(stringIds.slice(i, i + 30));
    }

    const allDocs: DocumentSnapshot[] = [];
    for (const chunk of chunks) {
      const snapshot = await ordersColRef.where(admin.firestore.FieldPath.documentId(), 'in', chunk).get();
      snapshot.forEach(doc => allDocs.push(doc));
    }

    allDocs.sort((a, b) => stringIds.indexOf(a.id) - stringIds.indexOf(b.id));

    if (allDocs.length === 0) {
      return NextResponse.json({ error: 'No matching orders found' }, { status: 404 });
    }

    const pdfDoc = await PDFDocument.create();
    const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const pages: PDFPage[] = [];
    for (const d of allDocs) {
      const order = d.data();
      const page = await createSlipPage(pdfDoc, { regular: bold, bold }, order, sellerDetails);
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