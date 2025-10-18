// src/app/api/public/book-return/cancel-request/route.ts

import { NextRequest, NextResponse } from "next/server";
import { db, storage } from "@/lib/firebase-admin";
import { validateCustomerSession } from "@/lib/validateBookReturnSession";
import { FieldValue, Timestamp } from "firebase-admin/firestore";

export async function POST(req: NextRequest) {
    try {
        // Validate session first
        const session = await validateCustomerSession(req);
        
        // Parse request body
        const body = await req.json();
        const { orderId } = body;

        // Input validation
        if (!orderId || typeof orderId !== 'string' || orderId.trim() === '') {
            return NextResponse.json({ 
                error: 'Valid Order ID is required.' 
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

        // Only allow cancellation if status is "DTO Requested"
        if (currentStatus !== "DTO Requested") {
            return NextResponse.json({
                error: 'Return request can only be cancelled when status is "DTO Requested".'
            }, { status: 400 });
        }

        // Delete images from Firebase Storage
        if (orderData.booked_return_images && Array.isArray(orderData.booked_return_images)) {
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
                    console.log(`Deleted ${files.length} return images from ${folderPath}`);
                }
            } catch (deleteError) {
                console.warn('Error deleting return images:', deleteError);
                // Continue with order update even if image deletion fails
            }
        }

        // Remove the latest log entry if it exists
        let updatedLogs = orderData.customStatusesLogs || [];
        if (updatedLogs.length > 0) {
            updatedLogs = updatedLogs.slice(0, -1); // Remove last entry
        }

        // Update order document
        await orderRef.update({
            customStatus: "Delivered",
            book_return_reason: FieldValue.delete(),
            booked_return_reason: FieldValue.delete(),
            booked_return_images: FieldValue.delete(),
            returnItemsVariantIds: FieldValue.delete(),
            return_request_date: FieldValue.delete(),
            customStatusesLogs: updatedLogs,
            lastStatusUpdate: Timestamp.now()
        });

        return NextResponse.json({
            success: true,
            message: "Your return request has been cancelled successfully."
        }, { status: 200 });

    } catch (error: any) {
        console.error('Cancel return request failed:', error);
        
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