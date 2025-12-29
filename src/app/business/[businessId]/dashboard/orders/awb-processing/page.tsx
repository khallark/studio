// /business/[businessId]/dashboard/orders/awb-processing/page.tsx

'use client';

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { db } from '@/lib/firebase';
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  getDocs,
  where,
} from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  PackagePlus,
  Loader2,
  CheckCircle,
  XCircle,
  RotateCcw,
  Download,
  Truck,
  Clock,
  TrendingUp,
  AlertTriangle,
  Package,
  ArrowUpRight,
  MoreVertical,
} from 'lucide-react';
import { GenerateAwbDialog } from '@/components/generate-awb-dialog';
import { useToast } from '@/hooks/use-toast';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AssignAwbDialog } from '@/components/assign-awb-dialog';
import { useProcessingQueue } from '@/contexts/processing-queue-context';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from '@radix-ui/react-alert-dialog';
import { AlertDialogFooter, AlertDialogHeader } from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAwbCount } from '@/hooks/use-awb-count';
import { useBusinessContext } from '../../../layout';
import { Badge } from '@/components/ui/badge';

type ShipmentBatch = {
  id: string;
  createdAt?: Timestamp;
  status: 'running' | 'completed' | 'failed' | 'paused';
  total: number;
  queued: number;
  processing: number;
  success: number;
  failed: number;
  carrier?: string;
  courier?: string;
  pickupName?: string;
  shippingMode?: string;
  shop?: string;
  storeId?: string;
};

interface Order {
  id: string;
  name: string;
  storeId: string;
}

type BatchType = 'forward' | 'return';

// ============================================================================
// Loading & Skeleton Components
// ============================================================================

function PageLoadingState() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] bg-gradient-to-br from-background via-background to-primary/5">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-primary/5 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '700ms' }} />
      </div>

      <div className="relative z-10 flex flex-col items-center">
        <div className="relative mb-8">
          <div
            className="absolute inset-0 w-20 h-20 rounded-full border-2 border-primary/20 border-t-primary animate-spin"
            style={{ animationDuration: '1.5s' }}
          />
          <div
            className="absolute inset-1.5 w-[68px] h-[68px] rounded-full border border-primary/10 border-b-primary/40 animate-spin"
            style={{ animationDuration: '2s', animationDirection: 'reverse' }}
          />
          <div className="absolute inset-3 w-14 h-14 rounded-full bg-primary/10 animate-pulse" />
          <div className="relative w-20 h-20 flex items-center justify-center">
            <Truck className="h-7 w-7 text-primary" />
          </div>
        </div>

        <div className="text-center space-y-2">
          <h2 className="text-lg font-semibold text-foreground">Loading AWB Processing</h2>
          <p className="text-sm text-muted-foreground">Fetching your shipment data...</p>
        </div>

        <div className="flex items-center gap-1.5 mt-6">
          <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '0ms' }} />
          <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '150ms' }} />
          <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    </div>
  );
}

function BatchRowSkeleton() {
  return (
    <div className="border rounded-xl p-4 space-y-4 animate-pulse">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-muted" />
          <div className="space-y-2">
            <div className="h-4 w-32 bg-muted rounded" />
            <div className="h-3 w-24 bg-muted rounded" />
          </div>
        </div>
        <div className="flex gap-2">
          <div className="h-9 w-28 bg-muted rounded-md" />
          <div className="h-9 w-28 bg-muted rounded-md" />
        </div>
      </div>
      <div className="space-y-2">
        <div className="h-2 w-full bg-muted rounded-full" />
        <div className="flex justify-between">
          <div className="h-3 w-16 bg-muted rounded" />
          <div className="h-3 w-16 bg-muted rounded" />
        </div>
      </div>
    </div>
  );
}

function ContentSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-5 w-24 bg-muted rounded animate-pulse" />
      {[1, 2, 3].map((i) => (
        <BatchRowSkeleton key={i} />
      ))}
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
        You don't have permission to access this business's AWB processing.
      </p>
    </div>
  );
}

function EmptyState({ batchType }: { batchType: BatchType }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <div className="relative mb-6">
        <div className="absolute inset-0 bg-primary/10 rounded-full blur-xl scale-150" />
        <div className="relative rounded-full bg-muted p-6">
          <Package className="h-10 w-10 text-muted-foreground" />
        </div>
      </div>
      <h3 className="text-lg font-semibold mb-2">No Batches Yet</h3>
      <p className="text-sm text-muted-foreground text-center max-w-sm">
        {batchType === 'forward'
          ? 'Start an AWB assignment from the Orders page to see batches here.'
          : 'Start a return assignment from the Orders page to see batches here.'}
      </p>
    </div>
  );
}

function NoStoresState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <div className="rounded-full bg-muted p-6 mb-4">
        <AlertTriangle className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold mb-2">No Stores Connected</h3>
      <p className="text-sm text-muted-foreground text-center max-w-sm">
        Connect a store to this business to start processing AWBs.
      </p>
    </div>
  );
}

// ============================================================================
// Stats Card Component
// ============================================================================

function StatsCard({
  icon: Icon,
  label,
  value,
  trend,
  className,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  trend?: string;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border bg-card p-4 ${className}`}>
      <div className="flex items-center justify-between">
        <div className="rounded-lg bg-primary/10 p-2">
          <Icon className="h-4 w-4 text-primary" />
        </div>
        {trend && (
          <div className="flex items-center gap-1 text-xs text-green-600">
            <TrendingUp className="h-3 w-3" />
            {trend}
          </div>
        )}
      </div>
      <div className="mt-3">
        <div className="text-2xl font-bold">{value}</div>
        <div className="text-xs text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

// ============================================================================
// Batch Row Component
// ============================================================================

function BatchRow({
  businessId,
  batch,
  batchType,
  handleAssignAwbClick,
  user,
}: {
  businessId: string;
  batch: ShipmentBatch;
  batchType: BatchType;
  handleAssignAwbClick: (ordersToProcess: Order[]) => void;
  user: any;
}) {
  const { toast } = useToast();
  const [isDownloadingSuccess, setIsDownloadingSuccess] = useState(false);
  const [isDownloadingFailed, setIsDownloadingFailed] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);

  const done = (batch?.success || 0) + (batch?.failed || 0);
  const pct = batch?.total > 0 ? Math.round((done / batch.total) * 100) : 0;
  const running = batch?.status === 'running' || done < (batch?.total || 0);
  const completed = !running && batch?.failed === 0;
  const hasFailures = !running && batch?.failed > 0;

  const retryFailedAwbAssignments = useCallback(
    async (batchId: string) => {
      if (!user) {
        toast({ title: 'Authentication Error', description: 'You must be logged in.', variant: 'destructive' });
        return;
      }

      setIsRetrying(true);

      try {
        const batchStoreId = batch.shop || batch.storeId;

        if (!batchStoreId) {
          toast({
            title: 'Cannot Retry',
            description: 'This batch is missing store information.',
            variant: 'destructive',
          });
          return;
        }

        const collectionName = batchType === 'forward' ? 'shipment_batches' : 'book_return_batches';
        const jobsRef = collection(db, 'users', businessId, collectionName, batchId, 'jobs');
        const failedJobsQuery = query(jobsRef, where('status', '==', 'failed'));
        const failedJobsSnapshot = await getDocs(failedJobsQuery);

        if (failedJobsSnapshot.empty) {
          toast({ title: 'No Failed Jobs', description: 'There are no failed jobs to retry.' });
          return;
        }

        const ordersToProcess = failedJobsSnapshot.docs.map((jobDoc) => {
          const jobData = jobDoc.data();
          return {
            id: jobData.orderId || jobDoc.id,
            name: jobData.orderName || `#${jobData.orderId || jobDoc.id}`,
            storeId: batchStoreId,
          };
        });

        handleAssignAwbClick(ordersToProcess);
      } catch (error) {
        console.error('Failed to retry:', error);
        toast({
          title: 'Retry Failed',
          description: error instanceof Error ? error.message : 'Unknown error',
          variant: 'destructive',
        });
      } finally {
        setIsRetrying(false);
      }
    },
    [user, toast, handleAssignAwbClick, batchType, businessId, batch]
  );

  const handleDownload = useCallback(
    async (batchId: string, status: 'success' | 'failed') => {
      if (!user) return;

      const setLoading = status === 'success' ? setIsDownloadingSuccess : setIsDownloadingFailed;
      setLoading(true);
      toast({ title: 'Generating Report', description: 'Your download will begin shortly.' });

      try {
        const idToken = await user.getIdToken();
        const collectionName = batchType === 'forward' ? 'shipment_batches' : 'book_return_batches';

        const response = await fetch('/api/shopify/courier/download-jobs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
          body: JSON.stringify({ businessId, batchId, status, collectionName }),
        });

        if (!response.ok) throw new Error((await response.json()).details || 'Failed to generate report');

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${status}-jobs-${batchType}-${batchId}.xlsx`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      } catch (error) {
        toast({
          title: 'Download Failed',
          description: error instanceof Error ? error.message : 'An error occurred',
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    },
    [user, toast, batchType, businessId]
  );

  const statusConfig = {
    running: { icon: Loader2, color: 'text-primary', bg: 'bg-primary/10', iconClass: 'animate-spin' },
    completed: { icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-100', iconClass: '' },
    failed: { icon: XCircle, color: 'text-destructive', bg: 'bg-destructive/10', iconClass: '' },
  };

  const status = running ? 'running' : completed ? 'completed' : 'failed';
  const StatusIcon = statusConfig[status].icon;

  return (
    <div className={`
      border rounded-xl p-4 transition-all duration-200 
      hover:shadow-md hover:border-primary/20
      ${running ? 'border-primary/30 bg-primary/5' : ''}
      ${hasFailures ? 'border-destructive/30' : ''}
    `}>
      {/* Header Row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {/* Status Icon */}
          <div className={`shrink-0 rounded-full p-2.5 ${statusConfig[status].bg}`}>
            <StatusIcon className={`h-5 w-5 ${statusConfig[status].color} ${statusConfig[status].iconClass}`} />
          </div>

          {/* Batch Info */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold truncate">Batch {batch.id.slice(0, 8)}...</span>
              <Badge variant="secondary" className="text-xs shrink-0">
                {batch.courier || batch.carrier || 'Unknown'}
              </Badge>
            </div>
            <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              <span>{batch.createdAt?.toDate().toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* Desktop Actions */}
        <div className="hidden md:flex items-center gap-2 shrink-0">
          {batch.success > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleDownload(batch.id, 'success')}
              disabled={isDownloadingSuccess}
              className="gap-1.5"
            >
              {isDownloadingSuccess ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              <span className="hidden lg:inline">Success</span>
            </Button>
          )}
          {batch.failed > 0 && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleDownload(batch.id, 'failed')}
                disabled={isDownloadingFailed}
                className="gap-1.5"
              >
                {isDownloadingFailed ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Download className="h-3.5 w-3.5" />
                )}
                <span className="hidden lg:inline">Failed</span>
              </Button>
              {batchType === 'forward' && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => retryFailedAwbAssignments(batch.id)}
                        disabled={isRetrying}
                        className="gap-1.5"
                      >
                        {isRetrying ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <RotateCcw className="h-3.5 w-3.5" />
                        )}
                        <span className="hidden lg:inline">Retry</span>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Re-enqueue failed jobs</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </>
          )}
        </div>

        {/* Mobile Actions Menu */}
        <div className="md:hidden shrink-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="ghost" className="h-8 w-8">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {batch.success > 0 && (
                <DropdownMenuItem
                  onClick={() => handleDownload(batch.id, 'success')}
                  disabled={isDownloadingSuccess}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download Success Report
                </DropdownMenuItem>
              )}
              {batch.failed > 0 && (
                <>
                  <DropdownMenuItem
                    onClick={() => handleDownload(batch.id, 'failed')}
                    disabled={isDownloadingFailed}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Download Failed Report
                  </DropdownMenuItem>
                  {batchType === 'forward' && (
                    <DropdownMenuItem
                      onClick={() => retryFailedAwbAssignments(batch.id)}
                      disabled={isRetrying}
                    >
                      <RotateCcw className="h-4 w-4 mr-2" />
                      Retry Failed Jobs
                    </DropdownMenuItem>
                  )}
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Progress Section */}
      <div className="mt-4 space-y-2">
        <div className="flex justify-between items-center text-sm">
          <span className="text-muted-foreground">
            {done} / {batch.total} processed
          </span>
          <span className="font-medium">{pct}%</span>
        </div>
        <Progress value={pct} className="h-2" />
        <div className="flex justify-between text-xs">
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-muted-foreground">
              <span className="font-medium text-green-600">{batch.success}</span> success
            </span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-destructive" />
            <span className="text-muted-foreground">
              <span className="font-medium text-destructive">{batch.failed}</span> failed
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Main Page Component
// ============================================================================

export default function BusinessAwbProcessingPage() {
  const {
    isAuthorized,
    stores,
    loading: authLoading,
    user,
    businessId,
  } = useBusinessContext();

  const [isFetchAwbDialogOpen, setIsFetchAwbDialogOpen] = useState(false);
  const [isAwbDialogOpen, setIsAwbDialogOpen] = useState(false);
  const [isLowAwbAlertOpen, setIsLowAwbAlertOpen] = useState(false);
  const [selectedOrders, setSelectedOrders] = useState<Order[]>([]);
  const [batchType, setBatchType] = useState<BatchType>('forward');
  const { processAwbAssignments } = useProcessingQueue();
  const { toast } = useToast();

  const [batches, setBatches] = useState<ShipmentBatch[]>([]);
  const [loading, setLoading] = useState(true);

  const { data: unusedAwbsCount = 0 } = useAwbCount(businessId);

  useEffect(() => {
    document.title = 'Business - AWB Processing';
  }, []);

  useEffect(() => {
    if (!businessId) {
      setBatches([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const collectionName = batchType === 'forward' ? 'shipment_batches' : 'book_return_batches';
    const ref = collection(db, 'users', businessId, collectionName);
    const q = query(ref, orderBy('createdAt', 'desc'), limit(50));

    const unsub = onSnapshot(
      q,
      (snap) => {
        const fetchedBatches = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
        setBatches(fetchedBatches);
        setLoading(false);
      },
      (err) => {
        console.error('Error loading batches:', err);
        toast({ title: 'Failed to load batches', description: 'Please try again.', variant: 'destructive' });
        setLoading(false);
      }
    );

    return () => unsub();
  }, [businessId, batchType, toast]);

  const ongoing = useMemo(
    () => batches.filter((b) => b.status === 'running' || (b.success + b.failed) < b.total),
    [batches]
  );

  const completed = useMemo(
    () => batches.filter((b) => b.status !== 'running' && (b.success + b.failed) >= b.total),
    [batches]
  );

  // Stats calculations
  const stats = useMemo(() => {
    const totalProcessed = batches.reduce((acc, b) => acc + b.success + b.failed, 0);
    const totalSuccess = batches.reduce((acc, b) => acc + b.success, 0);
    const successRate = totalProcessed > 0 ? Math.round((totalSuccess / totalProcessed) * 100) : 0;
    return { totalProcessed, totalSuccess, successRate, ongoingCount: ongoing.length };
  }, [batches, ongoing]);

  const handleAssignAwbClick = useCallback(
    (ordersToProcess: Order[]) => {
      if (ordersToProcess.length === 0) {
        toast({
          title: 'No orders selected',
          description: 'Please select orders from the "Confirmed" tab to assign AWBs.',
          variant: 'destructive',
        });
        return;
      }

      setSelectedOrders(ordersToProcess);

      if (ordersToProcess.length > unusedAwbsCount) {
        setIsLowAwbAlertOpen(true);
      } else {
        setIsAwbDialogOpen(true);
      }
    },
    [unusedAwbsCount, toast]
  );

  if (authLoading) {
    return <PageLoadingState />;
  }

  if (!isAuthorized) {
    return <UnauthorizedState />;
  }

  return (
    <>
      <main className="flex h-full flex-col bg-muted/30">
        {/* Header */}
        <div className="border-b bg-background">
          <div className="p-4 md:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h1 className="text-xl md:text-2xl font-bold font-headline flex items-center gap-2">
                  <Truck className="h-6 w-6 text-primary" />
                  AWB Processing
                </h1>
                <p className="text-sm text-muted-foreground mt-1">
                  Manage bulk AWB assignments across {stores.length} store{stores.length !== 1 ? 's' : ''}.
                </p>
              </div>
              <Button onClick={() => setIsFetchAwbDialogOpen(true)} className="gap-2 w-full sm:w-auto">
                <PackagePlus className="h-4 w-4" />
                Generate AWBs
              </Button>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="p-4 md:p-6 pb-0">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
            <StatsCard
              icon={Package}
              label="Available AWBs"
              value={unusedAwbsCount}
            />
            <StatsCard
              icon={Clock}
              label="Active Batches"
              value={stats.ongoingCount}
            />
            <StatsCard
              icon={CheckCircle}
              label="Total Processed"
              value={stats.totalProcessed}
            />
            <StatsCard
              icon={TrendingUp}
              label="Success Rate"
              value={`${stats.successRate}%`}
            />
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 p-4 md:p-6 min-h-0">
          <Card className="h-full flex flex-col">
            <CardHeader className="pb-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <CardTitle className="text-lg">
                    {batchType === 'forward' ? 'Assignment History' : 'Return History'}
                  </CardTitle>
                  <CardDescription className="mt-1">
                    View ongoing and completed batch operations.
                  </CardDescription>
                </div>
                <Select value={batchType} onValueChange={(value: BatchType) => setBatchType(value)}>
                  <SelectTrigger className="w-full sm:w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="forward">
                      <div className="flex items-center gap-2">
                        <ArrowUpRight className="h-4 w-4" />
                        Forward Shipments
                      </div>
                    </SelectItem>
                    <SelectItem value="return">
                      <div className="flex items-center gap-2">
                        <RotateCcw className="h-4 w-4" />
                        Return Shipments
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>

            <CardContent className="flex-1 min-h-0 overflow-hidden">
              <ScrollArea className="h-full pr-4">
                {stores.length === 0 ? (
                  <NoStoresState />
                ) : loading ? (
                  <ContentSkeleton />
                ) : batches.length === 0 ? (
                  <EmptyState batchType={batchType} />
                ) : (
                  <div className="space-y-6 pb-4">
                    {/* Ongoing Batches */}
                    {ongoing.length > 0 && (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                          <h4 className="font-semibold text-sm">
                            Ongoing ({ongoing.length})
                          </h4>
                        </div>
                        {ongoing.map((b) => (
                          <BatchRow
                            key={b.id}
                            businessId={businessId}
                            batch={b}
                            batchType={batchType}
                            handleAssignAwbClick={handleAssignAwbClick}
                            user={user}
                          />
                        ))}
                      </div>
                    )}

                    {/* Completed Batches */}
                    {completed.length > 0 && (
                      <div className="space-y-3">
                        <h4 className="font-semibold text-sm text-muted-foreground">
                          Completed ({completed.length})
                        </h4>
                        {completed.map((b) => (
                          <BatchRow
                            key={b.id}
                            businessId={businessId}
                            batch={b}
                            batchType={batchType}
                            handleAssignAwbClick={handleAssignAwbClick}
                            user={user}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </main>

      {/* Dialogs */}
      <AlertDialog open={isLowAwbAlertOpen} onOpenChange={setIsLowAwbAlertOpen}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Not Enough AWBs
            </AlertDialogTitle>
            <AlertDialogDescription>
              You've selected {selectedOrders.length} orders but only have {unusedAwbsCount} unused AWBs.
              Please generate more to proceed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel className="w-full sm:w-auto">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setIsLowAwbAlertOpen(false);
                setIsFetchAwbDialogOpen(true);
              }}
              className="w-full sm:w-auto"
            >
              Generate More AWBs
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AssignAwbDialog
        isOpen={isAwbDialogOpen}
        onClose={() => setIsAwbDialogOpen(false)}
        orders={selectedOrders}
        onConfirm={(courier, pickupName, shippingMode) => {
          processAwbAssignments(
            selectedOrders.map((o) => ({ id: o.id, name: o.name, storeId: o.storeId })),
            courier,
            pickupName,
            shippingMode
          );
        }}
        businessId={businessId}
      />

      <GenerateAwbDialog
        isOpen={isFetchAwbDialogOpen}
        onClose={() => setIsFetchAwbDialogOpen(false)}
        businessId={businessId}
        user={user}
      />
    </>
  );
}