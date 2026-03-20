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

const GST_RATE = 0.05;   // hardcoded 5%
const GST_RATE_PC = '5%';
const HOME_STATE = 'punjab'; // business residing state — intra-state check

function n2(n: number): string {
    return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Returns true when the supplier is from Punjab (intra-state supply). */
function isIntraState(party: Party | null): boolean {
    const state = (party?.address?.state ?? '').trim().toLowerCase();
    return state === HOME_STATE || state === 'pb';
}

function buildInvoiceHTML(payload: {
    grn: GRN;
    po: PurchaseOrder | null;
    party: Party | null;
    biz: any;
}): string {
    const { grn, po, party, biz } = payload;

    // ── Billed From (Supplier / Party) ────────────────────────────────────────
    const fromName = party?.name ?? po?.supplierName ?? '—';
    const fromAddr = party?.address;
    const fromLines = [
        fromAddr?.line1,
        fromAddr?.line2,
        [fromAddr?.city, fromAddr?.state].filter(Boolean).join(', '),
        fromAddr?.country && fromAddr?.pincode
            ? `${fromAddr.country} - ${fromAddr.pincode}`
            : (fromAddr?.country || fromAddr?.pincode || ''),
    ].filter((l): l is string => !!l);
    const fromGstin = party?.gstin ?? '';
    const fromPan = party?.pan ?? '';
    const fromAccountName = party?.bankDetails?.accountName ?? '';
    const fromAccountNumber = party?.bankDetails?.accountNumber ?? '';
    const fromIfsc = party?.bankDetails?.ifsc ?? '';
    const fromBank = party?.bankDetails?.bankName ?? '';

    // ── Billed To (Business) ─────────────────────────────────────────────────
    const bizAddr = biz?.companyAddress ?? biz?.address ?? null;
    const toName = biz?.companyName ?? biz?.businessName ?? 'Majime Technologies';
    const toLines = [
        bizAddr?.address ?? bizAddr?.line1,
        [bizAddr?.city, bizAddr?.state].filter(Boolean).join(', '),
        bizAddr?.country && bizAddr?.pincode
            ? `${bizAddr.country} - ${bizAddr.pincode}`
            : (bizAddr?.country || bizAddr?.pincode || ''),
    ].filter((l): l is string => !!l);

    // ── GST type ──────────────────────────────────────────────────────────────
    // Intra-state (Punjab → Punjab): CGST 2.5% + SGST 2.5%, IGST 0
    // Inter-state (any other state): IGST 5%, CGST 0, SGST 0
    const intra = isIntraState(party);
    const cgstRate = intra ? GST_RATE / 2 : 0;
    const sgstRate = intra ? GST_RATE / 2 : 0;
    const igstRate = intra ? 0 : GST_RATE;

    // ── Items (received qty > 0 only) + per-line tax ──────────────────────────
    const items = (grn.items ?? []).filter((i: any) => i.receivedQty > 0);

    const computedItems = items.map((item: any) => {
        const taxableAmt = item.receivedQty * item.unitCost;
        const cgst = taxableAmt * cgstRate;
        const sgst = taxableAmt * sgstRate;
        const igst = taxableAmt * igstRate;
        const total = taxableAmt + cgst + sgst + igst;
        return { ...item, taxableAmt, cgst, sgst, igst, total };
    });

    // ── Grand totals ──────────────────────────────────────────────────────────
    const totalTaxable = computedItems.reduce((s: number, i: any) => s + i.taxableAmt, 0);
    const totalCGST = computedItems.reduce((s: number, i: any) => s + i.cgst, 0);
    const totalSGST = computedItems.reduce((s: number, i: any) => s + i.sgst, 0);
    const totalIGST = computedItems.reduce((s: number, i: any) => s + i.igst, 0);
    const grandTotal = totalTaxable + totalCGST + totalSGST + totalIGST;

    // ── Status pill ───────────────────────────────────────────────────────────
    const statusStyles: Record<string, string> = {
        completed: 'background:#059669;',
        cancelled: 'background:#DC2626;',
        draft: 'background:#64748B;',
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
            ${pan ? `<div class="addr-meta"><b>PAN:</b> ${escapeHtml(pan)}</div>` : ''}
        </div>
    `;

    // ── Items table rows ──────────────────────────────────────────────────────
    const itemRows = computedItems.map((item: any, i: number) => `
        <tr class="${i % 2 === 1 ? 'row-alt' : ''}">
            <td class="c-idx">${i + 1}.</td>
            <td class="c-item">
                <span class="item-name">${escapeHtml(item.productName)}</span>
                <span class="item-sku">${escapeHtml(item.sku)}</span>
            </td>
            <td class="c-gst num">${GST_RATE_PC}</td>
            <td class="c-qty num">${item.receivedQty}</td>
            <td class="c-rate num mono">${n2(item.unitCost)}</td>
            <td class="c-amt num mono">${n2(item.taxableAmt)}</td>
            <td class="c-tax num mono">${n2(item.cgst)}</td>
            <td class="c-tax num mono">${n2(item.sgst)}</td>
            <td class="c-tax num mono">${n2(item.igst)}</td>
            <td class="c-total num mono bold">${n2(item.total)}</td>
        </tr>
    `).join('');

    // ── Totals box rows ───────────────────────────────────────────────────────
    // Only show tax rows that are non-zero to keep it clean
    const totalsRows = [
        { label: 'Amount', value: n2(totalTaxable), grand: false },
        ...(totalCGST > 0 ? [{ label: `+ CGST (${(cgstRate * 100).toFixed(1)}%)`, value: n2(totalCGST), grand: false }] : []),
        ...(totalSGST > 0 ? [{ label: `+ SGST (${(sgstRate * 100).toFixed(1)}%)`, value: n2(totalSGST), grand: false }] : []),
        ...(totalIGST > 0 ? [{ label: `+ IGST (${(igstRate * 100).toFixed(1)}%)`, value: n2(totalIGST), grand: false }] : []),
        { label: 'Total (INR)', value: fmtCurrency(grandTotal), grand: true },
    ].map(r => `
        <div class="tot-row${r.grand ? ' grand' : ''}">
            <span class="tot-lbl">${r.label}</span>
            <span class="tot-val">${r.value}</span>
        </div>
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
    .logo { text-align: right; }
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

    /* ── Sub-header ── */
    .subheader { margin-top: 12px; margin-bottom: 16px; }
    .subheader table { border-collapse: collapse; }
    .subheader td { padding: 2px 6px 2px 0; font-size: 12px; }
    .subheader .lbl { color: #888; font-weight: 400; white-space: nowrap; }
    .subheader .val { font-weight: 700; color: #1e1e1e; }

    /* ── Address boxes ── */
    .addr-row { display: flex; gap: 14px; margin-bottom: 12px; }
    .addr-box {
        flex: 1;
        background: #F9FAFB;
        border: 1px solid #e0e0e0;
        border-radius: 6px;
        padding: 12px 14px;
        min-height: 110px;
    }
    .addr-title { font-size: 12px; font-weight: 700; color: #6B46C1; margin-bottom: 5px; }
    .addr-name  { font-size: 13px; font-weight: 700; color: #1e1e1e; margin-bottom: 4px; }
    .addr-line  { font-size: 11.5px; color: #333; line-height: 1.5; }
    .addr-meta  { font-size: 11px; color: #555; margin-top: 4px; line-height: 1.5; }

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
        font-size: 11px;   /* slightly smaller to fit 10 cols on A4 */
        table-layout: fixed;
    }
    .items-table thead tr { background: #EDE9FE; }
    .items-table thead th {
        color: #6B46C1;
        font-weight: 700;
        font-size: 10.5px;
        padding: 7px 5px;
        text-align: left;
        border-bottom: 1.5px solid #c4b5fd;
        overflow: hidden;
        white-space: nowrap;
    }
    .items-table thead th.num { text-align: right; }

    /* fixed column widths — must total 100% of the ~511px content area */
    .c-idx  { width: 24px; }
    .c-item { width: auto; }   /* flex remainder */
    .c-gst  { width: 44px; }
    .c-qty  { width: 34px; }
    .c-rate { width: 68px; }
    .c-amt  { width: 68px; }
    .c-tax  { width: 62px; }   /* CGST / SGST / IGST — 3 cols */
    .c-total{ width: 72px; }

    .items-table tbody td {
        padding: 7px 5px;
        vertical-align: top;
        border-bottom: 1px solid #eee;
        overflow: hidden;
    }
    .items-table tbody td.num  { text-align: right; }
    .items-table tbody td.mono { font-family: 'Courier New', Courier, monospace; }
    .items-table tbody td.bold { font-weight: 700; }
    .row-alt { background: #F9FAFB; }
    .item-name { display: block; font-weight: 600; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .item-sku  { display: block; font-size: 10px; color: #888; font-family: 'Courier New', Courier, monospace; margin-top: 2px; }

    /* ── Bottom: bank + totals ── */
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
        width: 230px;
        flex-shrink: 0;
    }
    .bank-title { font-size: 12px; font-weight: 700; color: #6B46C1; margin-bottom: 8px; }
    .bank-row {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        font-size: 11px;
        padding: 4px 0;
        border-bottom: 1px solid #eee;
        gap: 8px;
    }
    .bank-row:last-child { border-bottom: none; }
    .bank-lbl { color: #888; white-space: nowrap; flex-shrink: 0; min-width: 95px; }
    .bank-val { font-weight: 600; color: #1e1e1e; font-family: 'Courier New', Courier, monospace;
                text-align: right; word-break: break-all; }

    .totals-box {
        background: #F9FAFB;
        border: 1px solid #e0e0e0;
        border-radius: 6px;
        padding: 12px 16px;
        width: 220px;
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
    .tot-lbl { color: #888; white-space: nowrap; }
    .tot-val { font-family: 'Courier New', Courier, monospace; font-weight: 600; text-align: right; margin-left: 8px; }
    .tot-row.grand { margin-top: 2px; padding-top: 6px; border-top: 1.5px solid #d0d0d0; }
    .tot-row.grand .tot-lbl { font-weight: 700; color: #1e1e1e; font-size: 13px; }
    .tot-row.grand .tot-val { font-weight: 800; font-size: 13px; color: #1e1e1e; }

    /* ── Terms ── */
    .terms { margin-top: 24px; padding-top: 12px; border-top: 1px solid #e0e0e0; }
    .terms-title { font-size: 12px; font-weight: 700; color: #6B46C1; margin-bottom: 6px; }
    .terms ol { padding-left: 16px; }
    .terms li { font-size: 11.5px; color: #444; line-height: 1.6; margin-bottom: 2px; }

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
            <tr>
                <td class="lbl">Place of Supply</td>
                <td class="val">Punjab (03)</td>
            </tr>
            <tr>
                <td class="lbl">Supply Type</td>
                <td class="val">${intra ? 'Intra-State (CGST + SGST)' : 'Inter-State (IGST)'}</td>
            </tr>
        </table>
    </div>

    <!-- ── BILLED BY / BILLED TO ── -->
    <div class="addr-row">
        ${addrBlock('Billed By', fromName, fromLines, fromGstin, fromPan)}
        ${addrBlock('Billed To', toName, toLines, '03AAQCM9385B1Z8', 'AAQCM9385B')}
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
                <th class="c-idx">#</th>
                <th class="c-item">Item</th>
                <th class="c-gst num">GST Rate</th>
                <th class="c-qty num">Qty.</th>
                <th class="c-rate num">Rate</th>
                <th class="c-amt num">Amount</th>
                <th class="c-tax num">CGST</th>
                <th class="c-tax num">SGST</th>
                <th class="c-tax num">IGST</th>
                <th class="c-total num">Total</th>
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
            <div class="bank-row"><span class="bank-lbl">Account Name</span>   <span class="bank-val">${fromAccountName || '—'}</span></div>
            <div class="bank-row"><span class="bank-lbl">Account Number</span> <span class="bank-val">${fromAccountNumber || '—'}</span></div>
            <div class="bank-row"><span class="bank-lbl">IFSC</span>           <span class="bank-val">${fromIfsc || '—'}</span></div>
            <div class="bank-row"><span class="bank-lbl">Bank</span>           <span class="bank-val">${fromBank || '—'}</span></div>
        </div>

        <div class="totals-box">
            ${totalsRows}
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
        const bizRef = db.doc(`users/${businessId}`);
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
        const html = buildInvoiceHTML({ grn, po, party, biz: bizData });
        const pdfBuf = await renderPDF(html);

        return new NextResponse(new Uint8Array(pdfBuf), {
            status: 200,
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="${grn.billNumber || grn.grnNumber}.pdf"`,
            },
        });

    } catch (err) {
        console.error('❌ GRN bill PDF generation failed:', err);
        const msg = err instanceof Error ? err.message : 'Unknown error';
        return NextResponse.json({ error: 'Failed to generate PDF.', details: msg }, { status: 500 });
    }
}