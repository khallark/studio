/**
 * generateGRNPdf.ts
 * Client-side GRN bill PDF generator — uses jsPDF + jspdf-autotable.
 * Install: npm install jspdf jspdf-autotable
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { GRN } from '@/types/warehouse';

// ─── Constants ────────────────────────────────────────────────────────────────
const PURPLE   = '#6B46C1';
const PURPLE_R = 107; const PURPLE_G = 70; const PURPLE_B = 193;
const PURPLE_LIGHT_R = 237; const PURPLE_LIGHT_G = 233; const PURPLE_LIGHT_B = 254;
const DARK_R   = 30;  const DARK_G   = 30;  const DARK_B   = 30;
const GREY_R   = 100; const GREY_G   = 100; const GREY_B   = 100;
const GREEN_R  = 5;   const GREEN_G  = 150; const GREEN_B  = 105;
const AMBER_R  = 180; const AMBER_G  = 83;  const AMBER_B  = 9;
const RED_R    = 220; const RED_G    = 38;  const RED_B    = 38;
const SLATE_R  = 100; const SLATE_G  = 116; const SLATE_B  = 139;
const BG_R     = 249; const BG_G     = 250; const BG_B     = 251;
const BORDER_R = 220; const BORDER_G = 220; const BORDER_B = 220;

const ML = 14; // margin left
const MR = 14; // margin right
const PW = 210; // A4 width mm
const CW = PW - ML - MR; // content width

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(timestamp: any): string {
    if (!timestamp) return '—';
    try {
        const d = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch { return '—'; }
}

function fmtCurrency(amount: number): string {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency', currency: 'INR', minimumFractionDigits: 2,
    }).format(amount);
}

function statusRGB(status: string): [number, number, number] {
    if (status === 'completed') return [GREEN_R, GREEN_G, GREEN_B];
    if (status === 'cancelled') return [RED_R, RED_G, RED_B];
    return [SLATE_R, SLATE_G, SLATE_B]; // draft
}

function statusLabel(status: string): string {
    return { draft: 'DRAFT', completed: 'COMPLETED', cancelled: 'CANCELLED' }[status] ?? status.toUpperCase();
}

// Draw a thin horizontal rule
function rule(doc: jsPDF, y: number, r = BORDER_R, g = BORDER_G, b = BORDER_B) {
    doc.setDrawColor(r, g, b);
    doc.setLineWidth(0.3);
    doc.line(ML, y, PW - MR, y);
}

// Filled rounded rect helper
function filledRoundRect(
    doc: jsPDF,
    x: number, y: number, w: number, h: number,
    r: number,
    fillR: number, fillG: number, fillB: number,
) {
    doc.setFillColor(fillR, fillG, fillB);
    doc.roundedRect(x, y, w, h, r, r, 'F');
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function downloadGRNPdf(grn: GRN): void {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    let y = 14;

    // ── HEADER ROW: Logo left | "Goods Receipt Note" right ──────────────────
    // Purple logo block
    filledRoundRect(doc, ML, y, 32, 10, 2, PURPLE_R, PURPLE_G, PURPLE_B);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(255, 255, 255);
    doc.text('MAJIME', ML + 16, y + 6.5, { align: 'center' });

    // Title
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(DARK_R, DARK_G, DARK_B);
    doc.text('Goods Receipt Note', PW - MR, y + 4, { align: 'right' });

    // Status pill
    y += 13;
    const sc = statusRGB(grn.status);
    const sl = statusLabel(grn.status);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    const pillW = doc.getTextWidth(sl) + 7;
    const pillX = PW - MR - pillW;
    doc.setFillColor(sc[0], sc[1], sc[2]);
    doc.roundedRect(pillX, y - 4, pillW, 5.5, 1.5, 1.5, 'F');
    doc.setTextColor(255, 255, 255);
    doc.text(sl, pillX + pillW / 2, y, { align: 'center' });

    // GRN number sub-line
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(GREY_R, GREY_G, GREY_B);
    doc.text(grn.grnNumber, PW - MR, y + 5.5, { align: 'right' });

    y += 8;
    rule(doc, y, PURPLE_R, PURPLE_G, PURPLE_B);
    doc.setLineWidth(0.3);
    doc.setDrawColor(PURPLE_R, PURPLE_G, PURPLE_B);
    doc.line(ML, y + 0.6, PW - MR, y + 0.6); // double-line effect

    // ── TWO-COLUMN META BLOCK ─────────────────────────────────────────────────
    y += 6;
    const col1X = ML;
    const col2X = ML + CW / 2 + 4;
    const colW  = CW / 2 - 4;

    // Light bg card for meta
    filledRoundRect(doc, ML, y, CW, 34, 2, BG_R, BG_G, BG_B);
    doc.setDrawColor(BORDER_R, BORDER_G, BORDER_B);
    doc.setLineWidth(0.25);
    doc.roundedRect(ML, y, CW, 34, 2, 2, 'S');

    const metaLabelStyle = () => {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(GREY_R, GREY_G, GREY_B);
    };
    const metaValueStyle = () => {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(DARK_R, DARK_G, DARK_B);
    };

    const metaRows: Array<[string, string, string, string]> = [
        ['Linked PO',       grn.poNumber,                          'Bill / Invoice #', grn.billNumber || '—'],
        ['Warehouse',       grn.warehouseName || grn.warehouseId,  'Received By',      grn.receivedBy || '—'],
        ['Created At',      fmt(grn.createdAt),                    'Received At',      fmt(grn.receivedAt)],
        ['Received Value',  fmtCurrency(grn.totalReceivedValue),   'UPCs Created',     String((grn as any).totalUPCsCreated ?? '—')],
    ];

    let ry = y + 6;
    for (const [l1, v1, l2, v2] of metaRows) {
        metaLabelStyle();
        doc.text(l1, col1X + 4, ry);
        doc.text(l2, col2X, ry);
        ry += 4;
        metaValueStyle();
        doc.text(v1, col1X + 4, ry);
        doc.text(v2, col2X, ry);
        ry += 5;
    }

    // ── QUANTITY SUMMARY PILLS ────────────────────────────────────────────────
    y += 38;
    const pillH = 14;
    const pillTW = (CW - 8) / 3;

    const pills: Array<{ label: string; value: number; r: number; g: number; b: number; fr: number; fg: number; fb: number }> = [
        { label: 'Total Expected',     value: grn.totalExpectedQty,    r: 37,  g: 99,  b: 235,  fr: 239, fg: 246, fb: 255 },
        { label: 'Total Received',     value: grn.totalReceivedQty,    r: GREEN_R, g: GREEN_G, b: GREEN_B, fr: 236, fg: 253, fb: 245 },
        { label: 'Not Received',       value: grn.totalNotReceivedQty, r: AMBER_R, g: AMBER_G, b: AMBER_B, fr: 255, fg: 251, fb: 235 },
    ];

    pills.forEach((p, i) => {
        const px = ML + i * (pillTW + 4);
        filledRoundRect(doc, px, y, pillTW, pillH, 2, p.fr, p.fg, p.fb);
        doc.setDrawColor(p.r, p.g, p.b);
        doc.setLineWidth(0.2);
        doc.roundedRect(px, y, pillTW, pillH, 2, 2, 'S');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(14);
        doc.setTextColor(p.r, p.g, p.b);
        doc.text(String(p.value), px + pillTW / 2, y + 7, { align: 'center' });

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(p.r, p.g, p.b);
        doc.text(p.label, px + pillTW / 2, y + 12, { align: 'center' });
    });

    // ── NOTES ─────────────────────────────────────────────────────────────────
    y += pillH + 6;
    if (grn.notes) {
        filledRoundRect(doc, ML, y, CW, 11, 2, BG_R, BG_G, BG_B);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(GREY_R, GREY_G, GREY_B);
        doc.text('Notes', ML + 3, y + 4);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(DARK_R, DARK_G, DARK_B);
        // Truncate long notes to fit single row
        const notesText = doc.splitTextToSize(grn.notes, CW - 6)[0];
        doc.text(notesText, ML + 3, y + 9);
        y += 15;
    }

    // ── LINE ITEMS TABLE ──────────────────────────────────────────────────────
    y += 2;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(DARK_R, DARK_G, DARK_B);
    doc.text(`Line Items (${grn.items.length})`, ML, y);
    y += 4;

    autoTable(doc, {
        startY: y,
        margin: { left: ML, right: MR },
        head: [['SKU', 'Product', 'Expected', 'Received', 'Not Received', 'Value (INR)']],
        body: grn.items.map(item => [
            item.sku,
            item.productName,
            item.expectedQty,
            item.receivedQty,
            item.notReceivedQty,
            fmtCurrency(item.totalCost),
        ]),
        headStyles: {
            fillColor: [PURPLE_LIGHT_R, PURPLE_LIGHT_G, PURPLE_LIGHT_B],
            textColor: [PURPLE_R, PURPLE_G, PURPLE_B],
            fontStyle: 'bold',
            fontSize: 8,
            halign: 'left',
        },
        columnStyles: {
            0: { cellWidth: 28, fontSize: 7.5, fontStyle: 'normal', font: 'courier' },
            1: { cellWidth: 'auto', fontSize: 8 },
            2: { cellWidth: 20, halign: 'center', fontSize: 8 },
            3: { cellWidth: 20, halign: 'center', fontSize: 8, fontStyle: 'bold',
                 textColor: [GREEN_R, GREEN_G, GREEN_B] },
            4: { cellWidth: 24, halign: 'center', fontSize: 8 },
            5: { cellWidth: 30, halign: 'right', fontSize: 8, font: 'courier' },
        },
        alternateRowStyles: { fillColor: [BG_R, BG_G, BG_B] },
        bodyStyles: { textColor: [DARK_R, DARK_G, DARK_B] },
        tableLineColor: [BORDER_R, BORDER_G, BORDER_B],
        tableLineWidth: 0.2,
        didParseCell(data) {
            // Colour "Not Received" column amber when > 0
            if (data.section === 'body' && data.column.index === 4) {
                const val = Number(data.cell.raw);
                if (val > 0) data.cell.styles.textColor = [AMBER_R, AMBER_G, AMBER_B];
            }
        },
    });

    // ── TOTALS BOX (bottom-right, matching reference invoice) ─────────────────
    const afterTable = (doc as any).lastAutoTable.finalY + 6;
    const boxW = 72;
    const boxX = PW - MR - boxW;
    let by = afterTable;

    filledRoundRect(doc, boxX, by, boxW, 28, 2, BG_R, BG_G, BG_B);
    doc.setDrawColor(BORDER_R, BORDER_G, BORDER_B);
    doc.setLineWidth(0.25);
    doc.roundedRect(boxX, by, boxW, 28, 2, 2, 'S');

    const totRow = (label: string, value: string, bold = false, large = false) => {
        doc.setFont('helvetica', bold ? 'bold' : 'normal');
        doc.setFontSize(large ? 9.5 : 8.5);
        doc.setTextColor(bold ? DARK_R : GREY_R, bold ? DARK_G : GREY_G, bold ? DARK_B : GREY_B);
        doc.text(label, boxX + 4, by);
        doc.setFont('courier', bold ? 'bold' : 'normal');
        doc.text(value, boxX + boxW - 4, by, { align: 'right' });
        by += large ? 7 : 6;
    };

    by += 5;
    totRow('Total Expected Qty',  String(grn.totalExpectedQty));
    totRow('Total Received Qty',  String(grn.totalReceivedQty));

    // Divider inside box
    doc.setDrawColor(BORDER_R, BORDER_G, BORDER_B);
    doc.setLineWidth(0.2);
    doc.line(boxX + 2, by, boxX + boxW - 2, by);
    by += 4;

    totRow('Total (INR)', fmtCurrency(grn.totalReceivedValue), true, true);

    // ── FOOTER ────────────────────────────────────────────────────────────────
    const footerY = 287;
    rule(doc, footerY, BORDER_R, BORDER_G, BORDER_B);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(GREY_R, GREY_G, GREY_B);
    doc.text('This is a system-generated document. No signature is required.', ML, footerY + 4);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(PURPLE_R, PURPLE_G, PURPLE_B);
    doc.text('Majime', PW - MR, footerY + 4, { align: 'right' });

    // ── SAVE ─────────────────────────────────────────────────────────────────
    doc.save(`${grn.grnNumber}.pdf`);
}