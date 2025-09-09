
'use client';

import React, { createContext, useContext, ReactNode } from 'react';

interface OrderInfo {
  id: string;
  name: string;
}

interface ProcessingQueueContextType {
  processAwbAssignments: (orders: OrderInfo[], pickupLocationId: string) => Promise<void>;
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
  processAwbAssignments: (orders: OrderInfo[], pickupLocationId: string) => Promise<void>;
}

export function ProcessingQueueProvider({ children, processAwbAssignments }: ProcessingQueueProviderProps) {
  return (
    <ProcessingQueueContext.Provider value={{ processAwbAssignments }}>
      {children}
    </ProcessingQueueContext.Provider>
  );
}
