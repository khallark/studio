
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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { X, Search } from 'lucide-react';

interface AwbBulkSelectionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (awbs: string[], customStatus: string) => void;
  customStatus: string;
}

export function AwbBulkSelectionDialog({ isOpen, onClose, onConfirm, customStatus }: AwbBulkSelectionDialogProps) {
  const [scannedAwbs, setScannedAwbs] = useState<Set<string>>(new Set());
  const [currentAwb, setCurrentAwb] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      // Reset state and focus input when dialog opens
      setScannedAwbs(new Set());
      setCurrentAwb('');
      setSearchTerm('');
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
  };
  
  const filteredAwbs = Array.from(scannedAwbs).filter(awb => 
    awb.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleConfirm = () => {
    onConfirm(Array.from(scannedAwbs), customStatus);
    onClose();
  };

  return (
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
                        <Button variant="outline" size="sm" onClick={() => setScannedAwbs(new Set())}>Clear All</Button>
                    )}
                 </div>
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
                            {filteredAwbs.map(awb => (
                                <div key={awb} className="flex items-center justify-between p-2 bg-muted/50 rounded-md">
                                    <span className="font-mono text-sm">{awb}</span>
                                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleRemoveAwb(awb)}>
                                        <X className="h-4 w-4" />
                                    </Button>
                                </div>
                            ))}
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
  );
}
