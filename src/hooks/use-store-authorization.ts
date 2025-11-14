'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '@/lib/firebase';
import { useToast } from '@/hooks/use-toast';
import { User } from 'firebase/auth';

export type MemberRole = 'SuperAdmin' | 'Admin' | 'Staff' | 'Vendor';

export interface StoreContextType {
  storeId: string;
  user: User | null;
  member: any | null;
}

export function useStoreAuthorization(storeId: string) {
  const [user, userLoading] = useAuthState(auth);
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);
  const [member, setMember] = useState<any | null>(null);
  const [prefixedStoreId, setPrefixedStoreId] = useState<string>('');
  const router = useRouter();
  const { toast } = useToast();

  useEffect(() => {
    async function checkAuthorization() {
      if (userLoading) return;

      if (!user) {
        setIsAuthorized(false);
        return;
      }

      if (!storeId || storeId === 'undefined') {
        setIsAuthorized(false);
        return;
      }

      try {
        const token = await user.getIdToken();

        const response = await fetch(`/api/stores/${storeId}/auth`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          setIsAuthorized(false);
          return;
        }

        const data = await response.json();
        setIsAuthorized(true);
        setMember(data.member); // Store the full member object
        setPrefixedStoreId(data.storeId);
      } catch (error) {
        console.error('Authorization check error:', error);
        setIsAuthorized(false);
      }
    }

    checkAuthorization();
  }, [user, userLoading, storeId]);

  return {
    isAuthorized,
    member, // Return full member object
    memberRole: member?.role || null, // Still provide role for convenience
    loading: userLoading || isAuthorized === null,
    user,
    storeId: prefixedStoreId,
  };
}