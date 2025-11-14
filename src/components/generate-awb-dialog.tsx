'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { User } from 'firebase/auth';
import { db } from '@/lib/firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import { Loader2 } from 'lucide-react';

interface GenerateAwbDialogBusinessProps {
  isOpen: boolean;
  onClose: () => void;
  businessId: string;
  user: User | null | undefined;
}

/**
 * Business-level AWB fetching dialog.
 * AWBs are stored at the business level and shared across all stores.
 */
export function GenerateAwbDialog({ 
  isOpen, 
  onClose, 
  businessId,
  user 
}: GenerateAwbDialogBusinessProps) {
  const { toast } = useToast();
  
  const [count, setCount] = useState<number>(50);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [unusedAwbsCount, setUnusedAwbsCount] = useState(0);
  const [loadingCount, setLoadingCount] = useState(true);

  // Subscribe to business-level AWB count
  useEffect(() => {
    if (!businessId || !isOpen) return;

    setLoadingCount(true);
    
    // ✅ Subscribe to business-level AWBs (not store-level)
    const awbsRef = collection(db, 'users', businessId, 'unused_awbs');
    
    const unsubscribe = onSnapshot(
      awbsRef,
      (snapshot) => {
        setUnusedAwbsCount(snapshot.size);
        setLoadingCount(false);
      },
      (error) => {
        console.error("Error fetching business AWB count:", error);
        setUnusedAwbsCount(0);
        setLoadingCount(false);
      }
    );

    return () => unsubscribe();
  }, [businessId, isOpen]);

  const handleFetchAwbs = useCallback(async () => {
    if (!user) {
      toast({ 
        title: "Authentication Error", 
        description: "You must be logged in.", 
        variant: "destructive" 
      });
      return;
    }

    if (count <= 0 || count > 500) {
      toast({ 
        title: "Invalid Count", 
        description: "Please enter a number between 1 and 500.", 
        variant: "destructive" 
      });
      return;
    }
    
    setIsSubmitting(true);
    try {
      const idToken = await user.getIdToken();
      
      // ✅ Pass businessId instead of shopId
      const response = await fetch('/api/shopify/courier/fetch-awbs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({ 
          businessId, // ✅ Business-level
          count 
        }),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.details || 'Failed to fetch AWBs from Delhivery.');
      }
      
      toast({
        title: 'AWBs Fetched Successfully',
        description: `${result.added} new Air Waybill numbers have been added to your business. ${result.duplicates} duplicates were ignored.`,
      });

      onClose();

    } catch (error) {
      console.error("Failed to fetch AWBs:", error);
      toast({ 
        title: "Fetch Failed", 
        description: error instanceof Error ? error.message : 'An unknown error occurred.', 
        variant: "destructive" 
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [user, businessId, count, toast, onClose]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Generate Air Waybills (AWBs)</DialogTitle>
          <DialogDescription>
            Fetch new AWB numbers from your integrated courier service. AWBs are shared across all stores in your business.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4 space-y-4">
          {/* Business-level AWB count */}
          <div className="p-4 bg-muted rounded-md text-center">
            <p className="text-sm text-muted-foreground">Unused AWBs (Shared across all stores)</p>
            {loadingCount ? 
              <Loader2 className="h-8 w-8 mx-auto animate-spin" /> : 
              <p className="text-3xl font-bold">{unusedAwbsCount}</p>
            }
          </div>
          
          {/* Count input */}
          <div className="space-y-2">
            <Label htmlFor="awb-count">Number of AWBs to fetch</Label>
            <Input
              id="awb-count"
              type="number"
              value={count}
              onChange={(e) => setCount(Math.max(0, Math.min(500, parseInt(e.target.value, 10) || 0)))}
              placeholder="Enter a number between 1 and 500"
              min="1"
              max="500"
              disabled={isSubmitting}
            />
            <p className="text-xs text-muted-foreground">
              Specify how many new AWB numbers you need (max 500). These will be available for all stores in your business.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleFetchAwbs} disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isSubmitting ? 'Fetching...' : 'Fetch Now'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}