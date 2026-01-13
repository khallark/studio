// src/app/api/public/book-return/request/route.ts

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase-admin";
import { validateCustomerSession } from "@/lib/validateBookReturnSession";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { sendDTORequestedOrderWhatsAppMessage } from "@/lib/communication/whatsappMessagesSendingFuncs";

// Constants
const DELIVERABLE_STATUSES = ["Delivered", "DTO Requested"];
const IN_TRANSIT_STATUSES = ["In Transit", "RTO In Transit", "Out For Delivery"];
const RETURN_BLOCKED_STATUSES = ["DTO In Transit", "DTO Delivered", "DTO Booked", "Pending Refunds", "DTO Refunded"];

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
        const { storeId, orderId, selectedVariantIds, booked_return_images, booked_return_reason } = body;

        // Input validation
        if (!storeId || !orderId || typeof orderId !== 'string' || orderId.trim() === '') {
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
        const storeRef = db.collection('accounts').doc(storeId);
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
            if (currentStatus === 'DTO Requested') {
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

                    const shopData = (await storeRef.get()).data() as any;
                    const orderDataUpdated = (await orderRef.get()).data() as any;
                    await sendDTORequestedOrderWhatsAppMessage(
                        shopData,
                        orderDataUpdated
                    );

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
        // Determine courier from order data
        const courierProvider = orderData.courierProvider ||
            (orderData.courier?.split(':')[0]?.trim());

        if (!courierProvider) {
            throw new Error('Courier provider not found in order');
        }

        // Get AWB
        const awb = orderData.awb;
        if (!awb) {
            throw new Error('No tracking number available');
        }

        // Route to appropriate courier API
        switch (courierProvider.toLowerCase()) {
            case 'delhivery':
                return await checkDelhiveryStatus(storeRef, awb);

            case 'shiprocket':
                return await checkShiprocketStatus(storeRef, awb);

            case 'xpressbees':
                return await checkXpressbeesStatus(storeRef, awb);

            default:
                console.warn(`Unsupported courier provider: ${courierProvider}`);
                return null;
        }
    } catch (error) {
        console.error('Delivery status check failed:', error);
        throw error;
    }
}

// ============================================================================
// DELHIVERY STATUS CHECK
// ============================================================================
async function checkDelhiveryStatus(storeRef: any, awb: string): Promise<string | null> {
    try {
        const storeDoc = await storeRef.get();
        const apiKey = storeDoc.data()?.integrations?.couriers?.delhivery?.apiKey;

        if (!apiKey) {
            throw new Error('Delhivery API key not configured');
        }

        // Call Delhivery tracking API
        const trackingUrl = `https://track.delhivery.com/api/v1/packages/json/?waybill=${awb}`;
        const response = await fetch(trackingUrl, {
            headers: {
                'Authorization': `Token ${apiKey}`,
                'Accept': 'application/json',
            },
        });

        if (!response.ok) {
            throw new Error(`Delhivery API error: ${response.status}`);
        }

        const trackingData: TrackingResponse = await response.json();

        if (!trackingData.ShipmentData?.length) {
            throw new Error('No shipment data available');
        }

        const shipmentStatus = trackingData.ShipmentData[0]?.Shipment?.Status;
        if (!shipmentStatus) {
            throw new Error('No status information available');
        }

        return mapDelhiveryStatus(shipmentStatus);
    } catch (error) {
        console.error('Delhivery status check failed:', error);
        throw error;
    }
}

function mapDelhiveryStatus(status: DeliveryStatus): string | null {
    const { Status, StatusType } = status;

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

// ============================================================================
// SHIPROCKET STATUS CHECK
// ============================================================================
async function checkShiprocketStatus(storeRef: any, awb: string): Promise<string | null> {
    try {
        const storeDoc = await storeRef.get();
        const shiprocketCfg = storeDoc.data()?.integrations?.couriers?.shiprocket || {};
        const apiKey = shiprocketCfg?.accessToken ||
            shiprocketCfg?.token ||
            shiprocketCfg?.apiKey ||
            shiprocketCfg?.bearer;

        if (!apiKey) {
            throw new Error('Shiprocket API key not configured');
        }

        // Call Shiprocket tracking API
        const trackingUrl = `https://apiv2.shiprocket.in/v1/external/courier/track/awb/${awb}`;
        const response = await fetch(trackingUrl, {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Accept': 'application/json',
            },
        });

        if (!response.ok) {
            throw new Error(`Shiprocket API error: ${response.status}`);
        }

        const trackingData = await response.json();

        // Shiprocket response structure: { tracking_data: { shipment_track: [...] } }
        const shipmentTrack = trackingData?.tracking_data?.shipment_track;
        if (!Array.isArray(shipmentTrack) || shipmentTrack.length === 0) {
            throw new Error('No tracking data available');
        }

        const currentStatus = shipmentTrack[0]?.current_status;
        if (!currentStatus) {
            throw new Error('No current status available');
        }

        return mapShiprocketStatus(currentStatus);
    } catch (error) {
        console.error('Shiprocket status check failed:', error);
        throw error;
    }
}

function mapShiprocketStatus(currentStatus: string): string | null {
    const statusMap: Record<string, string> = {
        'In Transit': 'In Transit',
        'In Transit-EN-ROUTE': 'In Transit',
        'Out for Delivery': 'Out For Delivery',
        'Delivered': 'Delivered',
        'RTO IN INTRANSIT': 'RTO In Transit',
    };

    return statusMap[currentStatus] || null;
}

// ============================================================================
// XPRESSBEES STATUS CHECK
// ============================================================================
async function getXpressbeesToken(email: string, password: string): Promise<string | null> {
    try {
        const response = await fetch("https://shipment.xpressbees.com/api/users/login", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
            body: JSON.stringify({ email, password }),
        });

        if (!response.ok) {
            console.error(`Xpressbees login failed: ${response.status}`);
            return null;
        }

        const data = await response.json();
        if (data?.status && data?.data) {
            return data.data; // The JWT token
        }

        return null;
    } catch (error) {
        console.error("Xpressbees login error:", error);
        return null;
    }
}

async function checkXpressbeesStatus(storeRef: any, awb: string): Promise<string | null> {
    try {
        const storeDoc = await storeRef.get();
        const xpressbeesCfg = storeDoc.data()?.integrations?.couriers?.xpressbees || {};
        const email = xpressbeesCfg?.email;
        const password = xpressbeesCfg?.password;

        if (!email || !password) {
            throw new Error('Xpressbees credentials not configured');
        }

        // Generate fresh token
        const apiKey = await getXpressbeesToken(email, password);
        if (!apiKey) {
            throw new Error('Failed to generate Xpressbees token');
        }

        // Call Xpressbees tracking API
        const trackingUrl = `https://shipment.xpressbees.com/api/shipments2/track/${awb}`;
        const response = await fetch(trackingUrl, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
        });

        if (!response.ok) {
            throw new Error(`Xpressbees API error: ${response.status}`);
        }

        const trackingData = await response.json();

        // Xpressbees response structure: { status: true, data: { status: "..." } }
        if (!trackingData?.status || !trackingData?.data) {
            throw new Error('No tracking data available');
        }

        const currentStatus = trackingData.data.status !== 'rto'
            ? trackingData.data.status
            : trackingData.data.history?.[0]?.status_code;

        if (!currentStatus) {
            throw new Error('No current status available');
        }

        return mapXpressbeesStatus(currentStatus);
    } catch (error) {
        console.error('Xpressbees status check failed:', error);
        throw error;
    }
}

function mapXpressbeesStatus(currentStatus: string): string | null {
    const statusMap: Record<string, string> = {
        'in transit': 'In Transit',
        'out for delivery': 'Out For Delivery',
        'delivered': 'Delivered',
        'RT-IT': 'RTO In Transit',
        'RT-DL': 'RTO Delivered',
    };

    return statusMap[currentStatus] || null;
}