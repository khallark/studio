'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { X, Search, AlertTriangle } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface AwbBulkSelectionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (awbs: string[], customStatus: string) => void;
  customStatus: string;
  orders: Array<{ awb?: string | null; id: string }>; // Add orders prop to validate against
}

export function AwbBulkSelectionDialog({ isOpen, onClose, onConfirm, customStatus, orders }: AwbBulkSelectionDialogProps) {
  const [scannedAwbs, setScannedAwbs] = useState<Set<string>>(new Set());
  const [currentAwb, setCurrentAwb] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [nonExistingAwbs, setNonExistingAwbs] = useState<Set<string>>(new Set());
  const [showWarning, setShowWarning] = useState(false);
  const [validationResult, setValidationResult] = useState<{ existing: string[]; nonExisting: string[] } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      // Reset state and focus input when dialog opens
      setScannedAwbs(new Set());
      setCurrentAwb('');
      setSearchTerm('');
      setNonExistingAwbs(new Set());
      setShowWarning(false);
      setValidationResult(null);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [isOpen]);

  const handleAddAwb = (e: React.FormEvent) => {
    e.preventDefault();
    if (currentAwb.trim()) {
      setScannedAwbs(prev => new Set(prev).add(currentAwb.trim()));
      setCurrentAwb('');
    }
  };
  
  const handleRemoveAwb = (awb: string) => {
      setScannedAwbs(prev => {
          const newSet = new Set(prev);
          newSet.delete(awb);
          return newSet;
      });
      // Also remove from non-existing if it was marked
      setNonExistingAwbs(prev => {
          const newSet = new Set(prev);
          newSet.delete(awb);
          return newSet;
      });
  };
  
  const filteredAwbs = Array.from(scannedAwbs).filter(awb => 
    awb.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const validateAwbs = (awbs: string[]) => {
    // Get all AWBs from orders with the current status
    const existingAwbs = new Set(
      orders
        .filter(o => o.awb)
        .map(o => o.awb!.trim())
    );

    const existing: string[] = [];
    const nonExisting: string[] = [];

    awbs.forEach(awb => {
      if (existingAwbs.has(awb.trim())) {
        existing.push(awb);
      } else {
        nonExisting.push(awb);
      }
    });

    return { existing, nonExisting };
  };

  const handleConfirm = () => {
    const awbsArray = Array.from(scannedAwbs);
    const result = validateAwbs(awbsArray);
    
    if (result.nonExisting.length > 0) {
      // Store validation result and show warning
      setValidationResult(result);
      setShowWarning(true);
    } else {
      // All AWBs exist, proceed directly
      onConfirm(result.existing, customStatus);
      onClose();
    }
  };

  const handleShowNonExisting = () => {
    if (validationResult) {
      // Mark non-existing AWBs for highlighting
      setNonExistingAwbs(new Set(validationResult.nonExisting));
      setShowWarning(false);
    }
  };

  const handleProceedAnyway = () => {
    if (validationResult) {
      const { existing, nonExisting } = validationResult;
      
      // Show toast with counts
      toast({
        title: "Selection Complete",
        description: `${existing.length} order${existing.length !== 1 ? 's' : ''} selected. ${nonExisting.length} AWB${nonExisting.length !== 1 ? 's' : ''} ignored (not found in ${customStatus} orders).`,
        variant: existing.length > 0 ? "default" : "destructive",
      });

      // Only confirm with existing AWBs
      if (existing.length > 0) {
        onConfirm(existing, customStatus);
      }
      
      setShowWarning(false);
      onClose();
    }
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>AWB Bulk Selection</DialogTitle>
            <DialogDescription>
              Use your barcode scanner to add AWBs to the list, then select the corresponding orders.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-4">
              {/* Left Side: Scanning Input */}
              <div className="space-y-4">
                  <h3 className="font-semibold text-lg">Scan AWBs</h3>
                  <form onSubmit={handleAddAwb} className="space-y-2">
                      <Input
                          ref={inputRef}
                          placeholder="Scanner input..."
                          value={currentAwb}
                          onChange={(e) => setCurrentAwb(e.target.value)}
                      />
                      <Button type="submit" className="w-full">Add AWB Manually</Button>
                  </form>
                  <div className="text-sm text-muted-foreground p-4 border border-dashed rounded-lg text-center">
                      <p>Your barcode scanner should be connected and configured as a keyboard (HID).</p>
                      <p className="mt-2">Scanned codes will automatically be added to the list.</p>
                  </div>
              </div>

              {/* Right Side: Scanned List */}
              <div className="space-y-4 flex flex-col h-96 md:h-auto">
                   <div className="flex justify-between items-center">
                      <h3 className="font-semibold text-lg">Scanned List ({scannedAwbs.size}) </h3>
                      {scannedAwbs.size > 0 && (
                          <Button variant="outline" size="sm" onClick={() => {
                            setScannedAwbs(new Set());
                            setNonExistingAwbs(new Set());
                          }}>Clear All</Button>
                      )}
                   </div>
                   {nonExistingAwbs.size > 0 && (
                     <div className="flex items-center gap-2 p-2 bg-destructive/10 border border-destructive/20 rounded-md">
                       <AlertTriangle className="h-4 w-4 text-destructive" />
                       <span className="text-sm text-destructive font-medium">
                         {nonExistingAwbs.size} AWB{nonExistingAwbs.size !== 1 ? 's' : ''} not found in {customStatus} orders
                       </span>
                     </div>
                   )}
                   <div className="relative">
                      <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input 
                          placeholder="Search scanned AWBs..."
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          className="pl-8"
                      />
                   </div>
                  <ScrollArea className="h-64 border rounded-md p-2 overflow-auto">
                      {filteredAwbs.length > 0 ? (
                          <div className="space-y-2">
                              {filteredAwbs.map(awb => {
                                const isNonExisting = nonExistingAwbs.has(awb);
                                return (
                                  <div 
                                    key={awb} 
                                    className={`flex items-center justify-between p-2 rounded-md ${
                                      isNonExisting 
                                        ? 'bg-destructive/20 border border-destructive/30' 
                                        : 'bg-muted/50'
                                    }`}
                                  >
                                      <div className="flex items-center gap-2">
                                        {isNonExisting && (
                                          <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0" />
                                        )}
                                        <span className={`font-mono text-sm ${isNonExisting ? 'text-destructive font-medium' : ''}`}>
                                          {awb}
                                        </span>
                                      </div>
                                      <Button 
                                        variant="ghost" 
                                        size="icon" 
                                        className="h-6 w-6" 
                                        onClick={() => handleRemoveAwb(awb)}
                                      >
                                          <X className="h-4 w-4" />
                                      </Button>
                                  </div>
                                );
                              })}
                          </div>
                      ) : (
                          <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                              {scannedAwbs.size > 0 ? 'No results for your search.' : 'Scan an AWB to begin.'}
                          </div>
                      )}
                  </ScrollArea>
              </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleConfirm} disabled={scannedAwbs.size === 0}>
              Select {scannedAwbs.size > 0 ? `(${scannedAwbs.size})` : ''} Orders
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Warning Dialog */}
      <AlertDialog open={showWarning} onOpenChange={setShowWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Some AWBs Not Found
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                {validationResult?.nonExisting.length} out of {scannedAwbs.size} scanned AWB{scannedAwbs.size !== 1 ? 's' : ''} {validationResult?.nonExisting.length !== 1 ? 'do' : 'does'} not exist in {customStatus} orders.
              </p>
              <p className="font-medium">
                {validationResult?.existing.length} order{validationResult?.existing.length !== 1 ? 's' : ''} can be selected.
              </p>
              <p className="text-sm">
                Would you like to see which AWBs were not found, or proceed with selecting the available orders?
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleShowNonExisting}>
              Show Non-Existing AWBs
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleProceedAnyway}>
              Proceed Anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}