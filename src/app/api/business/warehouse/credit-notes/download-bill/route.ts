// /api/business/warehouse/credit-notes/download-bill

import { NextRequest, NextResponse } from 'next/server';
import { db, auth as adminAuth } from '@/lib/firebase-admin';
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import { CreditNote } from '@/types/warehouse';
import { Party } from '@/types/warehouse';
import { authUserForBusiness } from '@/lib/authoriseUser';

// ─── Type assertion for chromium runtime properties ───────────────────────────
const chromiumConfig = chromium as typeof chromium & {
    defaultViewport: { width: number; height: number } | null;
    headless: boolean | 'shell';
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const HOME_STATE = 'punjab';

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

function n2(n: number): string {
    return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtCurrency(amount: number): string {
    return 'Rs. ' + Number(amount || 0).toLocaleString('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

/**
 * Returns true when the party (recipient of credit note) is from Punjab.
 * Determines CGST+SGST vs IGST.
 */
function isIntraState(party: Party | null): boolean {
    const state = (party?.address?.state ?? '').trim().toLowerCase();
    return state === HOME_STATE || state === 'pb';
}

// ─── HTML generator ───────────────────────────────────────────────────────────

function buildCreditNoteHTML(payload: {
    cn: CreditNote;
    party: Party | null;
    biz: any;
}): string {
    const { cn, party, biz } = payload;

    // ── Billed By (Business — issuing the credit note) ────────────────────────
    const bizAddr = biz?.companyAddress ?? biz?.address ?? null;
    const fromName = biz?.companyName ?? biz?.businessName ?? 'Majime Technologies';
    const fromLines = [
        bizAddr?.address ?? bizAddr?.line1,
        [bizAddr?.city, bizAddr?.state].filter(Boolean).join(', '),
        bizAddr?.country && bizAddr?.pincode
            ? `${bizAddr.country} - ${bizAddr.pincode}`
            : (bizAddr?.country || bizAddr?.pincode || ''),
    ].filter((l): l is string => !!l);
    const fromGstin = '03AAQCM9385B1Z8';
    const fromPan = 'AAQCM9385B';

    // Business bank details (so supplier knows where to send money back)
    const bizBank = biz?.bankDetails ?? null;
    const fromAccountName = bizBank?.accountName ?? '';
    const fromAccountNumber = bizBank?.accountNumber ?? '';
    const fromIfsc = bizBank?.ifsc ?? '';
    const fromBank = bizBank?.bankName ?? '';

    // ── Billed To (Party / Supplier — receiving the credit note) ─────────────
    const toName = party?.name ?? cn.partyName ?? '—';
    const toAddr = party?.address;
    const toLines = [
        toAddr?.line1,
        toAddr?.line2,
        [toAddr?.city, toAddr?.state].filter(Boolean).join(', '),
        toAddr?.country && toAddr?.pincode
            ? `${toAddr.country} - ${toAddr.pincode}`
            : (toAddr?.country || toAddr?.pincode || ''),
    ].filter((l): l is string => !!l);
    const toGstin = party?.gstin ?? '';
    const toPan = party?.pan ?? '';

    // ── Intra vs inter state ──────────────────────────────────────────────────
    const intra = isIntraState(party);

    // ── Items ─────────────────────────────────────────────────────────────────
    const items = (cn.items ?? []).filter((i: any) => i.quantity > 0);

    const computedItems = items.map((item: any) => {
        // taxRate is stored as percentage (e.g. 5), not decimal
        const gstRate = (Number(item.taxRate) || 0) / 100;
        const cgstRate = intra ? gstRate / 2 : 0;
        const sgstRate = intra ? gstRate / 2 : 0;
        const igstRate = intra ? 0 : gstRate;

        const taxableAmt = item.quantity * item.unitPrice;
        const cgst = taxableAmt * cgstRate;
        const sgst = taxableAmt * sgstRate;
        const igst = taxableAmt * igstRate;
        const total = taxableAmt + cgst + sgst + igst;

        return { ...item, gstRate, cgstRate, sgstRate, igstRate, taxableAmt, cgst, sgst, igst, total };
    });

    // ── Grand totals ──────────────────────────────────────────────────────────
    const totalTaxable = computedItems.reduce((s: number, i: any) => s + i.taxableAmt, 0);
    const totalCGST = computedItems.reduce((s: number, i: any) => s + i.cgst, 0);
    const totalSGST = computedItems.reduce((s: number, i: any) => s + i.sgst, 0);
    const totalIGST = computedItems.reduce((s: number, i: any) => s + i.igst, 0);
    const grandTotal = totalTaxable + totalCGST + totalSGST + totalIGST;

    // ── Address block helper ──────────────────────────────────────────────────
    const addrBlock = (title: string, name: string, lines: string[], gstin: string, pan: string) => `
        <div class="addr-box">
            <div class="addr-title">${escapeHtml(title)}</div>
            <div class="addr-name">${escapeHtml(name)}</div>
            ${lines.map(l => `<div class="addr-line">${escapeHtml(l)}</div>`).join('')}
            ${gstin ? `<div class="addr-meta"><b>GSTIN:</b> ${escapeHtml(gstin)}</div>` : ''}
            ${pan ? `<div class="addr-meta"><b>PAN:</b>   ${escapeHtml(pan)}</div>` : ''}
        </div>
    `;

    // ── Items table rows ──────────────────────────────────────────────────────
    const itemRows = computedItems.map((item: any, i: number) => {
        const gstPc = `${(item.gstRate * 100).toFixed(0)}%`;
        return `
        <tr class="${i % 2 === 1 ? 'row-alt' : ''}">
            <td class="c-idx">${i + 1}.</td>
            <td class="c-item">
                <span class="item-name">${escapeHtml(item.sku || item.productId)}</span>
            </td>
            <td class="c-gst num">${gstPc}</td>
            <td class="c-qty num">${item.quantity}</td>
            <td class="c-rate num mono">${n2(item.unitPrice)}</td>
            <td class="c-amt num mono">${n2(item.taxableAmt)}</td>
            <td class="c-tax num mono">${n2(item.cgst)}</td>
            <td class="c-tax num mono">${n2(item.sgst)}</td>
            <td class="c-tax num mono">${n2(item.igst)}</td>
            <td class="c-total num mono bold">${n2(item.total)}</td>
        </tr>
    `}).join('');

    // ── Totals box ────────────────────────────────────────────────────────────
    const totalsRows = [
        { label: 'Amount', value: n2(totalTaxable), grand: false },
        ...(totalCGST > 0 ? [{ label: '+ CGST', value: n2(totalCGST), grand: false }] : []),
        ...(totalSGST > 0 ? [{ label: '+ SGST', value: n2(totalSGST), grand: false }] : []),
        ...(totalIGST > 0 ? [{ label: '+ IGST', value: n2(totalIGST), grand: false }] : []),
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
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6px; }
    .header-left { display: flex; align-items: center; gap: 10px; }
    .title { font-size: 26px; font-weight: 700; color: #B45309; line-height: 1; }
    .status-pill {
        display: inline-block; padding: 3px 10px; border-radius: 20px;
        font-size: 10px; font-weight: 700; color: #fff; letter-spacing: 0.5px;
        align-self: center; background: #059669;
    }
    .logo { text-align: right; }
    .logo-text { font-size: 20px; font-weight: 800; color: #1e1e1e; letter-spacing: 2px; }
    .logo-underline { height: 2.5px; background: #B45309; border-radius: 2px; margin-top: 3px; }

    .subheader { margin-top: 12px; margin-bottom: 16px; }
    .subheader table { border-collapse: collapse; }
    .subheader td { padding: 2px 6px 2px 0; font-size: 12px; }
    .subheader .lbl { color: #888; font-weight: 400; white-space: nowrap; }
    .subheader .val { font-weight: 700; color: #1e1e1e; }

    .addr-row { display: flex; gap: 14px; margin-bottom: 12px; }
    .addr-box {
        flex: 1; background: #FFFBEB; border: 1px solid #FDE68A;
        border-radius: 6px; padding: 12px 14px; min-height: 110px;
    }
    .addr-title { font-size: 12px; font-weight: 700; color: #B45309; margin-bottom: 5px; }
    .addr-name  { font-size: 13px; font-weight: 700; color: #1e1e1e; margin-bottom: 4px; }
    .addr-line  { font-size: 11.5px; color: #333; line-height: 1.5; }
    .addr-meta  { font-size: 11px; color: #555; margin-top: 4px; line-height: 1.5; }

    .info-bar {
        display: flex; justify-content: space-between; font-size: 11px;
        color: #888; padding: 4px 0 10px; border-bottom: 1px solid #e0e0e0; margin-bottom: 4px;
    }

    .items-table { width: 100%; border-collapse: collapse; margin-top: 6px; font-size: 11px; table-layout: fixed; }
    .items-table thead tr { background: #FEF3C7; }
    .items-table thead th {
        color: #B45309; font-weight: 700; font-size: 10.5px; padding: 7px 5px;
        text-align: left; border-bottom: 1.5px solid #FDE68A; overflow: hidden; white-space: nowrap;
    }
    .items-table thead th.num { text-align: right; }
    .c-idx  { width: 24px; }
    .c-item { width: auto; }
    .c-gst  { width: 44px; }
    .c-qty  { width: 34px; }
    .c-rate { width: 68px; }
    .c-amt  { width: 68px; }
    .c-tax  { width: 62px; }
    .c-total{ width: 72px; }
    .items-table tbody td {
        padding: 7px 5px; vertical-align: top; border-bottom: 1px solid #eee; overflow: hidden;
    }
    .items-table tbody td.num  { text-align: right; }
    .items-table tbody td.mono { font-family: 'Courier New', Courier, monospace; }
    .items-table tbody td.bold { font-weight: 700; }
    .row-alt { background: #FFFBEB; }
    .item-name { display: block; font-weight: 600; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

    .bottom-row { display: flex; justify-content: space-between; align-items: flex-start; margin-top: 16px; gap: 14px; }
    .bank-box {
        background: #FFFBEB; border: 1px solid #FDE68A; border-radius: 6px;
        padding: 12px 14px; width: 230px; flex-shrink: 0;
    }
    .bank-title { font-size: 12px; font-weight: 700; color: #B45309; margin-bottom: 8px; }
    .bank-row {
        display: flex; justify-content: space-between; align-items: baseline;
        font-size: 11px; padding: 4px 0; border-bottom: 1px solid #eee; gap: 8px;
    }
    .bank-row:last-child { border-bottom: none; }
    .bank-lbl { color: #888; white-space: nowrap; flex-shrink: 0; min-width: 95px; }
    .bank-val { font-weight: 600; color: #1e1e1e; font-family: 'Courier New', Courier, monospace; text-align: right; word-break: break-all; }

    .totals-box {
        background: #FFFBEB; border: 1px solid #FDE68A; border-radius: 6px;
        padding: 12px 16px; width: 220px; flex-shrink: 0; align-self: flex-start;
    }
    .tot-row { display: flex; justify-content: space-between; font-size: 12px; padding: 4px 0; border-bottom: 1px solid #eee; }
    .tot-row:last-child { border-bottom: none; }
    .tot-lbl { color: #888; white-space: nowrap; }
    .tot-val { font-family: 'Courier New', Courier, monospace; font-weight: 600; text-align: right; margin-left: 8px; }
    .tot-row.grand { margin-top: 2px; padding-top: 6px; border-top: 1.5px solid #d0d0d0; }
    .tot-row.grand .tot-lbl { font-weight: 700; color: #1e1e1e; font-size: 13px; }
    .tot-row.grand .tot-val { font-weight: 800; font-size: 13px; color: #1e1e1e; }

    .reason-box {
        margin-top: 12px; padding: 10px 14px; background: #FFF7ED;
        border: 1px solid #FED7AA; border-radius: 6px; font-size: 11.5px;
    }
    .reason-box b { color: #B45309; }

    .terms { margin-top: 20px; padding-top: 12px; border-top: 1px solid #e0e0e0; }
    .terms-title { font-size: 12px; font-weight: 700; color: #B45309; margin-bottom: 6px; }
    .terms ol { padding-left: 16px; }
    .terms li { font-size: 11.5px; color: #444; line-height: 1.6; margin-bottom: 2px; }

    .footer {
        margin-top: 28px; padding-top: 8px; border-top: 1px solid #e0e0e0;
        display: flex; justify-content: space-between; font-size: 10px; color: #aaa;
    }
    .footer-brand { font-weight: 700; color: #B45309; }
    @page { size: A4; margin: 0; }
</style>
</head>
<body>

    <!-- ── HEADER ── -->
    <div class="header">
        <div class="header-left">
            <span class="title">Credit Note</span>
            <span class="status-pill">COMPLETED</span>
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
                <td class="lbl">Credit Note #</td>
                <td class="val">${escapeHtml(cn.creditNoteNumber)}</td>
            </tr>
            <tr>
                <td class="lbl">Date</td>
                <td class="val">${fmtDate((cn as any).completedAt ?? (cn as any).createdAt)}</td>
            </tr>
            <tr>
                <td class="lbl">Warehouse</td>
                <td class="val">${escapeHtml(cn.warehouseId)}</td>
            </tr>
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
    <!-- Credit note: Business issues → Party receives. Opposite of GRN. -->
    <div class="addr-row">
        ${addrBlock('Billed By', fromName, fromLines, fromGstin, fromPan)}
        ${addrBlock('Billed To', toName, toLines, toGstin, toPan)}
    </div>

    <!-- ── INFO BAR ── -->
    <div class="info-bar">
        <span><b>Reason:</b> ${escapeHtml(cn.reason)}</span>
        <span><b>Total Items:</b> ${cn.totalItems}</span>
    </div>

    <!-- ── ITEMS TABLE ── -->
    <table class="items-table">
        <thead>
            <tr>
                <th class="c-idx">#</th>
                <th class="c-item">Item (SKU)</th>
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
    <!-- Bank details here are the BUSINESS's bank — supplier pays back here -->
    <div class="bottom-row">
        <div class="bank-box">
            <div class="bank-title">Refund To (Our Bank Details)</div>
            <div class="bank-row"><span class="bank-lbl">Account Name</span>   <span class="bank-val">${escapeHtml(fromAccountName) || '—'}</span></div>
            <div class="bank-row"><span class="bank-lbl">Account Number</span> <span class="bank-val">${escapeHtml(fromAccountNumber) || '—'}</span></div>
            <div class="bank-row"><span class="bank-lbl">IFSC</span>           <span class="bank-val">${escapeHtml(fromIfsc) || '—'}</span></div>
            <div class="bank-row"><span class="bank-lbl">Bank</span>           <span class="bank-val">${escapeHtml(fromBank) || '—'}</span></div>
        </div>
        <div class="totals-box">
            ${totalsRows}
        </div>
    </div>

    ${cn.notes ? `
    <div class="reason-box">
        <b>Notes:</b> ${escapeHtml(cn.notes)}
    </div>` : ''}

    <!-- ── TERMS ── -->
    <div class="terms">
        <div class="terms-title">Terms and Conditions</div>
        <ol>
            <li>This credit note is issued for goods returned or written off from our warehouse.</li>
            <li>The supplier is requested to process the refund within 30 days of receiving this note.</li>
            <li>Any disputes must be raised within 7 days of receiving this credit note.</li>
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
        const { businessId, creditNoteId } = await req.json();

        if (!businessId || !creditNoteId) {
            return NextResponse.json({ error: 'businessId and creditNoteId are required.' }, { status: 400 });
        }

        // ── Auth ──────────────────────────────────────────────────────────────
        const { authorised, businessDoc, error, status } = await authUserForBusiness({ businessId, req });
        if (!authorised || !businessDoc?.exists) {
            return NextResponse.json({ error }, { status });
        }

        const bizData = businessDoc.data();

        // ── Fetch Credit Note ─────────────────────────────────────────────────
        const cnSnap = await db.doc(`users/${businessId}/credit_notes/${creditNoteId}`).get();
        if (!cnSnap.exists) return NextResponse.json({ error: 'Credit Note not found.' }, { status: 404 });
        const cn = { id: cnSnap.id, ...cnSnap.data() } as CreditNote;

        // ── Fetch Party ───────────────────────────────────────────────────────
        let party: Party | null = null;
        if (cn.partyId) {
            const partySnap = await db.doc(`users/${businessId}/parties/${cn.partyId}`).get();
            if (partySnap.exists) party = { id: partySnap.id, ...partySnap.data() } as Party;
        }

        // ── Build & render ────────────────────────────────────────────────────
        const html = buildCreditNoteHTML({ cn, party, biz: bizData });
        const pdfBuf = await renderPDF(html);

        return new NextResponse(new Uint8Array(pdfBuf), {
            status: 200,
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="${cn.creditNoteNumber}.pdf"`,
            },
        });

    } catch (err) {
        console.error('❌ Credit Note bill PDF generation failed:', err);
        const msg = err instanceof Error ? err.message : 'Unknown error';
        return NextResponse.json({ error: 'Failed to generate PDF.', details: msg }, { status: 500 });
    }
}