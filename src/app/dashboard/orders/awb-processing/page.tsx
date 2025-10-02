'use client';

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import Link from 'next/link';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '@/lib/firebase';
import {
  collection,
  doc,
  getDoc,
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
import { PackagePlus, Loader2, CheckCircle, XCircle, RotateCcw, ChevronRight, Download, MoveRight } from 'lucide-react';
import { GenerateAwbDialog } from '@/components/generate-awb-dialog';
import { useToast } from '@/hooks/use-toast';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';

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

type UserData = { activeAccountId: string | null };

export default function AwbProcessingPage() {
  const [isGenerateAwbOpen, setIsGenerateAwbOpen] = useState(false);
  const [user] = useAuthState(auth);
  const { toast } = useToast();

  const [shopId, setShopId] = useState<string>('');
  const [batches, setBatches] = useState<ShipmentBatch[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    document.title = "Dashboard - AWB Processing";
  })

  useEffect(() => {
    const run = async () => {
      if (!user) return;
      const uref = doc(db, 'users', user.uid);
      const usnap = await getDoc(uref);
      const data = usnap.data() as UserData | undefined;
      const active = data?.activeAccountId || '—';
      setShopId(active);
    };
    run().catch(console.error);
  }, [user]);

  useEffect(() => {
    if (!shopId || shopId === '—') {
      setBatches([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const ref = collection(db, 'accounts', shopId, 'shipment_batches');
    const q = query(ref, orderBy('createdAt', 'desc'), limit(50));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setBatches(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
        setLoading(false);
      },
      (err) => {
        console.error(err);
        toast({
          title: 'Failed to load batches',
          description: 'Please try again.',
          variant: 'destructive',
        });
        setLoading(false);
      },
    );
    return unsub;
  }, [shopId, toast]);

  const ongoing = useMemo(
    () => batches.filter((b) => b.status === 'running' || (b.success + b.failed) < b.total),
    [batches],
  );
  const completed = useMemo(
    () => batches.filter((b) => b.status !== 'running' && (b.success + b.failed) >= b.total),
    [batches],
  );

  return (
    <>
      <main className="flex h-full flex-col">
        <div className="flex items-center justify-between p-4 md:p-6 border-b">
            <div>
                <h1 className="text-2xl font-bold font-headline">AWB Processing</h1>
                <p className="text-muted-foreground">Manage bulk AWB assignments and generate shipping slips.</p>
            </div>
          <Button onClick={() => setIsGenerateAwbOpen(true)}>
            <PackagePlus className="mr-2 h-4 w-4" />
            Generate AWBs
          </Button>
        </div>
        
        <div className="grid flex-1 min-h-0 gap-8 lg:grid-cols-3 p-4 md:p-6">
          <div className="lg:col-span-3 h-full min-h-0">
            <Card className="flex h-full min-h-0 flex-col">
              <CardHeader>
                <CardTitle>Bulk Assignment History</CardTitle>
                <CardDescription>
                  Ongoing runs and recent completions for{' '}
                  <span className="font-medium">{shopId}</span>.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-1 min-h-0 overflow-hidden">
                <ScrollArea className="h-full">
                  {!shopId || shopId === '—' ? (
                    <div className="flex flex-col items-center justify-center h-full border-2 border-dashed rounded-lg">
                      <p className="text-muted-foreground">No active store selected.</p>
                      <p className="text-sm text-muted-foreground">
                        Select a store (or sign in) to view batches.
                      </p>
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
                        Start an assignment from the Orders page to see it here.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4 pr-6">
                      {ongoing.length > 0 && (
                        <div className="space-y-4">
                          <h4 className="font-semibold">Ongoing</h4>
                          {ongoing.map((b) => (
                            <BatchRow key={b.id} shopId={shopId} batch={b} />
                          ))}
                        </div>
                      )}

                      {completed.length > 0 && (
                        <div className="space-y-4 mt-6">
                          <h4 className="font-semibold">Completed</h4>
                          {completed.map((b) => (
                            <BatchRow key={b.id} shopId={shopId} batch={b} />
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

      <GenerateAwbDialog
        isOpen={isGenerateAwbOpen}
        onClose={() => setIsGenerateAwbOpen(false)}
      />
    </>
  );
}

function BatchRow({ shopId, batch }: { shopId: string; batch: ShipmentBatch }) {
  const [user] = useAuthState(auth);
  const { toast } = useToast();
  const [isDownloadingSuccess, setIsDownloadingSuccess] = useState(false);
  const [isDownloadingFailed, setIsDownloadingFailed] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const done = (batch?.success || 0) + (batch?.failed || 0);
  const pct = batch?.total > 0 ? Math.round((done / batch.total) * 100) : 0;
  const running = batch?.status === 'running' || done < (batch?.total || 0);
  const completed = !running && batch?.failed === 0;

  const retryFailedAwbAssignments = useCallback(async (batchId: string) => {
    if (!user) {
        toast({ title: "Authentication Error", description: "You must be logged in.", variant: "destructive" });
        return;
    }
    
    const userRef = doc(db, 'users', user.uid);
    const userDoc = await getDoc(userRef);
    if (!userDoc.exists() || !userDoc.data()?.activeAccountId) {
        toast({ title: "No Active Store", description: "Could not find an active store to process orders for.", variant: "destructive" });
        return;
    }
    const activeShopId = userDoc.data()?.activeAccountId;

    setIsRetrying(true);

    try {
        // Get batch document to extract required fields
        const batchRef = doc(db, 'accounts', activeShopId, 'shipment_batches', batchId);
        const batchDoc = await getDoc(batchRef);
        
        if (!batchDoc.exists()) {
            throw new Error('Batch not found');
        }

        const batchData = batchDoc.data();
        const courier = batchData?.courier;
        const pickupName = batchData?.pickupName;
        const shippingMode = batchData?.shippingMode;

        // Validate required fields
        if (!courier || !pickupName || !shippingMode) {
            toast({
                title: "Missing Configuration",
                description: "Batch is missing required fields (courier, pickupName, or shippingMode). Cannot retry.",
                variant: "destructive"
            });
            return;
        }

        // Get all failed jobs from the batch's jobs subcollection
        const jobsRef = collection(db, 'accounts', activeShopId, 'shipment_batches', batchId, 'jobs');
        const failedJobsQuery = query(jobsRef, where('status', '==', 'failed'));
        const failedJobsSnapshot = await getDocs(failedJobsQuery);

        if (failedJobsSnapshot.empty) {
            toast({
                title: "No Failed Jobs",
                description: "There are no failed jobs to retry for this batch.",
            });
            return;
        }

        // Extract order details from failed jobs
        const ordersToProcess = failedJobsSnapshot.docs.map(jobDoc => {
            const jobData = jobDoc.data();
            return {
                orderId: jobData.orderId,
                name: jobData.orderName
            };
        });

        // Call the API to retry
        const idToken = await user.getIdToken();
        const response = await fetch('/api/shopify/courier/assign-awb', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${idToken}`
            },
            body: JSON.stringify({ 
                shop: activeShopId,
                orders: ordersToProcess,
                courier,
                pickupName,
                shippingMode
            }),
        });

        const result = await response.json();
        if (!response.ok) throw new Error(result.details || 'Failed to start AWB assignment');

        toast({
            title: `AWB Assignment Started`,
            description: `Retrying ${ordersToProcess.length} failed order(s) in the background.`,
            action: (
                <Button variant="outline" size="sm" asChild>
                    <Link href="/dashboard/orders/awb-processing">
                        View Progress
                        <MoveRight className="ml-2 h-4 w-4" />
                    </Link>
                </Button>
            )
        });

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
  }, [user, toast]);

  const handleRetryFailed = async () => {
    await retryFailedAwbAssignments(batch.id);
  };

  const handleDownloadFailed = useCallback(async (batchId: string) => {
    if (!shopId || !user) return;
    setIsDownloadingFailed(true);
    toast({ title: 'Generating Report', description: 'Your download will begin shortly.' });

    try {
        const idToken = await user.getIdToken();
        const response = await fetch('/api/shopify/courier/download-jobs', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${idToken}`,
            },
            body: JSON.stringify({ shop: shopId, batchId, status: "failed" }),
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.details || 'Failed to generate report');
        }

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `failed-jobs-${batchId}.xlsx`;
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
  }, [shopId, user, toast]);

  const handleDownloadSuccess = useCallback(async (batchId: string) => {
    if (!shopId || !user) return;
    setIsDownloadingSuccess(true);
    toast({ title: 'Generating Report', description: 'Your download will begin shortly.' });

    try {
      const idToken = await user.getIdToken();
      const response = await fetch('/api/shopify/courier/download-jobs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({ shop: shopId, batchId, status: "success" }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.details || 'Failed to generate report');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `success-jobs-${batchId}.xlsx`;
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
  }, [shopId, user, toast]);

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
                          <Button size="sm" variant="outline" onClick={() => handleDownloadFailed(batch.id)} disabled={isDownloadingFailed}>
                              <Download className="mr-2 h-4 w-4" />
                              {isDownloadingFailed ? 'Downloading...' : 'Failed Report'}
                          </Button>
                          <Tooltip>
                              <TooltipTrigger asChild>
                                  <Button size="sm" variant="outline" onClick={handleRetryFailed} disabled={isRetrying}>
                                  <RotateCcw className="mr-2 h-4 w-4" /> {isRetrying ? 'Retrying...' : 'Retry Failed'}
                                  </Button>
                              </TooltipTrigger>
                              <TooltipContent>Re-enqueue only the failed jobs for this batch</TooltipContent>
                          </Tooltip>
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
                <span><span className="text-green-600 font-medium">{batch.success}</span> success</span>
                <span><span className="text-destructive font-medium">{batch.failed}</span> failed</span>
             </div>
        </div>
    </div>
  );
}