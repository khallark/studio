// /api/shopify/products/export-store-variants/route.ts
//
// Exports store product variants to Excel with mapping status
// Payload: { businessId, storeFilter?, mappingFilter?, searchQuery? }
// Auth: Bearer token
// Returns: Excel file (.xlsx)

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';
import { authUserForBusiness, authUserForBusinessAndStore } from '@/lib/authoriseUser';
import ExcelJS from 'exceljs';
import { SHARED_STORE_IDS, SUPER_ADMIN_ID } from '@/lib/shared-constants';

// ============================================================
// TYPES
// ============================================================

interface ExportVariant {
    storeProductTitle: string;
    variantSku: string;
    variantTitle: string;
    storeName: string;
    isMapped: boolean;
    mappedToSku: string | null;
}

// ============================================================
// MAIN HANDLER
// ============================================================

export async function POST(req: NextRequest) {
    const body = await req.json();
    const { businessId, storeFilter, mappingFilter, searchQuery }: {
        businessId: string;
        storeFilter: string | null;
        mappingFilter: string | null;
        searchQuery: string | null;
    } = body;

    // ============================================================
    // PARSE REQUEST
    // ============================================================

    if (!businessId) {
        return NextResponse.json(
            { error: 'Bad Request', message: 'businessId is required' },
            { status: 400 }
        );
    }

    try {
        // ============================================================
        // AUTHORIZATION
        // ============================================================

        const result = (storeFilter && storeFilter.length && storeFilter !== 'all')
            ? await authUserForBusinessAndStore({ businessId, shop: storeFilter, req })
            : await authUserForBusiness({ businessId, req });

        if (!result.authorised) {
            return NextResponse.json(
                { error: 'Not authorised', message: result.error },
                { status: result.status }
            );
        }

        // ============================================================
        // GET BUSINESS STORES
        // ============================================================

        const { businessDoc } = result;

        if (!businessDoc?.exists) {
            return NextResponse.json(
                { error: 'Not Found', message: 'Business not found' },
                { status: 404 }
            );
        }

        const businessData = businessDoc.data();
        const linkedStores: string[] = businessData?.stores || [];

        if (linkedStores.length === 0) {
            return NextResponse.json(
                { error: 'No Data', message: 'No stores linked to this business' },
                { status: 400 }
            );
        }

        // ============================================================
        // FETCH STORES INFO
        // ============================================================

        const storesMap: Record<string, string> = {};
        const storesToQuery = storeFilter && storeFilter !== 'all'
            ? [storeFilter]
            : linkedStores;

        for (const storeId of linkedStores) {
            const storeDoc = await db.collection('accounts').doc(storeId).get();
            if (storeDoc.exists) {
                storesMap[storeId] = storeDoc.data()?.shopName || storeId;
            }
        }

        // ============================================================
        // FETCH STORE PRODUCTS AND EXTRACT VARIANTS
        // ============================================================

        const exportData: ExportVariant[] = [];

        for (const storeId of storesToQuery) {
            const productsQuery = SHARED_STORE_IDS.includes(storeId) && businessId !== SUPER_ADMIN_ID
                ? db
                    .collection('accounts')
                    .doc(storeId)
                    .collection('products')
                    .where('isDeleted', '==', false)
                    .where('vendor', '==', businessData?.vendorName)
                : db
                    .collection('accounts')
                    .doc(storeId)
                    .collection('products')
                    .where('isDeleted', '==', false);

            const productsSnap = await productsQuery.get();

            for (const doc of productsSnap.docs) {
                const productData = doc.data();
                const productTitle = productData.title || 'Untitled Product';
                const vendor = productData.vendor || null;
                const variants = productData.variants || [];
                const variantMappings: Record<string, string> = productData.variantMappings || {};

                for (const variant of variants) {
                    const variantId = variant.id;
                    const mappedBusinessSku = variantMappings[String(variantId)] || null;
                    const isMapped = !!mappedBusinessSku;

                    // Apply mapping filter
                    if (mappingFilter === 'mapped' && !isMapped) continue;
                    if (mappingFilter === 'unmapped' && isMapped) continue;

                    // Apply search filter
                    if (searchQuery) {
                        const search = searchQuery.toLowerCase();
                        const titleMatch = productTitle.toLowerCase().includes(search);
                        const variantTitleMatch = variant.title?.toLowerCase().includes(search);
                        const skuMatch = variant.sku?.toLowerCase().includes(search);
                        const vendorMatch = vendor?.toLowerCase().includes(search);

                        if (!titleMatch && !variantTitleMatch && !skuMatch && !vendorMatch) continue;
                    }

                    exportData.push({
                        storeProductTitle: productTitle,
                        variantSku: variant.sku || '',
                        variantTitle: variant.title || 'Default Title',
                        storeName: storesMap[storeId] || storeId,
                        isMapped: isMapped,
                        mappedToSku: mappedBusinessSku,
                    });
                }
            }
        }

        // Sort by product title, then variant title
        exportData.sort((a, b) => {
            const productCompare = a.storeProductTitle.localeCompare(b.storeProductTitle);
            if (productCompare !== 0) return productCompare;
            return a.variantTitle.localeCompare(b.variantTitle);
        });

        // ============================================================
        // CREATE EXCEL FILE WITH EXCELJS
        // ============================================================

        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'Majime';
        workbook.created = new Date();

        const worksheet = workbook.addWorksheet('Store Variants');

        // Define columns
        worksheet.columns = [
            { header: 'Store Product Title', key: 'storeProductTitle', width: 45 },
            { header: 'Variant Title', key: 'variantTitle', width: 25 },
            { header: 'Variant SKU', key: 'variantSku', width: 20 },
            { header: 'Store', key: 'storeName', width: 25 },
            { header: 'Is Mapped', key: 'isMapped', width: 12 },
            { header: 'Mapped to Business SKU', key: 'mappedToSku', width: 25 },
        ];

        // Style header row
        const headerRow = worksheet.getRow(1);
        headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        headerRow.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF4F46E5' }, // Indigo color
        };
        headerRow.alignment = { vertical: 'middle', horizontal: 'left' };
        headerRow.height = 24;

        // Add data rows
        exportData.forEach((item) => {
            worksheet.addRow({
                storeProductTitle: item.storeProductTitle,
                variantTitle: item.variantTitle,
                variantSku: item.variantSku,
                storeName: item.storeName,
                isMapped: item.isMapped ? 'TRUE' : 'FALSE',
                mappedToSku: item.mappedToSku || '',
            });
        });

        // Style data rows - alternate row colors for readability
        worksheet.eachRow((row, rowNumber) => {
            if (rowNumber > 1) {
                // Alternate row background
                if (rowNumber % 2 === 0) {
                    row.fill = {
                        type: 'pattern',
                        pattern: 'solid',
                        fgColor: { argb: 'FFF9FAFB' }, // Light gray
                    };
                }

                // Style the "Is Mapped" column
                const isMappedCell = row.getCell(5);
                if (isMappedCell.value === 'TRUE') {
                    isMappedCell.font = { color: { argb: 'FF059669' }, bold: true }; // Green
                } else {
                    isMappedCell.font = { color: { argb: 'FFDC2626' } }; // Red
                }
            }

            // Add borders to all cells
            row.eachCell((cell) => {
                cell.border = {
                    top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                    left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                    bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                    right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                };
            });
        });

        // Freeze header row
        worksheet.views = [{ state: 'frozen', ySplit: 1 }];

        // Auto-filter
        worksheet.autoFilter = {
            from: 'A1',
            to: 'F1',
        };

        // Generate buffer
        const buffer = await workbook.xlsx.writeBuffer();

        // ============================================================
        // RETURN EXCEL FILE
        // ============================================================

        const filename = `store-variants-${new Date().toISOString().split('T')[0]}.xlsx`;

        return new NextResponse(buffer, {
            status: 200,
            headers: {
                'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'Content-Disposition': `attachment; filename="${filename}"`,
            },
        });

    } catch (error: any) {
        console.error('Error exporting store variants:', error);
        return NextResponse.json(
            {
                error: 'Internal Server Error',
                message: error.message || 'An unexpected error occurred',
            },
            { status: 500 }
        );
    }
}