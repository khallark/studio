// app/api/shopify/products/bulk-mapping/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { authUserForBusiness } from '@/lib/authoriseUser';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { db } from '@/lib/firebase-admin';
import ExcelJS from 'exceljs';

// ============================================================
// TYPES
// ============================================================

interface MappingRow {
    'Store Product Title'?: string;
    'Store Product SKU'?: string;
    'Business Product SKU'?: string;
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

interface StoreVariantInfo {
    storeId: string;
    productId: string;
    productTitle: string;
    variantId: number;
    variantTitle: string;
    variantSku: string;
    currentMapping: string | null;
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

    const requiredColumns = ['Store Product Title', 'Store Product SKU', 'Business Product SKU'];

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

        if (/^store\s*product\s*title$/i.test(normalizedKey)) {
            normalized['Store Product Title'] = value as string;
        } else if (/^store\s*product\s*sku$/i.test(normalizedKey) || /^store\s*sku$/i.test(normalizedKey) || /^variant\s*sku$/i.test(normalizedKey)) {
            normalized['Store Product SKU'] = value as string;
        } else if (/^business\s*product\s*sku$/i.test(normalizedKey) || /^business\s*sku$/i.test(normalizedKey)) {
            normalized['Business Product SKU'] = value as string;
        } else {
            normalized[normalizedKey] = value;
        }
    }

    return normalized;
}

function validateRow(row: MappingRow, rowIndex: number): { valid: boolean; error?: string } {
    const storeProductTitle = row['Store Product Title']?.toString().trim();
    const storeProductSku = row['Store Product SKU']?.toString().trim();
    const businessProductSku = row['Business Product SKU']?.toString().trim();

    if (!storeProductTitle) {
        return { valid: false, error: `Row ${rowIndex}: Store Product Title is required` };
    }

    if (!storeProductSku) {
        return { valid: false, error: `Row ${rowIndex}: Store Product SKU is required` };
    }

    if (!businessProductSku) {
        return { valid: false, error: `Row ${rowIndex}: Business Product SKU is required` };
    }

    return { valid: true };
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
        { header: 'Store Product Title', key: 'Store Product Title', width: 35 },
        { header: 'Store Product SKU', key: 'Store Product SKU', width: 20 },
        { header: 'Business Product SKU', key: 'Business Product SKU', width: 20 },
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
        // GET LINKED STORES AND BUILD VARIANT INDEX
        // ============================================================

        const businessData = businessDoc?.data();
        const linkedStores: string[] = businessData?.stores || [];

        if (linkedStores.length === 0) {
            return NextResponse.json(
                { error: 'Validation Error', message: 'No linked stores found for this business' },
                { status: 400 }
            );
        }

        // Build an index of all store variants by SKU
        const storeVariantIndex: Map<string, StoreVariantInfo> = new Map();

        for (const storeId of linkedStores) {
            const storeProductsSnap = await db
                .collection('accounts')
                .doc(storeId)
                .collection('products')
                .get();

            storeProductsSnap.docs.forEach(doc => {
                const product = doc.data();
                const variants = product.variants || [];
                const variantMappings = product.variantMappings || {};

                variants.forEach((variant: any) => {
                    const variantSku = variant.sku?.toString().trim().toUpperCase();
                    if (variantSku) {
                        storeVariantIndex.set(variantSku, {
                            storeId,
                            productId: doc.id,
                            productTitle: product.title || '',
                            variantId: variant.id,
                            variantTitle: variant.title || 'Default Title',
                            variantSku: variant.sku,
                            currentMapping: variantMappings[variant.id] || null,
                        });
                    }
                });
            });
        }

        // ============================================================
        // GET EXISTING BUSINESS PRODUCTS
        // ============================================================

        const businessProductsSnap = await businessDoc?.ref.collection('products').get();
        const businessProductSkus = new Set<string>();
        const businessProductNames: Map<string, string> = new Map();

        businessProductsSnap?.docs.forEach(doc => {
            const sku = doc.id.toUpperCase();
            businessProductSkus.add(sku);
            businessProductNames.set(sku, doc.data().name || sku);
        });

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

        for (let i = 0; i < data.length; i++) {
            const row = data[i];
            const rowIndex = i + 2;

            // Skip empty rows
            const storeProductSku = row['Store Product SKU']?.toString().trim().toUpperCase();
            const businessProductSku = row['Business Product SKU']?.toString().trim().toUpperCase();

            if (!storeProductSku && !businessProductSku) {
                continue;
            }

            // Validate row
            const validation = validateRow(row, rowIndex);
            if (!validation.valid) {
                results.push({
                    ...row,
                    Status: 'Error',
                    Message: validation.error || 'Validation failed',
                });
                errorCount++;
                continue;
            }

            // Check if store variant exists
            const variantInfo = storeVariantIndex.get(storeProductSku!);
            if (!variantInfo) {
                results.push({
                    ...row,
                    Status: 'Skipped',
                    Message: `Store Product SKU "${storeProductSku}" not found in any linked store`,
                });
                skippedCount++;
                continue;
            }

            // Check if business product exists
            if (!businessProductSkus.has(businessProductSku!)) {
                results.push({
                    ...row,
                    Status: 'Skipped',
                    Message: `Business Product SKU "${businessProductSku}" does not exist`,
                });
                skippedCount++;
                continue;
            }

            // Check if already mapped to the same SKU
            if (variantInfo.currentMapping === businessProductSku) {
                results.push({
                    ...row,
                    Status: 'Skipped',
                    Message: `Already mapped to "${businessProductSku}"`,
                });
                skippedCount++;
                continue;
            }

            // Create the mapping
            const storeProductRef = db
                .collection('accounts')
                .doc(variantInfo.storeId)
                .collection('products')
                .doc(variantInfo.productId);

            const businessProductRef = businessDoc?.ref.collection('products').doc(businessProductSku!);

            // Update store product with variant mapping
            batch.update(storeProductRef, {
                [`variantMappings.${variantInfo.variantId}`]: businessProductSku,
                [`variantMappingDetails.${variantInfo.variantId}`]: {
                    businessProductSku: businessProductSku,
                    mappedAt: new Date().toISOString(),
                    mappedBy: userId,
                },
                updatedAt: FieldValue.serverTimestamp(),
            });
            batchCount++;

            // Update business product with mapped variant
            const mappedVariantEntry = {
                storeId: variantInfo.storeId,
                productId: variantInfo.productId,
                productTitle: variantInfo.productTitle,
                variantId: variantInfo.variantId,
                variantTitle: variantInfo.variantTitle,
                variantSku: variantInfo.variantSku,
                mappedAt: new Date().toISOString(),
            };

            batch.update(businessProductRef!, {
                mappedVariants: FieldValue.arrayUnion(mappedVariantEntry),
                updatedAt: FieldValue.serverTimestamp(),
            });
            batchCount++;

            // Create log entry
            const logRef = businessProductRef!.collection('logs').doc();
            batch.set(logRef, {
                action: 'mapping_created',
                changes: [
                    {
                        field: 'variantMapping',
                        fieldLabel: 'Variant Mapping',
                        oldValue: variantInfo.currentMapping || null,
                        newValue: `${variantInfo.storeId.replace('.myshopify.com', '')} → ${variantInfo.productTitle} → ${variantInfo.variantTitle}`,
                    },
                ],
                performedBy: userId,
                performedByEmail: userEmail,
                performedAt: Timestamp.now(),
                metadata: {
                    source: 'bulk_mapping',
                    storeId: variantInfo.storeId,
                    productId: variantInfo.productId,
                    variantId: variantInfo.variantId,
                    variantTitle: variantInfo.variantTitle,
                    variantSku: variantInfo.variantSku,
                    storeProductTitle: variantInfo.productTitle,
                },
            });
            batchCount++;

            // Update the index to reflect the new mapping
            variantInfo.currentMapping = businessProductSku!;

            results.push({
                ...row,
                Status: 'Success',
                Message: `Mapped to "${businessProductNames.get(businessProductSku!) || businessProductSku}"`,
            });
            successCount++;

            // Commit batch if approaching limit
            if (batchCount >= MAX_BATCH_SIZE) {
                await batch.commit();
                batch = db.batch();
                batchCount = 0;
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