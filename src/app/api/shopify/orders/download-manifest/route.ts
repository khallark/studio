import { NextRequest, NextResponse } from 'next/server';
import { db, auth as adminAuth } from '@/lib/firebase-admin';
import { DocumentSnapshot } from 'firebase-admin/firestore';
import admin from 'firebase-admin';
import { authBusinessForOrderOfTheExceptionStore, authUserForBusinessAndStore } from '@/lib/authoriseUser';
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import { SHARED_STORE_IDS } from '@/lib/shared-constants';

const chromiumConfig = chromium as typeof chromium & {
  defaultViewport: { width: number; height: number } | null;
  headless: boolean | 'shell';
};

function ddmmyyyy(dateish: any): string {
  const d = new Date(dateish || Date.now());
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
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

interface ManifestOrder {
  sNo: number;
  orderName: string;
  awb: string;
  courier: string;
  customerName: string;
  city: string;
  state: string;
  pincode: string;
  items: number;
  paymentMode: string;
  codAmount: string;
  totalPrice: string;
}

function buildManifestRows(orders: any[]): ManifestOrder[] {
  return orders.map((order, idx) => {
    const shipTo = order.raw?.shipping_address || order.raw?.billing_address || {};
    const customerName = shipTo.name || order.raw?.customer?.first_name || 'Customer';
    const paymentMode = Number(order.raw?.total_outstanding ?? 0) > 0
      ? 'COD'
      : 'Prepaid';
    const totalPrice = Number(order.raw?.total_price ?? 0);
    const outstanding = Number(order.raw?.total_outstanding ?? 0);

    return {
      sNo: idx + 1,
      orderName: order.name || `#${order.orderId || 'N/A'}`,
      awb: order.awb || '-',
      courier: order.courier || order.courierProvider || '-',
      customerName,
      city: shipTo.city || '-',
      state: shipTo.province || '-',
      pincode: shipTo.zip || '-',
      items: order.raw?.line_items?.length || 0,
      paymentMode,
      codAmount: paymentMode === 'COD' ? `₹${outstanding.toFixed(2)}` : '-',
      totalPrice: `₹${totalPrice.toFixed(2)}`,
    };
  });
}

function generateManifestHTML(
  rows: ManifestOrder[],
  sellerDetails: { name: string; gst: string; returnAddress: string },
  courierSummary: { courier: string; count: number; codTotal: number; prepaidTotal: number }[]
): string {
  const now = new Date();
  const manifestId = `MFT-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${Date.now().toString().slice(-6)}`;
  const manifestDate = ddmmyyyy(now);
  const manifestTime = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });

  const totalOrders = rows.length;
  const totalCOD = rows.filter(r => r.paymentMode === 'COD').length;
  const totalPrepaid = rows.filter(r => r.paymentMode === 'Prepaid').length;
  const totalCODAmount = rows
    .filter(r => r.paymentMode === 'COD')
    .reduce((sum, r) => sum + (parseFloat(r.codAmount.replace('₹', '').replace(',', '')) || 0), 0);

  const tableRows = rows
    .map(
      (r) => `
      <tr>
        <td>${r.sNo}</td>
        <td>${escapeHtml(r.orderName)}</td>
        <td class="mono">${escapeHtml(r.awb)}</td>
        <td>${escapeHtml(r.courier)}</td>
        <td>${escapeHtml(r.customerName)}</td>
        <td>${escapeHtml(r.city)}</td>
        <td>${escapeHtml(r.state)}</td>
        <td>${escapeHtml(r.pincode)}</td>
        <td>${r.items}</td>
        <td>${escapeHtml(r.paymentMode)}</td>
        <td class="right">${escapeHtml(r.codAmount)}</td>
        <td class="right">${escapeHtml(r.totalPrice)}</td>
      </tr>`
    )
    .join('');

  const courierSummaryRows = courierSummary
    .map(
      (c) => `
      <tr>
        <td>${escapeHtml(c.courier)}</td>
        <td class="center">${c.count}</td>
        <td class="right">₹${c.codTotal.toFixed(2)}</td>
        <td class="right">₹${c.prepaidTotal.toFixed(2)}</td>
      </tr>`
    )
    .join('');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;600;700&display=swap');

        * { margin: 0; padding: 0; box-sizing: border-box; }

        body {
          font-family: 'Noto Sans', sans-serif;
          font-size: 11px;
          line-height: 1.4;
          color: #000;
          background: #fff;
        }

        @page {
          size: A4 landscape;
          margin: 12mm 10mm;
        }

        .page {
          width: 100%;
          padding: 0;
        }

        /* ---- Header ---- */
        .header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 16px;
          padding-bottom: 12px;
          border-bottom: 2px solid #000;
        }

        .header-left h1 {
          font-size: 22px;
          font-weight: 700;
          margin-bottom: 4px;
        }

        .header-left p {
          font-size: 11px;
          color: #333;
        }

        .header-right {
          text-align: right;
        }

        .header-right .manifest-id {
          font-size: 14px;
          font-weight: 700;
        }

        .header-right p {
          font-size: 11px;
          color: #333;
        }

        /* ---- Summary strip ---- */
        .summary-strip {
          display: flex;
          gap: 24px;
          margin-bottom: 14px;
          padding: 8px 12px;
          background: #f5f5f5;
          border: 1px solid #ddd;
          border-radius: 4px;
        }

        .summary-item {
          display: flex;
          flex-direction: column;
        }

        .summary-item .label {
          font-size: 9px;
          text-transform: uppercase;
          color: #666;
          font-weight: 600;
        }

        .summary-item .value {
          font-size: 14px;
          font-weight: 700;
        }

        /* ---- Table ---- */
        table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 20px;
          font-size: 10.5px;
        }

        thead th {
          background: #222;
          color: #fff;
          padding: 6px 5px;
          text-align: left;
          font-weight: 600;
          font-size: 10px;
          white-space: nowrap;
        }

        tbody td {
          padding: 5px;
          border-bottom: 1px solid #ddd;
          vertical-align: middle;
        }

        tbody tr:nth-child(even) {
          background: #fafafa;
        }

        .right { text-align: right; }
        .center { text-align: center; }
        .mono { font-family: monospace; font-size: 10px; }

        /* ---- Courier summary ---- */
        .courier-summary {
          margin-bottom: 20px;
        }

        .courier-summary h3 {
          font-size: 12px;
          margin-bottom: 6px;
          font-weight: 700;
        }

        .courier-summary table {
          width: auto;
          min-width: 400px;
        }

        .courier-summary thead th {
          font-size: 10px;
        }

        /* ---- Footer / Signatures ---- */
        .signatures {
          display: flex;
          justify-content: space-between;
          margin-top: 40px;
          padding-top: 12px;
        }

        .sig-block {
          width: 220px;
          text-align: center;
        }

        .sig-block .line {
          border-top: 1px solid #000;
          margin-top: 50px;
          padding-top: 4px;
          font-size: 11px;
          font-weight: 600;
        }

        .sig-block .sub {
          font-size: 9px;
          color: #666;
          margin-top: 2px;
        }

        .footer-note {
          margin-top: 16px;
          font-size: 9px;
          color: #888;
          text-align: center;
        }
      </style>
    </head>
    <body>
      <div class="page">
        <!-- Header -->
        <div class="header">
          <div class="header-left">
            <h1>Courier Manifest</h1>
            <p><strong>Seller:</strong> ${escapeHtml(sellerDetails.name)}</p>
            <p><strong>GST:</strong> ${escapeHtml(sellerDetails.gst)}</p>
            <p><strong>Address:</strong> ${escapeHtml(sellerDetails.returnAddress)}</p>
          </div>
          <div class="header-right">
            <p class="manifest-id">${escapeHtml(manifestId)}</p>
            <p><strong>Date:</strong> ${escapeHtml(manifestDate)}</p>
            <p><strong>Time:</strong> ${escapeHtml(manifestTime)}</p>
          </div>
        </div>

        <!-- Summary strip -->
        <div class="summary-strip">
          <div class="summary-item">
            <span class="label">Total Shipments</span>
            <span class="value">${totalOrders}</span>
          </div>
          <div class="summary-item">
            <span class="label">Prepaid</span>
            <span class="value">${totalPrepaid}</span>
          </div>
          <div class="summary-item">
            <span class="label">COD</span>
            <span class="value">${totalCOD}</span>
          </div>
          <div class="summary-item">
            <span class="label">Total COD Collectible</span>
            <span class="value">₹${totalCODAmount.toFixed(2)}</span>
          </div>
        </div>

        <!-- Shipment Table -->
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Order</th>
              <th>AWB Number</th>
              <th>Courier</th>
              <th>Customer</th>
              <th>City</th>
              <th>State</th>
              <th>PIN</th>
              <th>Items</th>
              <th>Payment</th>
              <th class="right">COD Amt</th>
              <th class="right">Total</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>

        <!-- Courier-wise Summary -->
        <div class="courier-summary">
          <h3>Courier-wise Summary</h3>
          <table>
            <thead>
              <tr>
                <th>Courier</th>
                <th class="center">Shipments</th>
                <th class="right">COD Total</th>
                <th class="right">Prepaid Total</th>
              </tr>
            </thead>
            <tbody>
              ${courierSummaryRows}
            </tbody>
          </table>
        </div>

        <!-- Signature blocks -->
        <div class="signatures">
          <div class="sig-block">
            <div class="line">Warehouse Handler</div>
            <div class="sub">Name &amp; Signature</div>
          </div>
          <div class="sig-block">
            <div class="line">Courier Pickup Agent</div>
            <div class="sub">Name &amp; Signature</div>
          </div>
        </div>

        <div class="footer-note">
          This manifest is a proof-of-handover document. Both parties must sign to confirm the listed shipments were physically picked up.
        </div>
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
      landscape: true,
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: '12mm', right: '10mm', bottom: '12mm', left: '10mm' },
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

    // Chunking for Firestore 'in' limit
    const chunks: string[][] = [];
    for (let i = 0; i < stringIds.length; i += 30) {
      chunks.push(stringIds.slice(i, i + 30));
    }

    const allDocs: DocumentSnapshot[] = [];
    for (const chunk of chunks) {
      const snapshot = await ordersColRef?.where(admin.firestore.FieldPath.documentId(), 'in', chunk).get();
      snapshot?.forEach(doc => allDocs.push(doc));
    }

    allDocs.sort((a, b) => stringIds.indexOf(a.id) - stringIds.indexOf(b.id));

    if (allDocs.length === 0) {
      return NextResponse.json({ error: 'No matching orders found' }, { status: 404 });
    }

    // Filter by authorization
    const authorizedOrders: any[] = [];
    for (const d of allDocs) {
      const order = d.data();
      if (SHARED_STORE_IDS.includes(shop)) {
        const vendorName = businessData?.vendorName;
        const vendors = order?.vendors;
        const canProcess = authBusinessForOrderOfTheExceptionStore({ businessId, vendorName, vendors });
        if (!canProcess.authorised) continue;
      }
      authorizedOrders.push(order);
    }

    if (authorizedOrders.length === 0) {
      return NextResponse.json({ error: 'No authorized orders found' }, { status: 404 });
    }

    // Build manifest data
    const manifestRows = buildManifestRows(authorizedOrders);

    // Courier-wise summary
    const courierMap = new Map<string, { count: number; codTotal: number; prepaidTotal: number }>();
    for (const order of authorizedOrders) {
      const courier = order.courier || order.courierProvider || 'Unknown';
      const paymentMode = Number(order.raw?.total_outstanding ?? 0) > 0 ? 'COD' : 'Prepaid';
      const totalPrice = Number(order.raw?.total_price ?? 0);
      const outstanding = Number(order.raw?.total_outstanding ?? 0);

      if (!courierMap.has(courier)) {
        courierMap.set(courier, { count: 0, codTotal: 0, prepaidTotal: 0 });
      }
      const entry = courierMap.get(courier)!;
      entry.count++;
      if (paymentMode === 'COD') {
        entry.codTotal += outstanding;
      } else {
        entry.prepaidTotal += totalPrice;
      }
    }

    const courierSummary = Array.from(courierMap.entries()).map(([courier, data]) => ({
      courier,
      ...data,
    }));

    const htmlContent = generateManifestHTML(manifestRows, sellerDetails, courierSummary);
    const pdfBytes = await generatePDFWithPuppeteer(htmlContent);

    return new NextResponse(new Uint8Array(pdfBytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="manifest-${Date.now()}.pdf"`,
      },
    });
  } catch (error) {
    console.error('Error generating manifest:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ error: 'Failed to generate manifest', details: errorMessage }, { status: 500 });
  }
}