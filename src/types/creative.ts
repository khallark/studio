// types/creative.ts

export type CreativeProductAction =
  | "RUN_TEST_AD"
  | "CREATE_CREATIVE"
  | "RESTOCK_FIRST"
  | "READY_TO_SCALE"
  | "WATCH"
  | "AVOID"
  | "NO_ACTION";

export type CreativeReadiness =
  | "missing"
  | "basic"
  | "ready"
  | "tested";

export type AdReadiness =
  | "ready"
  | "needs_creative"
  | "needs_stock"
  | "avoid"
  | "watch";

export type StockHealth =
  | "stockout"
  | "critical"
  | "low"
  | "medium"
  | "healthy";

export type DataQuality =
  | "excellent"
  | "good"
  | "fair"
  | "poor"
  | "insufficient";

export type CreativePriorityOverride =
  | "high"
  | "normal"
  | "low"
  | "blocked";

export interface CreativeProductProfile {
  sku: string;
  creativeStatus: CreativeReadiness;
  priorityOverride: CreativePriorityOverride | null;
  notes: string | null;
  manualTags: string[] | null;
  lastCreativeAddedAt: unknown | null;
  lastAdTestedAt: unknown | null;
  createdAt: unknown | null;
  updatedAt: unknown | null;
  updatedBy: string | null;
}

export interface CreativeProductRow {
  sku: string;
  name: string;
  category: string;
  price: number | null;

  physicalStock: number;
  availableStock: number;
  blockedStock: number;
  daysOfStockLeft: number | null;
  stockHealth: StockHealth;

  sales: {
    last7DaysAvg: number;
    last14DaysAvg: number;
    last30DaysAvg: number;
    trendMultiplier: number;
    dataQuality: DataQuality;
    dataSource: string;
  };

  restock: {
    suggestedQuantity: number;
    confidence: number;
    predictedDailyDemand: number;
    safetyStock: number;
    forecastDays: number;
    warnings: string[] | null;
  };

  creative: {
    readiness: CreativeReadiness;
    creativeCount: number;
    testedCreativeCount: number;
    winningCreativeCount: number;
    notes: string | null;
  };

  adReadiness: AdReadiness;
  priorityScore: number;
  recommendedAction: CreativeProductAction;
  reasons: string[];
}