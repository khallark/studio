// app/business/[businessId]/creative/products/page.tsx

"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useBusinessContext } from "../../layout";
import { useToast } from "@/hooks/use-toast";
import { useDebounce } from "use-debounce";
import {
  AlertTriangle,
  ArrowUpDown,
  BarChart3,
  Box,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Eye,
  ImageIcon,
  Loader2,
  Package,
  RefreshCw,
  Search,
  Sparkles,
  TrendingUp,
  X,
} from "lucide-react";

import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  CreativeProductAction,
  CreativeProductRow,
  CreativeReadiness,
  StockHealth,
} from "@/types/creative";

type SortField =
  | "priorityScore"
  | "name"
  | "sku"
  | "category"
  | "availableStock"
  | "last7DaysAvg"
  | "trendMultiplier"
  | "suggestedQuantity";

function formatNumber(value: number, digits = 1) {
  if (!Number.isFinite(value)) return "—";
  return value.toFixed(digits);
}

function formatDays(days: number | null) {
  if (days === null) return "∞";
  if (!Number.isFinite(days)) return "∞";
  return `${Math.floor(days)}d`;
}

function getActionLabel(action: CreativeProductAction) {
  switch (action) {
    case "RUN_TEST_AD":
      return "Run Test Ad";
    case "CREATE_CREATIVE":
      return "Create Creative";
    case "RESTOCK_FIRST":
      return "Restock First";
    case "READY_TO_SCALE":
      return "Ready To Scale";
    case "WATCH":
      return "Watch";
    case "AVOID":
      return "Avoid";
    case "NO_ACTION":
      return "No Action";
    default:
      return action;
  }
}

function getActionBadgeClass(action: CreativeProductAction) {
  switch (action) {
    case "RUN_TEST_AD":
      return "bg-blue-500/10 text-blue-700 border-blue-500/20";
    case "CREATE_CREATIVE":
      return "bg-violet-500/10 text-violet-700 border-violet-500/20";
    case "RESTOCK_FIRST":
      return "bg-amber-500/10 text-amber-700 border-amber-500/20";
    case "READY_TO_SCALE":
      return "bg-emerald-500/10 text-emerald-700 border-emerald-500/20";
    case "AVOID":
      return "bg-red-500/10 text-red-700 border-red-500/20";
    case "NO_ACTION":
      return "bg-muted text-muted-foreground border-border";
    default:
      return "bg-slate-500/10 text-slate-700 border-slate-500/20";
  }
}

function getStockHealthLabel(stockHealth: StockHealth) {
  switch (stockHealth) {
    case "stockout":
      return "Stockout";
    case "critical":
      return "Critical";
    case "low":
      return "Low";
    case "medium":
      return "Medium";
    case "healthy":
      return "Healthy";
    default:
      return stockHealth;
  }
}

function getStockHealthBadgeClass(stockHealth: StockHealth) {
  switch (stockHealth) {
    case "stockout":
    case "critical":
      return "bg-red-500/10 text-red-700 border-red-500/20";
    case "low":
      return "bg-amber-500/10 text-amber-700 border-amber-500/20";
    case "medium":
      return "bg-blue-500/10 text-blue-700 border-blue-500/20";
    case "healthy":
      return "bg-emerald-500/10 text-emerald-700 border-emerald-500/20";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function getCreativeLabel(readiness: CreativeReadiness) {
  switch (readiness) {
    case "missing":
      return "Missing";
    case "basic":
      return "Basic";
    case "ready":
      return "Ready";
    case "tested":
      return "Tested";
    default:
      return readiness;
  }
}

export default function CreativeProductsPage() {
  const { isAuthorized, loading: authLoading, user, businessId } =
    useBusinessContext();
  const { toast } = useToast();

  const [rows, setRows] = useState<CreativeProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch] = useDebounce(searchQuery, 300);

  const [categoryFilter, setCategoryFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");
  const [creativeFilter, setCreativeFilter] = useState("all");
  const [stockFilter, setStockFilter] = useState("all");

  const [sortField, setSortField] = useState<SortField>("priorityScore");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const [selectedRow, setSelectedRow] = useState<CreativeProductRow | null>(
    null,
  );

  async function fetchRows(showRefreshState = false) {
    if (!user || !businessId) return;

    if (showRefreshState) setRefreshing(true);
    else setLoading(true);

    try {
      const idToken = await user.getIdToken();

      const response = await fetch(
        `/api/business/creative/products?businessId=${businessId}`,
        {
          headers: {
            Authorization: `Bearer ${idToken}`,
          },
        },
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || "Failed to fetch creative products");
      }

      setRows(result.rows || []);
    } catch (error) {
      console.error("Error fetching creative products:", error);
      toast({
        title: "Error",
        description:
          error instanceof Error
            ? error.message
            : "Could not fetch creative products.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function updateCreativeStatus(
    row: CreativeProductRow,
    creativeStatus: CreativeReadiness,
  ) {
    if (!user || !businessId) return;

    try {
      const idToken = await user.getIdToken();

      const response = await fetch(
        "/api/business/creative/products/update-profile",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({
            businessId,
            sku: row.sku,
            creativeStatus,
          }),
        },
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || "Failed to update creative status");
      }

      toast({
        title: "Creative Status Updated",
        description: `${row.sku} marked as ${getCreativeLabel(creativeStatus)}.`,
      });

      await fetchRows(true);
    } catch (error) {
      console.error("Error updating creative status:", error);
      toast({
        title: "Error",
        description:
          error instanceof Error
            ? error.message
            : "Could not update creative status.",
        variant: "destructive",
      });
    }
  }

  useEffect(() => {
    document.title = "Creative Products - Business Dashboard";
  }, []);

  useEffect(() => {
    if (!authLoading && isAuthorized && businessId && user) {
      fetchRows();
    }
  }, [authLoading, isAuthorized, businessId, user]);

  useEffect(() => {
    setCurrentPage(1);
  }, [
    debouncedSearch,
    categoryFilter,
    actionFilter,
    creativeFilter,
    stockFilter,
    sortField,
    sortDirection,
  ]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};

    rows.forEach((row) => {
      counts[row.category] = (counts[row.category] || 0) + 1;
    });

    return counts;
  }, [rows]);

  const stats = useMemo(() => {
    return {
      total: rows.length,
      runTestAd: rows.filter((r) => r.recommendedAction === "RUN_TEST_AD")
        .length,
      needCreative: rows.filter((r) => r.recommendedAction === "CREATE_CREATIVE")
        .length,
      restockFirst: rows.filter((r) => r.recommendedAction === "RESTOCK_FIRST")
        .length,
      readyToScale: rows.filter((r) => r.recommendedAction === "READY_TO_SCALE")
        .length,
      avoid: rows.filter((r) => r.recommendedAction === "AVOID").length,
    };
  }, [rows]);

  const filteredRows = useMemo(() => {
    let result = [...rows];

    if (debouncedSearch) {
      const search = debouncedSearch.toLowerCase();

      result = result.filter(
        (row) =>
          row.name.toLowerCase().includes(search) ||
          row.sku.toLowerCase().includes(search) ||
          row.category.toLowerCase().includes(search),
      );
    }

    if (categoryFilter !== "all") {
      result = result.filter((row) => row.category === categoryFilter);
    }

    if (actionFilter !== "all") {
      result = result.filter((row) => row.recommendedAction === actionFilter);
    }

    if (creativeFilter !== "all") {
      result = result.filter((row) => row.creative.readiness === creativeFilter);
    }

    if (stockFilter !== "all") {
      result = result.filter((row) => row.stockHealth === stockFilter);
    }

    result.sort((a, b) => {
      let aVal: string | number = 0;
      let bVal: string | number = 0;

      switch (sortField) {
        case "priorityScore":
          aVal = a.priorityScore;
          bVal = b.priorityScore;
          break;
        case "name":
          aVal = a.name.toLowerCase();
          bVal = b.name.toLowerCase();
          break;
        case "sku":
          aVal = a.sku.toLowerCase();
          bVal = b.sku.toLowerCase();
          break;
        case "category":
          aVal = a.category.toLowerCase();
          bVal = b.category.toLowerCase();
          break;
        case "availableStock":
          aVal = a.availableStock;
          bVal = b.availableStock;
          break;
        case "last7DaysAvg":
          aVal = a.sales.last7DaysAvg;
          bVal = b.sales.last7DaysAvg;
          break;
        case "trendMultiplier":
          aVal = a.sales.trendMultiplier;
          bVal = b.sales.trendMultiplier;
          break;
        case "suggestedQuantity":
          aVal = a.restock.suggestedQuantity;
          bVal = b.restock.suggestedQuantity;
          break;
      }

      if (sortDirection === "asc") {
        return aVal > bVal ? 1 : -1;
      }

      return aVal < bVal ? 1 : -1;
    });

    return result;
  }, [
    rows,
    debouncedSearch,
    categoryFilter,
    actionFilter,
    creativeFilter,
    stockFilter,
    sortField,
    sortDirection,
  ]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / rowsPerPage));

  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    return filteredRows.slice(start, start + rowsPerPage);
  }, [filteredRows, currentPage, rowsPerPage]);

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  }

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthorized) return null;

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4 md:p-6 border-b bg-gradient-to-r from-background via-background to-muted/30">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/10 ring-1 ring-primary/20">
              <Sparkles className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
                Creative Products
              </h1>
              <p className="text-sm text-muted-foreground">
                Decide which products need ads, creatives, or restock attention.
              </p>
            </div>
          </div>
        </div>

        <Button
          variant="outline"
          onClick={() => fetchRows(true)}
          disabled={refreshing}
          className="gap-2"
        >
          {refreshing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-6 gap-4 p-4 md:px-6">
        <StatsCard title="Total" value={stats.total} icon={Package} />
        <StatsCard title="Run Test" value={stats.runTestAd} icon={BarChart3} />
        <StatsCard title="Need Creative" value={stats.needCreative} icon={ImageIcon} />
        <StatsCard title="Restock First" value={stats.restockFirst} icon={Box} />
        <StatsCard title="Scale Ready" value={stats.readyToScale} icon={TrendingUp} />
        <StatsCard title="Avoid" value={stats.avoid} icon={AlertTriangle} />
      </div>

      <div className="flex-1 p-4 md:px-6 md:pb-6 overflow-hidden">
        <Card className="h-full flex flex-col shadow-xl shadow-black/5 border-0 ring-1 ring-border/50">
          <CardHeader className="pb-4 border-b bg-muted/30">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              <div className="relative md:col-span-2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name, SKU, or category..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 bg-background border-0 ring-1 ring-border/50"
                />
                {searchQuery && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                    onClick={() => setSearchQuery("")}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>

              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="bg-background border-0 ring-1 ring-border/50">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {Object.keys(categoryCounts)
                    .sort()
                    .map((category) => (
                      <SelectItem key={category} value={category}>
                        {category} ({categoryCounts[category]})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>

              <Select value={actionFilter} onValueChange={setActionFilter}>
                <SelectTrigger className="bg-background border-0 ring-1 ring-border/50">
                  <SelectValue placeholder="Action" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Actions</SelectItem>
                  <SelectItem value="CREATE_CREATIVE">Create Creative</SelectItem>
                  <SelectItem value="RESTOCK_FIRST">Restock First</SelectItem>
                  <SelectItem value="RUN_TEST_AD">Run Test Ad</SelectItem>
                  <SelectItem value="READY_TO_SCALE">Ready To Scale</SelectItem>
                  <SelectItem value="WATCH">Watch</SelectItem>
                  <SelectItem value="NO_ACTION">No Action</SelectItem>
                  <SelectItem value="AVOID">Avoid</SelectItem>
                </SelectContent>
              </Select>

              <Select value={creativeFilter} onValueChange={setCreativeFilter}>
                <SelectTrigger className="bg-background border-0 ring-1 ring-border/50">
                  <SelectValue placeholder="Creative" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Creative</SelectItem>
                  <SelectItem value="missing">Missing</SelectItem>
                  <SelectItem value="basic">Basic</SelectItem>
                  <SelectItem value="ready">Ready</SelectItem>
                  <SelectItem value="tested">Tested</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>

          <CardContent className="flex-1 p-0 overflow-auto">
            {loading ? (
              <div className="p-6 space-y-4">
                {[...Array(6)].map((_, index) => (
                  <div key={index} className="flex items-center gap-4">
                    <Skeleton className="h-10 w-10 rounded-lg" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-1/3" />
                      <Skeleton className="h-3 w-1/4" />
                    </div>
                    <Skeleton className="h-6 w-24 rounded-full" />
                    <Skeleton className="h-6 w-20 rounded-full" />
                  </div>
                ))}
              </div>
            ) : filteredRows.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 px-4">
                <Search className="h-12 w-12 text-muted-foreground/50" />
                <h3 className="mt-4 text-lg font-medium">No products found</h3>
                <p className="mt-1 text-muted-foreground">
                  Try adjusting your filters.
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader className="bg-muted/50 sticky top-0">
                  <TableRow>
                    <TableHead>
                      <SortButton
                        label="Product"
                        onClick={() => handleSort("name")}
                      />
                    </TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>
                      <SortButton
                        label="Stock"
                        onClick={() => handleSort("availableStock")}
                      />
                    </TableHead>
                    <TableHead>
                      <SortButton
                        label="Sales"
                        onClick={() => handleSort("last7DaysAvg")}
                      />
                    </TableHead>
                    <TableHead>Creative</TableHead>
                    <TableHead>
                      <SortButton
                        label="Restock"
                        onClick={() => handleSort("suggestedQuantity")}
                      />
                    </TableHead>
                    <TableHead>
                      <SortButton
                        label="Score"
                        onClick={() => handleSort("priorityScore")}
                      />
                    </TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead className="w-[70px]" />
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {paginatedRows.map((row) => (
                    <TableRow key={row.sku} className="group">
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 ring-1 ring-primary/10">
                            <Package className="h-5 w-5 text-primary" />
                          </div>
                          <div>
                            <p className="font-medium">{row.name}</p>
                            <code className="text-xs text-muted-foreground">
                              {row.sku}
                            </code>
                          </div>
                        </div>
                      </TableCell>

                      <TableCell>
                        <Badge variant="secondary">{row.category}</Badge>
                      </TableCell>

                      <TableCell>
                        <div className="space-y-1">
                          <p className="font-medium tabular-nums">
                            {row.availableStock} available
                          </p>
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-xs",
                              getStockHealthBadgeClass(row.stockHealth),
                            )}
                          >
                            {getStockHealthLabel(row.stockHealth)} ·{" "}
                            {formatDays(row.daysOfStockLeft)}
                          </Badge>
                        </div>
                      </TableCell>

                      <TableCell>
                        <div className="space-y-1 text-sm">
                          <p>
                            7D:{" "}
                            <span className="font-medium">
                              {formatNumber(row.sales.last7DaysAvg)}
                            </span>
                            /day
                          </p>
                          <p className="text-xs text-muted-foreground">
                            30D: {formatNumber(row.sales.last30DaysAvg)}/day ·{" "}
                            {formatNumber(row.sales.trendMultiplier, 2)}x
                          </p>
                        </div>
                      </TableCell>

                      <TableCell>
                        <Badge variant="outline">
                          {getCreativeLabel(row.creative.readiness)}
                        </Badge>
                      </TableCell>

                      <TableCell>
                        <div className="space-y-1">
                          <p className="font-medium">
                            {row.restock.suggestedQuantity}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {Math.round(row.restock.confidence * 100)}% confidence
                          </p>
                        </div>
                      </TableCell>

                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-16 rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full bg-primary"
                              style={{ width: `${row.priorityScore}%` }}
                            />
                          </div>
                          <span className="text-sm font-semibold tabular-nums">
                            {row.priorityScore}
                          </span>
                        </div>
                      </TableCell>

                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn(
                            "whitespace-nowrap",
                            getActionBadgeClass(row.recommendedAction),
                          )}
                        >
                          {getActionLabel(row.recommendedAction)}
                        </Badge>
                      </TableCell>

                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <Eye className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>

                          <DropdownMenuContent align="end" className="w-56">
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>

                            <DropdownMenuItem onClick={() => setSelectedRow(row)}>
                              View Decision Details
                            </DropdownMenuItem>

                            <DropdownMenuSeparator />

                            <DropdownMenuItem
                              onClick={() => updateCreativeStatus(row, "missing")}
                            >
                              Mark Creative Missing
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => updateCreativeStatus(row, "basic")}
                            >
                              Mark Creative Basic
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => updateCreativeStatus(row, "ready")}
                            >
                              Mark Creative Ready
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => updateCreativeStatus(row, "tested")}
                            >
                              Mark Creative Tested
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>

          {filteredRows.length > 0 && (
            <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/30">
              <p className="text-sm text-muted-foreground">
                Showing{" "}
                <span className="font-medium">
                  {(currentPage - 1) * rowsPerPage + 1}
                </span>{" "}
                to{" "}
                <span className="font-medium">
                  {Math.min(currentPage * rowsPerPage, filteredRows.length)}
                </span>{" "}
                of <span className="font-medium">{filteredRows.length}</span>{" "}
                products
              </p>

              <div className="flex items-center gap-2">
                <Select
                  value={rowsPerPage.toString()}
                  onValueChange={(value) => {
                    setRowsPerPage(Number(value));
                    setCurrentPage(1);
                  }}
                >
                  <SelectTrigger className="w-[75px] h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="25">25</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                  </SelectContent>
                </Select>

                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>

                <span className="text-sm">
                  Page {currentPage} of {totalPages}
                </span>

                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  disabled={currentPage === totalPages}
                  onClick={() =>
                    setCurrentPage((prev) => Math.min(totalPages, prev + 1))
                  }
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>

      <DecisionDialog
        row={selectedRow}
        onOpenChange={(open) => {
          if (!open) setSelectedRow(null);
        }}
      />
    </div>
  );
}

function StatsCard({
  title,
  value,
  icon: Icon,
}: {
  title: string;
  value: number;
  icon: React.ElementType;
}) {
  return (
    <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {title}
            </p>
            <p className="text-2xl font-bold mt-1">{value}</p>
          </div>
          <div className="p-2 rounded-lg bg-primary/10">
            <Icon className="h-5 w-5 text-primary" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SortButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className="-ml-3 h-8 gap-1 font-semibold"
      onClick={onClick}
    >
      {label}
      <ArrowUpDown className="h-3 w-3" />
    </Button>
  );
}

function DecisionDialog({
  row,
  onOpenChange,
}: {
  row: CreativeProductRow | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={!!row} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        {row && (
          <>
            <DialogHeader>
              <DialogTitle>{row.name}</DialogTitle>
              <DialogDescription>
                {row.sku} · {row.category}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-5">
              <div className="flex flex-wrap gap-2">
                <Badge
                  variant="outline"
                  className={cn(getActionBadgeClass(row.recommendedAction))}
                >
                  {getActionLabel(row.recommendedAction)}
                </Badge>
                <Badge variant="secondary">Score {row.priorityScore}</Badge>
                <Badge variant="secondary">
                  Creative: {getCreativeLabel(row.creative.readiness)}
                </Badge>
              </div>

              <div>
                <h3 className="font-semibold mb-2">Reasons</h3>
                <ul className="space-y-1 text-sm text-muted-foreground list-disc pl-5">
                  {row.reasons.map((reason, index) => (
                    <li key={index}>{reason}</li>
                  ))}
                </ul>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <InfoBlock
                  title="Demand"
                  items={[
                    ["7D Avg", `${formatNumber(row.sales.last7DaysAvg)}/day`],
                    ["14D Avg", `${formatNumber(row.sales.last14DaysAvg)}/day`],
                    ["30D Avg", `${formatNumber(row.sales.last30DaysAvg)}/day`],
                    ["Trend", `${formatNumber(row.sales.trendMultiplier, 2)}x`],
                    ["Data Quality", row.sales.dataQuality],
                  ]}
                />

                <InfoBlock
                  title="Stock"
                  items={[
                    ["Physical", String(row.physicalStock)],
                    ["Blocked", String(row.blockedStock)],
                    ["Available", String(row.availableStock)],
                    ["Days Left", formatDays(row.daysOfStockLeft)],
                    ["Health", getStockHealthLabel(row.stockHealth)],
                  ]}
                />

                <InfoBlock
                  title="Restock"
                  items={[
                    ["Suggested Qty", String(row.restock.suggestedQuantity)],
                    [
                      "Confidence",
                      `${Math.round(row.restock.confidence * 100)}%`,
                    ],
                    [
                      "Predicted Demand",
                      `${formatNumber(row.restock.predictedDailyDemand)}/day`,
                    ],
                    ["Safety Stock", String(row.restock.safetyStock)],
                    ["Forecast Days", String(row.restock.forecastDays)],
                  ]}
                />

                <InfoBlock
                  title="Creative"
                  items={[
                    ["Status", getCreativeLabel(row.creative.readiness)],
                    ["Creative Count", String(row.creative.creativeCount)],
                    [
                      "Tested Count",
                      String(row.creative.testedCreativeCount),
                    ],
                    [
                      "Winning Count",
                      String(row.creative.winningCreativeCount),
                    ],
                  ]}
                />
              </div>

              {row.restock.warnings && row.restock.warnings.length > 0 && (
                <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-3">
                  <h3 className="font-semibold text-amber-800 mb-1">
                    Warnings
                  </h3>
                  <ul className="list-disc pl-5 text-sm text-amber-800 space-y-1">
                    {row.restock.warnings.map((warning, index) => (
                      <li key={index}>{warning}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function InfoBlock({
  title,
  items,
}: {
  title: string;
  items: [string, string][];
}) {
  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      <h3 className="font-semibold mb-2">{title}</h3>
      <div className="space-y-1">
        {items.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-4">
            <span className="text-muted-foreground">{label}</span>
            <span className="font-medium text-right">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}