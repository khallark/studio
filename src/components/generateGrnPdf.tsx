/**
 * generateGRNBillPdf.ts
 * Generates a bill-style PDF for a GRN, closely matching the Majime invoice reference.
 * Client-side only — jsPDF + jspdf-autotable.
 *
 * Install: npm install jspdf jspdf-autotable
 *
 * Usage:
 *   import { downloadGRNBill } from '@/lib/generateGRNBillPdf';
 *   await downloadGRNBill(grn, businessId, user);
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { User } from 'firebase/auth';
import { GRN } from '@/types/warehouse';
import { Party, PurchaseOrder } from '@/types/warehouse';

// ─── Palette (matches reference invoice) ────────────────────────────────────
const C = {
    purple: [107, 70, 193] as [number, number, number], // #6B46C1
    purpleLight: [237, 233, 254] as [number, number, number], // #EDE9FE  (table header bg)
    dark: [30, 30, 30] as [number, number, number],
    grey: [100, 100, 100] as [number, number, number],
    greyLight: [160, 160, 160] as [number, number, number],
    border: [220, 220, 220] as [number, number, number],
    bg: [249, 250, 251] as [number, number, number],
    white: [255, 255, 255] as [number, number, number],
    green: [5, 150, 105] as [number, number, number],
    red: [220, 38, 38] as [number, number, number],
    slate: [100, 116, 139] as [number, number, number],
};

// ─── Page geometry ───────────────────────────────────────────────────────────
const PW = 210;  // A4 width mm
const PH = 297;  // A4 height mm
const ML = 14;   // margin left
const MR = 14;   // margin right
const CW = PW - ML - MR; // 182mm content width

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** jsPDF doesn't support ₹ in built-in fonts — use Rs. */
function rs(amount: number): string {
    return 'Rs. ' + amount.toLocaleString('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

function fmt(ts: any): string {
    if (!ts) return '—';
    try {
        const d = ts.toDate ? ts.toDate() : new Date(ts);
        return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch { return '—'; }
}

function statusLabel(s: string) {
    return { draft: 'DRAFT', completed: 'COMPLETED', cancelled: 'CANCELLED' }[s] ?? s.toUpperCase();
}
function statusColor(s: string): [number, number, number] {
    if (s === 'completed') return C.green;
    if (s === 'cancelled') return C.red;
    return C.slate;
}

/** Draw a horizontal rule */
function rule(doc: jsPDF, y: number, color = C.border) {
    doc.setDrawColor(...color);
    doc.setLineWidth(0.3);
    doc.line(ML, y, PW - MR, y);
}

/** Outlined rounded rect */
function outlineRect(doc: jsPDF, x: number, y: number, w: number, h: number, r = 2, color = C.border) {
    doc.setDrawColor(...color);
    doc.setLineWidth(0.25);
    doc.roundedRect(x, y, w, h, r, r, 'S');
}

/** Filled rounded rect */
function fillRect(doc: jsPDF, x: number, y: number, w: number, h: number, r = 2, fill: [number, number, number] = C.bg) {
    doc.setFillColor(...fill);
    doc.roundedRect(x, y, w, h, r, r, 'F');
}

/** Safe text — clips to maxW with ellipsis */
function safeText(doc: jsPDF, text: string, x: number, y: number, maxW: number, align: 'left' | 'right' = 'left') {
    const safe = doc.splitTextToSize(String(text ?? '—'), maxW)[0] ?? '';
    doc.text(safe, x, y, { align });
}

/** Render a label+value line pair, returns new y after the pair */
function labelValue(
    doc: jsPDF,
    label: string,
    value: string,
    x: number,
    y: number,
    maxW: number,
): number {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...C.grey);
    safeText(doc, label, x, y, maxW);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...C.purple);
    safeText(doc, value, x, y + 4, maxW);
    return y + 9;
}

// ─── Address block renderer (returns final y) ────────────────────────────────
function renderAddressBlock(
    doc: jsPDF,
    title: string,
    name: string,
    lines: string[],   // address lines
    gstin: string,
    pan: string,
    x: number,
    y: number,
    w: number,
    h: number,
): void {
    fillRect(doc, x, y, w, h, 2, C.bg);
    outlineRect(doc, x, y, w, h, 2, C.border);

    let cy = y + 6;
    const ix = x + 4;
    const iw = w - 8;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...C.purple);
    safeText(doc, title, ix, cy, iw);
    cy += 5;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...C.dark);
    safeText(doc, name, ix, cy, iw);
    cy += 5;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...C.dark);
    for (const line of lines) {
        if (!line) continue;
        const wrapped = doc.splitTextToSize(line, iw);
        for (const wl of wrapped) {
            doc.text(wl, ix, cy);
            cy += 4;
        }
    }

    cy += 1;
    const metaLines: Array<[string, string]> = [];
    if (gstin) metaLines.push(['GSTIN:', gstin]);
    if (pan) metaLines.push(['PAN:', pan]);

    for (const [lbl, val] of metaLines) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(...C.grey);
        doc.text(lbl, ix, cy);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...C.dark);
        safeText(doc, val, ix + doc.getTextWidth(lbl) + 2, cy, iw - doc.getTextWidth(lbl) - 2);
        cy += 4.5;
    }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export async function downloadGRNBill(
    grn: GRN,
    businessId: string,
    user: User,
): Promise<void> {
    // ── 1. Fetch PO ──────────────────────────────────────────────────────────
    const idToken = await user.getIdToken();
    const poSnap = await getDoc(doc(db, 'users', businessId, 'purchaseOrders', grn.poId));
    const po = poSnap.exists() ? (poSnap.data() as PurchaseOrder) : null;

    // ── 2. Fetch Party (supplier) ────────────────────────────────────────────
    let party: Party | null = null;
    if (po?.supplierPartyId) {
        const partySnap = await getDoc(doc(db, 'users', businessId, 'parties', po.supplierPartyId));
        if (partySnap.exists()) party = partySnap.data() as Party;
    }

    // ── 3. Fetch Business doc ────────────────────────────────────────────────
    const bizSnap = await getDoc(doc(db, 'users', businessId));
    const biz = bizSnap.exists() ? bizSnap.data() : null;
    const bizAddr = biz?.companyAddress ?? biz?.address ?? null;

    // ── 4. Build data ────────────────────────────────────────────────────────

    // Billed From — party/supplier
    const fromName = party?.name ?? po?.supplierName ?? '—';
    const fromAddr = party?.address;
    const fromLines = [
        fromAddr?.line1,
        fromAddr?.line2,
        [fromAddr?.city, fromAddr?.state].filter(Boolean).join(', '),
        [fromAddr?.country, fromAddr?.pincode].filter(Boolean).join(' - '),
    ].filter(Boolean) as string[];
    const fromGstin = party?.gstin ?? '';
    const fromPan = party?.pan ?? '';

    // Billed To — business
    const toName = biz?.companyName ?? biz?.businessName ?? '—';
    const toLines = [
        bizAddr?.address ?? bizAddr?.line1,
        [bizAddr?.city, bizAddr?.state].filter(Boolean).join(', '),
        [bizAddr?.country, bizAddr?.pincode].filter(Boolean).join(' - '),
    ].filter(Boolean) as string[];
    const toGstin = ''; // left blank intentionally
    const toPan = '';

    // Items — only received qty
    const items = grn.items.filter(i => i.receivedQty > 0);
    const subtotal = items.reduce((s, i) => s + i.receivedQty * i.unitCost, 0);

    // ── 5. Build PDF ─────────────────────────────────────────────────────────
    const doc2 = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    let y = 14;

    // ════════════════════════════════════════════════════════════════
    // SECTION A — HEADER (mirrors reference: title left, logo right)
    // ════════════════════════════════════════════════════════════════

    // "GRN Receipt" title
    doc2.setFont('helvetica', 'bold');
    doc2.setFontSize(22);
    doc2.setTextColor(...C.purple);
    doc2.text('GRN Receipt', ML, y + 5);

    // Status pill next to title
    const sc = statusColor(grn.status);
    const sl = statusLabel(grn.status);
    doc2.setFont('helvetica', 'bold');
    doc2.setFontSize(7.5);
    const pillW = Math.max(doc2.getTextWidth(sl) + 6, 20);
    const pillX = ML + doc2.getTextWidth('GRN Receipt') + 4;
    doc2.setFillColor(...sc);
    doc2.roundedRect(pillX, y, pillW, 6, 1.5, 1.5, 'F');
    doc2.setTextColor(255, 255, 255);
    doc2.text(sl, pillX + pillW / 2, y + 4, { align: 'center' });

    // MAJIME wordmark — top right (triangle logo approximated with text)
    doc2.setFont('helvetica', 'bold');
    doc2.setFontSize(16);
    doc2.setTextColor(...C.dark);
    doc2.text('MAJIME', PW - MR, y + 3, { align: 'right' });
    // decorative underline in purple
    const mw = doc2.getTextWidth('MAJIME');
    doc2.setDrawColor(...C.purple);
    doc2.setLineWidth(0.6);
    doc2.line(PW - MR - mw, y + 5, PW - MR, y + 5);

    // Invoice No & Date lines
    y += 12;
    doc2.setFont('helvetica', 'normal');
    doc2.setFontSize(8.5);
    doc2.setTextColor(...C.grey);
    doc2.text('GRN No #', ML, y);
    doc2.setFont('helvetica', 'bold');
    doc2.setTextColor(...C.dark);
    doc2.text(grn.grnNumber, ML + 22, y);

    y += 5;
    doc2.setFont('helvetica', 'normal');
    doc2.setTextColor(...C.grey);
    doc2.text('GRN Date', ML, y);
    doc2.setFont('helvetica', 'bold');
    doc2.setTextColor(...C.dark);
    doc2.text(fmt(grn.receivedAt ?? grn.createdAt), ML + 22, y);

    if (grn.billNumber) {
        y += 5;
        doc2.setFont('helvetica', 'normal');
        doc2.setTextColor(...C.grey);
        doc2.text('Bill / Invoice #', ML, y);
        doc2.setFont('helvetica', 'bold');
        doc2.setTextColor(...C.dark);
        safeText(doc2, grn.billNumber, ML + 30, y, 60);
    }

    // ════════════════════════════════════════════════════════════════
    // SECTION B — BILLED BY / BILLED TO (two equal columns)
    // ════════════════════════════════════════════════════════════════
    y += 10;
    const boxW = (CW - 6) / 2; // ~88mm each, 6mm gap
    const boxH = 46;
    const boxY = y;

    renderAddressBlock(doc2, 'Billed By', fromName, fromLines, fromGstin, fromPan,
        ML, boxY, boxW, boxH);
    renderAddressBlock(doc2, 'Billed To', toName, toLines, toGstin, toPan,
        ML + boxW + 6, boxY, boxW, boxH);

    // ════════════════════════════════════════════════════════════════
    // SECTION C — SUPPLY INFO BAR (thin, centred, like reference)
    // ════════════════════════════════════════════════════════════════
    y = boxY + boxH + 5;
    doc2.setFont('helvetica', 'normal');
    doc2.setFontSize(8);
    doc2.setTextColor(...C.grey);
    const supplyLeft = `Linked PO: ${grn.poNumber}`;
    const supplyRight = `Warehouse: ${grn.warehouseName ?? grn.warehouseId}`;
    doc2.text(supplyLeft, ML, y);
    safeText(doc2, supplyRight, PW - MR, y, 80, 'right');

    // ════════════════════════════════════════════════════════════════
    // SECTION D — ITEMS TABLE
    // Column widths must sum to CW = 182mm:
    //   # (6) | Item (94) | Qty (16) | Rate (30) | Amount (36) = 182 ✓
    // ════════════════════════════════════════════════════════════════
    y += 5;

    autoTable(doc2, {
        startY: y,
        margin: { left: ML, right: MR },
        tableWidth: CW,
        head: [['#', 'Item', 'Qty.', 'Rate (Rs.)', 'Amount (Rs.)']],
        body: items.map((item, i) => [
            String(i + 1) + '.',
            `${item.productName}\n${item.sku}`,
            String(item.receivedQty),
            item.unitCost.toLocaleString('en-IN', { minimumFractionDigits: 2 }),
            (item.receivedQty * item.unitCost).toLocaleString('en-IN', { minimumFractionDigits: 2 }),
        ]),
        headStyles: {
            fillColor: C.purpleLight,
            textColor: C.purple,
            fontStyle: 'bold',
            fontSize: 8.5,
            cellPadding: { top: 4, bottom: 4, left: 3, right: 3 },
        },
        columnStyles: {
            0: { cellWidth: 8, halign: 'left', fontSize: 8, fontStyle: 'normal' },
            1: { cellWidth: 92, halign: 'left', fontSize: 8, fontStyle: 'normal' },
            2: { cellWidth: 16, halign: 'center', fontSize: 8, fontStyle: 'normal' },
            3: { cellWidth: 32, halign: 'right', fontSize: 8, fontStyle: 'normal', font: 'courier' },
            4: { cellWidth: 34, halign: 'right', fontSize: 8, fontStyle: 'bold', font: 'courier' },
        },
        bodyStyles: {
            textColor: C.dark,
            cellPadding: { top: 3, bottom: 3, left: 3, right: 3 },
        },
        alternateRowStyles: { fillColor: C.bg },
        tableLineColor: C.border,
        tableLineWidth: 0.2,
        // Subtle SKU text colour
        didParseCell(data) {
            if (data.section === 'body' && data.column.index === 1) {
                // SKU is the second line — rendered inside same cell via \n
                data.cell.styles.fontSize = 8;
            }
        },
        didDrawCell(data) {
            // Draw SKU in grey below product name (same cell, manual second line)
            if (data.section === 'body' && data.column.index === 1) {
                const raw = String(data.cell.raw ?? '');
                const parts = raw.split('\n');
                if (parts.length > 1) {
                    doc2.setFont('courier', 'normal');
                    doc2.setFontSize(7);
                    doc2.setTextColor(...C.grey);
                    doc2.text(
                        parts[1],
                        data.cell.x + 3,
                        data.cell.y + data.cell.height - 3.5,
                    );
                }
            }
        },
    });

    // ════════════════════════════════════════════════════════════════
    // SECTION E — BANK DETAILS (left) + TOTALS (right)
    //   Mirrors reference invoice exactly.
    // ════════════════════════════════════════════════════════════════
    const afterTableY = (doc2 as any).lastAutoTable.finalY + 6;
    y = afterTableY;

    // Guard: if we're too close to page bottom, add page
    if (y > PH - 80) {
        doc2.addPage();
        y = 16;
    }

    const bankW = 78;
    const totW = 72;
    const totX = PW - MR - totW;
    const bankH = 36;

    // Bank details box (left) — fields present, values blank
    fillRect(doc2, ML, y, bankW, bankH, 2, C.bg);
    outlineRect(doc2, ML, y, bankW, bankH, 2, C.border);

    doc2.setFont('helvetica', 'bold');
    doc2.setFontSize(8.5);
    doc2.setTextColor(...C.purple);
    doc2.text('Bank Details', ML + 4, y + 6);

    const bankFields: Array<[string, string]> = [
        ['Account Name', ''],
        ['Account Number', ''],
        ['IFSC', ''],
        ['Bank', ''],
    ];
    let by = y + 12;
    for (const [lbl, val] of bankFields) {
        doc2.setFont('helvetica', 'bold');
        doc2.setFontSize(7.5);
        doc2.setTextColor(...C.grey);
        doc2.text(lbl, ML + 4, by);
        doc2.setFont('helvetica', 'normal');
        doc2.setFontSize(7.5);
        doc2.setTextColor(...C.dark);
        doc2.text(val || '—', ML + 34, by);
        by += 5;
    }

    // Totals box (right) — Amount + Total (INR)
    const totH = 28;
    fillRect(doc2, totX, y, totW, totH, 2, C.bg);
    outlineRect(doc2, totX, y, totW, totH, 2, C.border);

    let ty = y + 7;

    const totRow = (label: string, value: string, bold = false, large = false, topBorder = false) => {
        if (topBorder) {
            doc2.setDrawColor(...C.border);
            doc2.setLineWidth(0.2);
            doc2.line(totX + 2, ty - 2.5, totX + totW - 2, ty - 2.5);
        }
        doc2.setFont('helvetica', bold ? 'bold' : 'normal');
        doc2.setFontSize(large ? 9.5 : 8);
        doc2.setTextColor(bold ? C.dark[0] : C.grey[0], bold ? C.dark[1] : C.grey[1], bold ? C.dark[2] : C.grey[2]);
        doc2.text(label, totX + 4, ty);

        doc2.setFont('courier', bold ? 'bold' : 'normal');
        doc2.setFontSize(large ? 9.5 : 8);
        safeText(doc2, value, totX + totW - 4, ty, totW - 20, 'right');
        ty += large ? 7 : 5.5;
    };

    totRow('Amount', subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 }));
    totRow('Total (INR)', rs(subtotal), true, true, true);

    // ════════════════════════════════════════════════════════════════
    // SECTION F — TERMS AND CONDITIONS
    // ════════════════════════════════════════════════════════════════
    y = Math.max(y + bankH, y + totH) + 8;

    if (y > PH - 45) {
        doc2.addPage();
        y = 16;
    }

    doc2.setFont('helvetica', 'bold');
    doc2.setFontSize(9);
    doc2.setTextColor(...C.purple);
    doc2.text('Terms and Conditions', ML, y);
    y += 5;

    const terms = [
        'Payment is due within 30 days from the date of this GRN receipt.',
        'All disputes must be raised within 7 days of receipt of goods.',
        'Goods once received and accepted cannot be returned without prior written approval.',
    ];
    doc2.setFont('helvetica', 'normal');
    doc2.setFontSize(8);
    doc2.setTextColor(...C.dark);
    terms.forEach((t, i) => {
        const lines = doc2.splitTextToSize(`${i + 1}. ${t}`, CW);
        lines.forEach((line: string) => {
            doc2.text(line, ML, y);
            y += 4.5;
        });
    });

    // ════════════════════════════════════════════════════════════════
    // SECTION G — FOOTER (pinned near bottom)
    // ════════════════════════════════════════════════════════════════
    const footerY = PH - 8;
    rule(doc2, footerY - 3, C.border);
    doc2.setFont('helvetica', 'normal');
    doc2.setFontSize(7);
    doc2.setTextColor(...C.grey);
    doc2.text('This is an electronically generated document, no signature is required.', ML, footerY);
    doc2.setFont('helvetica', 'bold');
    doc2.setTextColor(...C.purple);
    doc2.text('Powered by Majime', PW - MR, footerY, { align: 'right' });

    // ── Save ──────────────────────────────────────────────────────────────────
    doc2.save(`${grn.grnNumber}-bill.pdf`);
}