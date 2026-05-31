// src/app/api/public/book-return/upload-image/route.ts

import { NextRequest, NextResponse } from "next/server";
import { validateCustomerSession } from "@/lib/validateBookReturnSession";
import { getSessionScopedOrderRef } from "@/lib/getSessionScopedOrderRef";
import { storage } from "@/lib/firebase-admin";
import { v4 as uuidv4 } from "uuid";
import { FieldValue } from "firebase-admin/firestore";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

const ALLOWED_MIME_TYPES = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/gif",
    "image/webp",
];

const EXTENSION_BY_MIME_TYPE: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
    "image/webp": "webp",
};

function getPublicSessionErrorResponse(errorMessage: string) {
    const sessionExpired = errorMessage === "SESSION_EXPIRED";

    return NextResponse.json(
        {
            error: sessionExpired
                ? "Your session has expired. Please refresh the page."
                : "Your session is invalid. Please refresh the page.",
            sessionError: true,
        },
        { status: 401 }
    );
}

function isValidFileName(fileName: string): boolean {
    return /^[a-zA-Z0-9._ -]+$/.test(fileName);
}

export async function POST(req: NextRequest) {
    try {
        const session = await validateCustomerSession(req);
        const formData = await req.formData();

        const imageFile = formData.get("image");
        const orderId = formData.get("orderId");

        if (!orderId || typeof orderId !== "string" || orderId.trim() === "") {
            return NextResponse.json(
                { error: "Valid Order ID is required." },
                { status: 400 }
            );
        }

        if (!imageFile || !(imageFile instanceof File)) {
            return NextResponse.json(
                { error: "Image file is required." },
                { status: 400 }
            );
        }

        if (!ALLOWED_MIME_TYPES.includes(imageFile.type)) {
            return NextResponse.json(
                {
                    error: "Invalid file type. Only JPEG, PNG, GIF, and WebP images are allowed.",
                },
                { status: 400 }
            );
        }

        if (imageFile.size > MAX_FILE_SIZE) {
            return NextResponse.json(
                { error: "File size exceeds 5 MB limit." },
                { status: 400 }
            );
        }

        if (imageFile.name && !isValidFileName(imageFile.name)) {
            return NextResponse.json(
                { error: "Invalid image file name." },
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
                { error: "Order not found." },
                { status: 404 }
            );
        }

        const extension = EXTENSION_BY_MIME_TYPE[imageFile.type] || "jpg";

        /**
         * Keep fileName simple and safe.
         * Do not put storeId/orderId into fileName because they already exist in the folder path.
         */
        const uniqueFileName = `return_image_${Date.now()}_${uuidv4()}.${extension}`;

        /**
         * Canonical path:
         * return-images/{storeId}/{orderId}/{fileName}
         */
        const filePath = `return-images/${storeId}/${cleanOrderId}/${uniqueFileName}`;

        const arrayBuffer = await imageFile.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        const bucket = storage.bucket();
        const file = bucket.file(filePath);

        await file.save(buffer, {
            metadata: {
                contentType: imageFile.type,
                metadata: {
                    storeId,
                    orderId: cleanOrderId,
                    uploadedAt: new Date().toISOString(),
                    originalName: imageFile.name || "unknown",
                },
            },
        });

        /**
         * This is okay if your UI expects uploaded images to be visible before final submit.
         * /request will later store the final submitted image list again.
         */
        await orderRef.update({
            booked_return_images: FieldValue.arrayUnion(uniqueFileName),
        });

        return NextResponse.json(
            {
                success: true,
                fileName: uniqueFileName,
                filePath,
                message: "Image uploaded successfully.",
            },
            { status: 200 }
        );

    } catch (error: any) {
        console.error("Image upload failed:", error);

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

        if (error?.code === "storage/unauthorized") {
            return NextResponse.json(
                { error: "Unauthorized to upload files." },
                { status: 403 }
            );
        }

        if (error?.code === "storage/quota-exceeded") {
            return NextResponse.json(
                { error: "Storage quota exceeded. Please contact support." },
                { status: 507 }
            );
        }

        return NextResponse.json(
            {
                error: "An internal server error occurred during upload. Please try again later.",
            },
            { status: 500 }
        );
    }
}