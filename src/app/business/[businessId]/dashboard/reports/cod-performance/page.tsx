// /business/[businessId]/dashboard/reports/cod/page.tsx

'use client';

import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { db } from '@/lib/firebase';
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  startAfter,
  QueryDocumentSnapshot,
} from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Loader2,
  CheckCircle,
  XCircle,
  Clock,
  Download,
  Truck,
  PackageCheck,
  AlertTriangle,
  MoreVertical,
  RefreshCw,
  ChevronDown,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { format } from 'date-fns';
import { useBusinessContext } from '../../../layout';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type CodReportStatus = 'generating' | 'uploading' | 'completed' | 'failed';
type StatusFilter = 'all' | CodReportStatus;
type Courier = 'Blue Dart' | 'Delhivery';

interface CodReportSummary {
  totalOrders: number;
  prepaidCount: number;
  codTotal: number;
  yetToBeAttempted: number;
  attempted: number;
  delivered: number;
  noTracking: number;
  deliveredAttemptBuckets: Record<string, number>;
}

interface CodReportDoc {
  id: string;
  status: CodReportStatus;
  startedAt?: Timestamp;
  completedAt?: Timestamp;
  failedAt?: Timestamp;
  courier: Courier;
  startDate: string;
  endDate: string;
  storeIds: string[];
  downloadUrl?: string;
  fileName?: string;
  error?: string;
  summary?: CodReportSummary;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

// ─────────────────────────────────────────────────────────────────────────────
// Small helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatDateLabel(dateStr: string) {
  try {
    return format(new Date(`${dateStr}T00:00:00`), 'dd MMM yyyy');
  } catch {
    return dateStr;
  }
}

function formatTs(ts?: Timestamp) {
  if (!ts) return '—';
  return format(ts.toDate(), 'dd MMM yyyy, HH:mm');
}

function elapsedLabel(start?: Timestamp, end?: Timestamp) {
  if (!start || !end) return null;
  const ms = end.toDate().getTime() - start.toDate().getTime();
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

// delivered / attempted, as a 1-dp percentage string (or null when nothing attempted)
function deliveryRate(summary?: CodReportSummary): string | null {
  if (!summary || summary.attempted <= 0) return null;
  return `${((summary.delivered / summary.attempted) * 100).toFixed(1)}%`;
}

// ─────────────────────────────────────────────────────────────────────────────
// State / Loading components
// ─────────────────────────────────────────────────────────────────────────────

function PageLoadingState() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh]">
      <div className="relative mb-8">
        <div className="w-20 h-20 rounded-full border-2 border-primary/20 border-t-primary animate-spin absolute inset-0" style={{ animationDuration: '1.5s' }} />
        <div className="w-20 h-20 flex items-center justify-center">
          <Truck className="h-7 w-7 text-primary" />
        </div>
      </div>
      <h2 className="text-lg font-semibold">Loading COD Reports</h2>
      <p className="text-sm text-muted-foreground mt-1">Fetching report history...</p>
    </div>
  );
}

function UnauthorizedState() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh]">
      <div className="relative mb-6">
        <div className="text-[120px] font-bold text-muted/20 leading-none select-none">404</div>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="rounded-full bg-muted p-4">
            <AlertTriangle className="h-8 w-8 text-muted-foreground" />
          </div>
        </div>
      </div>
      <h2 className="text-xl font-semibold mb-2">Unauthorized Access</h2>
      <p className="text-muted-foreground text-center max-w-sm">
        You don't have permission to access this business's COD reports.
      </p>
    </div>
  );
}

function EmptyState({ filter }: { filter: StatusFilter }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
      <div className="relative mb-6">
        <div className="absolute inset-0 bg-primary/10 rounded-full blur-xl scale-150" />
        <div className="relative rounded-full bg-muted p-6">
          <Truck className="h-10 w-10 text-muted-foreground" />
        </div>
      </div>
      <h3 className="text-lg font-semibold mb-2">No Reports Found</h3>
      <p className="text-sm text-muted-foreground max-w-sm">
        {filter === 'all'
          ? 'Queue a COD report from the Dashboard to see it here.'
          : `No reports with status "${filter}" found.`}
      </p>
    </div>
  );
}

function ReportCardSkeleton() {
  return (
    <div className="border rounded-xl p-4 space-y-3 animate-pulse">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-muted" />
          <div className="space-y-2">
            <div className="h-4 w-40 bg-muted rounded" />
            <div className="h-3 w-28 bg-muted rounded" />
          </div>
        </div>
        <div className="h-8 w-24 bg-muted rounded-md" />
      </div>
      <div className="flex gap-4">
        <div className="h-3 w-32 bg-muted rounded" />
        <div className="h-3 w-24 bg-muted rounded" />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Status config
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  CodReportStatus,
  { icon: React.ElementType; color: string; bg: string; iconClass: string; label: string }
> = {
  generating: {
    icon: Loader2,
    color: 'text-primary',
    bg: 'bg-primary/10',
    iconClass: 'animate-spin',
    label: 'Generating',
  },
  uploading: {
    icon: RefreshCw,
    color: 'text-amber-600',
    bg: 'bg-amber-100 dark:bg-amber-900/20',
    iconClass: 'animate-spin',
    label: 'Uploading',
  },
  completed: {
    icon: CheckCircle,
    color: 'text-green-600',
    bg: 'bg-green-100 dark:bg-green-900/20',
    iconClass: '',
    label: 'Completed',
  },
  failed: {
    icon: XCircle,
    color: 'text-destructive',
    bg: 'bg-destructive/10',
    iconClass: '',
    label: 'Failed',
  },
};

// Courier accent — keeps Blue Dart / Delhivery visually distinct at a glance.
const COURIER_CONFIG: Record<Courier, { label: string; className: string }> = {
  'Blue Dart': {
    label: 'Blue Dart',
    className: 'border-blue-300 text-blue-700 dark:text-blue-400',
  },
  Delhivery: {
    label: 'Delhivery',
    className: 'border-red-300 text-red-700 dark:text-red-400',
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Report Card
// ─────────────────────────────────────────────────────────────────────────────

function ReportCard({ report }: { report: CodReportDoc }) {
  const { toast } = useToast();
  const [isDownloading, setIsDownloading] = useState(false);
  const cfg = STATUS_CONFIG[report.status];
  const StatusIcon = cfg.icon;
  const courierCfg = COURIER_CONFIG[report.courier];

  const isActive = report.status === 'generating' || report.status === 'uploading';

  const handleDownload = useCallback(async () => {
    if (!report.downloadUrl) return;
    setIsDownloading(true);
    try {
      const a = document.createElement('a');
      a.href = report.downloadUrl;
      a.download = report.fileName ?? `cod-report_${report.startDate}_to_${report.endDate}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {
      toast({ title: 'Download Failed', description: 'Could not open the download URL.', variant: 'destructive' });
    } finally {
      setIsDownloading(false);
    }
  }, [report, toast]);

  const elapsed = elapsedLabel(report.startedAt, report.completedAt ?? report.failedAt);
  const rate = deliveryRate(report.summary);

  // Attempt bifurcation chips, sorted by attempt number ascending.
  const attemptBuckets = useMemo(() => {
    const buckets = report.summary?.deliveredAttemptBuckets;
    if (!buckets) return [];
    return Object.entries(buckets)
      .map(([k, v]) => [Number(k), v] as const)
      .filter(([, v]) => v > 0)
      .sort(([a], [b]) => a - b);
  }, [report.summary]);

  return (
    <div
      className={cn(
        'border rounded-xl p-4 transition-all duration-200 hover:shadow-md hover:border-primary/20',
        isActive && 'border-primary/30 bg-primary/5',
        report.status === 'failed' && 'border-destructive/30',
      )}
    >
      {/* Top row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {/* Status icon */}
          <div className={cn('shrink-0 rounded-full p-2.5', cfg.bg)}>
            <StatusIcon className={cn('h-5 w-5', cfg.color, cfg.iconClass)} />
          </div>

          {/* Main info */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold">
                {formatDateLabel(report.startDate)}
                {report.startDate !== report.endDate && (
                  <> &rarr; {formatDateLabel(report.endDate)}</>
                )}
              </span>
              <Badge
                variant="outline"
                className={cn('text-xs shrink-0 gap-1', courierCfg.className)}
              >
                <Truck className="h-3 w-3" />
                {courierCfg.label}
              </Badge>
              <Badge
                variant="secondary"
                className={cn('text-xs shrink-0', cfg.color)}
              >
                {cfg.label}
              </Badge>
            </div>

            <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatTs(report.startedAt)}
              </span>
              {elapsed && (
                <span className="text-muted-foreground/70">({elapsed})</span>
              )}
            </div>
          </div>
        </div>

        {/* Actions — desktop */}
        <div className="hidden md:flex items-center gap-2 shrink-0">
          {report.status === 'completed' && report.downloadUrl && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleDownload}
              disabled={isDownloading}
              className="gap-1.5"
            >
              {isDownloading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              Download Excel
            </Button>
          )}
        </div>

        {/* Actions — mobile */}
        {report.status === 'completed' && report.downloadUrl && (
          <div className="md:hidden shrink-0">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon" variant="ghost" className="h-8 w-8">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleDownload} disabled={isDownloading}>
                  <Download className="h-4 w-4 mr-2" />
                  Download Excel
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      {/* Store IDs */}
      {report.storeIds?.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {report.storeIds.map((s) => (
            <Badge key={s} variant="outline" className="text-xs font-normal">
              {s}
            </Badge>
          ))}
        </div>
      )}

      {/* Summary for completed */}
      {report.status === 'completed' && report.summary && (
        <div className="mt-3 pt-3 border-t space-y-3">
          {/* Funnel */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-muted-foreground">
            <span>
              <span className="font-medium text-foreground">
                {report.summary.totalOrders.toLocaleString('en-IN')}
              </span>{' '}
              total orders
            </span>
            <span>
              <span className="font-medium text-foreground">
                {report.summary.codTotal.toLocaleString('en-IN')}
              </span>{' '}
              COD orders
            </span>
            <span>
              <span className="font-medium text-foreground">
                {report.summary.delivered.toLocaleString('en-IN')}
              </span>{' '}
              delivered
            </span>
            <span className="flex items-center gap-1">
              <PackageCheck className="h-3.5 w-3.5 text-green-600" />
              <span className="font-medium text-foreground">{rate ?? '—'}</span>{' '}
              delivery rate
            </span>
          </div>

          {/* Attempt bifurcation */}
          {attemptBuckets.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Delivered in:</span>
              {attemptBuckets.map(([attempts, count]) => (
                <Badge key={attempts} variant="secondary" className="text-xs font-normal">
                  {attempts} {attempts === 1 ? 'attempt' : 'attempts'} · {count.toLocaleString('en-IN')}
                </Badge>
              ))}
            </div>
          )}

          {/* No-tracking note */}
          {report.summary.noTracking > 0 && (
            <p className="text-xs text-muted-foreground/80 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              {report.summary.noTracking.toLocaleString('en-IN')} COD order
              {report.summary.noTracking === 1 ? '' : 's'} had no tracking data
              (counted under “Yet to be Attempted”).
            </p>
          )}
        </div>
      )}

      {/* Error row for failed */}
      {report.status === 'failed' && report.error && (
        <div className="mt-3 flex items-start gap-2 p-2.5 rounded-lg bg-destructive/5 text-destructive text-xs">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span className="break-all">{report.error}</span>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────

export default function CodReportsPage() {
  const { isAuthorized, loading: authLoading, businessId } = useBusinessContext();
  const { toast } = useToast();

  const [reports, setReports] = useState<CodReportDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  // Cursor for pagination (last doc from previous batch)
  const lastDocRef = useRef<QueryDocumentSnapshot | null>(null);
  // Unsubscribe fn for the current listener
  const unsubRef = useRef<(() => void) | null>(null);

  // Set page title
  useEffect(() => {
    document.title = 'COD Reports';
  }, []);

  // Core listener setup
  const attachListener = useCallback(
    (cursor: QueryDocumentSnapshot | null, append: boolean) => {
      if (!businessId) return;

      if (!append) {
        setLoading(true);
        // Tear down existing listener
        unsubRef.current?.();
        unsubRef.current = null;
      } else {
        setLoadingMore(true);
      }

      const ref = collection(db, 'users', businessId, 'cod_reports');
      const constraints: Parameters<typeof query>[1][] = [
        orderBy('startedAt', 'desc'),
        limit(PAGE_SIZE + 1), // fetch one extra to determine hasMore
      ];
      if (cursor) constraints.push(startAfter(cursor));

      const q = query(ref, ...constraints);

      const unsub = onSnapshot(
        q,
        (snap) => {
          const docs = snap.docs;
          const hasNextPage = docs.length > PAGE_SIZE;
          const pageDocs = hasNextPage ? docs.slice(0, PAGE_SIZE) : docs;

          const parsed: CodReportDoc[] = pageDocs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<CodReportDoc, 'id'>),
          }));

          if (append) {
            setReports((prev) => {
              // Merge: replace existing by id, then append new
              const existingMap = new Map(prev.map((r) => [r.id, r]));
              parsed.forEach((r) => existingMap.set(r.id, r));
              return Array.from(existingMap.values()).sort((a, b) => {
                const tA = a.startedAt?.toMillis() ?? 0;
                const tB = b.startedAt?.toMillis() ?? 0;
                return tB - tA;
              });
            });
            setLoadingMore(false);
          } else {
            setReports(parsed);
            setLoading(false);
          }

          lastDocRef.current = pageDocs[pageDocs.length - 1] ?? null;
          setHasMore(hasNextPage);
        },
        (err) => {
          console.error('COD reports snapshot error:', err);
          toast({ title: 'Failed to load reports', description: 'Please refresh.', variant: 'destructive' });
          setLoading(false);
          setLoadingMore(false);
        },
      );

      unsubRef.current = unsub;
    },
    [businessId, toast],
  );

  // Re-attach on businessId change
  useEffect(() => {
    if (!businessId || !isAuthorized) return;
    lastDocRef.current = null;
    attachListener(null, false);

    return () => {
      unsubRef.current?.();
      unsubRef.current = null;
    };
  }, [businessId, isAuthorized, attachListener]);

  const handleLoadMore = useCallback(() => {
    if (!lastDocRef.current || loadingMore) return;
    attachListener(lastDocRef.current, true);
  }, [attachListener, loadingMore]);

  // Client-side filter
  const filteredReports = useMemo(() => {
    if (statusFilter === 'all') return reports;
    return reports.filter((r) => r.status === statusFilter);
  }, [reports, statusFilter]);

  // Status counts for badges
  const counts = useMemo(() => {
    const c: Record<StatusFilter, number> = { all: reports.length, generating: 0, uploading: 0, completed: 0, failed: 0 };
    reports.forEach((r) => { c[r.status] = (c[r.status] ?? 0) + 1; });
    return c;
  }, [reports]);

  // ── Auth guards ──────────────────────────────────────────────────────────

  if (authLoading) return <PageLoadingState />;
  if (!isAuthorized) return <UnauthorizedState />;

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <main className="flex h-full flex-col bg-muted/30">
      {/* Header */}
      <div className="border-b bg-background">
        <div className="p-4 md:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
                <Truck className="h-6 w-6 text-primary" />
                COD Reports
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                View and download generated COD delivery performance reports.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 p-4 md:p-6 min-h-0">
        <Card className="h-full flex flex-col">
          <CardHeader className="pb-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <CardTitle className="text-lg">Report History</CardTitle>
                <CardDescription className="mt-1">
                  All COD report generation jobs, newest first.
                </CardDescription>
              </div>

              {/* Filter */}
              <Select
                value={statusFilter}
                onValueChange={(v) => setStatusFilter(v as StatusFilter)}
              >
                <SelectTrigger className="w-full sm:w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(['all', 'generating', 'uploading', 'completed', 'failed'] as StatusFilter[]).map((s) => (
                    <SelectItem key={s} value={s}>
                      <div className="flex items-center justify-between w-full gap-4">
                        <span className="capitalize">{s === 'all' ? 'All Statuses' : s}</span>
                        {counts[s] > 0 && (
                          <Badge variant="secondary" className="text-xs ml-2">
                            {counts[s]}
                          </Badge>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>

          <CardContent className="flex-1 min-h-0 overflow-hidden">
            <ScrollArea className="h-full pr-4">
              {loading ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4].map((i) => <ReportCardSkeleton key={i} />)}
                </div>
              ) : filteredReports.length === 0 ? (
                <EmptyState filter={statusFilter} />
              ) : (
                <div className="space-y-3 pb-4">
                  {filteredReports.map((r) => (
                    <ReportCard key={r.id} report={r} />
                  ))}

                  {/* Load more */}
                  {hasMore && statusFilter === 'all' && (
                    <div className="pt-2 flex justify-center">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleLoadMore}
                        disabled={loadingMore}
                        className="gap-2"
                      >
                        {loadingMore ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                        {loadingMore ? 'Loading...' : 'Load More'}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}