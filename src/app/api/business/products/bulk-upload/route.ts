// app/api/business/products/bulk-upload/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { authUserForBusiness } from '@/lib/authoriseUser';
import { Timestamp } from 'firebase-admin/firestore';
import { db } from '@/lib/firebase-admin';
import ExcelJS from 'exceljs';

// ============================================================
// TYPES
// ============================================================

interface ProductRow {
    'Product Name'?: string;
    'SKU'?: string;
    'Weight'?: number | string;
    'Category'?: string;
    'Description'?: string;
    'Price'?: number | string;
    'Stock'?: number | string;
    [key: string]: any;
}

interface ProcessedRow extends ProductRow {
    Status: 'Success' | 'Error' | 'Skipped';
    Message: string;
}

interface ValidationResult {
    isValid: boolean;
    errors: string[];
}

// Valid categories
const VALID_CATEGORIES = [
    'Apparel',
    'Accessories',
    'Footwear',
    'Electronics',
    'Home & Living',
    'Beauty & Personal Care',
    'Sports & Outdoors',
    'Books & Stationery',
    'Food & Beverages',
    'Other',
];

// ============================================================
// HELPER FUNCTIONS
// ============================================================

function validateFileStructure(data: ProductRow[], mode: 'add' | 'update'): ValidationResult {
    const errors: string[] = [];

    if (!data || data.length === 0) {
        return { isValid: false, errors: ['File is empty or has no valid data rows'] };
    }

    // Check for required columns based on mode
    const firstRow = data[0];
    const columns = Object.keys(firstRow);

    const requiredColumns = ['SKU'];
    if (mode === 'add') {
        requiredColumns.push('Product Name', 'Weight');
    }

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

function normalizeColumnNames(row: any): ProductRow {
    const normalized: ProductRow = {};

    for (const [key, value] of Object.entries(row)) {
        const normalizedKey = key.trim();

        // Map common variations to standard names
        if (/^product\s*name$/i.test(normalizedKey)) {
            normalized['Product Name'] = value as string;
        } else if (/^sku$/i.test(normalizedKey)) {
            normalized['SKU'] = value as string;
        } else if (/^weight(\s*\(g(rams?)?\))?$/i.test(normalizedKey)) {
            normalized['Weight'] = value as number;
        } else if (/^category$/i.test(normalizedKey)) {
            normalized['Category'] = value as string;
        } else if (/^description$/i.test(normalizedKey)) {
            normalized['Description'] = value as string;
        } else if (/^price(\s*\(₹\))?$/i.test(normalizedKey)) {
            normalized['Price'] = value as number;
        } else if (/^stock$/i.test(normalizedKey)) {
            normalized['Stock'] = value as number;
        } else {
            normalized[normalizedKey] = value;
        }
    }

    return normalized;
}

function validateRow(row: ProductRow, mode: 'add' | 'update', rowIndex: number): { valid: boolean; error?: string } {
    const sku = row['SKU']?.toString().trim();

    if (!sku) {
        return { valid: false, error: `Row ${rowIndex}: SKU is required` };
    }

    if (mode === 'add') {
        const name = row['Product Name']?.toString().trim();
        const weight = parseFloat(row['Weight']?.toString() || '0');

        if (!name) {
            return { valid: false, error: `Row ${rowIndex}: Product Name is required for adding new products` };
        }

        if (!weight || weight <= 0) {
            return { valid: false, error: `Row ${rowIndex}: Weight must be greater than 0` };
        }
    }

    // Validate weight if provided (for update mode too)
    if (row['Weight'] !== undefined && row['Weight'] !== null && row['Weight'] !== '') {
        const weight = parseFloat(row['Weight'].toString());
        if (isNaN(weight) || weight <= 0) {
            return { valid: false, error: `Row ${rowIndex}: Weight must be a positive number` };
        }
    }

    // Validate category if provided
    if (row['Category']) {
        const category = row['Category'].toString().trim();
        if (category && !VALID_CATEGORIES.includes(category)) {
            return { valid: false, error: `Row ${rowIndex}: Invalid category "${category}". Valid options: ${VALID_CATEGORIES.join(', ')}` };
        }
    }

    // Validate price if provided
    if (row['Price'] !== undefined && row['Price'] !== null && row['Price'] !== '') {
        const price = parseFloat(row['Price'].toString());
        if (isNaN(price) || price < 0) {
            return { valid: false, error: `Row ${rowIndex}: Price must be a non-negative number` };
        }
    }

    // Validate stock if provided
    if (row['Stock'] !== undefined && row['Stock'] !== null && row['Stock'] !== '') {
        const stock = parseInt(row['Stock'].toString());
        if (isNaN(stock) || stock < 0) {
            return { valid: false, error: `Row ${rowIndex}: Stock must be a non-negative integer` };
        }
    }

    return { valid: true };
}

async function parseExcelFile(buffer: ArrayBuffer): Promise<ProductRow[]> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);

    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
        throw new Error('No worksheet found in the file');
    }

    const rows: ProductRow[] = [];
    const headers: string[] = [];

    worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) {
            // First row is headers
            row.eachCell((cell, colNumber) => {
                headers[colNumber] = cell.value?.toString() || '';
            });
        } else {
            // Data rows
            const rowData: any = {};
            row.eachCell((cell, colNumber) => {
                const header = headers[colNumber];
                if (header) {
                    rowData[header] = cell.value;
                }
            });

            // Only add non-empty rows
            if (Object.keys(rowData).length > 0) {
                rows.push(normalizeColumnNames(rowData));
            }
        }
    });

    return rows;
}

async function parseCsvFile(buffer: ArrayBuffer): Promise<ProductRow[]> {
    const text = new TextDecoder().decode(buffer);
    const lines = text.split(/\r?\n/).filter(line => line.trim());

    if (lines.length < 2) {
        throw new Error('CSV file must have at least a header row and one data row');
    }

    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
    const rows: ProductRow[] = [];

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
    const worksheet = workbook.addWorksheet('Results');

    // Define columns
    worksheet.columns = [
        { header: 'Product Name', key: 'Product Name', width: 25 },
        { header: 'SKU', key: 'SKU', width: 15 },
        { header: 'Weight', key: 'Weight', width: 10 },
        { header: 'Category', key: 'Category', width: 18 },
        { header: 'Description', key: 'Description', width: 30 },
        { header: 'Price', key: 'Price', width: 10 },
        { header: 'Stock', key: 'Stock', width: 10 },
        { header: 'Status', key: 'Status', width: 12 },
        { header: 'Message', key: 'Message', width: 40 },
    ];

    // Style header row
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' },
    };

    // Add data rows with conditional styling
    results.forEach((result, index) => {
        const row = worksheet.addRow(result);

        // Color code based on status
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

    // Generate buffer
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
        const mode = formData.get('mode') as 'add' | 'update' | null;

        // ============================================================
        // VALIDATION
        // ============================================================

        if (!businessId) {
            return NextResponse.json(
                { error: 'Validation Error', message: 'businessId is required' },
                { status: 400 }
            );
        }

        if (!mode || !['add', 'update'].includes(mode)) {
            return NextResponse.json(
                { error: 'Validation Error', message: 'mode must be either "add" or "update"' },
                { status: 400 }
            );
        }

        if (!file) {
            return NextResponse.json(
                { error: 'Validation Error', message: 'No file uploaded' },
                { status: 400 }
            );
        }

        // Validate file type
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
        let data: ProductRow[];

        if (fileName.endsWith('.csv')) {
            data = await parseCsvFile(arrayBuffer);
        } else {
            data = await parseExcelFile(arrayBuffer);
        }

        // Validate file structure
        const structureValidation = validateFileStructure(data, mode);
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
        // GET EXISTING PRODUCTS
        // ============================================================

        const productsRef = businessDoc?.ref.collection('products');
        const existingProductsSnap = await productsRef?.get();
        const existingSkus = new Set<string>();

        existingProductsSnap?.docs.forEach(doc => {
            existingSkus.add(doc.id.toUpperCase());
        });

        // ============================================================
        // PROCESS ROWS
        // ============================================================

        const results: ProcessedRow[] = [];
        let batch = db.batch();
        let batchCount = 0;
        const MAX_BATCH_SIZE = 450; // Firestore limit is 500, keep some buffer

        let successCount = 0;
        let errorCount = 0;
        let skippedCount = 0;

        const userData = userDoc?.data();
        const userEmail = userData?.email || userData?.primaryContact?.email || null;

        for (let i = 0; i < data.length; i++) {
            const row = data[i];
            const rowIndex = i + 2; // +2 because row 1 is header, and we're 0-indexed

            // Skip completely empty rows
            const sku = row['SKU']?.toString().trim().toUpperCase();
            if (!sku && !row['Product Name']) {
                continue;
            }

            // Validate row
            const validation = validateRow(row, mode, rowIndex);
            if (!validation.valid) {
                results.push({
                    ...row,
                    Status: 'Error',
                    Message: validation.error || 'Validation failed',
                });
                errorCount++;
                continue;
            }

            const skuUpper = sku!.toUpperCase();
            const productRef = productsRef?.doc(skuUpper);

            if (mode === 'add') {
                // ADD MODE: Skip if SKU already exists
                if (existingSkus.has(skuUpper)) {
                    results.push({
                        ...row,
                        Status: 'Skipped',
                        Message: `SKU "${skuUpper}" already exists in the system`,
                    });
                    skippedCount++;
                    continue;
                }

                // Create new product
                const productData: any = {
                    name: row['Product Name']?.toString().trim(),
                    sku: skuUpper,
                    weight: parseFloat(row['Weight']?.toString() || '0'),
                    category: row['Category']?.toString().trim() || 'Other',
                    createdBy: userId,
                    createdAt: Timestamp.now(),
                    updatedAt: Timestamp.now(),
                };

                if (row['Description']) {
                    productData.description = row['Description'].toString().trim();
                }
                if (row['Price'] !== undefined && row['Price'] !== '') {
                    productData.price = parseFloat(row['Price'].toString());
                }
                if (row['Stock'] !== undefined && row['Stock'] !== '') {
                    productData.stock = parseInt(row['Stock'].toString());
                }

                batch.set(productRef!, productData);
                batchCount++;

                // Also create a log entry
                const logRef = productRef!.collection('logs').doc();
                batch.set(logRef, {
                    action: 'created',
                    changes: [
                        { field: 'name', fieldLabel: 'Product Name', oldValue: null, newValue: productData.name },
                        { field: 'weight', fieldLabel: 'Weight', oldValue: null, newValue: productData.weight },
                        { field: 'category', fieldLabel: 'Category', oldValue: null, newValue: productData.category },
                    ],
                    performedBy: userId,
                    performedByEmail: userEmail,
                    performedAt: Timestamp.now(),
                    metadata: { source: 'bulk_upload' },
                });
                batchCount++;

                existingSkus.add(skuUpper); // Track for subsequent rows
                results.push({
                    ...row,
                    Status: 'Success',
                    Message: 'Product created successfully',
                });
                successCount++;

            } else {
                // UPDATE MODE: Skip if SKU doesn't exist
                if (!existingSkus.has(skuUpper)) {
                    results.push({
                        ...row,
                        Status: 'Skipped',
                        Message: `SKU "${skuUpper}" does not exist in the system`,
                    });
                    skippedCount++;
                    continue;
                }

                // Build update object with only provided fields
                const updateData: any = {
                    updatedBy: userId,
                    updatedAt: Timestamp.now(),
                };
                const changes: any[] = [];

                if (row['Product Name']) {
                    updateData.name = row['Product Name'].toString().trim();
                    changes.push({ field: 'name', fieldLabel: 'Product Name', oldValue: '(previous)', newValue: updateData.name });
                }
                if (row['Weight'] !== undefined && row['Weight'] !== '') {
                    updateData.weight = parseFloat(row['Weight'].toString());
                    changes.push({ field: 'weight', fieldLabel: 'Weight', oldValue: '(previous)', newValue: updateData.weight });
                }
                if (row['Category']) {
                    updateData.category = row['Category'].toString().trim();
                    changes.push({ field: 'category', fieldLabel: 'Category', oldValue: '(previous)', newValue: updateData.category });
                }
                if (row['Description'] !== undefined) {
                    updateData.description = row['Description']?.toString().trim() || null;
                    changes.push({ field: 'description', fieldLabel: 'Description', oldValue: '(previous)', newValue: updateData.description });
                }
                if (row['Price'] !== undefined && row['Price'] !== '') {
                    updateData.price = parseFloat(row['Price'].toString());
                    changes.push({ field: 'price', fieldLabel: 'Price', oldValue: '(previous)', newValue: updateData.price });
                }
                if (row['Stock'] !== undefined && row['Stock'] !== '') {
                    updateData.stock = parseInt(row['Stock'].toString());
                    changes.push({ field: 'stock', fieldLabel: 'Stock', oldValue: '(previous)', newValue: updateData.stock });
                }

                // Only update if there are actual changes
                if (Object.keys(updateData).length > 2) { // More than just updatedBy and updatedAt
                    batch.update(productRef!, updateData);
                    batchCount++;

                    // Create log entry
                    const logRef = productRef!.collection('logs').doc();
                    batch.set(logRef, {
                        action: 'updated',
                        changes,
                        performedBy: userId,
                        performedByEmail: userEmail,
                        performedAt: Timestamp.now(),
                        metadata: { source: 'bulk_upload' },
                    });
                    batchCount++;

                    results.push({
                        ...row,
                        Status: 'Success',
                        Message: 'Product updated successfully',
                    });
                    successCount++;
                } else {
                    results.push({
                        ...row,
                        Status: 'Skipped',
                        Message: 'No fields to update',
                    });
                    skippedCount++;
                }
            }

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
            message: `Bulk ${mode === 'add' ? 'upload' : 'update'} completed`,
            summary: {
                total: data.length,
                success: successCount,
                skipped: skippedCount,
                errors: errorCount,
            },
            resultFile: {
                name: `bulk-${mode}-results-${Date.now()}.xlsx`,
                data: resultBase64,
                mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            },
        });

    } catch (error: any) {
        console.error('❌ Bulk upload error:', error);
        return NextResponse.json(
            {
                error: 'Internal Server Error',
                message: error.message || 'An unexpected error occurred',
            },
            { status: 500 }
        );
    }
}