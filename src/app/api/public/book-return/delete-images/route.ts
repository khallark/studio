// src/app/api/public/book-return/delete-images/route.ts

import { NextRequest, NextResponse } from "next/server";
import { validateCustomerSession } from "@/lib/validateBookReturnSession";
import { storage } from "@/lib/firebase-admin";
import { getSessionScopedOrderRef } from "@/lib/getSessionScopedOrderRef";

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

        /**
         * Optional but recommended:
         * Verify order exists before deleting images.
         * This prevents deleting arbitrary folder paths under a valid session.
         */
        const orderDoc = await orderRef.get();

        if (!orderDoc.exists) {
            return NextResponse.json(
                { error: "Order not found. Please check the order number." },
                { status: 404 }
            );
        }

        const bucket = storage.bucket();

        /**
         * Canonical return image path:
         * return-images/{storeId}/{orderId}/
         */
        const folderPath = `return-images/${storeId}/${cleanOrderId}/`;

        const [files] = await bucket.getFiles({ prefix: folderPath });

        if (files.length === 0) {
            return NextResponse.json(
                {
                    success: true,
                    deletedCount: 0,
                    message: "No existing images found to delete.",
                },
                { status: 200 }
            );
        }

        await Promise.all(
            files.map((file) =>
                file.delete().catch((err: any) => {
                    console.warn(`Failed to delete file ${file.name}:`, err);
                })
            )
        );

        console.log(`Deleted ${files.length} images from ${folderPath}`);

        return NextResponse.json(
            {
                success: true,
                deletedCount: files.length,
                message: `Successfully deleted ${files.length} existing images.`,
            },
            { status: 200 }
        );

    } catch (error: any) {
        console.error("Delete images failed:", error);

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

        /**
         * Admin SDK storage errors usually will not use Firebase client-style
         * code like "storage/unauthorized", but keeping this does no harm.
         */
        if (error?.code === "storage/unauthorized") {
            return NextResponse.json(
                { error: "Unauthorized to delete files." },
                { status: 403 }
            );
        }

        return NextResponse.json(
            {
                error: "An internal server error occurred during deletion. Please try again later.",
            },
            { status: 500 }
        );
    }
}