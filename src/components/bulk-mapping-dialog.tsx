'use client';

import React, { useState, useRef, useCallback } from 'react';
import { User } from 'firebase/auth';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    Alert,
    AlertDescription,
    AlertTitle,
} from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Upload,
    FileSpreadsheet,
    X,
    CheckCircle2,
    Download,
    FileDown,
    Info,
    Loader2,
    Sparkles,
    FileUp,
    Table,
    AlertTriangle,
    Link2,
    ArrowRight,
} from 'lucide-react';

// ============================================================
// TYPES
// ============================================================

interface BulkMappingDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    businessId: string;
    user: User | null | undefined;
    onMappingComplete: () => void;
}

interface UploadResult {
    success: boolean;
    summary: {
        total: number;
        success: number;
        skipped: number;
        errors: number;
    };
    resultFile?: {
        name: string;
        data: string;
        mimeType: string;
    };
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export function BulkMappingDialog({
    open,
    onOpenChange,
    businessId,
    user,
    onMappingComplete,
}: BulkMappingDialogProps) {
    const { toast } = useToast();
    const fileInputRef = useRef<HTMLInputElement>(null);

    // State
    const [file, setFile] = useState<File | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [result, setResult] = useState<UploadResult | null>(null);

    // Reset state when dialog closes
    const handleOpenChange = (open: boolean) => {
        if (!open) {
            setFile(null);
            setResult(null);
            setUploadProgress(0);
            setIsUploading(false);
        }
        onOpenChange(open);
    };

    // File handling
    const handleFileSelect = useCallback((selectedFile: File) => {
        const fileName = selectedFile.name.toLowerCase();
        if (!fileName.endsWith('.xlsx') && !fileName.endsWith('.xls') && !fileName.endsWith('.csv')) {
            toast({
                title: 'Invalid File Type',
                description: 'Please upload an Excel (.xlsx, .xls) or CSV (.csv) file',
                variant: 'destructive',
            });
            return;
        }
        setFile(selectedFile);
        setResult(null);
    }, [toast]);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);

        const droppedFile = e.dataTransfer.files[0];
        if (droppedFile) {
            handleFileSelect(droppedFile);
        }
    }, [handleFileSelect]);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    }, []);

    // Upload handler
    const handleUpload = async () => {
        if (!file || !user || !businessId) return;

        setIsUploading(true);
        setUploadProgress(10);

        try {
            const idToken = await user.getIdToken();
            const formData = new FormData();
            formData.append('file', file);
            formData.append('businessId', businessId);

            setUploadProgress(30);

            const response = await fetch('/api/shopify/products/bulk-mapping', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${idToken}`,
                },
                body: formData,
            });

            setUploadProgress(70);

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Upload failed');
            }

            setUploadProgress(100);
            setResult({
                success: true,
                summary: data.summary,
                resultFile: data.resultFile,
            });

            toast({
                title: 'Mapping Complete',
                description: `${data.summary.success} mappings created successfully`,
            });

            // Trigger refresh in parent
            if (data.summary.success > 0) {
                onMappingComplete();
            }

        } catch (error) {
            toast({
                title: 'Upload Failed',
                description: error instanceof Error ? error.message : 'An error occurred',
                variant: 'destructive',
            });
            setResult(null);
        } finally {
            setIsUploading(false);
        }
    };

    // Download result file
    const handleDownloadResult = () => {
        if (!result?.resultFile) return;

        const byteCharacters = atob(result.resultFile.data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: result.resultFile.mimeType });

        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = result.resultFile.name;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // Download template
    const handleDownloadTemplate = async () => {
        const ExcelJS = (await import('exceljs')).default;

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Mappings');

        worksheet.columns = [
            { header: 'Store Product Title', key: 'storeProductTitle', width: 35 },
            { header: 'Store Product SKU', key: 'storeProductSku', width: 20 },
            { header: 'Business Product SKU', key: 'businessProductSku', width: 20 },
        ];

        // Style header row
        worksheet.getRow(1).font = { bold: true };
        worksheet.getRow(1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFE0E0E0' },
        };

        // Add sample data
        worksheet.addRow({
            storeProductTitle: 'Blue Cotton T-Shirt - Small',
            storeProductSku: 'BLU-TSH-S',
            businessProductSku: 'TSH-001',
        });
        worksheet.addRow({
            storeProductTitle: 'Blue Cotton T-Shirt - Medium',
            storeProductSku: 'BLU-TSH-M',
            businessProductSku: 'TSH-001',
        });
        worksheet.addRow({
            storeProductTitle: 'Classic Denim Jeans - 32',
            storeProductSku: 'DNM-JNS-32',
            businessProductSku: 'JNS-002',
        });

        // Generate and download
        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'bulk-mapping-template.xlsx';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="sm:max-w-[550px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-xl bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 ring-1 ring-emerald-500/20">
                            <Link2 className="h-5 w-5 text-emerald-600" />
                        </div>
                        <div>
                            <DialogTitle className="text-xl">Bulk Variant Mapping</DialogTitle>
                            <DialogDescription>
                                Map multiple store variants to business products at once
                            </DialogDescription>
                        </div>
                    </div>
                </DialogHeader>

                <div className="space-y-6 py-4">
                    {/* Info Alert */}
                    <Alert className="border-blue-500/20 bg-blue-500/5">
                        <Info className="h-4 w-4 text-blue-500" />
                        <AlertTitle className="text-blue-700">How it works</AlertTitle>
                        <AlertDescription className="text-blue-600/80">
                            Upload a file with store variant SKUs and their corresponding business product SKUs.
                            Each row will create a mapping between the store variant and business product.
                        </AlertDescription>
                    </Alert>

                    {/* File Format Info */}
                    <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                        <div className="flex items-center justify-between">
                            <h4 className="font-medium flex items-center gap-2">
                                <Table className="h-4 w-4 text-muted-foreground" />
                                Required Columns
                            </h4>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleDownloadTemplate}
                                className="gap-2 text-xs"
                            >
                                <Download className="h-3 w-3" />
                                Download Template
                            </Button>
                        </div>

                        <div className="text-sm text-muted-foreground space-y-2">
                            <ul className="list-disc list-inside space-y-1.5 ml-2">
                                <li>
                                    <code className="px-1.5 py-0.5 bg-muted rounded text-xs">Store Product Title</code>
                                    {' '}- For reference (helps identify products)
                                </li>
                                <li>
                                    <code className="px-1.5 py-0.5 bg-muted rounded text-xs">Store Product SKU</code>
                                    {' '}- The variant SKU from your Shopify store
                                </li>
                                <li>
                                    <code className="px-1.5 py-0.5 bg-muted rounded text-xs">Business Product SKU</code>
                                    {' '}- Your internal business product SKU
                                </li>
                            </ul>

                            <div className="mt-3 p-3 bg-muted/50 rounded-md">
                                <p className="text-xs font-medium text-foreground mb-2">Example:</p>
                                <div className="flex items-center gap-2 text-xs">
                                    <span className="px-2 py-1 bg-background rounded border">BLU-TSH-S</span>
                                    <ArrowRight className="h-3 w-3 text-emerald-500" />
                                    <span className="px-2 py-1 bg-emerald-500/10 text-emerald-700 rounded border border-emerald-500/20">TSH-001</span>
                                </div>
                                <p className="text-xs text-muted-foreground mt-2">
                                    Store variant "BLU-TSH-S" will be mapped to business product "TSH-001"
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* File Upload Area */}
                    {!result && (
                        <div
                            onClick={() => fileInputRef.current?.click()}
                            onDrop={handleDrop}
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            className={cn(
                                'relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-200',
                                isDragging
                                    ? 'border-emerald-500 bg-emerald-500/5 scale-[1.02]'
                                    : file
                                        ? 'border-emerald-500/50 bg-emerald-500/5'
                                        : 'border-border hover:border-emerald-500/50 hover:bg-muted/50'
                            )}
                        >
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".xlsx,.xls,.csv"
                                onChange={(e) => {
                                    const selectedFile = e.target.files?.[0];
                                    if (selectedFile) handleFileSelect(selectedFile);
                                }}
                                className="hidden"
                            />

                            <AnimatePresence mode="wait">
                                {file ? (
                                    <motion.div
                                        key="file"
                                        initial={{ opacity: 0, scale: 0.9 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        exit={{ opacity: 0, scale: 0.9 }}
                                        className="space-y-3"
                                    >
                                        <div className="mx-auto w-14 h-14 rounded-full bg-emerald-500/10 flex items-center justify-center">
                                            <FileSpreadsheet className="h-7 w-7 text-emerald-600" />
                                        </div>
                                        <div>
                                            <p className="font-medium text-emerald-700">{file.name}</p>
                                            <p className="text-sm text-muted-foreground">
                                                {(file.size / 1024).toFixed(1)} KB
                                            </p>
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setFile(null);
                                            }}
                                            className="text-muted-foreground hover:text-destructive"
                                        >
                                            <X className="h-4 w-4 mr-1" />
                                            Remove
                                        </Button>
                                    </motion.div>
                                ) : (
                                    <motion.div
                                        key="empty"
                                        initial={{ opacity: 0, scale: 0.9 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        exit={{ opacity: 0, scale: 0.9 }}
                                        className="space-y-3"
                                    >
                                        <div className="mx-auto w-14 h-14 rounded-full bg-muted flex items-center justify-center">
                                            <FileUp className="h-7 w-7 text-muted-foreground" />
                                        </div>
                                        <div>
                                            <p className="font-medium">
                                                {isDragging ? 'Drop your file here' : 'Click to upload or drag & drop'}
                                            </p>
                                            <p className="text-sm text-muted-foreground">
                                                Excel (.xlsx, .xls) or CSV (.csv)
                                            </p>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    )}

                    {/* Progress */}
                    {isUploading && (
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="space-y-3"
                        >
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-muted-foreground flex items-center gap-2">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Processing mappings...
                                </span>
                                <span className="font-medium">{uploadProgress}%</span>
                            </div>
                            <Progress value={uploadProgress} className="h-2" />
                        </motion.div>
                    )}

                    {/* Results */}
                    {result && (
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="space-y-4"
                        >
                            {/* Summary */}
                            <div className="rounded-xl border bg-gradient-to-br from-background to-muted/30 p-5">
                                <div className="flex items-center gap-3 mb-4">
                                    <div className={cn(
                                        'p-2 rounded-lg',
                                        result.summary.errors > 0
                                            ? 'bg-amber-500/10'
                                            : 'bg-emerald-500/10'
                                    )}>
                                        {result.summary.errors > 0 ? (
                                            <AlertTriangle className="h-5 w-5 text-amber-600" />
                                        ) : (
                                            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                                        )}
                                    </div>
                                    <div>
                                        <h4 className="font-semibold">Mapping Complete</h4>
                                        <p className="text-sm text-muted-foreground">
                                            Processed {result.summary.total} rows
                                        </p>
                                    </div>
                                </div>

                                <div className="grid grid-cols-3 gap-3">
                                    <div className="rounded-lg bg-emerald-500/10 p-3 text-center">
                                        <p className="text-2xl font-bold text-emerald-600">
                                            {result.summary.success}
                                        </p>
                                        <p className="text-xs text-emerald-600/70">Mapped</p>
                                    </div>
                                    <div className="rounded-lg bg-amber-500/10 p-3 text-center">
                                        <p className="text-2xl font-bold text-amber-600">
                                            {result.summary.skipped}
                                        </p>
                                        <p className="text-xs text-amber-600/70">Skipped</p>
                                    </div>
                                    <div className="rounded-lg bg-red-500/10 p-3 text-center">
                                        <p className="text-2xl font-bold text-red-600">
                                            {result.summary.errors}
                                        </p>
                                        <p className="text-xs text-red-600/70">Errors</p>
                                    </div>
                                </div>
                            </div>

                            {/* Download Result File */}
                            {result.resultFile && (
                                <Button
                                    onClick={handleDownloadResult}
                                    variant="outline"
                                    className="w-full gap-2"
                                >
                                    <FileDown className="h-4 w-4" />
                                    Download Detailed Results
                                </Button>
                            )}

                            {/* Upload Another */}
                            <Button
                                onClick={() => {
                                    setFile(null);
                                    setResult(null);
                                    setUploadProgress(0);
                                }}
                                variant="ghost"
                                className="w-full gap-2"
                            >
                                <Upload className="h-4 w-4" />
                                Upload Another File
                            </Button>
                        </motion.div>
                    )}

                    {/* Action Buttons */}
                    {!result && (
                        <div className="flex justify-end gap-3 pt-2">
                            <Button
                                variant="outline"
                                onClick={() => handleOpenChange(false)}
                                disabled={isUploading}
                            >
                                Cancel
                            </Button>
                            <Button
                                onClick={handleUpload}
                                disabled={!file || isUploading}
                                className="gap-2 min-w-[140px] bg-emerald-600 hover:bg-emerald-700"
                            >
                                {isUploading ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Processing...
                                    </>
                                ) : (
                                    <>
                                        <Sparkles className="h-4 w-4" />
                                        Create Mappings
                                    </>
                                )}
                            </Button>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}