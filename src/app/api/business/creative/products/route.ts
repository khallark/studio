// app/api/business/creative/products/route.ts

import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { buildCreativeProductRow } from "@/lib/creative/creative-product-scoring";
import { CreativeProductProfile } from "@/types/creative";
import { authUserForBusiness } from "@/lib/authoriseUser";
import { db } from "@/lib/firebase-admin";

type RestockFunctionResponse = {
  success: boolean;
  recommendations?: any[];
  error?: string;
  details?: string;
  meta?: {
    count: number;
    totalWarnings: number;
    processingTimeMs: number;
    timestamp: string;
  };
};

function normalizeCreativeProfile(
  sku: string,
  data: Partial<CreativeProductProfile> | null,
): CreativeProductProfile {
  return {
    sku,
    creativeStatus: data?.creativeStatus ?? "missing",
    priorityOverride: data?.priorityOverride ?? null,
    notes: data?.notes ?? null,
    manualTags: data?.manualTags ?? null,
    lastCreativeAddedAt: data?.lastCreativeAddedAt ?? null,
    lastAdTestedAt: data?.lastAdTestedAt ?? null,
    createdAt: data?.createdAt ?? null,
    updatedAt: data?.updatedAt ?? null,
    updatedBy: data?.updatedBy ?? null,
  };
}

async function fetchRestockRecommendationsFromCloudFunction(params: {
  businessId: string;
  forecastDays: number;
  includeZeroSuggestions: boolean;
}) {
  const functionUrl = process.env.GET_ALL_RESTOCK_RECOMMENDATIONS_URL;
  const secret = process.env.ENQUEUE_FUNCTION_SECRET;

  if (!functionUrl) {
    throw new Error("GET_ALL_RESTOCK_RECOMMENDATIONS_URL is not configured");
  }

  if (!secret) {
    throw new Error("ENQUEUE_FUNCTION_SECRET is not configured");
  }

  const response = await fetch(functionUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-enqueue-secret": secret,
    },
    body: JSON.stringify({
      businessId: params.businessId,
      forecastDays: params.forecastDays,
      includeZeroSuggestions: params.includeZeroSuggestions,
    }),
    cache: "no-store",
  });

  const result = (await response.json()) as RestockFunctionResponse;

  if (!response.ok || !result.success) {
    throw new Error(
      result.details ||
        result.error ||
        `Restock function failed with status ${response.status}`,
    );
  }

  return result.recommendations ?? [];
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const businessId = searchParams.get("businessId");

    if (!businessId) {
      return NextResponse.json(
        { success: false, message: "businessId is required" },
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

    const [productsSnapshot, profilesSnapshot, restockRecommendations] =
      await Promise.all([
        db.collection(`users/${businessId}/products`).get(),
        db.collection(`users/${businessId}/creative_product_profiles`).get(),
        fetchRestockRecommendationsFromCloudFunction({
          businessId,
          forecastDays: 14,
          includeZeroSuggestions: true,
        }),
      ]);

    const profilesMap = new Map<string, CreativeProductProfile>();

    profilesSnapshot.docs.forEach((doc) => {
      profilesMap.set(
        doc.id,
        normalizeCreativeProfile(
          doc.id,
          doc.data() as Partial<CreativeProductProfile>,
        ),
      );
    });

    const restockMap = new Map<string, any>(
      restockRecommendations.map((recommendation) => [
        recommendation.productId,
        recommendation,
      ]),
    );

    const rows = productsSnapshot.docs.map((doc) => {
      const data = doc.data();

      const product = {
        sku: doc.id,
        name: data.name ?? doc.id,
        category: data.category ?? null,
        price: data.price ?? null,
        inventory: data.inventory ?? null,
      };

      return buildCreativeProductRow({
        product,
        restock: restockMap.get(doc.id) ?? null,
        profile: profilesMap.get(doc.id) ?? null,
      });
    });

    rows.sort((a, b) => b.priorityScore - a.priorityScore);

    return NextResponse.json({
      success: true,
      rows,
      generatedAt: Timestamp.now().toDate().toISOString(),
    });
  } catch (error) {
    console.error("Error fetching creative products:", error);

    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Failed to fetch creative products",
      },
      { status: 500 },
    );
  }
}