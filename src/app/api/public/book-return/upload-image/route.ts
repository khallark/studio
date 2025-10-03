// src/app/api/public/book-return/upload-image/route.ts

import { NextRequest, NextResponse } from "next/server";
import { validateCustomerSession } from "@/lib/validateCustomerSession";
import { storage } from "@/lib/firebase-admin";
import { v4 as uuidv4 } from 'uuid';

// Constants
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_MIME_TYPES = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/webp'
];

export async function POST(req: NextRequest) {
    try {
        // Validate session first
        const session = await validateCustomerSession(req);

        // Parse form data
        const formData = await req.formData();
        const imageFile = formData.get('image') as File;
        const orderId = formData.get('orderId') as string;
        const isFirstImage = formData.get('isFirstImage') as string; // 'true' or 'false'

        // Input validation
        if (!orderId || typeof orderId !== 'string' || orderId.trim() === '') {
            return NextResponse.json({ 
                error: 'Valid Order ID is required.' 
            }, { status: 400 });
        }

        if (!imageFile) {
            return NextResponse.json({ 
                error: 'Image file is required.' 
            }, { status: 400 });
        }

        // Validate file type
        if (!ALLOWED_MIME_TYPES.includes(imageFile.type)) {
            return NextResponse.json({ 
                error: 'Invalid file type. Only JPEG, PNG, GIF, and WebP images are allowed.' 
            }, { status: 400 });
        }

        // Validate file size
        if (imageFile.size > MAX_FILE_SIZE) {
            return NextResponse.json({ 
                error: 'File size exceeds 5 MB limit.' 
            }, { status: 400 });
        }

        // Get bucket reference
        const bucket = storage.bucket();
        const folderPath = `return-images/${session.storeId}/${orderId}/`;

        // Delete all existing images in the folder
        try {
            const [files] = await bucket.getFiles({ prefix: folderPath });
            
            if (files.length > 0) {
                // Delete all files in parallel
                await Promise.all(
                    files.map(file => file.delete().catch(err => {
                        console.warn(`Failed to delete file ${file.name}:`, err);
                    }))
                );
                console.log(`Deleted ${files.length} existing images from ${folderPath}`);
            }
        } catch (deleteError) {
            console.warn('Error deleting existing files:', deleteError);
            // Continue with upload even if deletion fails
        }

        // Convert File to Buffer
        const arrayBuffer = await imageFile.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Generate unique filename
        const fileExtension = imageFile.name.split('.').pop() || 'jpg';
        const uniqueFileName = `${session.storeId}_${orderId}_${uuidv4()}.${fileExtension}`;
        const filePath = `${folderPath}${uniqueFileName}`;

        // Upload to Firebase Storage
        const file = bucket.file(filePath);

        await file.save(buffer, {
            metadata: {
                contentType: imageFile.type,
                metadata: {
                    orderId: orderId,
                    storeId: session.storeId,
                    uploadedAt: new Date().toISOString(),
                    originalName: imageFile.name
                }
            }
        });

        // Make file publicly accessible (optional, adjust based on your security needs)
        // await file.makePublic();

        // Get the file's download URL (if made public)
        // const publicUrl = `https://storage.googleapis.com/${bucket.name}/${filePath}`;

        return NextResponse.json({
            success: true,
            fileName: uniqueFileName,
            filePath: filePath,
            message: 'Image uploaded successfully.'
        }, { status: 200 });

    } catch (error: any) {
        console.error('Image upload failed:', error);

        // Handle specific session errors
        if (error.message?.includes('SESSION') || error.message?.includes('CSRF')) {
            const sessionExpired = error.message === 'SESSION_EXPIRED';
            return NextResponse.json({ 
                error: sessionExpired 
                    ? 'Your session has expired. Please refresh the page.'
                    : 'Your session is invalid. Please refresh the page.',
                sessionError: true
            }, { status: 401 });
        }

        // Handle Firebase Storage errors
        if (error.code === 'storage/unauthorized') {
            return NextResponse.json({ 
                error: 'Unauthorized to upload files.' 
            }, { status: 403 });
        }

        if (error.code === 'storage/quota-exceeded') {
            return NextResponse.json({ 
                error: 'Storage quota exceeded. Please contact support.' 
            }, { status: 507 });
        }

        // Generic server error
        return NextResponse.json({ 
            error: 'An internal server error occurred during upload. Please try again later.' 
        }, { status: 500 });
    }
}