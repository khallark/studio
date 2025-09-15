
import { NextRequest, NextResponse } from 'next/server';
import { db, auth as adminAuth } from '@/lib/firebase-admin';
import { PDFDocument, rgb, StandardFonts, PDFFont } from 'pdf-lib';
import bwip from 'bwip-js';

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

const formatAddress = (address: any): string[] => {
    if (!address) return ['N/A'];
    const parts = [
        address.address1,
        address.address2,
        `${address.city}, ${address.province}`,
        address.country,
        `PIN - ${address.zip}`,
    ];
    return parts.filter(Boolean);
};

const drawLine = (page: any, x1: number, y1: number, x2: number, y2: number, thickness = 1) => {
    page.drawLine({
        start: { x: x1, y: y1 },
        end: { x: x2, y: y2 },
        thickness: thickness,
        color: rgb(0, 0, 0),
    });
};

const drawText = (page: any, text: string, x: number, y: number, font: PDFFont, size: number, color = rgb(0, 0, 0)) => {
    page.drawText(text, { x, y, font, size, color });
};

async function createSlipPage(pdfDoc: PDFDocument, order: any, sellerDetails: any) {
    const page = pdfDoc.addPage([595, 842]); // A4 size
    const { width, height } = page.getSize();
    const margin = 30;

    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // Header
    drawText(page, 'Shipowr', margin, height - 40, boldFont, 16);
    drawText(page, (order.courier).toUpperCase(), width - margin - 80, height - 40, boldFont, 16);
    drawLine(page, margin, height - 55, width - margin, height - 55, 1.5);

    // AWB & Barcode
    const awb = order.awb || 'N/A';
    drawText(page, `AWB# ${awb}`, margin, height - 75, font, 12);
    
    if (order.awb) {
        try {
            const png = await bwip.toBuffer({
                bcid: 'code128',
                text: awb,
                scale: 3,
                height: 15,
                includetext: true,
                textxalign: 'center',
            });
            const barcodeImage = await pdfDoc.embedPng(png);
            page.drawImage(barcodeImage, {
                x: margin,
                y: height - 130,
                width: 250,
                height: 50,
            });
        } catch (e) {
            console.error('Barcode generation failed:', e);
            drawText(page, 'Barcode failed to generate', margin, height - 110, font, 10, rgb(1, 0, 0));
        }
    }
    
    // Ship to & Payment
    const customerName = `${order.raw.customer?.first_name || ''} ${order.raw.customer?.last_name || ''}`.trim();
    drawText(page, `Ship to - ${customerName}`, margin, height - 160, boldFont, 14);
    const shippingAddressLines = formatAddress(order.raw.shipping_address);
    let currentY = height - 180;
    shippingAddressLines.forEach(line => {
        drawText(page, line, margin, currentY, font, 11);
        currentY -= 15;
    });

    drawText(page, `${order.financialStatus === 'paid' ? 'Prepaid' : 'COD'} - ${order.courier === 'Delhivery' ? 'Express' : String(order.courier).split(':')[1].trim()}`, width / 2 + 50, height - 160, font, 12);
    drawText(page, `${order.currency} ${order.totalPrice.toFixed(2)}`, width / 2 + 50, height - 180, boldFont, 16);
    drawText(page, `Date`, width / 2 + 50, height - 200, font, 11);
    drawText(page, new Date(order.createdAt).toLocaleDateString('en-GB'), width / 2 + 50, height - 215, font, 11);

    drawLine(page, margin, height - 250, width - margin, height - 250);

    // Seller Info
    drawText(page, `Seller: ${sellerDetails.name || 'N/A'}`, margin, height - 270, font, 11);
    drawText(page, `GST: ${sellerDetails.gst || 'N/A'}`, margin, height - 285, font, 11);
    drawText(page, `${order.name}`, width - margin - 100, height - 270, boldFont, 14);

    drawLine(page, margin, height - 305, width - margin, height - 305);

    // Products Table
    let tableY = height - 325;
    const tableHeaderY = tableY;
    const tableHeaders = ['Product Name', 'HSN', 'Qty.', 'Taxable Price', 'Taxes', 'Total'];
    const colX = [margin, 300, 350, 400, 470, 520];
    
    tableHeaders.forEach((header, i) => drawText(page, header, colX[i], tableHeaderY, boldFont, 10));
    drawLine(page, margin, tableHeaderY - 8, width - margin, tableHeaderY - 8);
    
    tableY -= 25;
    
    order.raw.line_items.forEach((item: any) => {
        const tax = item.tax_lines.reduce((acc: number, tax: any) => acc + parseFloat(tax.price), 0);
        const taxable = item.price * item.quantity;
        
        drawText(page, item.title, colX[0], tableY, font, 10);
        drawText(page, item.sku || 'N/A', colX[1], tableY, font, 10);
        drawText(page, item.quantity.toString(), colX[2] + 10, tableY, font, 10);
        drawText(page, taxable.toFixed(2), colX[3], tableY, font, 10);
        drawText(page, tax.toFixed(2), colX[4], tableY, font, 10);
        drawText(page, (taxable + tax).toFixed(2), colX[5], tableY, font, 10);
        tableY -= 20;
    });

    // Footer
    const returnAddress = sellerDetails.returnAddress || 'Return address not configured.';
    drawText(page, `Return Address: ${returnAddress}`, margin, 60, font, 9);
    drawText(page, 'Page 1 of 1', width - margin - 60, 40, font, 9);
}


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
    const accountData = accountDoc.data();
    const sellerDetails = {
        name: accountData?.primaryContact?.name || 'You have your name in setting > Store Details > Primary Contact',
        gst: 'NOT_CONFIGURED', // Placeholder
        returnAddress: `${accountData?.companyAddress?.address}, ${accountData?.companyAddress?.city}, ${accountData?.companyAddress?.state}, ${accountData?.companyAddress?.pincode}`,
    };

    const ordersColRef = accountRef.collection('orders');
    const orderDocs = await ordersColRef.where('orderId', 'in', orderIds.map(id => Number(id))).get();

    if (orderDocs.empty) {
        return NextResponse.json({ error: 'No matching orders found' }, { status: 404 });
    }
    
    const pdfDoc = await PDFDocument.create();
    
    for (const doc of orderDocs.docs) {
        await createSlipPage(pdfDoc, doc.data(), sellerDetails);
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
