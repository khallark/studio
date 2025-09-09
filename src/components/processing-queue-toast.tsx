
'use client';

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { ScrollArea } from './ui/scroll-area';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

interface ProcessingOrder {
  id: string;
  name: string;
  status: 'pending' | 'processing' | 'done' | 'error';
  message?: string;
}

interface ProcessingQueueToastProps {
  queue: ProcessingOrder[];
}

export function ProcessingQueueToast({ queue }: ProcessingQueueToastProps) {
  return (
    <div className="fixed bottom-4 right-4 z-50">
      <Card className="w-80 shadow-2xl">
        <CardHeader>
          <CardTitle className="text-lg">Processing Shipments</CardTitle>
          <CardDescription>Assigning AWBs and updating orders.</CardDescription>
        </CardHeader>
        <CardContent>
            <ScrollArea className="h-40">
                <div className="space-y-3">
                    {queue.map(order => (
                        <div key={order.id} className="flex items-center justify-between text-sm">
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
        </CardContent>
      </Card>
    </div>
  );
}
