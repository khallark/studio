'use client';

import React, { useEffect, useMemo, useState } from 'react';
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
} from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { PackagePlus, Loader2, CheckCircle, XCircle, RotateCcw } from 'lucide-react';
import { GenerateAwbDialog } from '@/components/generate-awb-dialog';
import { useToast } from '@/hooks/use-toast';

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
};

type UserData = { activeAccountId: string | null };

export default function AwbProcessingPage() {
  const [isGenerateAwbOpen, setIsGenerateAwbOpen] = useState(false);
  const [user] = useAuthState(auth);
  const { toast } = useToast();

  const [shopId, setShopId] = useState<string>('');
  const [batches, setBatches] = useState<ShipmentBatch[]>([]);
  const [loading, setLoading] = useState(true);

  // Resolve active account from users/{uid} (same pattern as Orders page)
  useEffect(() => {
    const run = async () => {
      if (!user) return;
      const uref = doc(db, 'users', user.uid);
      const usnap = await getDoc(uref);
      const data = usnap.data() as UserData | undefined;
      const active = data?.activeAccountId || '';
      setShopId(active);
    };
    run().catch(console.error);
  }, [user]);

  // Live subscribe to recent batches
  useEffect(() => {
    if (!shopId) {
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
    () => batches.filter((b) => (b.success + b.failed) >= b.total),
    [batches],
  );

  return (
    <>
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-6">
        <div className="flex items-center justify-between">
          <h1 className="font-headline font-semibold text-2xl md:text-3xl">
            AWB Processing
          </h1>
          <Button onClick={() => setIsGenerateAwbOpen(true)}>
            <PackagePlus className="mr-2 h-4 w-4" />
            Generate AWBs
          </Button>
        </div>
        <Separator />

        <div className="grid gap-8 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Bulk AWB Assignments</CardTitle>
              <CardDescription>
                Ongoing runs and recent completions for{' '}
                <span className="font-medium">{shopId || '—'}</span>.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!shopId ? (
                <div className="flex flex-col items-center justify-center h-48 border-2 border-dashed rounded-lg">
                  <p className="text-muted-foreground">No active store selected.</p>
                  <p className="text-sm text-muted-foreground">
                    Select a store (or sign in) to view batches.
                  </p>
                </div>
              ) : loading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading batches…
                </div>
              ) : batches.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 border-2 border-dashed rounded-lg">
                  <p className="text-muted-foreground">No records yet.</p>
                  <p className="text-sm text-muted-foreground">
                    Start an assignment from the Orders page.
                  </p>
                </div>
              ) : (
                <ScrollArea className="h-72">
                  {/* Ongoing */}
                  {ongoing.length > 0 && (
                    <>
                      <h4 className="text-sm font-semibold mb-2">Ongoing</h4>
                      <div className="space-y-2 mb-4">
                        {ongoing.map((b) => (
                          <BatchRow key={b.id} shopId={shopId} batch={b} />
                        ))}
                      </div>
                    </>
                  )}

                  {/* Completed */}
                  <h4 className="text-sm font-semibold mt-2 mb-2">Completed</h4>
                  <div className="space-y-2">
                    {completed.map((b) => (
                      <BatchRow key={b.id} shopId={shopId} batch={b} />
                    ))}
                    {completed.length === 0 && (
                      <div className="text-sm text-muted-foreground">No completed batches yet.</div>
                    )}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>AWB Slip Generation</CardTitle>
              <CardDescription>
                Generate and download printable PDF slips for orders that are ready to
                dispatch.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center justify-center h-48 border-2 border-dashed rounded-lg">
                <p className="text-muted-foreground">Coming Soon</p>
                <p className="text-sm text-muted-foreground">
                  Functionality to generate slips will be here.
                </p>
              </div>
            </CardContent>
          </Card>
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
  const done = (batch?.success || 0) + (batch?.failed || 0);
  const pct = batch?.total ? Math.min(100, Math.round((done / batch.total) * 100)) : 0;
  const running = batch?.status === 'running' || done < (batch?.total || 0);
  const completed = done >= (batch?.total || 0) && batch?.status === 'completed';

  const handleRetryFailed = async () => {
    try {
      const res = await fetch('/api/shipments/retry-failed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shop: shopId, batchId: batch.id }),
      });
      if (!res.ok) throw new Error(await res.text());
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="flex items-center justify-between text-sm p-2 rounded-md hover:bg-muted/50">
      <div className="flex min-w-0 items-center gap-3">
        <div className="w-5">
          {running && <Loader2 className="h-4 w-4 animate-spin" />}
          {completed && <CheckCircle className="h-4 w-4 text-green-600" />}
          {!running && !completed && <XCircle className="h-4 w-4 text-destructive" />}
        </div>

        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Link
              href={`/shipments/${batch.id}?shop=${encodeURIComponent(shopId)}`}
              className="font-medium hover:underline truncate"
              title={`Open batch ${batch.id}`}
            >
              Batch {batch.id}
            </Link>
            <span className="text-xs text-muted-foreground">
              ({batch.carrier || 'delhivery'})
            </span>
          </div>

          <div className="text-xs text-muted-foreground">
            {batch.success} success · {batch.failed} failed · {batch.processing} processing ·{' '}
            {batch.queued} queued
          </div>

          <div className="h-1.5 mt-1 w-48 bg-muted rounded">
            <div
              className="h-1.5 bg-primary rounded"
              style={{ width: `${pct}%` }}
              aria-label={`Progress ${pct}%`}
            />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        {batch.failed > 0 && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="sm" variant="outline" onClick={handleRetryFailed}>
                  <RotateCcw className="mr-2 h-4 w-4" /> Retry Failed
                </Button>
              </TooltipTrigger>
              <TooltipContent>Re-enqueue only the failed jobs for this batch</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        <Link
          href={`/shipments/${batch.id}?shop=${encodeURIComponent(shopId)}`}
          className="text-primary text-xs hover:underline"
        >
          Details
        </Link>
      </div>
    </div>
  );
}
