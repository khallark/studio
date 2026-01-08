// /api/business/inventory/bulk-inward/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { authUserForBusiness } from '@/lib/authoriseUser';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { db } from '@/lib/firebase-admin';
import ExcelJS from 'exceljs';
import { Placement, Rack, Shelf, Warehouse, Zone } from '@/types/warehouse';

// ============================================================
// TYPES
// ============================================================

interface MappingRow {
    'Warehouse Code'?: string;
    'Zone Code'?: string;
    'Rack Code'?: string;
    'Shelf Code'?: string;
    'Business Product SKU'?: string;
    'Business Product Quantity'?: string;
    [key: string]: any;
}

interface ProcessedRow extends MappingRow {
    Status: 'Success' | 'Error' | 'Skipped';
    Message: string;
}

interface ValidationResult {
    isValid: boolean;
    errors: string[];
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

function validateFileStructure(data: MappingRow[]): ValidationResult {
    const errors: string[] = [];

    if (!data || data.length === 0) {
        return { isValid: false, errors: ['File is empty or has no valid data rows'] };
    }

    const firstRow = data[0];
    const columns = Object.keys(firstRow);

    const requiredColumns = ['Warehouse Code', 'Zone Code', 'Rack Code', 'Shelf Code', 'Business Product SKU', 'Business Product Quantity'];

    for (const col of requiredColumns) {
        if (!columns.some(c => c.toLowerCase().trim() === col.toLowerCase())) {
            errors.push(`Missing required column: ${col}`);
        }
    }

    if (errors.length > 0) {
        return { isValid: false, errors };
    }

    return { isValid: true, errors: [] };
}

function normalizeColumnNames(row: any): MappingRow {
    const normalized: MappingRow = {};

    for (const [key, value] of Object.entries(row)) {
        const normalizedKey = key.trim();

        if (/^warehouse\s*code$/i.test(normalizedKey)) {
            normalized['Warehouse Code'] = value as string;
        } else if (/^zone\s*code$/i.test(normalizedKey)) {
            normalized['Zone Code'] = value as string;
        } else if (/^rack\s*code$/i.test(normalizedKey)) {
            normalized['Rack Code'] = value as string;
        } else if (/^shelf\s*code$/i.test(normalizedKey)) {
            normalized['Shelf Code'] = value as string;
        } else if (/^business\s*product\s*sku$/i.test(normalizedKey)) {
            normalized['Business Product SKU'] = value as string;
        } else if (/^business\s*product\s*quantity$/i.test(normalizedKey)) {
            normalized['Business Product Quantity'] = value as string;
        } else {
            normalized[normalizedKey] = value;
        }
    }

    return normalized;
}

async function parseExcelFile(buffer: ArrayBuffer): Promise<MappingRow[]> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);

    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
        throw new Error('No worksheet found in the file');
    }

    const rows: MappingRow[] = [];
    const headers: string[] = [];

    worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) {
            row.eachCell((cell, colNumber) => {
                headers[colNumber] = cell.value?.toString() || '';
            });
        } else {
            const rowData: any = {};
            row.eachCell((cell, colNumber) => {
                const header = headers[colNumber];
                if (header) {
                    rowData[header] = cell.value;
                }
            });

            if (Object.keys(rowData).length > 0) {
                rows.push(normalizeColumnNames(rowData));
            }
        }
    });

    return rows;
}

async function parseCsvFile(buffer: ArrayBuffer): Promise<MappingRow[]> {
    const text = new TextDecoder().decode(buffer);
    const lines = text.split(/\r?\n/).filter(line => line.trim());

    if (lines.length < 2) {
        throw new Error('CSV file must have at least a header row and one data row');
    }

    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
    const rows: MappingRow[] = [];

    for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
        const rowData: any = {};

        headers.forEach((header, index) => {
            if (values[index] !== undefined && values[index] !== '') {
                rowData[header] = values[index];
            }
        });

        if (Object.keys(rowData).length > 0) {
            rows.push(normalizeColumnNames(rowData));
        }
    }

    return rows;
}

async function generateResultExcel(results: ProcessedRow[]): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Mapping Results');

    worksheet.columns = [
        { header: 'Warehouse Code', key: 'Warehouse Code', width: 35 },
        { header: 'Zone Code', key: 'Zone Code', width: 20 },
        { header: 'Rack Code', key: 'Rack Code', width: 20 },
        { header: 'Shelf Code', key: 'Shelf Code', width: 20 },
        { header: 'Business Product SKU', key: 'Business Product SKU', width: 20 },
        { header: 'Business Product Quantity', key: 'Business Product Quantity', width: 20 },
        { header: 'Status', key: 'Status', width: 12 },
        { header: 'Message', key: 'Message', width: 50 },
    ];

    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' },
    };

    results.forEach((result) => {
        const row = worksheet.addRow(result);

        const statusCell = row.getCell('Status');
        if (result.Status === 'Success') {
            statusCell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFD4EDDA' },
            };
            statusCell.font = { color: { argb: 'FF155724' } };
        } else if (result.Status === 'Error') {
            statusCell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFF8D7DA' },
            };
            statusCell.font = { color: { argb: 'FF721C24' } };
        } else if (result.Status === 'Skipped') {
            statusCell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFFFF3CD' },
            };
            statusCell.font = { color: { argb: 'FF856404' } };
        }
    });

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
}

async function processRow(
    row: MappingRow,
    rowIndex: number,
    businessId: string,
    businessDoc: any,
    userId: string,
    userEmail: string | null,
    req: NextRequest
): Promise<{
    result: ProcessedRow;
    applyWrites?: (batch: FirebaseFirestore.WriteBatch) => number;
}> {
    const warehouseCode = row['Warehouse Code']?.toString().trim().toUpperCase();
    const zoneCode = row['Zone Code']?.toString().trim().toUpperCase();
    const rackCode = row['Rack Code']?.toString().trim().toUpperCase();
    const shelfCode = row['Shelf Code']?.toString().trim().toUpperCase();
    const businessProductSKU = row['Business Product SKU']?.toString().trim().toUpperCase();
    const businessProductQuantity = Number(row['Business Product Quantity']);

    if (!warehouseCode || !zoneCode || !rackCode || !shelfCode || !businessProductSKU) {
        return {
            result: { ...row, Status: 'Error', Message: `Row ${rowIndex}: Missing required fields` }
        };
    }

    if (isNaN(businessProductQuantity) || businessProductQuantity <= 0) {
        return {
            result: { ...row, Status: 'Error', Message: `Invalid Business Product Quantity` }
        };
    }

    const placementId = `${businessProductSKU}_${shelfCode}`;

    const [
        warehouseDoc,
        zoneDoc,
        rackDoc,
        shelfDoc,
        businessProductDoc,
        placementDoc,
    ] = await Promise.all([
        db.collection('users').doc(businessId).collection('warehouses').doc(warehouseCode).get(),
        db.collection('users').doc(businessId).collection('zones').doc(zoneCode).get(),
        db.collection('users').doc(businessId).collection('racks').doc(rackCode).get(),
        db.collection('users').doc(businessId).collection('shelves').doc(shelfCode).get(),
        db.collection('users').doc(businessId).collection('products').doc(businessProductSKU).get(),
        db.collection('users').doc(businessId).collection('placements').doc(placementId).get(),
    ]);

    if (!warehouseDoc.exists || !zoneDoc.exists || !rackDoc.exists || !shelfDoc.exists) {
        return {
            result: {
                ...row,
                Status: 'Skipped',
                Message: `Invalid warehouse hierarchy`
            }
        };
    }

    if (!businessProductDoc.exists) {
        return {
            result: {
                ...row,
                Status: 'Skipped',
                Message: `Business Product "${businessProductSKU}" does not exist`
            }
        };
    }

    const warehouseData = warehouseDoc.data() as Warehouse;
    const zoneData = zoneDoc.data() as Zone;
    const rackData = rackDoc.data() as Rack;
    const shelfData = shelfDoc.data() as Shelf;

    if (
        shelfData.rackId !== rackData.code ||
        shelfData.zoneId !== zoneData.code ||
        shelfData.warehouseId !== warehouseData.code
    ) {
        return {
            result: {
                ...row,
                Status: 'Skipped',
                Message: `Shelf path mismatch`
            }
        };
    }

    const now = Timestamp.now();

    return {
        result: {
            ...row,
            Status: 'Success',
            Message: `Placement "${placementId}" processed successfully`
        },

        applyWrites: (batch) => {
            if (placementDoc.exists) {
                batch.update(placementDoc.ref, {
                    quantity: FieldValue.increment(businessProductQuantity),
                    updatedAt: now,
                    updatedBy: userId,
                    lastMovementReason: 'inward_addition',
                });
            } else {
                batch.set(placementDoc.ref, {
                    id: placementId,
                    productId: businessProductSKU,
                    productSKU: businessProductSKU,
                    quantity: businessProductQuantity,
                    shelfId: shelfData.code,
                    shelfName: shelfData.name,
                    rackId: rackData.code,
                    rackName: rackData.name,
                    zoneId: zoneData.code,
                    zoneName: zoneData.name,
                    warehouseId: warehouseData.code,
                    warehouseName: warehouseData.name,
                    createdAt: now,
                    updatedAt: now,
                    createdBy: userId,
                    updatedBy: userId,
                    lastMovementReason: 'inward_addition',
                    coordinates: null,
                    locationCode: null,
                    lastMovementReference: null,
                });
            }

            const logRef = businessProductDoc.ref.collection('logs').doc();
            batch.set(logRef, {
                action: 'inventory_adjusted',
                adjustmentType: 'inward',
                adjustmentAmount: businessProductQuantity,
                performedBy: userId,
                performedByEmail: userEmail,
                performedAt: now,
            });

            const productRef = businessProductDoc.ref;
            batch.set(productRef, {
                'inventory.inwardAddition': businessProductQuantity,
            })

            return 3; // number of writes added
        }
    };
}


// ============================================================
// MAIN HANDLER
// ============================================================

export async function POST(req: NextRequest) {
    try {
        // ============================================================
        // PARSE FORM DATA
        // ============================================================

        const formData = await req.formData();
        const file = formData.get('file') as File | null;
        const businessId = formData.get('businessId') as string | null;

        // ============================================================
        // VALIDATION
        // ============================================================

        if (!businessId) {
            return NextResponse.json(
                { error: 'Validation Error', message: 'businessId is required' },
                { status: 400 }
            );
        }

        if (!file) {
            return NextResponse.json(
                { error: 'Validation Error', message: 'No file uploaded' },
                { status: 400 }
            );
        }

        const fileName = file.name.toLowerCase();
        if (!fileName.endsWith('.xlsx') && !fileName.endsWith('.xls') && !fileName.endsWith('.csv')) {
            return NextResponse.json(
                { error: 'Validation Error', message: 'File must be an Excel (.xlsx, .xls) or CSV (.csv) file' },
                { status: 400 }
            );
        }

        // ============================================================
        // AUTHORIZATION
        // ============================================================

        const result = await authUserForBusiness({ businessId, req });
        const { businessDoc, userId, userDoc } = result;

        if (!result.authorised) {
            const { error, status } = result;
            return NextResponse.json({ error }, { status });
        }

        if (!userId) {
            return NextResponse.json({ error: 'User not logged in' }, { status: 401 });
        }

        // ============================================================
        // PARSE FILE
        // ============================================================

        const arrayBuffer = await file.arrayBuffer();
        let data: MappingRow[];

        if (fileName.endsWith('.csv')) {
            data = await parseCsvFile(arrayBuffer);
        } else {
            data = await parseExcelFile(arrayBuffer);
        }

        const structureValidation = validateFileStructure(data);
        if (!structureValidation.isValid) {
            return NextResponse.json(
                {
                    error: 'Validation Error',
                    message: 'Invalid file structure',
                    details: structureValidation.errors
                },
                { status: 400 }
            );
        }

        // ============================================================
        // PROCESS ROWS
        // ============================================================

        const results: ProcessedRow[] = [];
        let batch = db.batch();
        let batchCount = 0;
        const MAX_BATCH_SIZE = 450;

        let successCount = 0;
        let errorCount = 0;
        let skippedCount = 0;

        const userData = userDoc?.data();
        const userEmail = userData?.email || userData?.primaryContact?.email || null;

        const CONCURRENCY = 10;

        for (let i = 0; i < data.length; i += CONCURRENCY) {
            const chunk = data.slice(i, i + CONCURRENCY);

            const processed = await Promise.all(
                chunk.map((row, idx) =>
                    processRow(
                        row,
                        i + idx + 2,
                        businessId,
                        businessDoc,
                        userId,
                        userEmail,
                        req
                    )
                )
            );

            for (const item of processed) {
                results.push(item.result);

                if (item.result.Status === 'Success') successCount++;
                if (item.result.Status === 'Error') errorCount++;
                if (item.result.Status === 'Skipped') skippedCount++;

                if (item.applyWrites) {
                    batchCount += item.applyWrites(batch);
                }

                if (batchCount >= MAX_BATCH_SIZE) {
                    await batch.commit();
                    batch = db.batch();
                    batchCount = 0;
                }
            }
        }


        // Commit remaining operations
        if (batchCount > 0) {
            await batch.commit();
        }

        // ============================================================
        // GENERATE RESULT FILE
        // ============================================================

        const resultBuffer = await generateResultExcel(results);
        const resultBase64 = resultBuffer.toString('base64');

        // ============================================================
        // RETURN RESPONSE
        // ============================================================

        return NextResponse.json({
            success: true,
            message: 'Bulk mapping completed',
            summary: {
                total: data.length,
                success: successCount,
                skipped: skippedCount,
                errors: errorCount,
            },
            resultFile: {
                name: `bulk-mapping-results-${Date.now()}.xlsx`,
                data: resultBase64,
                mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            },
        });

    } catch (error: any) {
        console.error('❌ Bulk mapping error:', error);
        return NextResponse.json(
            {
                error: 'Internal Server Error',
                message: error.message || 'An unexpected error occurred',
            },
            { status: 500 }
        );
    }
}