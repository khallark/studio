import { NextRequest, NextResponse } from 'next/server';
import { db, auth as adminAuth } from '@/lib/firebase-admin';
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import { GRN } from '@/types/warehouse';
import { Party, PurchaseOrder } from '@/types/warehouse';

// ─── Type assertion for chromium runtime properties ───────────────────────────
const chromiumConfig = chromium as typeof chromium & {
    defaultViewport: { width: number; height: number } | null;
    headless: boolean | 'shell';
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function escapeHtml(text: string | null | undefined): string {
    if (!text) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function fmtDate(timestamp: any): string {
    if (!timestamp) return '—';
    try {
        const d = timestamp._seconds
            ? new Date(timestamp._seconds * 1000)
            : new Date(timestamp);
        return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch { return '—'; }
}

function fmtCurrency(amount: number): string {
    return 'Rs. ' + Number(amount || 0).toLocaleString('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

// ─── HTML generator ───────────────────────────────────────────────────────────

function buildInvoiceHTML(payload: {
    grn: GRN;
    po: PurchaseOrder | null;
    party: Party | null;
    biz: any;
}): string {
    const { grn, po, party, biz } = payload;

    // ── Billed From (Supplier / Party) ────────────────────────────────────────
    const fromName  = party?.name ?? po?.supplierName ?? '—';
    const fromAddr  = party?.address;
    const fromLines = [
        fromAddr?.line1,
        fromAddr?.line2,
        [fromAddr?.city, fromAddr?.state].filter(Boolean).join(', '),
        fromAddr?.country && fromAddr?.pincode
            ? `${fromAddr.country} - ${fromAddr.pincode}`
            : (fromAddr?.country || fromAddr?.pincode || ''),
    ].filter((l): l is string => !!l);
    const fromGstin = party?.gstin ?? '';
    const fromPan   = party?.pan   ?? '';

    // ── Billed To (Business) ─────────────────────────────────────────────────
    const bizAddr = biz?.companyAddress ?? biz?.address ?? null;
    const toName  = biz?.companyName ?? biz?.businessName ?? '—';
    const toLines = [
        bizAddr?.address ?? bizAddr?.line1,
        [bizAddr?.city, bizAddr?.state].filter(Boolean).join(', '),
        bizAddr?.country && bizAddr?.pincode
            ? `${bizAddr.country} - ${bizAddr.pincode}`
            : (bizAddr?.country || bizAddr?.pincode || ''),
    ].filter((l): l is string => !!l);

    // ── Items (received qty > 0 only) ─────────────────────────────────────────
    const items = (grn.items ?? []).filter((i: any) => i.receivedQty > 0);
    const subtotal = items.reduce((s: number, i: any) => s + i.receivedQty * i.unitCost, 0);

    // ── Status pill ───────────────────────────────────────────────────────────
    const statusStyles: Record<string, string> = {
        completed: 'background:#059669;',
        cancelled: 'background:#DC2626;',
        draft:     'background:#64748B;',
    };
    const pillStyle = statusStyles[grn.status] ?? statusStyles.draft;
    const pillLabel = (grn.status ?? 'draft').toUpperCase();

    // ── Address block helper ──────────────────────────────────────────────────
    const addrBlock = (title: string, name: string, lines: string[], gstin: string, pan: string) => `
        <div class="addr-box">
            <div class="addr-title">${escapeHtml(title)}</div>
            <div class="addr-name">${escapeHtml(name)}</div>
            ${lines.map(l => `<div class="addr-line">${escapeHtml(l)}</div>`).join('')}
            ${gstin ? `<div class="addr-meta"><b>GSTIN:</b> ${escapeHtml(gstin)}</div>` : ''}
            ${pan   ? `<div class="addr-meta"><b>PAN:</b> ${escapeHtml(pan)}</div>`   : ''}
        </div>
    `;

    // ── Items table rows ──────────────────────────────────────────────────────
    const itemRows = items.map((item: any, i: number) => `
        <tr class="${i % 2 === 1 ? 'row-alt' : ''}">
            <td>${i + 1}.</td>
            <td>
                <span class="item-name">${escapeHtml(item.productName)}</span>
                <span class="item-sku">${escapeHtml(item.sku)}</span>
            </td>
            <td class="num">${item.receivedQty}</td>
            <td class="num mono">${Number(item.unitCost).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
            <td class="num mono bold">${(item.receivedQty * item.unitCost).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
        </tr>
    `).join('');

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
        font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
        font-size: 13px;
        color: #1e1e1e;
        background: #fff;
        padding: 36px 42px;
    }

    /* ── Header ── */
    .header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 6px;
    }
    .header-left { display: flex; align-items: center; gap: 10px; }
    .title {
        font-size: 26px;
        font-weight: 700;
        color: #6B46C1;
        line-height: 1;
    }
    .status-pill {
        display: inline-block;
        padding: 3px 10px;
        border-radius: 20px;
        font-size: 10px;
        font-weight: 700;
        color: #fff;
        letter-spacing: 0.5px;
        align-self: center;
        ${pillStyle}
    }
    .logo {
        text-align: right;
    }
    .logo-text {
        font-size: 20px;
        font-weight: 800;
        color: #1e1e1e;
        letter-spacing: 2px;
    }
    .logo-underline {
        height: 2.5px;
        background: #6B46C1;
        border-radius: 2px;
        margin-top: 3px;
    }

    /* ── Sub-header (GRN No, Date) ── */
    .subheader {
        margin-top: 12px;
        margin-bottom: 16px;
    }
    .subheader table { border-collapse: collapse; }
    .subheader td { padding: 2px 6px 2px 0; font-size: 12px; }
    .subheader .lbl { color: #888; font-weight: 400; white-space: nowrap; }
    .subheader .val { font-weight: 700; color: #1e1e1e; }

    /* ── Address boxes ── */
    .addr-row {
        display: flex;
        gap: 14px;
        margin-bottom: 12px;
    }
    .addr-box {
        flex: 1;
        background: #F9FAFB;
        border: 1px solid #e0e0e0;
        border-radius: 6px;
        padding: 12px 14px;
        min-height: 110px;
    }
    .addr-title {
        font-size: 12px;
        font-weight: 700;
        color: #6B46C1;
        margin-bottom: 5px;
    }
    .addr-name {
        font-size: 13px;
        font-weight: 700;
        color: #1e1e1e;
        margin-bottom: 4px;
    }
    .addr-line {
        font-size: 11.5px;
        color: #333;
        line-height: 1.5;
    }
    .addr-meta {
        font-size: 11px;
        color: #555;
        margin-top: 4px;
        line-height: 1.5;
    }

    /* ── Supply info bar ── */
    .supply-bar {
        display: flex;
        justify-content: space-between;
        font-size: 11px;
        color: #888;
        padding: 4px 0 10px;
        border-bottom: 1px solid #e0e0e0;
        margin-bottom: 4px;
    }

    /* ── Items table ── */
    .items-table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 6px;
        font-size: 12px;
    }
    .items-table thead tr {
        background: #EDE9FE;
    }
    .items-table thead th {
        color: #6B46C1;
        font-weight: 700;
        font-size: 11.5px;
        padding: 8px 8px;
        text-align: left;
        border-bottom: 1.5px solid #c4b5fd;
    }
    .items-table thead th.num { text-align: right; }
    .items-table tbody td {
        padding: 8px 8px;
        vertical-align: top;
        border-bottom: 1px solid #eee;
    }
    .items-table tbody td.num { text-align: right; }
    .items-table tbody td.mono { font-family: 'Courier New', Courier, monospace; }
    .items-table tbody td.bold { font-weight: 700; }
    .row-alt { background: #F9FAFB; }
    .item-name { display: block; font-weight: 600; }
    .item-sku  { display: block; font-size: 10.5px; color: #888; font-family: 'Courier New', Courier, monospace; margin-top: 2px; }

    /* ── Bottom section: bank + totals ── */
    .bottom-row {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-top: 16px;
        gap: 14px;
    }
    .bank-box {
        background: #F9FAFB;
        border: 1px solid #e0e0e0;
        border-radius: 6px;
        padding: 12px 14px;
        width: 220px;
        flex-shrink: 0;
    }
    .bank-title {
        font-size: 12px;
        font-weight: 700;
        color: #6B46C1;
        margin-bottom: 8px;
    }
    .bank-row {
        display: flex;
        justify-content: space-between;
        font-size: 11px;
        padding: 3px 0;
        border-bottom: 1px solid #eee;
    }
    .bank-row:last-child { border-bottom: none; }
    .bank-lbl { color: #888; }
    .bank-val { font-weight: 600; color: #1e1e1e; }

    .totals-box {
        background: #F9FAFB;
        border: 1px solid #e0e0e0;
        border-radius: 6px;
        padding: 12px 16px;
        width: 210px;
        flex-shrink: 0;
        align-self: flex-start;
    }
    .tot-row {
        display: flex;
        justify-content: space-between;
        font-size: 12px;
        padding: 4px 0;
        border-bottom: 1px solid #eee;
    }
    .tot-row:last-child { border-bottom: none; }
    .tot-lbl { color: #888; }
    .tot-val { font-family: 'Courier New', Courier, monospace; font-weight: 600; }
    .tot-row.grand { margin-top: 4px; padding-top: 6px; border-top: 1.5px solid #d0d0d0; }
    .tot-row.grand .tot-lbl { font-weight: 700; color: #1e1e1e; font-size: 13px; }
    .tot-row.grand .tot-val { font-weight: 800; font-size: 13px; color: #1e1e1e; }

    /* ── Terms ── */
    .terms {
        margin-top: 24px;
        padding-top: 12px;
        border-top: 1px solid #e0e0e0;
    }
    .terms-title {
        font-size: 12px;
        font-weight: 700;
        color: #6B46C1;
        margin-bottom: 6px;
    }
    .terms ol { padding-left: 16px; }
    .terms li {
        font-size: 11.5px;
        color: #444;
        line-height: 1.6;
        margin-bottom: 2px;
    }

    /* ── Footer ── */
    .footer {
        margin-top: 28px;
        padding-top: 8px;
        border-top: 1px solid #e0e0e0;
        display: flex;
        justify-content: space-between;
        font-size: 10px;
        color: #aaa;
    }
    .footer-brand { font-weight: 700; color: #6B46C1; }

    @page { size: A4; margin: 0; }
</style>
</head>
<body>

    <!-- ── HEADER ── -->
    <div class="header">
        <div class="header-left">
            <span class="title">GRN Receipt</span>
            <span class="status-pill">${pillLabel}</span>
        </div>
        <div class="logo">
            <div class="logo-text">MAJIME</div>
            <div class="logo-underline"></div>
        </div>
    </div>

    <!-- ── SUB-HEADER ── -->
    <div class="subheader">
        <table>
            <tr>
                <td class="lbl">GRN No #</td>
                <td class="val">${escapeHtml(grn.grnNumber)}</td>
            </tr>
            <tr>
                <td class="lbl">GRN Date</td>
                <td class="val">${fmtDate((grn as any).receivedAt ?? (grn as any).createdAt)}</td>
            </tr>
            ${grn.billNumber ? `
            <tr>
                <td class="lbl">Bill / Invoice #</td>
                <td class="val">${escapeHtml(grn.billNumber)}</td>
            </tr>` : ''}
        </table>
    </div>

    <!-- ── BILLED BY / BILLED TO ── -->
    <div class="addr-row">
        ${addrBlock('Billed By', fromName, fromLines, fromGstin, fromPan)}
        ${addrBlock('Billed To', toName, toLines, '', '')}
    </div>

    <!-- ── SUPPLY INFO BAR ── -->
    <div class="supply-bar">
        <span><b>Linked PO:</b> ${escapeHtml(grn.poNumber)}</span>
        <span><b>Warehouse:</b> ${escapeHtml(grn.warehouseName ?? grn.warehouseId)}</span>
    </div>

    <!-- ── ITEMS TABLE ── -->
    <table class="items-table">
        <thead>
            <tr>
                <th style="width:28px">#</th>
                <th>Item</th>
                <th class="num" style="width:50px">Qty.</th>
                <th class="num" style="width:90px">Rate (Rs.)</th>
                <th class="num" style="width:100px">Amount (Rs.)</th>
            </tr>
        </thead>
        <tbody>
            ${itemRows}
        </tbody>
    </table>

    <!-- ── BANK DETAILS + TOTALS ── -->
    <div class="bottom-row">

        <div class="bank-box">
            <div class="bank-title">Bank Details</div>
            <div class="bank-row"><span class="bank-lbl">Account Name</span>   <span class="bank-val">—</span></div>
            <div class="bank-row"><span class="bank-lbl">Account Number</span> <span class="bank-val">—</span></div>
            <div class="bank-row"><span class="bank-lbl">IFSC</span>           <span class="bank-val">—</span></div>
            <div class="bank-row"><span class="bank-lbl">Bank</span>           <span class="bank-val">—</span></div>
        </div>

        <div class="totals-box">
            <div class="tot-row">
                <span class="tot-lbl">Amount</span>
                <span class="tot-val">${subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
            </div>
            <div class="tot-row grand">
                <span class="tot-lbl">Total (INR)</span>
                <span class="tot-val">${fmtCurrency(subtotal)}</span>
            </div>
        </div>

    </div>

    <!-- ── TERMS ── -->
    <div class="terms">
        <div class="terms-title">Terms and Conditions</div>
        <ol>
            <li>Payment is due within 30 days from the date of this GRN receipt.</li>
            <li>All disputes must be raised within 7 days of receipt of goods.</li>
            <li>Goods once received and accepted cannot be returned without prior written approval.</li>
        </ol>
    </div>

    <!-- ── FOOTER ── -->
    <div class="footer">
        <span>This is an electronically generated document, no signature is required.</span>
        <span class="footer-brand">Powered by Majime</span>
    </div>

</body>
</html>`;
}

// ─── Puppeteer PDF generation ─────────────────────────────────────────────────

async function renderPDF(html: string): Promise<Buffer> {
    const browser = await puppeteer.launch({
        args: chromiumConfig.args,
        defaultViewport: chromiumConfig.defaultViewport,
        executablePath: await chromiumConfig.executablePath(),
        headless: chromiumConfig.headless,
    });

    try {
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 });
        const pdf = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
        });
        return Buffer.from(pdf);
    } finally {
        await browser.close();
    }
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
    try {
        const { businessId, grnId } = await req.json();

        if (!businessId || !grnId) {
            return NextResponse.json({ error: 'businessId and grnId are required.' }, { status: 400 });
        }

        // ── Auth: verify Firebase ID token ───────────────────────────────────
        const authHeader = req.headers.get('Authorization') ?? '';
        const idToken = authHeader.replace('Bearer ', '').trim();
        if (!idToken) {
            return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
        }

        let uid: string;
        try {
            const decoded = await adminAuth.verifyIdToken(idToken);
            uid = decoded.uid;
        } catch {
            return NextResponse.json({ error: 'Invalid or expired token.' }, { status: 401 });
        }

        // Verify user belongs to this business
        const bizRef  = db.doc(`users/${businessId}`);
        const bizSnap = await bizRef.get();
        if (!bizSnap.exists) {
            return NextResponse.json({ error: 'Business not found.' }, { status: 404 });
        }
        const bizData = bizSnap.data()!;

        const memberSnap = await db.doc(`users/${businessId}/members/${uid}`).get();
        if (!memberSnap.exists) {
            return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
        }

        // ── Fetch GRN ─────────────────────────────────────────────────────────
        const grnSnap = await db.doc(`users/${businessId}/grns/${grnId}`).get();
        if (!grnSnap.exists) {
            return NextResponse.json({ error: 'GRN not found.' }, { status: 404 });
        }
        const grn = { id: grnSnap.id, ...grnSnap.data() } as GRN;

        // ── Fetch PO ──────────────────────────────────────────────────────────
        let po: PurchaseOrder | null = null;
        if (grn.poId) {
            const poSnap = await db.doc(`users/${businessId}/purchaseOrders/${grn.poId}`).get();
            if (poSnap.exists) po = { id: poSnap.id, ...poSnap.data() } as PurchaseOrder;
        }

        // ── Fetch Party (supplier) ────────────────────────────────────────────
        let party: Party | null = null;
        if (po?.supplierPartyId) {
            const partySnap = await db.doc(`users/${businessId}/parties/${po.supplierPartyId}`).get();
            if (partySnap.exists) party = { id: partySnap.id, ...partySnap.data() } as Party;
        }

        // ── Build & render ────────────────────────────────────────────────────
        const html   = buildInvoiceHTML({ grn, po, party, biz: bizData });
        const pdfBuf = await renderPDF(html);

        return new NextResponse(new Uint8Array(pdfBuf), {
            status: 200,
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="${grn.grnNumber}-bill.pdf"`,
            },
        });

    } catch (err) {
        console.error('❌ GRN bill PDF generation failed:', err);
        const msg = err instanceof Error ? err.message : 'Unknown error';
        return NextResponse.json({ error: 'Failed to generate PDF.', details: msg }, { status: 500 });
    }
}