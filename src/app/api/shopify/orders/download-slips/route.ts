import { NextRequest, NextResponse } from 'next/server';
import { db, auth as adminAuth } from '@/lib/firebase-admin';
import { PDFDocument, rgb, StandardFonts, PDFFont, PDFPage } from 'pdf-lib';
import bwip from 'bwip-js';

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

/* -------------------- Helpers -------------------- */
function toNumber(n: any, fallback = 0): number {
  const v = typeof n === 'string' ? Number(n) : n;
  return Number.isFinite(v) ? (v as number) : fallback;
}

function formatINRNoTrailing(n: number): string {
  // If .00, print as integer; else keep 2 decimals
  const rounded = Math.round(n * 100) / 100;
  if (Math.abs(rounded - Math.round(rounded)) < 1e-8) return String(Math.round(rounded));
  return rounded.toFixed(2);
}

function ddmmyyyy(dateish: any): string {
  // Match sample: 11/9/2025 (no leading zero on month/day)
  const d = new Date(dateish || Date.now());
  const day = d.getDate();
  const month = d.getMonth() + 1;
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

function wrapTextByWidth(text: string, maxWidth: number, font: PDFFont, size: number): string[] {
  const words = (text || '').split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    const wWidth = font.widthOfTextAtSize(test, size);
    if (wWidth <= maxWidth) {
      line = test;
    } else {
      if (line) lines.push(line);
      // If a single word is too long, hard-break it
      if (font.widthOfTextAtSize(w, size) > maxWidth) {
        let chunk = '';
        for (const ch of w) {
          const t = chunk + ch;
          if (font.widthOfTextAtSize(t, size) <= maxWidth) chunk = t;
          else {
            if (chunk) lines.push(chunk);
            chunk = ch;
          }
        }
        line = chunk;
      } else {
        line = w;
      }
    }
  }
  if (line) lines.push(line);
  return lines;
}

const drawLine = (page: PDFPage, x1: number, y1: number, x2: number, y2: number, thickness = 1) => {
  page.drawLine({
    start: { x: x1, y: y1 },
    end: { x: x2, y: y2 },
    thickness,
    color: rgb(0, 0, 0),
  });
};

const drawText = (
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  font: PDFFont,
  size: number,
  color = rgb(0, 0, 0)
) => {
  page.drawText(text, { x, y, font, size, color });
};

type Address = {
  address1?: string;
  address2?: string;
  city?: string;
  province?: string;
  country?: string;
  zip?: string;
};

function addressLinesLikeSample(addr: Address | undefined): string[] {
  if (!addr) return ['N/A'];
  const lines: string[] = [];
  if (addr.address1) lines.push(addr.address1);
  if (addr.address2) lines.push(addr.address2);

  const cityState = [addr.city, addr.province].filter(Boolean).join(', ');
  if (cityState) lines.push(cityState);
  if (addr.province) lines.push(`(${addr.province})`); // separate state in parentheses like sample
  lines.push(`PIN - ${addr.zip || ''}`);
  return lines.filter(Boolean);
}

function getHSN(item: any): string {
  // Prefer explicit HSN; fallback to SKU; fallback to line item property named HSN
  const propHSN =
    Array.isArray(item?.properties) &&
    (item.properties.find((p: any) => (p?.name || '').toLowerCase() === 'hsn')?.value ||
      item.properties.find((p: any) => (p?.name || '').toLowerCase() === 'hsn_code')?.value);
  return (item?.hsn_code || propHSN || item?.sku || 'N/A').toString();
}

/* -------------------- Page Renderer (Code-1 with Code-2 layout) -------------------- */
async function createSlipPage(
  pdfDoc: PDFDocument,
  fonts: { regular: PDFFont; bold: PDFFont },
  order: any,
  sellerDetails: { name: string; gst: string; returnAddress: string }
) {
  // A4 portrait
  const page = pdfDoc.addPage([595, 842]);
  const { width, height } = page.getSize();

  // ~10mm margins like Code-2
  const margin = 28; // ≈10mm
  const contentWidth = width - 2 * margin;

  const font = fonts.regular;
  const boldFont = fonts.bold;

  /* -------------------- Outer border (Code-2 style) -------------------- */
  page.drawRectangle({
    x: margin,
    y: margin,
    width: contentWidth,
    height: height - 2 * margin,
    borderWidth: 1,
    borderColor: rgb(0, 0, 0), // show the border
  });

  /* -------------------- Header band (bordered like Code-2) -------------------- */
  const headerH = 64; // ~25mm feel
  const headerY = height - margin - headerH;

  page.drawRectangle({
    x: margin,
    y: headerY,
    width: contentWidth,
    height: headerH,
    borderWidth: 0.5,
    borderColor: rgb(0, 0, 0),
  });

  // Left: brand, Right: courier (uppercase)
  const shipowrSize = 18;
  const courierSize = 20;
  const courierTitle = (order?.courier || '').toString().toUpperCase() || 'DELHIVERY';

  const headerBaseline = headerY + headerH - 16;
  drawText(page, 'Shipowr', margin + 6, headerBaseline, boldFont, shipowrSize);

  const courierW = boldFont.widthOfTextAtSize(courierTitle, courierSize);
  drawText(page, courierTitle, margin + contentWidth - courierW - 6, headerBaseline, boldFont, courierSize);

  /* -------------------- AWB label + centered barcode (Code-2) -------------------- */
  const awb = order?.awb || 'N/A';
  let yPos = headerY - 12;

  drawText(page, `AWB# ${awb}`, margin + 6, yPos, boldFont, 14);
  yPos -= 12;

  if (order?.awb) {
    try {
      const png = await bwip.toBuffer({
        bcid: 'code128',
        text: awb,
        scale: 3,    // crisp
        height: 15,  // a bit taller
        includetext: true, // keep human-readable inside the barcode too
        textxalign: 'center',
      });
      const barcodeImage = await pdfDoc.embedPng(png);

      // Code-2 aims ~120mm width; cap by content width
      const approx120mmInPt = 340; // 120mm ≈ 340.16pt
      const desiredW = Math.min(contentWidth - 20, approx120mmInPt);
      const intrinsicW = barcodeImage.width;
      const intrinsicH = barcodeImage.height;
      const scale = desiredW / intrinsicW;
      const drawW = desiredW;
      const drawH = intrinsicH * scale;

      const barcodeX = margin + (contentWidth - drawW) / 2;
      const barcodeY = yPos - drawH - 4;

      page.drawImage(barcodeImage, { x: barcodeX, y: barcodeY, width: drawW, height: drawH });

      // AWB number BELOW barcode, centered (explicit like Code-2)
      const awbTxtSize = 12;
      const awbTxtW = font.widthOfTextAtSize(awb, awbTxtSize);
      const awbTxtX = margin + (contentWidth - awbTxtW) / 2;
      const awbTxtY = barcodeY - 12;
      drawText(page, awb, awbTxtX, awbTxtY, font, awbTxtSize);

      yPos = awbTxtY - 12; // continue below the barcode area
    } catch (e) {
      console.error('Barcode generation failed:', e);
      drawText(page, 'Barcode failed to generate', margin + 6, yPos, font, 10, rgb(1, 0, 0));
      yPos -= 16;
    }
  } else {
    yPos -= 10;
  }

  /* -------------------- Ship-to (left) + Payment/Amount/Date (right) -------------------- */
  const customerName = `${order?.raw?.customer?.first_name || ''} ${order?.raw?.customer?.last_name || ''}`.trim();
  drawText(page, `Ship to - ${customerName || 'Customer'}`, margin + 6, yPos, boldFont, 17);
  yPos -= 14;

  // two columns like Code-2: left ~60%, right ~40%
  const leftColW = contentWidth * 0.6;
  const rightColX = margin + leftColW + 10;

  // Left column: address
  const shipAddrLines = addressLinesLikeSample(order?.raw?.shipping_address as Address);
  let addrY = yPos;
  for (const line of shipAddrLines) {
    drawText(page, line, margin + 6, addrY, font, 14); // a touch larger like Code-2
    addrY -= 12;
  }

  // Right column: payment/speed/amount/date (Code-2 phrasing)
  const paymentMode = order?.financialStatus === 'paid' ? 'Prepaid' : 'COD';
  const speed =
    order?.courier === 'Delhivery'
      ? 'Express'
      : (String(order?.courier || '').split(':')[1] || 'Express').trim();

  let rightY = yPos + 2;
  drawText(page, `${paymentMode} - ${speed}`, rightColX, rightY, font, 14);
  rightY -= 10;

  const grandTotal = toNumber(order?.totalPrice, NaN) ?? NaN;
  const grandTotalFallback = toNumber(order?.raw?.total_price, 0);
  const totalToShow = Number.isFinite(grandTotal) ? grandTotal : grandTotalFallback;

  drawText(page, `INR ${formatINRNoTrailing(totalToShow)}`, rightColX, rightY, boldFont, 16);
  rightY -= 14;

  drawText(page, `Date`, rightColX, rightY, font, 14);
  rightY -= 10;
  const created = order?.createdAt || order?.raw?.created_at || Date.now();
  drawText(page, ddmmyyyy(created), rightColX, rightY, font, 14);

  // Move main cursor below address block
  yPos = Math.min(addrY, rightY) - 10;

  /* -------------------- Seller + GST boxed row (Code-2 box) -------------------- */
  const sellerBoxH = 28;
  const sellerBoxY = yPos - sellerBoxH;

  page.drawRectangle({
    x: margin,
    y: sellerBoxY,
    width: contentWidth,
    height: sellerBoxH,
    borderWidth: 0.5,
    borderColor: rgb(0, 0, 0),
  });

  const sellerName = sellerDetails?.name || 'N/A';
  const gstIn = sellerDetails?.gst || 'N/A';

  drawText(page, `Seller: ${sellerName}`, margin + 6, sellerBoxY + sellerBoxH - 10, font, 12);
  drawText(page, `GST: ${gstIn}`, margin + 6, sellerBoxY + 8, font, 12);

  const orderName = (order?.name || '').toString().replace(/^#+/, '');
  const orderIdText = `#${orderName}`;
  const orderIdW = boldFont.widthOfTextAtSize(orderIdText, 18);
  drawText(
    page,
    orderIdText,
    margin + contentWidth - orderIdW - 6,
    sellerBoxY + sellerBoxH / 2 - 6,
    boldFont,
    18
  );

  yPos = sellerBoxY - 10;

  /* -------------------- Products table (Code-2 look) -------------------- */
  const ratios = [70, 22, 18, 30, 25, 25].map((n) => n / 190);
  const colW = ratios.map((r) => r * contentWidth);
  const colX: number[] = [margin + 6];
  for (let i = 0; i < colW.length - 1; i++) colX.push(colX[colX.length - 1] + colW[i]);

  // Header band with light fill (visible like Code-2)
  const headerRowH = 16;
  const tableHeaderY = yPos - headerRowH;

  page.drawRectangle({
    x: margin,
    y: tableHeaderY,
    width: contentWidth,
    height: headerRowH,
    color: rgb(240 / 255, 240 / 255, 240 / 255), // fill
    borderWidth: 1,
    borderColor: rgb(0, 0, 0),
  });

  // Column vertical lines
  for (let i = 1; i < colX.length; i++) {
    drawLine(page, colX[i] - 3, tableHeaderY, colX[i] - 3, tableHeaderY + headerRowH, 0.6);
  }

  // Table header text (sizes aligned to Code-2)
  drawText(page, 'Product Name', colX[0], tableHeaderY + headerRowH - 5, boldFont, 13);
  drawText(page, 'HSN', colX[1], tableHeaderY + headerRowH - 5, boldFont, 13);
  drawText(page, 'Qty.', colX[2], tableHeaderY + headerRowH - 5, boldFont, 13);
  drawText(page, 'Taxable Price', colX[3], tableHeaderY + headerRowH - 5, boldFont, 12);
  drawText(page, 'Taxes', colX[4], tableHeaderY + headerRowH - 5, boldFont, 13);
  drawText(page, 'Total', colX[5], tableHeaderY + headerRowH - 5, boldFont, 13);

  // Rows
  let rowY = tableHeaderY - 3;
  const lineItems: any[] = Array.isArray(order?.raw?.line_items) ? order.raw.line_items : [];

  for (const item of lineItems) {
    // compute values (same logic as your Code-1)
    const qty = toNumber(item?.quantity, 1);
    const unit = toNumber(item?.price, 0);
    const taxable = unit * qty;
    const tax = Array.isArray(item?.tax_lines)
      ? item.tax_lines.reduce((acc: number, t: any) => acc + toNumber(t?.price, 0), 0)
      : 0;
    const total = taxable + tax;

    // name wrapping in first col (keep your wrap logic, but match Code-2 size)
    const nameMaxW = colW[0] - 8;
    const nameLines = wrapTextByWidth(
      `${item?.title || ''}${item?.variant_title ? ` - ${item.variant_title}` : ''}`,
      nameMaxW,
      font,
      13
    );
    const lineHt = 12;
    const rowHt = Math.max(lineHt, nameLines.length * lineHt) + 4;

    // Row border box (visible)
    page.drawRectangle({
      x: margin,
      y: rowY - rowHt,
      width: contentWidth,
      height: rowHt,
      borderWidth: 0.6,
      borderColor: rgb(0, 0, 0),
    });

    // Column separators
    for (let i = 1; i < colX.length; i++) {
      drawLine(page, colX[i] - 3, rowY - rowHt, colX[i] - 3, rowY, 0.6);
    }

    // Product name multi-line, vertically centered-ish
    let nameTop = rowY - 6 + (rowHt - nameLines.length * lineHt) / 2;
    for (let i = 0; i < nameLines.length; i++) {
      drawText(page, nameLines[i], colX[0], nameTop + (nameLines.length - 1 - i) * lineHt, font, 13);
    }

    // Other columns (vertically centered-ish)
    const midBase = rowY - rowHt / 2 + 4;
    drawText(page, getHSN(item), colX[1], midBase, font, 13);
    drawText(page, String(qty), colX[2], midBase, font, 13);
    drawText(page, formatINRNoTrailing(taxable), colX[3], midBase, font, 12);
    drawText(page, formatINRNoTrailing(tax), colX[4], midBase, font, 13);
    drawText(page, formatINRNoTrailing(total), colX[5], midBase, font, 13);

    rowY -= rowHt;

    // Overflow guard: keep room for bottom return address block
    const bottomReserve = margin + 40; // ~space for return address
    if (rowY < bottomReserve) break;
  }

  /* -------------------- Bottom: Return Address (Code-2 position/padding) -------------------- */
  const returnBlockY = margin + 28; // near bottom, with comfortable padding
  const returnLabel = 'Return Address: ';
  const labelW = font.widthOfTextAtSize(returnLabel, 13);

  const raText =
    sellerDetails?.returnAddress ||
    'Udyog vihar, Street no.1, Bhattian, Bahadarke, near Indian Oil petrol pump, Ludhiana, Punjab, India, 141008';

  const raMaxW = contentWidth - 10 - labelW;
  const raLines = wrapTextByWidth(raText, raMaxW, font, 13);

  // First line continues after label
  drawText(page, returnLabel, margin + 6, returnBlockY, font, 13);
  if (raLines.length > 0) {
    drawText(page, raLines[0], margin + 6 + labelW + 2, returnBlockY, font, 13);
    let bodyY = returnBlockY - 14;
    for (let i = 1; i < raLines.length; i++) {
      drawText(page, raLines[i], margin + 6, bodyY, font, 13);
      bodyY -= 14;
    }
  }

  // Page indicator: keep to your existing second pass (“Page i of N”)

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
    // Shopify order IDs are numeric (long); we stored denormalized orderId in docs
    const numericIds = orderIds.map((id: any) => Number(id)).filter((n: number) => Number.isFinite(n));
    if (numericIds.length === 0) {
      return NextResponse.json({ error: 'No valid numeric orderIds provided' }, { status: 400 });
    }

    const orderDocs = await ordersColRef.where('orderId', 'in', numericIds).get();
    if (orderDocs.empty) {
      return NextResponse.json({ error: 'No matching orders found' }, { status: 404 });
    }

    const pdfDoc = await PDFDocument.create();
    const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const pages: PDFPage[] = [];
    for (const d of orderDocs.docs) {
      const order = d.data();
      const page = await createSlipPage(pdfDoc, { regular, bold }, order, sellerDetails);
      pages.push(page);
    }

    // Second pass: page numbering “Page i of N” bottom-right to match sample
    const totalPages = pages.length;
    pages.forEach((page, idx) => {
      const text = `Page ${idx + 1} of ${totalPages}`;
      const size = 9;
      const w = regular.widthOfTextAtSize(text, size);
      page.drawText(text, {
        x: page.getWidth() - 30 - w,
        y: 40,
        font: regular,
        size,
        color: rgb(0, 0, 0),
      });
    });

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
