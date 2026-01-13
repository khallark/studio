// src/app/api/public/book-return/delete-images/route.ts

import { NextRequest, NextResponse } from "next/server";
import { validateCustomerSession } from "@/lib/validateBookReturnSession";
import { storage } from "@/lib/firebase-admin";
import { getBusinessIdForStore } from "@/lib/storage-helpers";
import { SHARED_STORE_IDS } from "@/lib/shared-constants";

export async function POST(req: NextRequest) {
    try {
        const session = await validateCustomerSession(req);
        const body = await req.json();
        const { storeId, orderId } = body;

        if (!storeId || !orderId || typeof orderId !== 'string' || orderId.trim() === '') {
            return NextResponse.json({
                error: 'Valid Store ID and Order ID are required.'
            }, { status: 400 });
        }

        const businessId = await getBusinessIdForStore(storeId);

        const bucket = storage.bucket();

        // ✅ Determine paths to check
        let foldersToCheck: string[] = [];

        if (SHARED_STORE_IDS.includes(storeId)) {
            // Shared store - check shared path
            foldersToCheck.push(`return-images/shared/${storeId}/${orderId}/`);
        } else if (businessId) {
            // Regular store - check business path
            foldersToCheck.push(`return-images/${businessId}/${storeId}/${orderId}/`);
        }

        // Always check legacy path too
        foldersToCheck.push(`return-images/${storeId}/${orderId}/`);

        try {
            let allFiles: any[] = [];

            // Check all possible paths
            for (const folderPath of foldersToCheck) {
                const [files] = await bucket.getFiles({ prefix: folderPath });
                allFiles = [...allFiles, ...files];
            }

            if (allFiles.length > 0) {
                await Promise.all(
                    allFiles.map(file => file.delete().catch((err: any) => {
                        console.warn(`Failed to delete file ${file.name}:`, err);
                    }))
                );

                console.log(`Deleted ${allFiles.length} images from ${foldersToCheck.length} locations`);

                return NextResponse.json({
                    success: true,
                    deletedCount: allFiles.length,
                    message: `Successfully deleted ${allFiles.length} existing images.`
                }, { status: 200 });
            } else {
                return NextResponse.json({
                    success: true,
                    deletedCount: 0,
                    message: 'No existing images found to delete.'
                }, { status: 200 });
            }
        } catch (deleteError) {
            console.error('Error deleting existing files:', deleteError);
            throw deleteError;
        }

    } catch (error: any) {
        console.error('Delete images failed:', error);

        if (error.message?.includes('SESSION') || error.message?.includes('CSRF')) {
            const sessionExpired = error.message === 'SESSION_EXPIRED';
            return NextResponse.json({
                error: sessionExpired
                    ? 'Your session has expired. Please refresh the page.'
                    : 'Your session is invalid. Please refresh the page.',
                sessionError: true
            }, { status: 401 });
        }

        if (error.code === 'storage/unauthorized') {
            return NextResponse.json({
                error: 'Unauthorized to delete files.'
            }, { status: 403 });
        }

        return NextResponse.json({
            error: 'An internal server error occurred during deletion. Please try again later.'
        }, { status: 500 });
    }
}