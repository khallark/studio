// src/app/api/public/book-return/cancel-request/route.ts

import { NextRequest, NextResponse } from "next/server";
import { storage } from "@/lib/firebase-admin";
import { validateCustomerSession } from "@/lib/validateBookReturnSession";
import { getSessionScopedOrderRef } from "@/lib/getSessionScopedOrderRef";
import { FieldValue } from "firebase-admin/firestore";

function getPublicSessionErrorResponse(errorMessage: string) {
    let message = "Your session is invalid. Please refresh the page.";

    if (errorMessage === "SESSION_EXPIRED") {
        message = "Your session has expired. Please refresh the page.";
    }

    return NextResponse.json(
        {
            error: message,
            sessionError: true,
        },
        { status: 401 }
    );
}

export async function POST(req: NextRequest) {
    try {
        const session = await validateCustomerSession(req);

        const { orderId } = await req.json();

        if (!orderId || typeof orderId !== "string" || orderId.trim() === "") {
            return NextResponse.json(
                { error: "Valid Order ID is required." },
                { status: 400 }
            );
        }

        const {
            storeId,
            cleanOrderId,
            orderRef,
        } = getSessionScopedOrderRef(session, orderId);

        const orderDoc = await orderRef.get();

        if (!orderDoc.exists) {
            return NextResponse.json(
                { error: "Order not found. Please check the order number." },
                { status: 404 }
            );
        }

        const orderData = orderDoc.data()!;
        const currentStatus = orderData.customStatus;

        if (currentStatus !== "DTO Requested") {
            return NextResponse.json(
                {
                    error: 'Return request can only be cancelled when status is "DTO Requested".',
                },
                { status: 400 }
            );
        }

        /**
         * Delete uploaded return images.
         * Canonical path:
         * return-images/{storeId}/{orderId}/
         */
        if (
            orderData.booked_return_images &&
            Array.isArray(orderData.booked_return_images) &&
            orderData.booked_return_images.length > 0
        ) {
            const bucket = storage.bucket();
            const folderPath = `return-images/${storeId}/${cleanOrderId}/`;

            try {
                const [files] = await bucket.getFiles({ prefix: folderPath });

                if (files.length > 0) {
                    await Promise.all(
                        files.map((file) =>
                            file.delete().catch((err) => {
                                console.warn(`Failed to delete file ${file.name}:`, err);
                            })
                        )
                    );

                    console.log(`Deleted ${files.length} return images from ${folderPath}`);
                }
            } catch (deleteError) {
                console.warn("Error deleting return images:", deleteError);
                /**
                 * Do not block cancellation just because storage cleanup failed.
                 * The order state should still be restored.
                 */
            }
        }

        const existingLogs = Array.isArray(orderData.customStatusesLogs)
            ? orderData.customStatusesLogs
            : [];

        const updatedLogs = existingLogs.length > 0
            ? existingLogs.slice(0, -1)
            : [];

        await orderRef.update({
            customStatus: "Delivered",

            book_return_reason: FieldValue.delete(),
            booked_return_reason: FieldValue.delete(),
            booked_return_images: FieldValue.delete(),
            returnItemsVariantIds: FieldValue.delete(),
            return_request_date: FieldValue.delete(),

            customStatusesLogs: updatedLogs,
        });

        return NextResponse.json(
            {
                success: true,
                message: "Your return request has been cancelled successfully.",
            },
            { status: 200 }
        );

    } catch (error: any) {
        console.error("Cancel return request failed:", error);

        const errorMessage = error instanceof Error ? error.message : String(error);

        switch (errorMessage) {
            case "NO_SESSION_COOKIE":
            case "NO_CSRF_TOKEN":
            case "INVALID_SESSION":
            case "INVALID_SESSION_SCOPE":
            case "INVALID_BUSINESS":
            case "STORE_NOT_OWNED_BY_BUSINESS":
            case "CSRF_MISMATCH":
            case "SESSION_EXPIRED":
                return getPublicSessionErrorResponse(errorMessage);
        }

        if (error instanceof SyntaxError) {
            return NextResponse.json(
                { error: "Invalid request format." },
                { status: 400 }
            );
        }

        return NextResponse.json(
            { error: "An internal server error occurred. Please try again later." },
            { status: 500 }
        );
    }
}