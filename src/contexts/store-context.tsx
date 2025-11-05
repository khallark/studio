// src/contexts/store-context.tsx
'use client';

import React, { createContext, useContext } from 'react';
import type { User } from 'firebase/auth';

// Export the role type so it can be used elsewhere
export type MemberRole = 'SuperAdmin' | 'Admin' | 'Staff' | 'Vendor';

// Export the context type
export interface StoreContextType {
  storeId: string;
  user: User | null;
  memberRole: MemberRole | null;
}