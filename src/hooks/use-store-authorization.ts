'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { prefixmyshopifycom } from '@/lib/prefix-myshopifycom';
import { User } from 'firebase/auth';

// Export the role type so it can be used elsewhere
export type MemberRole = 'SuperAdmin' | 'Admin' | 'Staff' | 'Vendor';

// Export the context type
export interface StoreContextType {
  storeId: string;
  user: User | null;
  memberRole: MemberRole | null;
}

export function useStoreAuthorization(storeId: string) {
  const [user, userLoading] = useAuthState(auth);
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);
  const [memberRole, setMemberRole] = useState<MemberRole | null>(null);
  const router = useRouter();
  const { toast } = useToast();

  // Compute the prefixed storeId once
  const prefixedStoreId = useMemo(() => 
    storeId ? prefixmyshopifycom(storeId) : '', 
    [storeId]
  );

  useEffect(() => {
    async function checkAuthorization() {
      if (userLoading) return;

      if (!user) {
        router.push('/login');
        return;
      }

      if (!storeId || storeId === 'undefined') {
        setIsAuthorized(false);
        toast({
          title: 'Invalid Store',
          description: 'The store ID is invalid.',
          variant: 'destructive',
        });
        router.push('/');
        return;
      }

      try {
        // Use the memoized prefixedStoreId
        const storeRef = doc(db, 'accounts', prefixedStoreId);
        const storeDoc = await getDoc(storeRef);

        if (!storeDoc.exists()) {
          setIsAuthorized(false);
          toast({
            title: 'Store Not Found',
            description: 'The requested store does not exist.',
            variant: 'destructive',
          });
          router.push('/');
          return;
        }

        // Check if user is a member of this store
        const memberRef = doc(db, 'accounts', prefixedStoreId, 'members', user.uid);
        const memberDoc = await getDoc(memberRef);

        if (!memberDoc.exists()) {
          setIsAuthorized(false);
          toast({
            title: 'Access Denied',
            description: 'You are not a member of this store.',
            variant: 'destructive',
          });
          router.push('/');
          return;
        }

        // User is authorized
        setIsAuthorized(true);
        setMemberRole(memberDoc.data()?.role || null);
      } catch (error) {
        console.error('Authorization check error:', error);
        setIsAuthorized(false);
        toast({
          title: 'Authorization Error',
          description: 'An error occurred while checking your permissions.',
          variant: 'destructive',
        });
        router.push('/');
      }
    }

    checkAuthorization();
  }, [user, userLoading, storeId, prefixedStoreId, router, toast]);

  return {
    isAuthorized,
    memberRole,
    loading: userLoading || isAuthorized === null,
    user,
    storeId: prefixedStoreId, // ✅ Return as 'storeId' (but it's the prefixed version)
  };
}