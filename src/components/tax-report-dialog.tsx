// components/tax-report-dialog.tsx
'use client';

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { DateRange } from 'react-day-picker';
import { Clock, Loader2, CalendarIcon } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { User } from 'firebase/auth';

interface TaxReportDialogProps {
    isOpen: boolean;
    onClose: () => void;
    stores: string[];
    user: User | null | undefined;
    businessId: string;
}

export function TaxReportDialog({ isOpen, onClose, stores, user, businessId }: TaxReportDialogProps) {
    const [selectedStore, setSelectedStore] = useState<string>('');
    const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
    const [isGenerating, setIsGenerating] = useState(false);

    const handleGenerateReport = async () => {
        // Validation
        if (!selectedStore) {
            toast({
                title: "Store Required",
                description: "Please select a store to generate the tax report.",
                variant: "destructive"
            });
            return;
        }

        if (!dateRange?.from || !dateRange?.to) {
            toast({
                title: "Date Range Required",
                description: "Please select both start and end dates.",
                variant: "destructive"
            });
            return;
        }

        if (!user) {
            toast({
                title: "Authentication Required",
                description: "You must be logged in to generate tax reports.",
                variant: "destructive"
            });
            return;
        }

        setIsGenerating(true);

        // Show processing toast
        toast({
            title: "Processing Your Request",
            description: "Generating tax report, please wait...",
        });

        try {
            // Get auth token
            const idToken = await user.getIdToken();

            // Format dates as YYYY-MM-DD
            const startDate = format(dateRange.from, 'yyyy-MM-dd');
            const endDate = format(dateRange.to, 'yyyy-MM-dd');

            // Call API
            const response = await fetch('/api/business/generate-tax-report', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`
                },
                body: JSON.stringify({
                    businessId,
                    storeId: selectedStore,
                    startDate,
                    endDate
                })
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || result.message || 'Failed to generate report');
            }

            // Success toast
            toast({
                title: "Report Generation Started",
                description: "Your tax report is being generated and will be sent to your WhatsApp number shortly.",
                duration: 5000,
            });

            // Reset and close
            setSelectedStore('');
            setDateRange(undefined);
            onClose();

        } catch (error: any) {
            console.error('Tax report generation error:', error);
            toast({
                title: "Generation Failed",
                description: error.message || "Failed to generate tax report. Please try again.",
                variant: "destructive"
            });
        } finally {
            setIsGenerating(false);
        }
    };

    const handleClose = () => {
        if (!isGenerating) {
            setSelectedStore('');
            setDateRange(undefined);
            onClose();
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>Generate Tax Report</DialogTitle>
                    <DialogDescription>
                        Select a store and date range to generate a comprehensive tax report.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-6 py-4">
                    {/* Store Selection */}
                    <div className="space-y-2">
                        <Label htmlFor="store">Store</Label>
                        <Select
                            value={selectedStore}
                            onValueChange={setSelectedStore}
                            disabled={isGenerating}
                        >
                            <SelectTrigger id="store">
                                <SelectValue placeholder="Select a store..." />
                            </SelectTrigger>
                            <SelectContent>
                                {stores.map(storeId => (
                                    <SelectItem key={storeId} value={storeId}>
                                        {storeId}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Date Range Selection */}
                    <div className="space-y-2">
                        <Label>Date Range</Label>
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button
                                    variant="outline"
                                    className={cn(
                                        "w-full justify-start text-left font-normal",
                                        !dateRange && "text-muted-foreground"
                                    )}
                                    disabled={isGenerating}
                                >
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {dateRange?.from ? (
                                        dateRange.to ? (
                                            <>
                                                {format(dateRange.from, "LLL dd, y")} -{" "}
                                                {format(dateRange.to, "LLL dd, y")}
                                            </>
                                        ) : (
                                            format(dateRange.from, "LLL dd, y")
                                        )
                                    ) : (
                                        <span>Pick a date range</span>
                                    )}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                                <Calendar
                                    initialFocus
                                    mode="range"
                                    defaultMonth={dateRange?.from}
                                    selected={dateRange}
                                    onSelect={setDateRange}
                                    numberOfMonths={2}
                                    disabled={(date) => date > new Date()} // Can't select future dates
                                />
                            </PopoverContent>
                        </Popover>
                        <p className="text-xs text-muted-foreground">
                            Select the date range for which you want to generate the tax report.
                        </p>
                    </div>
                </div>

                <DialogFooter>
                    <Button
                        variant="outline"
                        onClick={handleClose}
                        disabled={isGenerating}
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={handleGenerateReport}
                        disabled={isGenerating || !selectedStore || !dateRange?.from || !dateRange?.to}
                    >
                        {isGenerating ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Generating...
                            </>
                        ) : (
                            'Prepare Tax Report'
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}