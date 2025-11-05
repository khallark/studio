'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import type { MemberRole } from '@/contexts/store-context';

export function useStoreAuthorization(storeId: string) {
  const [user, userLoading] = useAuthState(auth);
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);
  const [memberRole, setMemberRole] = useState<MemberRole | null>(null);
  const router = useRouter();
  const { toast } = useToast();

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
        // Check if store exists
        const storeRef = doc(db, 'accounts', storeId);
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
        const memberRef = doc(db, 'accounts', storeId, 'members', user.uid);
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
  }, [user, userLoading, storeId, router, toast]);

  return {
    isAuthorized,
    memberRole,
    loading: userLoading || isAuthorized === null,
    user,
  };
}