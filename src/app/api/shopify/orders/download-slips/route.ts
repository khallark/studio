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
  page.drawText('Shipowr', {
    x: margin + 10,
    y,
    font: bold,
    size: 16,
    color: rgb(0, 0, 0),
  });

  page.drawText('DELHIVERY', {
    x: width - margin - 120,
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
  page.drawText(`AWB# ${awbNumber}`, {
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
      scale: 3,
      height: 15,
      includetext: true,
      textxalign: 'center',
    });
    
    const barcodeImage = await pdfDoc.embedPng(barcodeBuffer);
    const barcodeWidth = 200;
    const barcodeHeight = 60;
    
    page.drawImage(barcodeImage, {
      x: (width - barcodeWidth) / 2,
      y,
      width: barcodeWidth,
      height: barcodeHeight,
    });
  } catch (error) {
    console.error('Barcode generation failed:', error);
    // Fallback: draw AWB number as text
    page.drawText(awbNumber, {
      x: (width - regular.widthOfTextAtSize(awbNumber, 14)) / 2,
      y: y + 30,
      font: bold,
      size: 14,
      color: rgb(0, 0, 0),
    });
  }

  // Ship to section
  y -= 40;
  const shipTo = order.shippingAddress || {};
  const customerName = shipTo.name || 'Customer';
  const addressLine1 = shipTo.address1 || '';
  const addressLine2 = shipTo.address2 || '';
  const city = shipTo.city || '';
  const state = shipTo.province || '';
  const country = shipTo.country || 'India';
  const pincode = shipTo.zip || '';

  page.drawText(`Ship to - ${customerName}`, {
    x: margin + 10,
    y,
    font: bold,
    size: 12,
    color: rgb(0, 0, 0),
  });

  // COD and amount on the right
  const isCOD = order.paymentMethod === 'COD' || order.financialStatus === 'pending';
  const totalAmount = order.totalPrice || order.total || '0';
  
  if (isCOD) {
    page.drawText('COD - Express', {
      x: width - margin - 150,
      y,
      font: regular,
      size: 11,
      color: rgb(0, 0, 0),
    });
    
    y -= 20;
    page.drawText(`INR ${totalAmount}`, {
      x: width - margin - 150,
      y,
      font: bold,
      size: 13,
      color: rgb(0, 0, 0),
    });
  }

  // Address details
  y -= 20;
  const addressParts = [
    addressLine1,
    addressLine2,
    city,
    state && country ? `${state}, ${country}` : state || country,
  ].filter(Boolean);

  addressParts.forEach((line) => {
    page.drawText(line, {
      x: margin + 10,
      y,
      font: regular,
      size: 10,
      color: rgb(0, 0, 0),
    });
    y -= 15;
  });

  // PIN code
  if (pincode) {
    page.drawText(`PIN - ${pincode}`, {
      x: margin + 10,
      y,
      font: regular,
      size: 10,
      color: rgb(0, 0, 0),
    });
  }

  // Date on the right
  const orderDate = order.createdAt || new Date().toLocaleDateString('en-GB');
  page.drawText('Date', {
    x: width - margin - 150,
    y: y + 30,
    font: regular,
    size: 10,
    color: rgb(0, 0, 0),
  });
  page.drawText(orderDate, {
    x: width - margin - 150,
    y: y + 15,
    font: regular,
    size: 10,
    color: rgb(0, 0, 0),
  });

  // Horizontal line before seller section
  y -= 30;
  drawLine(y, 1);

  // Seller details section
  y -= 25;
  page.drawText(`Seller: ${sellerDetails.name}`, {
    x: margin + 10,
    y,
    font: regular,
    size: 11,
    color: rgb(0, 0, 0),
  });

  // Order number on the right
  const orderNumber = order.name || `#${order.orderId || 'N/A'}`;
  page.drawText(orderNumber, {
    x: width - margin - 150,
    y,
    font: bold,
    size: 12,
    color: rgb(0, 0, 0),
  });

  // GST number
  y -= 20;
  page.drawText(`GST: ${sellerDetails.gst}`, {
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
    page.drawText(header, {
      x: xPos,
      y,
      font: bold,
      size: 10,
      color: rgb(0, 0, 0),
    });
    xPos += colWidths[i];
  });

  // Horizontal line after header
  y -= 15;
  drawLine(y, 0.5);

  // Product items
  const lineItems = order.raw.lineItems || [];
  y -= 20;
  
  lineItems.forEach((item: any) => {
    xPos = margin + 10;
    
    const productName = item.name || item.title || 'Product';
    const hsn = item.hsn || '6109';
    const quantity = item.quantity || 1;
    const price = item.price || '0.00';
    const taxAmount = item.taxLines?.reduce((sum: number, tax: any) => sum + (parseFloat(tax.price) || 0), 0) || 0;
    const total = (parseFloat(price) * quantity + taxAmount).toFixed(2);

    const rowData = [
      productName.length > 30 ? productName.substring(0, 30) + '...' : productName,
      hsn,
      quantity.toString(),
      price,
      taxAmount.toFixed(2),
      total,
    ];

    rowData.forEach((data, i) => {
      page.drawText(data, {
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

  // Return address at bottom
  y = margin + 80;
  page.drawText(`Return Address: ${sellerDetails.returnAddress}`, {
    x: margin + 10,
    y,
    font: regular,
    size: 9,
    color: rgb(0, 0, 0),
  });

  // Note: Page numbering is handled in the main function after all pages are created

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
