// src/app/api/public/book-return/upload-image/route.ts

import { NextRequest, NextResponse } from "next/server";
import { validateCustomerSession } from "@/lib/validateBookReturnSession";
import { storage, db } from "@/lib/firebase-admin";
import { v4 as uuidv4 } from 'uuid';
import { FieldValue } from "firebase-admin/firestore";
import { getBusinessIdForStore, getReturnImagesPath } from "@/lib/storage-helpers";
import { SHARED_STORE_IDS } from "@/lib/shared-constants";

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
        const session = await validateCustomerSession(req);
        const formData = await req.formData();
        const imageFile = formData.get('image') as File;
        const storeId = formData.get('storeId') as string;
        const orderId = formData.get('orderId') as string;

        // Input validation
        if (!orderId || typeof orderId !== 'string' || orderId.trim() === '') {
            console.error('Valid Order ID is required.');
            return NextResponse.json({ 
                error: 'Valid Order ID is required.' 
            }, { status: 400 });
        }

        if (!imageFile) {
            console.error('Image file is required.');
            return NextResponse.json({ 
                error: 'Image file is required.' 
            }, { status: 400 });
        }

        // Validate file type
        if (!ALLOWED_MIME_TYPES.includes(imageFile.type)) {
            console.error('Invalid file type. Only JPEG, PNG, GIF, and WebP images are allowed.')
            return NextResponse.json({ 
                error: 'Invalid file type. Only JPEG, PNG, GIF, and WebP images are allowed.' 
            }, { status: 400 });
        }

        // Validate file size
        if (imageFile.size > MAX_FILE_SIZE) {
            console.error('File size exceeds 2 MB limit.');
            return NextResponse.json({ 
                error: 'File size exceeds 2 MB limit.' 
            }, { status: 400 });
        }

        // ✅ Lookup businessId (null for shared store)
        const businessId = await getBusinessIdForStore(storeId);
        
        // For shared store, businessId will be null, which is fine
        if (!businessId && !SHARED_STORE_IDS.includes(storeId)) {
            console.error(`Could not find business for store: ${storeId}`);
            return NextResponse.json({ 
                error: 'Store configuration error. Please contact support.' 
            }, { status: 500 });
        }
        
        // Convert File to Buffer
        const arrayBuffer = await imageFile.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Generate unique filename
        const fileExtension = imageFile.name.split('.').pop() || 'jpg';
        const uniqueFileName = `${storeId}_${orderId}_${uuidv4()}.${fileExtension}`;

        // ✅ Get appropriate path (shared or business-specific)
        const filePath = getReturnImagesPath(
            businessId,
            storeId,
            orderId,
            uniqueFileName
        );

        console.log(`Uploading to path: ${filePath}`);
        
        // Upload to Firebase Storage
        const bucket = storage.bucket();
        const file = bucket.file(filePath);

        await file.save(buffer, {
            metadata: {
                contentType: imageFile.type,
                metadata: {
                    orderId: orderId,
                    storeId: storeId,
                    uploadedAt: new Date().toISOString(),
                    originalName: imageFile.name
                }
            }
        });

        // Add image filename to order document
        const storeRef = db.collection('accounts').doc(storeId);
        const orderRef = storeRef.collection('orders').doc(orderId.trim());
        
        await orderRef.update({
            booked_return_images: FieldValue.arrayUnion(uniqueFileName)
        });

        return NextResponse.json({
            success: true,
            fileName: uniqueFileName,
            filePath: filePath,
            message: 'Image uploaded successfully.'
        }, { status: 200 });

    } catch (error: any) {
        console.error('Image upload failed:', error);

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
            console.error('Unauthorized to upload files.');
            return NextResponse.json({ 
                error: 'Unauthorized to upload files.' 
            }, { status: 403 });
        }

        if (error.code === 'storage/quota-exceeded') {
            console.error('Storage quota exceeded. Please contact support.');
            return NextResponse.json({ 
                error: 'Storage quota exceeded. Please contact support.' 
            }, { status: 507 });
        }

        console.error('An internal server error occurred during upload. Please try again later.');
        return NextResponse.json({ 
            error: 'An internal server error occurred during upload. Please try again later.' 
        }, { status: 500 });
    }
}