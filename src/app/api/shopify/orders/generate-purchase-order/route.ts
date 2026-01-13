import { NextRequest, NextResponse } from 'next/server';
import { db, auth as adminAuth } from '@/lib/firebase-admin';
import { authBusinessForOrderOfTheExceptionStore, authUserForBusinessAndStore } from '@/lib/authoriseUser';
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import { SHARED_STORE_IDS } from '@/lib/shared-constants';

// Type assertion for chromium properties that exist at runtime but not in types
const chromiumConfig = chromium as typeof chromium & {
  defaultViewport: { width: number; height: number } | null;
  headless: boolean | 'shell';
};

function escapeHtml(text: string): string {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function generatePurchaseOrderHTML(
  vendor: string,
  poNumber: string,
  items: { name: string; quantity: number }[],
  totalPcs: number
): string {
  const dateStr = new Date().toLocaleDateString('en-GB');

  const itemRows = items
    .map(
      (item, index) => `
      <tr>
        <td class="center">${index + 1}</td>
        <td>${escapeHtml(item.name)}</td>
        <td class="center">${item.quantity}</td>
      </tr>
    `
    )
    .join('');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;700&display=swap');
        
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        
        body {
          font-family: 'Noto Sans', sans-serif;
          font-size: 12px;
          color: #000;
          padding: 50px;
        }
        
        @page {
          size: A4;
          margin: 0;
        }
        
        .container {
          width: 100%;
          max-width: 495px;
          margin: 0 auto;
        }
        
        .header {
          background-color: #4472C4;
          color: white;
          text-align: center;
          padding: 10px;
          font-size: 20px;
          font-weight: bold;
          border: 1px solid #000;
        }
        
        .info-table {
          width: 100%;
          border-collapse: collapse;
        }
        
        .info-table td {
          border: 1px solid #000;
          padding: 6px 8px;
          font-size: 12px;
        }
        
        .info-table .label {
          font-weight: bold;
          width: 50%;
        }
        
        .sign-row {
          border: 1px solid #000;
          padding: 6px 8px;
          text-align: right;
          font-weight: bold;
          font-size: 12px;
        }
        
        .items-table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 10px;
        }
        
        .items-table th,
        .items-table td {
          border: 1px solid #000;
          padding: 6px 8px;
          font-size: 11px;
        }
        
        .items-table th {
          font-weight: bold;
          text-align: left;
        }
        
        .items-table .center {
          text-align: center;
        }
        
        .items-table th:first-child {
          width: 60px;
        }
        
        .items-table th:last-child {
          width: 80px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">Purchase Order</div>
        
        <table class="info-table">
          <tr>
            <td class="label">Po. No.</td>
            <td>${escapeHtml(vendor)}-${escapeHtml(poNumber)}</td>
          </tr>
          <tr>
            <td class="label">Date</td>
            <td>${escapeHtml(dateStr)}</td>
          </tr>
          <tr>
            <td class="label">Total Pcs</td>
            <td>${totalPcs}</td>
          </tr>
        </table>
        
        <div class="sign-row">Sign.</div>
        
        <table class="items-table">
          <thead>
            <tr>
              <th class="center">Sr. No.</th>
              <th>Item SKU</th>
              <th class="center">Qty</th>
            </tr>
          </thead>
          <tbody>
            ${itemRows}
          </tbody>
        </table>
      </div>
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

    await page.setContent(htmlContent, {
      waitUntil: ['networkidle0', 'domcontentloaded'],
      timeout: 30000,
    });

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    });

    return Buffer.from(pdfBuffer);
  } finally {
    await browser.close();
  }
}

export async function POST(req: NextRequest) {
  try {
    const { businessId, shop, vendor, poNumber, orderIds } = await req.json();

    if (!businessId || !shop || !vendor || !poNumber || !Array.isArray(orderIds) || orderIds.length === 0) {
      return NextResponse.json(
        { error: 'Missing params in the body' },
        { status: 400 }
      );
    }

    const result = await authUserForBusinessAndStore({ businessId, shop, req });

    const businessData = result.businessDoc?.data();

    if (!result.authorised) {
      const { error, status } = result;
      return NextResponse.json({ error }, { status });
    }

    const ordersColRef = db.collection('accounts').doc(shop).collection('orders');

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

      if (SHARED_STORE_IDS.includes(shop)) {
        const vendorName = businessData?.vendorName;
        const vendors = order?.vendors;
        const canProcess = authBusinessForOrderOfTheExceptionStore({ businessId, vendorName, vendors });
        if (!canProcess.authorised) {
          return;
        }
      }

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

    // Generate HTML and PDF
    const htmlContent = generatePurchaseOrderHTML(vendor, poNumber, items, totalPcs);
    const pdfBuffer = await generatePDFWithPuppeteer(htmlContent);

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="PO-${vendor}-${poNumber}.pdf"`,
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