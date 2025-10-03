// src/app/api/public/book-return/request/route.ts

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase-admin";
import { validateCustomerSession } from "@/lib/validateCustomerSession";
import { FieldValue, Timestamp } from "firebase-admin/firestore";

// Constants
const DELIVERABLE_STATUSES = ["Delivered", "DTO Requested"];
const IN_TRANSIT_STATUSES = ["In Transit", "RTO In Transit", "Out For Delivery"];
const RETURN_BLOCKED_STATUSES = ["DTO In Transit", "DTO Delivered", "DTO Booked"];

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
        
        // Parse and validate request body
        const body = await req.json();
        const { orderId, selectedVariantIds, booked_return_images, booked_return_reason } = body;

        // Input validation
        if (!orderId || typeof orderId !== 'string' || orderId.trim() === '') {
            return NextResponse.json({ 
                error: 'Valid Order ID is required.' 
            }, { status: 400 });
        }

        if (!selectedVariantIds || !Array.isArray(selectedVariantIds) || selectedVariantIds.length === 0) {
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

        // Validate return images
        if (!booked_return_images || !Array.isArray(booked_return_images)) {
            return NextResponse.json({ 
                error: 'At least one image is required for return request.' 
            }, { status: 400 });
        }

        if (booked_return_images.length > 10) {
            return NextResponse.json({ 
                error: 'Maximum 10 images are allowed.' 
            }, { status: 400 });
        }

        // Validate return reason
        if (!booked_return_reason || typeof booked_return_reason !== 'string' || booked_return_reason.trim() === '') {
            return NextResponse.json({ 
                error: 'Return reason is required.' 
            }, { status: 400 });
        }

        if (booked_return_reason.length > 500) {
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

        // Handle delivered orders - immediate return approval
        if (DELIVERABLE_STATUSES.includes(currentStatus)) {
            let logEntry = {
                status: "DTO Requested",
                createdAt: Timestamp.now(),
                remarks: `The Return for this order was requested by the customer. Reason: ${booked_return_reason}`
            }
            if(currentStatus === 'DTO Requested') {
                logEntry = {
                    status: "DTO Requested Again",
                    createdAt: Timestamp.now(),
                    remarks: `The Return for this order was requested again by the customer. Reason: ${booked_return_reason}`
                }
            }
            await orderRef.update({
                customStatus: "DTO Requested",
                returnItemsVariantIds: validVariantIds,
                booked_return_images: booked_return_images,
                booked_return_reason: booked_return_reason.trim(),
                return_request_date: Timestamp.now(),
                customStatusesLogs: FieldValue.arrayUnion(logEntry)
            });

            return NextResponse.json({
                success: true,
                message: "Your return request has been submitted successfully."
            }, { status: 200 });
        }

        // Handle in-transit orders - check with courier API
        if (IN_TRANSIT_STATUSES.includes(currentStatus)) {
            try {
                const updatedStatus = await checkDeliveryStatus(storeRef, orderData);
                
                if (updatedStatus === "Delivered") {
                    // Order was delivered, allow return
                    await orderRef.update({
                        customStatus: "DTO Requested",
                        returnItemsVariantIds: validVariantIds,
                        booked_return_images: booked_return_images,
                        booked_return_reason: booked_return_reason.trim(),
                        return_request_date: Timestamp.now(),
                        customStatusesLogs: FieldValue.arrayUnion({
                            status: "DTO Requested",
                            createdAt: Timestamp.now(),
                            remarks: `The Return for this order was requested by the customer. Reason: ${booked_return_reason}`
                        })
                    });

                    return NextResponse.json({
                        success: true,
                        message: "Your return request has been submitted successfully."
                    }, { status: 200 });
                } else if (updatedStatus && updatedStatus !== currentStatus) {
                    // Update status but deny return
                    await orderRef.update({ 
                        customStatus: updatedStatus,
                        lastStatusUpdate: FieldValue.serverTimestamp()
                    });
                }

                // Order not delivered yet
                return NextResponse.json({
                    success: false,
                    message: "This order has not been delivered yet. Return requests are only accepted for delivered orders."
                }, { status: 200 });

            } catch (trackingError) {
                console.error('Delivery tracking failed:', trackingError);
                
                // Fallback: deny return if we can't verify delivery
                return NextResponse.json({
                    success: false,
                    message: "Unable to verify delivery status. Please try again later or contact customer service."
                }, { status: 200 });
            }
        }

        // All other statuses - not eligible for return
        return NextResponse.json({
            success: false,
            message: "This order is not eligible for return requests."
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