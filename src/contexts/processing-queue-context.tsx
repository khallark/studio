
'use client';

import { ProcessingOrder } from '@/app/dashboard/layout';
import React, { createContext, useContext, ReactNode } from 'react';

interface OrderInfo {
  id: string;
  name: string;
}

interface ProcessingQueueContextType {
  processAwbAssignments: (orders: OrderInfo[], pickupName: string, shippingMode: string) => Promise<void>;
  processingQueue: ProcessingOrder[];
}

const ProcessingQueueContext = createContext<ProcessingQueueContextType | undefined>(undefined);

export function useProcessingQueue() {
  const context = useContext(ProcessingQueueContext);
  if (!context) {
    throw new Error('useProcessingQueue must be used within a ProcessingQueueProvider');
  }
  return context;
}

interface ProcessingQueueProviderProps {
  children: ReactNode;
  processAwbAssignments: (orders: OrderInfo[], pickupName: string, shippingMode: string) => Promise<void>;
  processingQueue: ProcessingOrder[];
}

export function ProcessingQueueProvider({ children, processAwbAssignments, processingQueue }: ProcessingQueueProviderProps) {
  return (
    <ProcessingQueueContext.Provider value={{ processAwbAssignments, processingQueue }}>
      {children}
    </ProcessingQueueContext.Provider>
  );
}
