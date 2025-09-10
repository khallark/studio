
'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { FileText, PackagePlus, Loader2, CheckCircle, XCircle } from 'lucide-react';
import { GenerateAwbDialog } from '@/components/generate-awb-dialog';
import { useProcessingQueue } from '@/contexts/processing-queue-context';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

export default function AwbProcessingPage() {
  const [isGenerateAwbOpen, setIsGenerateAwbOpen] = useState(false); 
  const { processingQueue } = useProcessingQueue();

  const activeSession = processingQueue.length > 0;

  return (
    <>
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-6">
        <div className="flex items-center justify-between">
          <h1 className="font-headline font-semibold text-2xl md:text-3xl">AWB Processing</h1>
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
                    <CardDescription>View and manage the status of ongoing bulk AWB assignment sessions.</CardDescription>
                </CardHeader>
                <CardContent>
                    {activeSession ? (
                        <ScrollArea className="h-48">
                            <div className="space-y-3">
                                {processingQueue.map(order => (
                                    <div key={order.id} className="flex items-center justify-between text-sm p-2 rounded-md hover:bg-muted/50">
                                        <span className="font-medium truncate pr-2">Order {order.name}</span>
                                        <div className="flex items-center gap-2 flex-shrink-0">
                                            {order.status === 'pending' && <span className="text-muted-foreground text-xs">Waiting...</span>}
                                            {order.status === 'processing' && <><Loader2 className="h-4 w-4 animate-spin" /> <span className="text-xs">Processing...</span></>}
                                            {order.status === 'done' && <CheckCircle className="h-4 w-4 text-green-600" />}
                                            {order.status === 'error' && (
                                                <TooltipProvider>
                                                    <Tooltip>
                                                        <TooltipTrigger>
                                                            <XCircle className="h-4 w-4 text-destructive" />
                                                        </TooltipTrigger>
                                                        <TooltipContent>
                                                            <p>{order.message || 'An unknown error occurred.'}</p>
                                                        </TooltipContent>
                                                    </Tooltip>
                                                </TooltipProvider>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </ScrollArea>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-48 border-2 border-dashed rounded-lg">
                            <p className="text-muted-foreground">No active sessions.</p>
                            <p className="text-sm text-muted-foreground">Start an assignment from the Orders page.</p>
                        </div>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>AWB Slip Generation</CardTitle>
                    <CardDescription>Generate and download printable PDF slips for orders that are ready to dispatch.</CardDescription>
                </CardHeader>
                <CardContent>
                     <div className="flex flex-col items-center justify-center h-48 border-2 border-dashed rounded-lg">
                        <p className="text-muted-foreground">Coming Soon</p>
                        <p className="text-sm text-muted-foreground">Functionality to generate slips will be here.</p>
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
