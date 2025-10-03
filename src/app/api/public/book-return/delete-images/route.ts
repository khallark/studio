// src/app/api/public/book-return/delete-images/route.ts

import { NextRequest, NextResponse } from "next/server";
import { validateCustomerSession } from "@/lib/validateCustomerSession";
import { storage } from "@/lib/firebase-admin";

export async function POST(req: NextRequest) {
    try {
        const session = await validateCustomerSession(req);
        const body = await req.json();
        const { orderId } = body;

        if (!orderId || typeof orderId !== 'string' || orderId.trim() === '') {
            return NextResponse.json({ 
                error: 'Valid Order ID is required.' 
            }, { status: 400 });
        }

        const bucket = storage.bucket();
        const folderPath = `return-images/${session.storeId}/${orderId}/`;

        try {
            const [files] = await bucket.getFiles({ prefix: folderPath });
            
            if (files.length > 0) {
                await Promise.all(
                    files.map(file => file.delete().catch(err => {
                        console.warn(`Failed to delete file ${file.name}:`, err);
                    }))
                );
                console.log(`Deleted ${files.length} existing images from ${folderPath}`);
                
                return NextResponse.json({
                    success: true,
                    deletedCount: files.length,
                    message: `Successfully deleted ${files.length} existing images.`
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