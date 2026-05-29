// app/api/business/creative/products/update-profile/route.ts

import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import {
  CreativePriorityOverride,
  CreativeReadiness,
} from "@/types/creative";
import { authUserForBusiness } from "@/lib/authoriseUser";
import { db } from "@/lib/firebase-admin";

const VALID_CREATIVE_STATUSES: CreativeReadiness[] = [
  "missing",
  "basic",
  "ready",
  "tested",
];

const VALID_PRIORITY_OVERRIDES: CreativePriorityOverride[] = [
  "high",
  "normal",
  "low",
  "blocked",
];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const {
      businessId,
      sku,
      creativeStatus,
      notes,
      priorityOverride,
      manualTags,
    } = body;

    if (!businessId || !sku) {
      return NextResponse.json(
        { success: false, message: "businessId and sku are required" },
        { status: 400 },
      );
    }

    const result = await authUserForBusiness({ businessId, req });

    if (!result.authorised) {
      return NextResponse.json(
        { success: false, message: result.error },
        { status: result.status },
      );
    }

    if (
      creativeStatus !== undefined &&
      creativeStatus !== null &&
      !VALID_CREATIVE_STATUSES.includes(creativeStatus)
    ) {
      return NextResponse.json(
        { success: false, message: "Invalid creativeStatus" },
        { status: 400 },
      );
    }

    if (
      priorityOverride !== undefined &&
      priorityOverride !== null &&
      !VALID_PRIORITY_OVERRIDES.includes(priorityOverride)
    ) {
      return NextResponse.json(
        { success: false, message: "Invalid priorityOverride" },
        { status: 400 },
      );
    }

    if (
      manualTags !== undefined &&
      manualTags !== null &&
      !Array.isArray(manualTags)
    ) {
      return NextResponse.json(
        { success: false, message: "manualTags must be an array or null" },
        { status: 400 },
      );
    }

    const productDoc = await db.doc(`users/${businessId}/products/${sku}`).get();

    if (!productDoc.exists) {
      return NextResponse.json(
        { success: false, message: "Product not found" },
        { status: 404 },
      );
    }

    const now = Timestamp.now();

    const profileRef = db.doc(
      `users/${businessId}/creative_product_profiles/${sku}`,
    );

    const existingProfile = await profileRef.get();

    const basePayload = existingProfile.exists
      ? {}
      : {
          sku,
          creativeStatus: "missing",
          priorityOverride: null,
          notes: null,
          manualTags: null,
          lastCreativeAddedAt: null,
          lastAdTestedAt: null,
          createdAt: now,
          updatedAt: null,
          updatedBy: null,
        };

    const updatePayload: Record<string, unknown> = {
      ...basePayload,
      sku,
      updatedAt: now,
      updatedBy: result.userId,
    };

    if (creativeStatus !== undefined) {
      updatePayload.creativeStatus = creativeStatus;

      if (creativeStatus === "missing") {
        updatePayload.lastCreativeAddedAt = null;
        updatePayload.lastAdTestedAt = null;
      } else {
        updatePayload.lastCreativeAddedAt = now;
      }

      if (creativeStatus === "tested") {
        updatePayload.lastAdTestedAt = now;
      }
    }

    if (notes !== undefined) {
      updatePayload.notes =
        typeof notes === "string" && notes.trim().length > 0
          ? notes.trim()
          : null;
    }

    if (priorityOverride !== undefined) {
      updatePayload.priorityOverride = priorityOverride ?? null;
    }

    if (manualTags !== undefined) {
      updatePayload.manualTags = manualTags ?? null;
    }

    await profileRef.set(updatePayload, { merge: true });

    return NextResponse.json({
      success: true,
      message: "Creative profile updated",
    });
  } catch (error) {
    console.error("Error updating creative product profile:", error);

    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Failed to update creative product profile",
      },
      { status: 500 },
    );
  }
}