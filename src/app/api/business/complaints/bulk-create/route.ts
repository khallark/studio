// apps/web/src/app/api/business/complaints/bulk-create/route.ts
//
// Bulk complaint creation from an uploaded .xlsx or .csv.
// Request: multipart/form-data  { businessId: string, file: File }
// Response: an .xlsx workbook (one row per source row) describing the outcome,
//           plus summary counts in headers:
//             X-Bulk-Total, X-Bulk-Created, X-Bulk-Failed
//
// Only CREATION is supported in bulk (per spec). Each created complaint gets a
// sequential number from a single contiguous block reserved up front.

import { NextRequest, NextResponse } from 'next/server';
import { Readable } from 'stream';
import ExcelJS from 'exceljs';
import { db } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { authUserForBusiness } from '@/lib/authoriseUser';
import {
  COMPLAINT_COUNT_FIELD,
  COMPLAINTS_COLLECTION,
  HEADER_ALIASES,
  MAX_BULK_COMPLAINTS,
  WRITE_CHUNK_SIZE,
  buildOpenComplaintBody,
  formatComplaintNumber,
  normalizeHeader,
  toOptionalString,
  toRequiredString,
  type BulkParsedRow,
} from '@/lib/complaints';
import type { BulkRowResult } from '@/types/complaint';

export const runtime = 'nodejs';

interface ValidRow {
  sourceRow: number; // 1-based row index in the sheet
  subject: string;
  description: string;
  orderNumber: string | null;
  awb: string;
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const businessId = form.get('businessId');
    const file = form.get('file');

    if (!businessId || typeof businessId !== 'string') {
      return NextResponse.json({ error: 'businessId is required.' }, { status: 400 });
    }
    if (!file || typeof file === 'string') {
      return NextResponse.json(
        { error: 'A file is required (field name "file").' },
        { status: 400 },
      );
    }

    // ── Auth ─────────────────────────────────────────────────────────────
    const result = await authUserForBusiness({ businessId, req });
    if (!result.authorised) {
      const { error, status } = result;
      return NextResponse.json({ error }, { status });
    }
    const { userId, businessDoc } = result;
    const bizRef = businessDoc!.ref;

    // ── Load the worksheet (xlsx or csv) ─────────────────────────────────
    const buffer = Buffer.from(await (file as File).arrayBuffer()) as unknown as Buffer;
    const filename = (file as File).name || '';
    const isCsv =
      filename.toLowerCase().endsWith('.csv') ||
      (file as File).type === 'text/csv';

    const workbook = new ExcelJS.Workbook();
    let worksheet: ExcelJS.Worksheet | undefined;

    try {
      if (isCsv) {
        worksheet = await workbook.csv.read(Readable.from(buffer));
      } else {
        await workbook.xlsx.load(buffer);
        worksheet = workbook.worksheets[0];
      }
    } catch {
      return NextResponse.json(
        { error: 'Could not read the file. Upload a valid .xlsx or .csv.' },
        { status: 400 },
      );
    }

    if (!worksheet || worksheet.rowCount < 2) {
      return NextResponse.json(
        { error: 'The file has no data rows below the header.' },
        { status: 400 },
      );
    }

    // ── Map header columns ───────────────────────────────────────────────
    const colMap: Partial<Record<keyof BulkParsedRow, number>> = {};
    const headerRow = worksheet.getRow(1);
    headerRow.eachCell((cell, colNumber) => {
      const key = HEADER_ALIASES[normalizeHeader(cell.value)];
      if (key && colMap[key] === undefined) colMap[key] = colNumber;
    });

    const missing = (['subject', 'description', 'awb'] as const).filter(
      (k) => colMap[k] === undefined,
    );
    if (missing.length > 0) {
      return NextResponse.json(
        {
          error: `Missing required column(s): ${missing.join(', ')}. ` +
            'Expected headers: subject, description, awb (orderNumber optional).',
        },
        { status: 400 },
      );
    }

    // ── Count data rows + enforce cap ────────────────────────────────────
    const dataRowNumbers: number[] = [];
    for (let r = 2; r <= worksheet.rowCount; r++) {
      const row = worksheet.getRow(r);
      // Skip fully-empty rows.
      const hasAny = row.values && (row.values as unknown[]).some((v) => {
        const s = toOptionalString(v);
        return s !== null;
      });
      if (hasAny) dataRowNumbers.push(r);
    }

    if (dataRowNumbers.length === 0) {
      return NextResponse.json(
        { error: 'The file has no non-empty data rows.' },
        { status: 400 },
      );
    }
    if (dataRowNumbers.length > MAX_BULK_COMPLAINTS) {
      return NextResponse.json(
        {
          error: `Too many rows: ${dataRowNumbers.length}. ` +
            `Limit is ${MAX_BULK_COMPLAINTS} per upload.`,
        },
        { status: 400 },
      );
    }

    const cellStr = (row: ExcelJS.Row, key: keyof BulkParsedRow): unknown => {
      const col = colMap[key];
      if (col === undefined) return null;
      const cell = row.getCell(col);
      // ExcelJS may hand back rich text / hyperlink objects — prefer .text.
      return cell.text ?? cell.value;
    };

    // ── Validate every row → partition ───────────────────────────────────
    const valid: ValidRow[] = [];
    const rowResults: BulkRowResult[] = [];

    for (const r of dataRowNumbers) {
      const row = worksheet.getRow(r);
      const subject = toRequiredString(cellStr(row, 'subject'));
      const description = toRequiredString(cellStr(row, 'description'));
      const awb = toRequiredString(cellStr(row, 'awb'));
      const orderNumber = toOptionalString(cellStr(row, 'orderNumber'));

      const problems: string[] = [];
      if (!subject) problems.push('subject missing');
      if (!description) problems.push('description missing');
      if (!awb) problems.push('awb missing');

      if (problems.length > 0) {
        rowResults.push({
          row: r,
          subject,
          awb,
          result: 'failed',
          complaintNumber: null,
          error: problems.join('; '),
        });
        continue;
      }

      valid.push({ sourceRow: r, subject: subject!, description: description!, orderNumber, awb: awb! });
    }

    // ── Reserve a contiguous number block (single transaction) ───────────
    let startNumber = 0;
    if (valid.length > 0) {
      startNumber = await db.runTransaction(async (tx) => {
        const snap = await tx.get(bizRef);
        const current = (snap.data()?.[COMPLAINT_COUNT_FIELD] as number) || 0;
        tx.update(bizRef, { [COMPLAINT_COUNT_FIELD]: current + valid.length });
        return current + 1; // first number in the reserved block
      });
    }

    // ── Write valid docs in chunked batches ──────────────────────────────
    const createdMeta: { sourceRow: number; subject: string; awb: string; number: string }[] = [];

    for (let i = 0; i < valid.length; i += WRITE_CHUNK_SIZE) {
      const slice = valid.slice(i, i + WRITE_CHUNK_SIZE);
      const batch = db.batch();

      slice.forEach((v, j) => {
        const n = startNumber + i + j;
        const complaintNumber = formatComplaintNumber(n);
        const ref = bizRef.collection(COMPLAINTS_COLLECTION).doc();
        batch.set(ref, {
          ...buildOpenComplaintBody({
            subject: v.subject,
            description: v.description,
            orderNumber: v.orderNumber,
            awb: v.awb,
            createdBy: userId!,
            source: 'bulk',
          }),
          complaintNumber,
          createdAt: FieldValue.serverTimestamp(),
        });
        createdMeta.push({ sourceRow: v.sourceRow, subject: v.subject, awb: v.awb, number: complaintNumber });
      });

      await batch.commit();
    }

    for (const m of createdMeta) {
      rowResults.push({
        row: m.sourceRow,
        subject: m.subject,
        awb: m.awb,
        result: 'created',
        complaintNumber: m.number,
        error: null,
      });
    }

    rowResults.sort((a, b) => a.row - b.row);

    const createdCount = createdMeta.length;
    const failedCount = rowResults.length - createdCount;

    // ── Build the result workbook ────────────────────────────────────────
    const out = new ExcelJS.Workbook();
    const sheet = out.addWorksheet('Result');
    sheet.columns = [
      { header: 'Row', key: 'row', width: 8 },
      { header: 'Subject', key: 'subject', width: 32 },
      { header: 'AWB', key: 'awb', width: 22 },
      { header: 'Result', key: 'result', width: 12 },
      { header: 'Complaint Number', key: 'complaintNumber', width: 18 },
      { header: 'Error', key: 'error', width: 40 },
    ];
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).alignment = { vertical: 'middle' };

    rowResults.forEach((r) => {
      const added = sheet.addRow({
        row: r.row,
        subject: r.subject ?? '',
        awb: r.awb ?? '',
        result: r.result === 'created' ? 'Created' : 'Failed',
        complaintNumber: r.complaintNumber ?? '',
        error: r.error ?? '',
      });
      added.getCell('result').font = {
        color: { argb: r.result === 'created' ? 'FF1B7F37' : 'FFB91C1C' },
        bold: true,
      };
    });

    const outBuffer = await out.xlsx.writeBuffer();

    return new NextResponse(outBuffer, {
      status: 200,
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="complaints-bulk-result.xlsx"',
        'X-Bulk-Total': String(rowResults.length),
        'X-Bulk-Created': String(createdCount),
        'X-Bulk-Failed': String(failedCount),
        // Let the browser read the custom headers from a fetch().
        'Access-Control-Expose-Headers': 'X-Bulk-Total, X-Bulk-Created, X-Bulk-Failed',
      },
    });
  } catch (error) {
    console.error('bulk-create complaints error:', error);
    const details = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: 'Bulk upload failed.', details },
      { status: 500 },
    );
  }
}