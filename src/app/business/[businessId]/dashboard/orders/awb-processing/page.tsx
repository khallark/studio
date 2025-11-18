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
import { PackagePlus, Loader2, CheckCircle, XCircle, RotateCcw, Download, Store } from 'lucide-react';
import { GenerateAwbDialog } from '@/components/generate-awb-dialog';
import { useToast } from '@/hooks/use-toast';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AssignAwbDialog } from '@/components/assign-awb-dialog';
import { useProcessingQueue } from '@/contexts/processing-queue-context';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogTitle } from '@radix-ui/react-alert-dialog';
import { AlertDialogFooter, AlertDialogHeader } from '@/components/ui/alert-dialog';
import { useAwbCount } from '@/hooks/use-awb-count';
import { useBusinessContext } from '../../../layout';

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
};

interface Order {
  id: string;
  name: string;
  storeId: string;
}

type BatchType = 'forward' | 'return';

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
    document.title = "Business - AWB Processing";
  }, []);

  // ✅ Fetch batches from BUSINESS collection (not per store)
  useEffect(() => {
    if (!businessId) {
      setBatches([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    // ✅ Batches are stored at: users/{businessId}/shipment_batches (or book_return_batches)
    const collectionName = batchType === 'forward' 
      ? 'shipment_batches' // For forward shipments
      : 'book_return_batches'; // For return shipments

    const ref = collection(db, 'users', businessId, collectionName);
    const q = query(ref, orderBy('createdAt', 'desc'), limit(50));

    const unsub = onSnapshot(
      q,
      (snap) => {
        const fetchedBatches = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as any),
        }));
        setBatches(fetchedBatches);
        setLoading(false);
      },
      (err) => {
        console.error('Error loading batches:', err);
        toast({
          title: 'Failed to load batches',
          description: 'Please try again.',
          variant: 'destructive',
        });
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
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!isAuthorized) {
    return (
      <div className="flex flex-col items-center justify-center h-screen">
        <div className="text-center space-y-4">
          <h1 className="text-6xl font-bold text-gray-300">404</h1>
          <h2 className="text-2xl font-semibold text-gray-700">Unauthorized</h2>
          <p className="text-gray-500">You don't have access to this business.</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <main className="flex h-full flex-col">
        <div className="flex items-center justify-between p-4 md:p-6 border-b">
          <div>
            <h1 className="text-2xl font-bold font-headline">AWB Processing</h1>
            <p className="text-muted-foreground">
              Manage bulk AWB assignments across {stores.length} store(s).
            </p>
          </div>
          <Button onClick={() => setIsFetchAwbDialogOpen(true)}>
            <PackagePlus className="mr-2 h-4 w-4" />
            Generate AWBs
          </Button>
        </div>

        <div className="grid flex-1 min-h-0 gap-8 lg:grid-cols-3 p-4 md:p-6">
          <div className="lg:col-span-3 h-full min-h-0">
            <Card className="flex h-full min-h-0 flex-col">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>
                      {batchType === 'forward' ? 'Bulk Assignment History' : 'Bulk Return Assignment History'}
                    </CardTitle>
                    <CardDescription>
                      Ongoing runs and recent completions for this business.
                    </CardDescription>
                  </div>
                  <Select value={batchType} onValueChange={(value: BatchType) => setBatchType(value)}>
                    <SelectTrigger className="w-[200px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="forward">Forward Shipments</SelectItem>
                      <SelectItem value="return">Return Shipments</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent className="flex-1 min-h-0 overflow-hidden">
                <ScrollArea className="h-full">
                  {stores.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full border-2 border-dashed rounded-lg">
                      <p className="text-muted-foreground">No stores in this business.</p>
                    </div>
                  ) : loading ? (
                    <div className="space-y-4 pr-6">
                      <div className="h-20 w-full animate-pulse rounded-md bg-muted" />
                      <div className="h-20 w-full animate-pulse rounded-md bg-muted" />
                      <div className="h-20 w-full animate-pulse rounded-md bg-muted" />
                    </div>
                  ) : batches.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full border-2 border-dashed rounded-lg">
                      <p className="text-muted-foreground">No records yet.</p>
                      <p className="text-sm text-muted-foreground">
                        {batchType === 'forward'
                          ? 'Start an assignment from the Orders page to see it here.'
                          : 'Start a return assignment from the Orders page to see it here.'}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4 pr-6">
                      {ongoing.length > 0 && (
                        <div className="space-y-4">
                          <h4 className="font-semibold">Ongoing</h4>
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

                      {completed.length > 0 && (
                        <div className="space-y-4 mt-6">
                          <h4 className="font-semibold">Completed</h4>
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
        </div>
      </main>

      <AlertDialog open={isLowAwbAlertOpen} onOpenChange={setIsLowAwbAlertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Not Enough AWBs</AlertDialogTitle>
            <AlertDialogDescription>
              You have selected {selectedOrders.length} orders but only have {unusedAwbsCount} unused AWBs
              available. Please fetch more to proceed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>OK</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setIsLowAwbAlertOpen(false);
                setIsFetchAwbDialogOpen(true);
              }}
            >
              Fetch More AWBs
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

  const retryFailedAwbAssignments = useCallback(
    async (batchId: string) => {
      if (!user) {
        toast({ title: 'Authentication Error', description: 'You must be logged in.', variant: 'destructive' });
        return;
      }

      setIsRetrying(true);

      try {
        // ✅ Batches are at: users/{businessId}/shipment_batches/{batchId}/jobs
        const collectionName = batchType === 'forward' ? 'shipment_batches' : 'book_return_batches';

        const jobsRef = collection(db, 'users', businessId, collectionName, batchId, 'jobs');
        const failedJobsQuery = query(jobsRef, where('status', '==', 'failed'));
        const failedJobsSnapshot = await getDocs(failedJobsQuery);

        if (failedJobsSnapshot.empty) {
          toast({
            title: 'No Failed Jobs',
            description: 'There are no failed jobs to retry for this batch.',
          });
          return;
        }

        // Extract order details from failed jobs
        const ordersToProcess = failedJobsSnapshot.docs.map((jobDoc) => {
          const jobData = jobDoc.data();
          return {
            id: jobData.orderId || jobDoc.id, // jobDoc.id is the orderId
            name: jobData.orderName || `#${jobDoc.id}`,
            storeId: jobData.shop || jobData.storeId, // ✅ Get storeId from job data
          };
        });

        handleAssignAwbClick(ordersToProcess);
      } catch (error) {
        console.error('Failed to retry failed jobs:', error);
        const message = error instanceof Error ? error.message : 'Unknown error';
        toast({
          title: 'Retry Failed',
          description: message,
          variant: 'destructive',
        });
      } finally {
        setIsRetrying(false);
      }
    },
    [user, toast, handleAssignAwbClick, batchType, businessId]
  );

  const handleRetryFailed = async () => {
    await retryFailedAwbAssignments(batch.id);
  };

  const handleDownloadFailed = useCallback(
    async (batchId: string) => {
      if (!user) return;
      setIsDownloadingFailed(true);
      toast({ title: 'Generating Report', description: 'Your download will begin shortly.' });

      try {
        const idToken = await user.getIdToken();
        const collectionName = batchType === 'forward' ? 'shipment_batches' : 'book_return_batches';

        const response = await fetch('/api/shopify/courier/download-jobs', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({
            businessId,
            batchId,
            status: 'failed',
            collectionName,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.details || 'Failed to generate report');
        }

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `failed-jobs-${batchType}-${batchId}.xlsx`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      } catch (error) {
        console.error('Failed to download failed jobs report:', error);
        toast({
          title: 'Download Failed',
          description: error instanceof Error ? error.message : 'An unknown error occurred',
          variant: 'destructive',
        });
      } finally {
        setIsDownloadingFailed(false);
      }
    },
    [user, toast, batchType, businessId]
  );

  const handleDownloadSuccess = useCallback(
    async (batchId: string) => {
      if (!user) return;
      setIsDownloadingSuccess(true);
      toast({ title: 'Generating Report', description: 'Your download will begin shortly.' });

      try {
        const idToken = await user.getIdToken();
        const collectionName = batchType === 'forward' ? 'shipment_batches' : 'book_return_batches';

        const response = await fetch('/api/shopify/courier/download-jobs', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({
            businessId,
            batchId,
            status: 'success',
            collectionName,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.details || 'Failed to generate report');
        }

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `success-jobs-${batchType}-${batchId}.xlsx`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      } catch (error) {
        console.error('Failed to download success jobs report:', error);
        toast({
          title: 'Download Failed',
          description: error instanceof Error ? error.message : 'An unknown error occurred',
          variant: 'destructive',
        });
      } finally {
        setIsDownloadingSuccess(false);
      }
    },
    [user, toast, batchType, businessId]
  );

  return (
    <div className="border rounded-lg p-4 transition-colors hover:bg-muted/50">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="w-5">
            {running && <Loader2 className="h-5 w-5 animate-spin text-primary" />}
            {completed && <CheckCircle className="h-5 w-5 text-green-600" />}
            {!running && !completed && <XCircle className="h-5 w-5 text-destructive" />}
          </div>

          <div>
            <div className="flex items-center gap-2">
              <div className="font-semibold hover:underline">
                Batch {batch.id}
              </div>
              <span className="text-xs text-muted-foreground px-2 py-0.5 rounded-full bg-muted border">
                {batch.courier || batch.carrier || 'Unknown'}
              </span>
            </div>

            <div className="text-xs text-muted-foreground mt-1">
              {batch.createdAt?.toDate().toLocaleString()}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4 mt-3 sm:mt-0">
          {batch.success > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleDownloadSuccess(batch.id)}
              disabled={isDownloadingSuccess}
            >
              <Download className="mr-2 h-4 w-4" />
              {isDownloadingSuccess ? 'Downloading...' : 'Success Report'}
            </Button>
          )}
          {batch.failed > 0 && (
            <TooltipProvider>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleDownloadFailed(batch.id)}
                  disabled={isDownloadingFailed}
                >
                  <Download className="mr-2 h-4 w-4" />
                  {isDownloadingFailed ? 'Downloading...' : 'Failed Report'}
                </Button>
                {batchType === 'forward' && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button size="sm" variant="outline" onClick={handleRetryFailed} disabled={isRetrying}>
                        <RotateCcw className="mr-2 h-4 w-4" /> {isRetrying ? 'Retrying...' : 'Retry Failed'}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Re-enqueue only the failed jobs for this batch</TooltipContent>
                  </Tooltip>
                )}
              </div>
            </TooltipProvider>
          )}
        </div>
      </div>

      <div className="mt-4">
        <div className="flex justify-between text-xs text-muted-foreground mb-1">
          <span>
            {done} / {batch.total} orders processed
          </span>
          <span>{pct}%</span>
        </div>
        <Progress value={pct} className="h-2" />
        <div className="flex justify-between text-xs text-muted-foreground mt-1">
          <span>
            <span className="text-green-600 font-medium">{batch.success}</span> success
          </span>
          <span>
            <span className="text-destructive font-medium">{batch.failed}</span> failed
          </span>
        </div>
      </div>
    </div>
  );
}