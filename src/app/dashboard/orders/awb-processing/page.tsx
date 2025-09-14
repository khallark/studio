
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { PackagePlus, Loader2, CheckCircle, XCircle, RotateCcw, FileText, ChevronRight } from 'lucide-react';
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
      <main className="flex flex-1 flex-col p-4 md:p-6 h-full">
        <div className="flex items-center justify-between">
            <div>
                <h1 className="text-2xl font-bold font-headline">AWB Processing</h1>
                <p className="text-muted-foreground">Manage bulk AWB assignments and generate shipping slips.</p>
            </div>
          <Button onClick={() => setIsGenerateAwbOpen(true)}>
            <PackagePlus className="mr-2 h-4 w-4" />
            Generate AWBs
          </Button>
        </div>
        
        <Separator className="my-6" />

        <div className="grid gap-8 lg:grid-cols-3 flex-1">
          <div className="lg:col-span-2">
            <Card className="h-full flex flex-col">
              <CardHeader>
                <CardTitle>Bulk Assignment History</CardTitle>
                <CardDescription>
                  Ongoing runs and recent completions for{' '}
                  <span className="font-medium">{shopId}</span>.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-1 overflow-hidden">
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
                            <BatchRow key={b.id} shopId={b.id} batch={b} />
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </div>

          <div>
             <Card className="h-full flex flex-col">
                <CardHeader>
                  <CardTitle>AWB Slip Generation</CardTitle>
                  <CardDescription>
                    Generate and download printable PDF slips.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col items-center justify-center text-center">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 mb-4">
                        <FileText className="h-8 w-8 text-primary" />
                    </div>
                    <h3 className="font-semibold">Generate Slips</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                        Functionality to generate and merge slips for your dispatched orders will be available here soon.
                    </p>
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
  const done = (batch?.success || 0) + (batch?.failed || 0);
  const pct = batch?.total > 0 ? Math.round((done / batch.total) * 100) : 0;
  const running = batch?.status === 'running' || done < (batch?.total || 0);
  const completed = !running && batch?.failed === 0;

  const handleRetryFailed = async () => {
    // Retry logic would go here
    console.log(`Retrying failed jobs for batch ${batch.id}`);
  };

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
                        <Link
                            href={`/dashboard/orders/awb-processing/${batch.id}?shop=${encodeURIComponent(shopId)}`}
                            className="font-semibold hover:underline"
                            title={`Open batch ${batch.id}`}
                        >
                            Batch {batch.id}
                        </Link>
                        <span className="text-xs text-muted-foreground px-2 py-0.5 rounded-full bg-muted border">
                            {batch.carrier || 'Unknown'}
                        </span>
                    </div>

                    <div className="text-xs text-muted-foreground mt-1">
                        {batch.createdAt?.toDate().toLocaleString()}
                    </div>
                </div>
            </div>
            
            <div className="flex items-center gap-4 mt-3 sm:mt-0">
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
                 <Button asChild variant="ghost" size="sm">
                    <Link
                    href={`/dashboard/orders/awb-processing/${batch.id}?shop=${encodeURIComponent(shopId)}`}
                    >
                    Details <ChevronRight className="h-4 w-4 ml-1" />
                    </Link>
                </Button>
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
