// hooks/use-business-authorization.ts
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '@/lib/firebase';
import { useToast } from '@/hooks/use-toast';
import { User } from 'firebase/auth';

export type BusinessMemberRole = 'Owner' | 'Admin' | 'Member';

export interface BusinessContextType {
  businessId: string;
  user: User | null;
  member: any | null;
  stores: string[]; // All stores in this business
  vendorName: string | null;
}

interface JoinedBusiness {
  id: string;
  name: string;
  currentlySelected: boolean;
}

export function useBusinessAuthorization(businessId: string) {
  const [user, userLoading] = useAuthState(auth);
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);
  const [member, setMember] = useState<any | null>(null);
  const [userIsBusiness, setUserIsBusiness] = useState<boolean | null>(null);
  const [stores, setStores] = useState<string[]>([]);
  const [joinedBusinesses, setJoinedBusinesses] = useState<JoinedBusiness[] | null>(null);
  const [vendorName, setVendorName] = useState<string | null>(null);
  const router = useRouter();
  const { toast } = useToast();
  
  useEffect(() => {
    async function checkAuthorization() {
      if (userLoading) return;

      if (!user) {
        setIsAuthorized(false);
        router.push('/login');
        return;
      }

      if (!businessId || businessId === 'undefined') {
        setIsAuthorized(false);
        toast({
          title: 'Invalid Business',
          description: 'Business ID is missing or invalid.',
          variant: 'destructive',
        });
        return;
      }

      try {
        const token = await user.getIdToken();

        const response = await fetch(`/api/business/${businessId}/auth`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          setIsAuthorized(false);
          toast({
            title: 'Unauthorized',
            description: 'You do not have access to this business.',
            variant: 'destructive',
          });
          return;
        }

        const data = await response.json();
        setIsAuthorized(true);
        setUserIsBusiness(data.userIsBusiness);
        setMember(data.member);
        setStores(data.stores || []); // All stores in the business
        setJoinedBusinesses(data.joinedBusinesses || []);
        setVendorName(data.vendorName || null);
        
        // ✅ ADD: Set custom claims for Firebase Storage access
        try {
          console.log('Setting custom claims for Storage access...');
          
          const claimsResponse = await fetch('/api/auth/set-business-claims', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ businessId }),
          });

          if (claimsResponse.ok) {
            // Force token refresh to get new claims
            await user.getIdToken(true);
            console.log('✅ Custom claims refreshed for Storage access');
          } else {
            console.warn('Failed to set custom claims (non-critical)');
          }
        } catch (claimsError) {
          // Don't block user if claims fail - they can still use the app
          // Storage operations will just fail if needed
          console.error('Failed to refresh claims (non-critical):', claimsError);
        }
        
        console.log(`✅ Authorized for business: ${businessId}`);
        console.log(`📦 Stores: ${data.stores?.length || 0}`);
      } catch (error) {
        console.error('Business authorization check error:', error);
        setIsAuthorized(false);
        toast({
          title: 'Authorization Error',
          description: 'An error occurred while checking your permissions.',
          variant: 'destructive',
        });
      }
    }

    checkAuthorization();
  }, [user, userLoading, businessId, router, toast]);

  return {
    isAuthorized,
    userIsBusiness,
    member,
    memberRole: member?.role || null,
    stores, // Array of ALL store IDs in this business
    joinedBusinesses,
    vendorName,
    loading: userLoading || isAuthorized === null,
    user,
    businessId,
  };
}