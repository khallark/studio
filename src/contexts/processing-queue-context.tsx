// @/contexts/processing-queue-context.tsx

'use client';
import React, { createContext, useContext, ReactNode } from 'react';

interface OrderInfo {
  id: string;
  name: string;
  storeId: string; // ✅ REQUIRED - each order must have storeId
}

interface ProcessingQueueContextType {
  businessId?: string;
  processAwbAssignments: (
    orders: OrderInfo[], 
    courier: string, 
    pickupName: string, 
    shippingMode: string
  ) => Promise<void>;
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
  businessId?: string;
  children: ReactNode;
  processAwbAssignments: (
    orders: OrderInfo[], 
    courier: string, 
    pickupName: string, 
    shippingMode: string
  ) => Promise<void>;
}

export function ProcessingQueueProvider({ 
  businessId, 
  children,
  processAwbAssignments,
}: ProcessingQueueProviderProps) {
  return (
    <ProcessingQueueContext.Provider value={{ businessId, processAwbAssignments }}>
      {children}
    </ProcessingQueueContext.Provider>
  );
}