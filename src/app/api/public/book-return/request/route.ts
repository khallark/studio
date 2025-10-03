// src/app/api/public/book-return/request/route.ts

import { NextRequest, NextResponse } from "next/server";
import { db, storage } from "@/lib/firebase-admin";
import { validateCustomerSession } from "@/lib/validateCustomerSession";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { v4 as uuidv4 } from 'uuid';

// Constants
const DELIVERABLE_STATUSES = ["Delivered", "DTO Requested"];
const IN_TRANSIT_STATUSES = ["In Transit", "RTO In Transit", "Out For Delivery"];
const RETURN_BLOCKED_STATUSES = ["DTO In Transit", "DTO Delivered", "DTO Booked"];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];

interface DeliveryStatus {
    Status: string;
    StatusType: string;
}

interface ShipmentData {
    Shipment: {
        Status: DeliveryStatus;
    };
}

interface TrackingResponse {
    ShipmentData: ShipmentData[];
}

export async function POST(req: NextRequest) {
    try {
        // Validate session first
        const session = await validateCustomerSession(req);
        
        // Parse form data (instead of JSON since we're uploading files)
        const formData = await req.formData();
        const orderId = formData.get('orderId') as string;
        const selectedVariantIdsStr = formData.get('selectedVariantIds') as string;
        const returnReason = formData.get('booked_return_reason') as string;
        
        // Get all image files
        const imageFiles: File[] = [];
        let imageIndex = 0;
        while (formData.has(`image_${imageIndex}`)) {
            const file = formData.get(`image_${imageIndex}`) as File;
            if (file) imageFiles.push(file);
            imageIndex++;
        }

        // Input validation
        if (!orderId || typeof orderId !== 'string' || orderId.trim() === '') {
            return NextResponse.json({ 
                error: 'Valid Order ID is required.' 
            }, { status: 400 });
        }

        // Parse and validate variant IDs
        let selectedVariantIds: number[] = [];
        try {
            selectedVariantIds = JSON.parse(selectedVariantIdsStr);
        } catch {
            return NextResponse.json({ 
                error: 'Invalid variant IDs format.' 
            }, { status: 400 });
        }

        if (!Array.isArray(selectedVariantIds) || selectedVariantIds.length === 0) {
            return NextResponse.json({ 
                error: 'At least one item variant must be selected for return.' 
            }, { status: 400 });
        }

        // Validate variant IDs are numbers
        const validVariantIds = selectedVariantIds.filter(id => 
            typeof id === 'number' && !isNaN(id) && id > 0
        );

        if (validVariantIds.length === 0) {
            return NextResponse.json({ 
                error: 'Valid item variant IDs are required.' 
            }, { status: 400 });
        }

        // Validate images
        if (imageFiles.length === 0) {
            return NextResponse.json({ 
                error: 'At least one image is required for return request.' 
            }, { status: 400 });
        }

        if (imageFiles.length > 10) {
            return NextResponse.json({ 
                error: 'Maximum 10 images are allowed.' 
            }, { status: 400 });
        }

        // Validate each image
        for (const imageFile of imageFiles) {
            if (!ALLOWED_MIME_TYPES.includes(imageFile.type)) {
                return NextResponse.json({ 
                    error: 'Invalid file type. Only JPEG, PNG, GIF, and WebP images are allowed.' 
                }, { status: 400 });
            }

            if (imageFile.size > MAX_FILE_SIZE) {
                return NextResponse.json({ 
                    error: 'Each image must be less than 5 MB.' 
                }, { status: 400 });
            }
        }

        // Validate return reason
        if (!returnReason || typeof returnReason !== 'string' || returnReason.trim() === '') {
            return NextResponse.json({ 
                error: 'Return reason is required.' 
            }, { status: 400 });
        }

        if (returnReason.length > 500) {
            return NextResponse.json({ 
                error: 'Return reason must not exceed 500 characters.' 
            }, { status: 400 });
        }

        // Get store and order references
        const storeRef = db.collection('accounts').doc(session.storeId);
        const orderRef = storeRef.collection('orders').doc(orderId.trim());
        
        // Fetch order
        const orderDoc = await orderRef.get();
        if (!orderDoc.exists) {
            return NextResponse.json({ 
                error: 'Order not found. Please check the order number.' 
            }, { status: 404 });
        }

        const orderData = orderDoc.data()!;
        const currentStatus = orderData.customStatus;

        if (!currentStatus) {
            return NextResponse.json({
                error: 'Order status is not available.'
            }, { status: 400 });
        }

        // Check if return already requested or processed
        if (RETURN_BLOCKED_STATUSES.some(status => currentStatus.includes(status))) {
            return NextResponse.json({
                success: false,
                message: "The return request for this order has already been submitted or processed."
            }, { status: 200 });
        }

        // Variable to track final status and whether to process return
        let shouldProcessReturn = false;
        let finalStatus = currentStatus;

        // Handle delivered orders - immediate return approval
        if (DELIVERABLE_STATUSES.includes(currentStatus)) {
            shouldProcessReturn = true;
            finalStatus = currentStatus;
        }

        // Handle in-transit orders - check with courier API
        if (IN_TRANSIT_STATUSES.includes(currentStatus)) {
            try {
                const updatedStatus = await checkDeliveryStatus(storeRef, orderData);
                
                if (updatedStatus === "Delivered") {
                    // Order was delivered, allow return
                    shouldProcessReturn = true;
                    finalStatus = "Delivered";
                } else if (updatedStatus && updatedStatus !== currentStatus) {
                    // Update status but deny return
                    await orderRef.update({ 
                        customStatus: updatedStatus,
                        lastStatusUpdate: FieldValue.serverTimestamp()
                    });
                }

                if (!shouldProcessReturn) {
                    // Order not delivered yet
                    return NextResponse.json({
                        success: false,
                        message: "This order has not been delivered yet. Return requests are only accepted for delivered orders."
                    }, { status: 200 });
                }

            } catch (trackingError) {
                console.error('Delivery tracking failed:', trackingError);
                
                // Fallback: deny return if we can't verify delivery
                return NextResponse.json({
                    success: false,
                    message: "Unable to verify delivery status. Please try again later or contact customer service."
                }, { status: 200 });
            }
        }

        // If we reach here and still not eligible
        if (!shouldProcessReturn) {
            return NextResponse.json({
                success: false,
                message: "This order is not eligible for return requests."
            }, { status: 200 });
        }

        // NOW process the return: Upload images and update order
        const bucket = storage.bucket();
        const folderPath = `return-images/${session.storeId}/${orderId}/`;

        // Step 1: Delete all existing images in the folder
        try {
            const [existingFiles] = await bucket.getFiles({ prefix: folderPath });
            
            if (existingFiles.length > 0) {
                await Promise.all(
                    existingFiles.map(file => file.delete().catch(err => {
                        console.warn(`Failed to delete file ${file.name}:`, err);
                    }))
                );
                console.log(`Deleted ${existingFiles.length} existing images from ${folderPath}`);
            }
        } catch (deleteError) {
            console.warn('Error deleting existing files:', deleteError);
            // Continue with upload even if deletion fails
        }

        // Step 2: Upload all new images
        const uploadedImageNames: string[] = [];
        
        for (const imageFile of imageFiles) {
            try {
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

                uploadedImageNames.push(uniqueFileName);
            } catch (uploadError) {
                console.error('Error uploading image:', uploadError);
                throw new Error('Failed to upload one or more images.');
            }
        }

        // Step 3: Update order document
        let logEntry = {
            status: "DTO Requested",
            createdAt: Timestamp.now(),
            remarks: `The Return for this order was requested by the customer. Reason: ${returnReason.trim()}`
        };
        
        if (finalStatus === 'DTO Requested') {
            logEntry = {
                status: "DTO Requested Again",
                createdAt: Timestamp.now(),
                remarks: `The Return for this order was requested again by the customer. Reason: ${returnReason.trim()}`
            };
        }

        await orderRef.update({
            customStatus: "DTO Requested",
            returnItemsVariantIds: validVariantIds,
            booked_return_images: uploadedImageNames,
            booked_return_reason: returnReason.trim(),
            return_request_date: Timestamp.now(),
            customStatusesLogs: FieldValue.arrayUnion(logEntry)
        });

        return NextResponse.json({
            success: true,
            message: "Your return request has been submitted successfully."
        }, { status: 200 });

    } catch (error: any) {
        console.error('Book return request failed:', error);
        
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

        // Handle JSON parsing errors
        if (error instanceof SyntaxError) {
            return NextResponse.json({ 
                error: 'Invalid request format.' 
            }, { status: 400 });
        }

        // Generic server error
        return NextResponse.json({ 
            error: 'An internal server error occurred. Please try again later.' 
        }, { status: 500 });
    }
}

async function checkDeliveryStatus(storeRef: any, orderData: any): Promise<string | null> {
    try {
        // Get API key from store
        const storeDoc = await storeRef.get();
        const apiKey = storeDoc.data()?.integrations?.couriers?.delhivery?.apiKey;
        
        if (!apiKey) {
            throw new Error('Delivery tracking not configured');
        }

        if (!orderData.awb) {
            throw new Error('No tracking number available');
        }

        // Call Delhivery tracking API
        const trackingUrl = `https://track.delhivery.com/api/v1/packages/json/?waybill=${orderData.awb}`;
        const response = await fetch(trackingUrl, {
            headers: {
                'Authorization': `Token ${apiKey}`,
                'Accept': 'application/json',
            },
        });

        if (!response.ok) {
            throw new Error(`Tracking API error: ${response.status}`);
        }

        const trackingData: TrackingResponse = await response.json();
        
        if (!trackingData.ShipmentData?.length) {
            throw new Error('No shipment data available');
        }

        const shipmentStatus = trackingData.ShipmentData[0]?.Shipment?.Status;
        if (!shipmentStatus) {
            throw new Error('No status information available');
        }

        // Map delivery status to internal status
        return mapDeliveryStatus(shipmentStatus);

    } catch (error) {
        console.error('Delivery status check failed:', error);
        throw error;
    }
}

function mapDeliveryStatus(status: DeliveryStatus): string | null {
    const { Status, StatusType } = status;

    // Map delivery statuses to internal statuses
    const statusMap: Record<string, string | null> = {
        'In Transit_UD': 'In Transit',
        'Pending_UD': 'In Transit',
        'In Transit_RT': 'RTO In Transit',
        'Pending_RT': 'RTO In Transit',
        'Dispatched_UD': 'Out For Delivery',
        'Delivered_DL': 'Delivered',
        'Delivered_RT': 'RTO Delivered',
        'In Transit_PU': 'DTO In Transit',
        'Pending_PU': 'DTO In Transit',
        'Delivered_PU': 'DTO Delivered',
        'Lost_LT': 'Lost'
    };

    const key = `${Status}_${StatusType}`;
    return statusMap[key] || null;
}