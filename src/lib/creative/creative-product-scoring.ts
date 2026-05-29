// lib/creative/creative-product-scoring.ts

import {
  AdReadiness,
  CreativePriorityOverride,
  CreativeProductAction,
  CreativeProductProfile,
  CreativeProductRow,
  CreativeReadiness,
  DataQuality,
  StockHealth,
} from "@/types/creative";

type InventoryLike = {
  openingStock: number | null;
  inwardAddition: number | null;
  deduction: number | null;
  autoAddition: number | null;
  autoDeduction: number | null;
  blockedStock: number | null;
} | null;

type ProductLike = {
  sku: string;
  name: string;
  category: string | null;
  price: number | null;
  inventory: InventoryLike;
};

type RestockRecommendationLike = {
  productId: string;
  suggestedQuantity: number;
  confidence: number;
  reasoning: {
    predictedDailyDemand: number;
    forecastDays: number;
    safetyStock: number;
    currentStock: number;
    adjustments: {
      stockoutAdjustment: number;
      trendAdjustment: number;
    };
  };
  metrics: {
    last7DaysAvg: number;
    last14DaysAvg: number;
    last30DaysAvg: number;
    trendMultiplier: number;
    dataQuality: DataQuality;
    dataSource: string;
  };
  warnings: string[] | null;
};

function n(value: number | null): number {
  return Number(value || 0);
}

export function calculatePhysicalStock(inventory: InventoryLike): number {
  if (!inventory) return 0;

  const stock =
    n(inventory.openingStock) +
    n(inventory.inwardAddition) -
    n(inventory.deduction) +
    n(inventory.autoAddition) -
    n(inventory.autoDeduction);

  return Math.max(0, stock);
}

export function calculateAvailableStock(inventory: InventoryLike): number {
  const physicalStock = calculatePhysicalStock(inventory);
  const blockedStock = n(inventory?.blockedStock ?? null);

  return Math.max(0, physicalStock - blockedStock);
}

export function getDaysOfStockLeft(
  availableStock: number,
  predictedDailyDemand: number,
): number | null {
  if (predictedDailyDemand <= 0) return null;
  return availableStock / predictedDailyDemand;
}

export function getStockHealth(
  availableStock: number,
  daysOfStockLeft: number | null,
): StockHealth {
  if (availableStock <= 0) return "stockout";
  if (daysOfStockLeft === null) return "healthy";
  if (daysOfStockLeft < 3) return "critical";
  if (daysOfStockLeft < 7) return "low";
  if (daysOfStockLeft < 14) return "medium";
  return "healthy";
}

function calculatePriorityScore(input: {
  last7DaysAvg: number;
  last30DaysAvg: number;
  trendMultiplier: number;
  availableStock: number;
  daysOfStockLeft: number | null;
  creativeStatus: CreativeReadiness;
  suggestedQuantity: number;
  confidence: number;
  dataQuality: DataQuality;
  priorityOverride: CreativePriorityOverride | null;
}): number {
  if (input.priorityOverride === "blocked") return 0;

  let score = 0;

  if (input.last7DaysAvg >= 5) score += 25;
  else if (input.last7DaysAvg >= 2) score += 18;
  else if (input.last7DaysAvg >= 1) score += 12;
  else if (input.last30DaysAvg > 0) score += 6;

  if (input.trendMultiplier >= 1.5) score += 20;
  else if (input.trendMultiplier >= 1.2) score += 14;
  else if (input.trendMultiplier >= 1.0) score += 8;
  else if (input.trendMultiplier < 0.7) score -= 8;

  if (input.availableStock <= 0) score -= 40;
  else if (input.daysOfStockLeft !== null && input.daysOfStockLeft < 3) score -= 25;
  else if (input.daysOfStockLeft !== null && input.daysOfStockLeft < 7) score -= 10;
  else if (input.daysOfStockLeft !== null && input.daysOfStockLeft >= 14) score += 15;
  else score += 8;

  if (input.creativeStatus === "missing" && input.last7DaysAvg > 0) score += 20;
  else if (input.creativeStatus === "basic") score += 10;
  else if (input.creativeStatus === "ready") score += 5;

  if (input.suggestedQuantity > 0 && input.confidence >= 0.6) score += 10;

  if (input.dataQuality === "poor") score -= 8;
  if (input.dataQuality === "insufficient") score -= 15;

  if (input.priorityOverride === "high") score += 15;
  if (input.priorityOverride === "low") score -= 15;

  return Math.max(0, Math.min(100, Math.round(score)));
}

function getRecommendedAction(input: {
  availableStock: number;
  daysOfStockLeft: number | null;
  predictedDailyDemand: number;
  last7DaysAvg: number;
  last30DaysAvg: number;
  trendMultiplier: number;
  creativeStatus: CreativeReadiness;
  priorityOverride: CreativePriorityOverride | null;
}): {
  action: CreativeProductAction;
  adReadiness: AdReadiness;
  reasons: string[];
} {
  if (input.priorityOverride === "blocked") {
    return {
      action: "AVOID",
      adReadiness: "avoid",
      reasons: ["Product is manually blocked from creative/ad decisions."],
    };
  }

  if (input.availableStock <= 0) {
    return {
      action: "RESTOCK_FIRST",
      adReadiness: "needs_stock",
      reasons: ["Available stock is zero. Ads should not run before restocking."],
    };
  }

  if (
    input.daysOfStockLeft !== null &&
    input.daysOfStockLeft < 7 &&
    input.predictedDailyDemand > 0
  ) {
    return {
      action: "RESTOCK_FIRST",
      adReadiness: "needs_stock",
      reasons: ["Product has demand but stock may run out soon."],
    };
  }

  if (
    input.last7DaysAvg > 0 &&
    input.creativeStatus === "missing" &&
    input.availableStock > 0
  ) {
    return {
      action: "CREATE_CREATIVE",
      adReadiness: "needs_creative",
      reasons: [
        "Product has recent demand.",
        "Creative status is missing.",
        "Create creative before running ads.",
      ],
    };
  }

  if (
    input.creativeStatus === "ready" &&
    input.availableStock > 0 &&
    (input.daysOfStockLeft === null || input.daysOfStockLeft >= 7) &&
    input.last7DaysAvg > 0
  ) {
    return {
      action: "RUN_TEST_AD",
      adReadiness: "ready",
      reasons: [
        "Product has demand, sufficient stock, and creative is ready.",
        "Run a small test ad before scaling.",
      ],
    };
  }

  if (
    input.creativeStatus === "tested" &&
    input.trendMultiplier >= 1.2 &&
    (input.daysOfStockLeft === null || input.daysOfStockLeft >= 14)
  ) {
    return {
      action: "READY_TO_SCALE",
      adReadiness: "ready",
      reasons: [
        "Creative has been tested.",
        "Product trend is positive.",
        "Stock can support scaling.",
      ],
    };
  }

  if (input.last30DaysAvg === 0 && input.creativeStatus === "missing") {
    return {
      action: "NO_ACTION",
      adReadiness: "watch",
      reasons: [
        "No recent demand signal found.",
        "Do not spend creative/ad budget blindly yet.",
      ],
    };
  }

  return {
    action: "WATCH",
    adReadiness: "watch",
    reasons: ["Product needs more observation before a strong action is recommended."],
  };
}

export function buildCreativeProductRow(params: {
  product: ProductLike;
  restock: RestockRecommendationLike | null;
  profile: CreativeProductProfile | null;
}): CreativeProductRow {
  const { product, restock, profile } = params;

  const physicalStock = calculatePhysicalStock(product.inventory);
  const availableStock = calculateAvailableStock(product.inventory);
  const blockedStock = n(product.inventory?.blockedStock ?? null);

  const predictedDailyDemand = restock?.reasoning.predictedDailyDemand ?? 0;
  const daysOfStockLeft = getDaysOfStockLeft(availableStock, predictedDailyDemand);
  const stockHealth = getStockHealth(availableStock, daysOfStockLeft);

  const creativeStatus = profile?.creativeStatus ?? "missing";
  const priorityOverride = profile?.priorityOverride ?? null;

  const last7DaysAvg = restock?.metrics.last7DaysAvg ?? 0;
  const last14DaysAvg = restock?.metrics.last14DaysAvg ?? 0;
  const last30DaysAvg = restock?.metrics.last30DaysAvg ?? 0;
  const trendMultiplier = restock?.metrics.trendMultiplier ?? 1;
  const dataQuality = restock?.metrics.dataQuality ?? "insufficient";
  const dataSource = restock?.metrics.dataSource ?? "missing_restock_signal";

  const decision = getRecommendedAction({
    availableStock,
    daysOfStockLeft,
    predictedDailyDemand,
    last7DaysAvg,
    last30DaysAvg,
    trendMultiplier,
    creativeStatus,
    priorityOverride,
  });

  const priorityScore = calculatePriorityScore({
    last7DaysAvg,
    last30DaysAvg,
    trendMultiplier,
    availableStock,
    daysOfStockLeft,
    creativeStatus,
    suggestedQuantity: restock?.suggestedQuantity ?? 0,
    confidence: restock?.confidence ?? 0,
    dataQuality,
    priorityOverride,
  });

  return {
    sku: product.sku,
    name: product.name,
    category: product.category ?? "Uncategorized",
    price: product.price,

    physicalStock,
    availableStock,
    blockedStock,
    daysOfStockLeft,
    stockHealth,

    sales: {
      last7DaysAvg,
      last14DaysAvg,
      last30DaysAvg,
      trendMultiplier,
      dataQuality,
      dataSource,
    },

    restock: {
      suggestedQuantity: restock?.suggestedQuantity ?? 0,
      confidence: restock?.confidence ?? 0,
      predictedDailyDemand,
      safetyStock: restock?.reasoning.safetyStock ?? 0,
      forecastDays: restock?.reasoning.forecastDays ?? 14,
      warnings: restock?.warnings ?? null,
    },

    creative: {
      readiness: creativeStatus,
      creativeCount: creativeStatus === "missing" ? 0 : 1,
      testedCreativeCount: creativeStatus === "tested" ? 1 : 0,
      winningCreativeCount: 0,
      notes: profile?.notes ?? null,
    },

    adReadiness: decision.adReadiness,
    priorityScore,
    recommendedAction: decision.action,
    reasons: decision.reasons,
  };
}