import { NextRequest, NextResponse } from 'next/server';
import { db, auth as adminAuth } from '@/lib/firebase-admin';
import { DocumentSnapshot } from 'firebase-admin/firestore';
import admin from 'firebase-admin';
import { authBusinessForOrderOfTheExceptionStore, authUserForBusinessAndStore, SHARED_STORE_ID } from '@/lib/authoriseUser';
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';

// Type assertion for chromium properties that exist at runtime but not in types
const chromiumConfig = chromium as typeof chromium & {
  defaultViewport: { width: number; height: number } | null;
  headless: boolean | 'shell';
};

function ddmmyyyy(dateish: any): string {
  const d = new Date(dateish || Date.now());
  const day = d.getDate();
  const month = d.getMonth() + 1;
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

function truncateKeepTailAfterHyphen(name: string, max = 30): string {
  const s = String(name ?? '');
  if (s.length <= max) return s;

  const hyphen = s.lastIndexOf('-');
  if (hyphen === -1) {
    return s.slice(0, Math.max(0, max - 3)) + '...';
  }

  const tail = s.slice(hyphen);
  const headRoom = max - 3 - tail.length;

  if (headRoom > 0) {
    return s.slice(0, headRoom) + '...' + tail;
  }

  return '...' + tail.slice(0, max - 3);
}

function escapeHtml(text: string): string {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function generateSlipHTML(
  order: any,
  sellerDetails: { name: string; gst: string; returnAddress: string }
): string {
  const shipTo = order.raw?.shipping_address || {};
  const customerName = shipTo.name || 'Customer';
  const addressLine1 = shipTo.address1 || '';
  const addressLine2 = shipTo.address2 || '';
  const city = shipTo.city || '';
  const state = shipTo.province || '';
  const country = shipTo.country || 'India';
  const pincode = shipTo.zip || '';
  const phone = shipTo.phone || '';

  const awbNumber = order.awb || `276468${Date.now().toString().slice(-10)}`;
  const orderNumber = order.name || `#${order.orderId || 'N/A'}`;
  const orderDate = ddmmyyyy(order.createdAt);

  const paymentMethod = order.raw?.payment_gateway_names?.join(',').toLowerCase().includes('cod') ? 'COD' : 'Prepaid';
  const shippingMode = order?.courier === 'Delhivery'
    ? order?.shippingMode || 'Surface/Express'
    : (String(order?.courier || '').split(':')[1] || 'Express').trim();

  const lineItems = order.raw?.line_items || [];

  const productRows = lineItems.map((item: any) => {
    const productName = item.name || item.title || 'Product';
    const quantity = item.quantity || 1;
    const hsn = item.hsn || '6109';
    const total = (parseFloat(item.price) * quantity).toFixed(2);
    const price = (Number(total) * (100 / 105)).toFixed(2);
    const taxAmount = (Number(total) - Number(price)).toFixed(2);

    return `
      <tr>
        <td class="product-name">${escapeHtml(truncateKeepTailAfterHyphen(productName, 35))}</td>
        <td>${escapeHtml(hsn)}</td>
        <td>${quantity}</td>
        <td>₹${price}</td>
        <td>₹${taxAmount}</td>
        <td>₹${total}</td>
      </tr>
    `;
  }).join('');

  return `
    <div class="slip">
      <!-- Header -->
      <div class="header">
        <div class="courier-name">${escapeHtml(String(order?.courier || 'COURIER').toUpperCase())}</div>
      </div>
      
      <div class="divider"></div>
      
      <!-- AWB Section -->
      <div class="awb-section">
        <div class="awb-label">AWB# ${escapeHtml(awbNumber)}</div>
      </div>
      
      <!-- Barcode -->
      <div class="barcode-container">
        <svg class="barcode" id="barcode-${escapeHtml(awbNumber)}"></svg>
      </div>
      
      <!-- Ship To & Payment Info -->
      <div class="ship-payment-row">
        <div class="ship-to">
          <div class="ship-to-header">Ship to - ${escapeHtml(customerName)}</div>
          <div class="address-line">${escapeHtml(addressLine1)}</div>
          ${addressLine2 ? `<div class="address-line">${escapeHtml(addressLine2)}</div>` : ''}
          <div class="address-line">${escapeHtml(city)}</div>
          <div class="address-line">${escapeHtml(state)}${state && country ? ', ' : ''}${escapeHtml(country)}</div>
          ${pincode ? `<div class="address-line pin">PIN - ${escapeHtml(pincode)}</div>` : ''}
          ${phone ? `<div class="address-line phone">Phone: ${escapeHtml(phone)}</div>` : ''}
        </div>
        <div class="payment-info">
          <div class="payment-type">${escapeHtml(paymentMethod)} - ${escapeHtml(shippingMode)}</div>
          <div class="payment-amount">INR ${escapeHtml(order.raw?.total_price || '0')}</div>
          <div class="date-section">
            <div class="date-label">Date</div>
            <div class="date-value">${escapeHtml(orderDate)}</div>
          </div>
        </div>
      </div>
      
      <div class="divider"></div>
      
      <!-- Seller Details -->
      <div class="seller-row">
        <div class="seller-info">
          <div class="seller-name">Seller: ${escapeHtml(sellerDetails.name)}</div>
          <div class="seller-gst">GST: ${escapeHtml(sellerDetails.gst)}</div>
        </div>
        <div class="order-number">${escapeHtml(orderNumber)}</div>
      </div>
      
      <div class="divider"></div>
      
      <!-- Product Table -->
      <table class="product-table">
        <thead>
          <tr>
            <th class="product-name-header">Product Name</th>
            <th>HSN</th>
            <th>Qty.</th>
            <th>Taxable Price</th>
            <th>Taxes</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          ${productRows}
        </tbody>
      </table>
      
      <!-- Return Address -->
      <div class="return-address">
        Return Address: ${escapeHtml(sellerDetails.returnAddress)}
      </div>
    </div>
  `;
}

function generateFullHTML(orders: any[], sellerDetails: { name: string; gst: string; returnAddress: string }): string {
  const slips = orders.map(order => generateSlipHTML(order, sellerDetails)).join('');

  // Collect all AWB numbers for barcode generation
  const awbNumbers = orders.map(order => order.awb || `276468${Date.now().toString().slice(-10)}`);

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Tamil:wght@400;700&family=Noto+Sans+Devanagari:wght@400;700&family=Noto+Sans+Bengali:wght@400;700&family=Noto+Sans+Telugu:wght@400;700&family=Noto+Sans+Kannada:wght@400;700&family=Noto+Sans+Malayalam:wght@400;700&family=Noto+Sans+Gujarati:wght@400;700&family=Noto+Sans+Gurmukhi:wght@400;700&family=Noto+Sans+Oriya:wght@400;700&family=Noto+Sans:wght@400;700&display=swap');
        
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        
        body {
          font-family: 'Noto Sans', 'Noto Sans Tamil', 'Noto Sans Devanagari', 'Noto Sans Bengali', 'Noto Sans Telugu', 'Noto Sans Kannada', 'Noto Sans Malayalam', 'Noto Sans Gujarati', 'Noto Sans Gurmukhi', 'Noto Sans Oriya', sans-serif;
          font-size: 14px;
          line-height: 1.4;
          color: #000;
          background-color: #fff;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-direction: column;
        }
        
        @page {
          size: A4;
          margin: 0;
        }
        
        .slip {
          width: 750px;
          min-height: 1070px;
          padding: 20px;
          page-break-after: always;
          position: relative;
          border: 2px solid #000;
          margin: 0 auto;
          margin-top: 25px;
        }
        
        .slip:last-child {
          page-break-after: auto;
        }
        
        .header {
          margin-bottom: 12px;
        }
        
        .courier-name {
          font-size: 28px;
          font-weight: 700;
        }
        
        .divider {
          border-top: 1.5px solid #000;
          margin: 12px 0;
        }
        
        .awb-section {
          margin: 18px 0 12px 0;
        }
        
        .awb-label {
          font-size: 20px;
          font-weight: 700;
        }
        
        .barcode-container {
          scale: 1.1;
          transform: scaleY(1.1);
          text-align: center;
          margin: 20px 0 25px 0;
        }
        
        .barcode {
          max-width: 380px;
          height: 100px;
        }
        
        .ship-payment-row {
          display: flex;
          justify-content: space-between;
          margin: 20px 0;
        }
        
        .ship-to {
          flex: 1;
          max-width: 62%;
        }
        
        .ship-to-header {
          font-size: 22px;
          font-weight: 700;
          margin-bottom: 12px;
        }
        
        .address-line {
          font-size: 18px;
          font-weight: 700;
          margin-bottom: 6px;
          line-height: 1.4;
        }
        
        .address-line.pin {
          margin-top: 8px;
        }
        
        .address-line.phone {
          margin-top: 6px;
          font-size: 17px;
        }
        
        .payment-info {
          text-align: right;
          min-width: 180px;
        }
        
        .payment-type {
          font-size: 20px;
          font-weight: 700;
          margin-bottom: 8px;
        }
        
        .payment-amount {
          font-size: 22px;
          font-weight: 700;
          margin-bottom: 20px;
        }
        
        .date-section {
          margin-top: 15px;
        }
        
        .date-label {
          font-size: 17px;
          font-weight: 700;
        }
        
        .date-value {
          font-size: 17px;
          font-weight: 700;
        }
        
        .seller-row {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin: 12px 0;
        }
        
        .seller-info {
          flex: 1;
        }
        
        .seller-name {
          font-size: 18px;
          font-weight: 700;
          margin-bottom: 6px;
        }
        
        .seller-gst {
          font-size: 16px;
          font-weight: 700;
        }
        
        .order-number {
          font-size: 20px;
          font-weight: 700;
        }
        
        .product-table {
          width: 100%;
          border-collapse: collapse;
          margin: 18px 0;
          font-size: 16px;
        }
        
        .product-table th {
          text-align: left;
          font-weight: 700;
          padding: 10px 6px;
          border-bottom: 1.5px solid #000;
          font-size: 16px;
        }
        
        .product-table td {
          padding: 10px 6px;
          font-weight: 900;
          vertical-align: top;
          font-size: 16.5px;
        }
        
        .product-table .product-name,
        .product-table .product-name-header {
          width: 38%;
        }
        
        .return-address {
          position: absolute;
          bottom: 20px;
          left: 20px;
          right: 20px;
          font-size: 16px;
          font-weight: 700;
          line-height: 1.4;
        }
      </style>
      
      <!-- JsBarcode library for barcode generation -->
      <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"></script>
    </head>
    <body>
      ${slips}
      
      <script>
        // Generate barcodes for all AWB numbers
        document.querySelectorAll('.barcode').forEach(svg => {
          const awb = svg.id.replace('barcode-', '');
          if (awb) {
            try {
              JsBarcode(svg, awb, {
                format: "CODE128",
                width: 2.5,
                height: 80,
                displayValue: true,
                fontSize: 18,
                margin: 10,
                textMargin: 8
              });
            } catch (e) {
              console.error('Barcode error:', e);
            }
          }
        });
      </script>
    </body>
    </html>
  `;
}

async function generatePDFWithPuppeteer(htmlContent: string): Promise<Buffer> {
  const browser = await puppeteer.launch({
    args: chromiumConfig.args,
    defaultViewport: chromiumConfig.defaultViewport,
    executablePath: await chromiumConfig.executablePath(),
    headless: chromiumConfig.headless,
  });

  try {
    const page = await browser.newPage();

    // Set content and wait for fonts and scripts to load
    await page.setContent(htmlContent, {
      waitUntil: ['networkidle0', 'domcontentloaded'],
      timeout: 30000,
    });

    // Wait a bit more to ensure barcodes are rendered
    await page.waitForFunction(() => {
      const barcodes = document.querySelectorAll('.barcode');
      return Array.from(barcodes).every(bc => bc.childNodes.length > 0);
    }, { timeout: 5000 }).catch(() => {
      // Continue even if barcode wait times out
      console.log('Barcode rendering timeout - continuing anyway');
    });

    // Generate PDF
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    });

    return Buffer.from(pdfBuffer);
  } finally {
    await browser.close();
  }
}

/* -------------------- Handler -------------------- */
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

    const sellerDetails = {
      name:
        businessData?.companyName ||
        businessData?.businessName ||
        businessData?.primaryContact?.name ||
        '-',
      gst: businessData?.gstin || businessData?.gst || '-',
      returnAddress: [
        businessData?.companyAddress?.address,
        businessData?.companyAddress?.city,
        businessData?.companyAddress?.state,
        businessData?.companyAddress?.pincode,
        businessData?.companyAddress?.country,
      ]
        .filter(Boolean)
        .join(', '),
    };

    const { shopDoc } = result;
    const ordersColRef = shopDoc?.ref.collection('orders');
    const stringIds = orderIds.map(String);

    // Chunking logic to handle Firestore's 30-item limit for 'in' queries
    const chunks: string[][] = [];
    for (let i = 0; i < stringIds.length; i += 30) {
      chunks.push(stringIds.slice(i, i + 30));
    }

    const allDocs: DocumentSnapshot[] = [];
    for (const chunk of chunks) {
      const snapshot = await ordersColRef?.where(admin.firestore.FieldPath.documentId(), 'in', chunk).get();
      snapshot?.forEach(doc => allDocs.push(doc));
    }

    // Re-sort the documents to match the original orderIds array
    allDocs.sort((a, b) => stringIds.indexOf(a.id) - stringIds.indexOf(b.id));

    if (allDocs.length === 0) {
      return NextResponse.json({ error: 'No matching orders found' }, { status: 404 });
    }

    // Filter orders based on authorization
    const authorizedOrders: any[] = [];
    for (const d of allDocs) {
      const order = d.data();
      if (shop === SHARED_STORE_ID) {
        const vendorName = businessData?.vendorName;
        const vendors = order?.vendors;
        const canProcess = authBusinessForOrderOfTheExceptionStore({ businessId, vendorName, vendors });
        if (!canProcess.authorised) {
          continue;
        }
      }
      authorizedOrders.push(order);
    }

    if (authorizedOrders.length === 0) {
      return NextResponse.json({ error: 'No authorized orders found' }, { status: 404 });
    }

    // Generate HTML and PDF
    const htmlContent = generateFullHTML(authorizedOrders, sellerDetails);
    const pdfBytes = await generatePDFWithPuppeteer(htmlContent);

    return new NextResponse(new Uint8Array(pdfBytes), {
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