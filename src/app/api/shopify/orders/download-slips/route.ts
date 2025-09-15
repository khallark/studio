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

/* -------------------- Page Renderer -------------------- */
async function createSlipPage(
  pdfDoc: PDFDocument,
  fonts: { regular: PDFFont; bold: PDFFont },
  order: any,
  sellerDetails: { name: string; gst: string; returnAddress: string }
) {
  const page = pdfDoc.addPage([595, 842]); // A4 portrait
  const { width, height } = page.getSize();
  const margin = 30;

  const font = fonts.regular;
  const boldFont = fonts.bold;

  // Header row: "Shipowr" (left)  +  Courier (right, uppercase)
  let headerY = height - 40;
  drawText(page, 'Shipowr', margin, headerY, boldFont, 16);

  const courierTitle = (order?.courier || '').toString().toUpperCase() || 'DELIVERY';
  const courierW = boldFont.widthOfTextAtSize(courierTitle, 16);
  drawText(page, courierTitle, width - margin - courierW, headerY, boldFont, 16);

  drawLine(page, margin, headerY - 15, width - margin, headerY - 15, 1.5);

  // AWB label + barcode (big, with human-readable text)
  const awb = order?.awb || 'N/A';
  drawText(page, `AWB# ${awb}`, margin, headerY - 35, font, 12);

  if (order?.awb) {
    try {
      const png = await bwip.toBuffer({
        bcid: 'code128',
        text: awb,
        scale: 3, // fine resolution
        height: 15,
        includetext: true,
        textxalign: 'center',
      });
      const barcodeImage = await pdfDoc.embedPng(png);
      // Bigger to match sample feel
      page.drawImage(barcodeImage, {
        x: margin,
        y: headerY - 110,
        width: 320,
        height: 70,
      });
    } catch (e) {
      console.error('Barcode generation failed:', e);
      drawText(page, 'Barcode failed to generate', margin, headerY - 70, font, 10, rgb(1, 0, 0));
    }
  }

  // Ship-to block (bold name + address, with state in parentheses, then PIN)
  const customerName = `${order?.raw?.customer?.first_name || ''} ${order?.raw?.customer?.last_name || ''}`.trim();
  drawText(page, `Ship to - ${customerName || 'Customer'}`, margin, height - 160, boldFont, 14);

  const shipAddrLines = addressLinesLikeSample(order?.raw?.shipping_address as Address);
  let y = height - 180;
  for (const line of shipAddrLines) {
    drawText(page, line, margin, y, font, 11);
    y -= 15;
  }

  // Payment mode + shipping speed + big amount + date
  const paymentMode = order?.financialStatus === 'paid' ? 'Prepaid' : 'COD';
  const speed = order?.courier === 'Delhivery' ? 'Express' : (String(order?.courier || '').split(':')[1] || 'Express').trim();

  const rightBlockX = width / 2 + 50;
  drawText(page, `${paymentMode} - ${speed}`, rightBlockX, height - 160, font, 12);

  const grandTotal =
    toNumber(order?.totalPrice, NaN) ?? NaN; // prefer your denormalized field
  const grandTotalFallback = toNumber(order?.raw?.total_price, 0);
  const totalToShow = Number.isFinite(grandTotal) ? grandTotal : grandTotalFallback;

  drawText(page, `INR ${formatINRNoTrailing(totalToShow)}`, rightBlockX, height - 180, boldFont, 18);

  drawText(page, `Date`, rightBlockX, height - 200, font, 11);
  const created = order?.createdAt || order?.raw?.created_at || Date.now();
  drawText(page, ddmmyyyy(created), rightBlockX, height - 215, font, 11);

  drawLine(page, margin, height - 250, width - margin, height - 250);

  // Seller info (left) + order name (right)
  const sellerName = sellerDetails?.name || 'N/A';
  const gstIn = sellerDetails?.gst || 'N/A';
  drawText(page, `Seller: ${sellerName}`, margin, height - 270, font, 11);
  drawText(page, `GST: ${gstIn}`, margin, height - 285, font, 11);

  const orderName = (order?.name || '').toString();
  const orderNameW = boldFont.widthOfTextAtSize(orderName, 14);
  drawText(page, orderName, Math.max(margin, width - margin - orderNameW), height - 270, boldFont, 14);

  drawLine(page, margin, height - 305, width - margin, height - 305);

  // Products table — columns aligned like sample
  const headers = ['Product Name', 'HSN', 'Qty.', 'Taxable Price', 'Taxes', 'Total'];
  const colX = [margin, 300, 350, 420, 485, 540]; // tuned for A4 and sample’s spacing

  headerY = height - 325;
  headers.forEach((h, i) => drawText(page, h, colX[i], headerY, boldFont, 10));
  drawLine(page, margin, headerY - 8, width - margin, headerY - 8);

  let rowY = headerY - 25;

  const lineItems: any[] = Array.isArray(order?.raw?.line_items) ? order.raw.line_items : [];
  for (const item of lineItems) {
    const qty = toNumber(item?.quantity, 1);
    const unit = toNumber(item?.price, 0);
    const taxable = unit * qty;
    const tax = Array.isArray(item?.tax_lines)
      ? item.tax_lines.reduce((acc: number, t: any) => acc + toNumber(t?.price, 0), 0)
      : 0;
    const total = taxable + tax;

    // Product title may be long: wrap within (colX[1] - colX[0] - 8)
    const nameWidth = colX[1] - colX[0] - 10;
    const nameLines = wrapTextByWidth(item?.title || '', nameWidth, font, 10);
    const lineHeight = 14;

    // Draw first line with columns; subsequent name lines span only first column
    drawText(page, nameLines[0] || '', colX[0], rowY, font, 10);
    drawText(page, getHSN(item), colX[1], rowY, font, 10);
    // Slight nudge to center-ish qty like sample
    drawText(page, String(qty), colX[2] + 8, rowY, font, 10);
    drawText(page, formatINRNoTrailing(taxable), colX[3], rowY, font, 10);
    drawText(page, formatINRNoTrailing(tax), colX[4], rowY, font, 10);
    drawText(page, formatINRNoTrailing(total), colX[5], rowY, font, 10);

    // Additional wrapped lines for product name only
    for (let i = 1; i < nameLines.length; i++) {
      rowY -= lineHeight;
      drawText(page, nameLines[i], colX[0], rowY, font, 10);
    }

    rowY -= 20;
    // (basic overflow guard)
    if (rowY < 100) break;
  }

  // Return address (wrapped)
  const returnLabel = 'Return Address: ';
  const raX = margin;
  const raY = 60;
  const maxRAWidth = width - margin - raX;

  const raText = sellerDetails?.returnAddress || 'Return address not configured.';
  const raLines = wrapTextByWidth(raText, maxRAWidth - font.widthOfTextAtSize(returnLabel, 9), font, 9);

  drawText(page, returnLabel, raX, raY, font, 9);
  // print wrapped body right after label, then subsequent lines starting at raX
  if (raLines.length > 0) {
    drawText(page, raLines[0], raX + font.widthOfTextAtSize(returnLabel, 9) + 2, raY, font, 9);
    let bodyY = raY - 12;
    for (let i = 1; i < raLines.length; i++) {
      drawText(page, raLines[i], raX, bodyY, font, 9);
      bodyY -= 12;
    }
  }

  // NOTE: page numbering will be drawn in a second pass so it reads “Page i of N”
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
