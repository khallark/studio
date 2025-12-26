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
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
} from '@/components/ui/tabs';
import {
    Alert,
    AlertDescription,
    AlertTitle,
} from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Upload,
    FileSpreadsheet,
    Plus,
    RefreshCw,
    X,
    CheckCircle2,
    XCircle,
    AlertCircle,
    Download,
    FileDown,
    Info,
    Loader2,
    ArrowRight,
    Sparkles,
    FileUp,
    Table,
    AlertTriangle,
} from 'lucide-react';

// ============================================================
// TYPES
// ============================================================

interface BulkUploadDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    businessId: string;
    user: User | null | undefined;
}

type UploadMode = 'add' | 'update';

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

export function BulkUploadDialog({
    open,
    onOpenChange,
    businessId,
    user,
}: BulkUploadDialogProps) {
    const { toast } = useToast();
    const fileInputRef = useRef<HTMLInputElement>(null);

    // State
    const [mode, setMode] = useState<UploadMode>('add');
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
            formData.append('mode', mode);

            setUploadProgress(30);

            const response = await fetch('/api/business/products/bulk-upload', {
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
                title: 'Upload Complete',
                description: `${data.summary.success} products ${mode === 'add' ? 'added' : 'updated'} successfully`,
            });

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
        const worksheet = workbook.addWorksheet('Products');

        // Define columns
        worksheet.columns = [
            { header: 'Product Name', key: 'productName', width: 25 },
            { header: 'SKU', key: 'sku', width: 15 },
            { header: 'Weight', key: 'weight', width: 10 },
            { header: 'Category', key: 'category', width: 20 },
            { header: 'Description', key: 'description', width: 35 },
            { header: 'Price', key: 'price', width: 10 },
            { header: 'Stock', key: 'stock', width: 10 },
        ];

        // Style header row
        worksheet.getRow(1).font = { bold: true };
        worksheet.getRow(1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFE0E0E0' },
        };

        // Add sample data
        worksheet.addRow({ productName: 'Cotton T-Shirt', sku: 'TSH-001', weight: 250, category: 'Apparel', description: 'Comfortable cotton t-shirt', price: 499, stock: 100 });
        worksheet.addRow({ productName: 'Denim Jeans', sku: 'JNS-002', weight: 450, category: 'Apparel', description: 'Classic denim jeans', price: 1299, stock: 50 });
        worksheet.addRow({ productName: 'Running Shoes', sku: 'SHO-003', weight: 350, category: 'Footwear', description: 'Lightweight running shoes', price: 2499, stock: 30 });

        // Generate and download
        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'product-upload-template.xlsx';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 ring-1 ring-primary/20">
                            <FileSpreadsheet className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                            <DialogTitle className="text-xl">Bulk Product Upload</DialogTitle>
                            <DialogDescription>
                                Add or update multiple products at once using Excel or CSV
                            </DialogDescription>
                        </div>
                    </div>
                </DialogHeader>

                <div className="space-y-6 py-4">
                    {/* Mode Selection */}
                    <Tabs value={mode} onValueChange={(v) => setMode(v as UploadMode)} className="w-full">
                        <TabsList className="grid w-full grid-cols-2">
                            <TabsTrigger value="add" className="gap-2">
                                <Plus className="h-4 w-4" />
                                Add Products
                            </TabsTrigger>
                            <TabsTrigger value="update" className="gap-2">
                                <RefreshCw className="h-4 w-4" />
                                Update Existing
                            </TabsTrigger>
                        </TabsList>

                        <TabsContent value="add" className="mt-4">
                            <Alert className="border-blue-500/20 bg-blue-500/5">
                                <Info className="h-4 w-4 text-blue-500" />
                                <AlertTitle className="text-blue-700">Adding New Products</AlertTitle>
                                <AlertDescription className="text-blue-600/80">
                                    Upload a file with new products. Products with SKUs that already exist will be skipped.
                                </AlertDescription>
                            </Alert>
                        </TabsContent>

                        <TabsContent value="update" className="mt-4">
                            <Alert className="border-amber-500/20 bg-amber-500/5">
                                <RefreshCw className="h-4 w-4 text-amber-500" />
                                <AlertTitle className="text-amber-700">Updating Existing Products</AlertTitle>
                                <AlertDescription className="text-amber-600/80">
                                    Upload a file to update existing products. Only products with matching SKUs will be updated.
                                </AlertDescription>
                            </Alert>
                        </TabsContent>
                    </Tabs>

                    {/* File Format Info */}
                    <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                        <div className="flex items-center justify-between">
                            <h4 className="font-medium flex items-center gap-2">
                                <Table className="h-4 w-4 text-muted-foreground" />
                                File Format Requirements
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
                            <p className="font-medium text-foreground">Required Columns:</p>
                            <ul className="list-disc list-inside space-y-1 ml-2">
                                <li>
                                    <code className="px-1.5 py-0.5 bg-muted rounded text-xs">SKU</code>
                                    {' '}- Unique product identifier (always required)
                                </li>
                                {mode === 'add' && (
                                    <>
                                        <li>
                                            <code className="px-1.5 py-0.5 bg-muted rounded text-xs">Product Name</code>
                                            {' '}- Name of the product
                                        </li>
                                        <li>
                                            <code className="px-1.5 py-0.5 bg-muted rounded text-xs">Weight</code>
                                            {' '}- Weight in grams (must be {'>'} 0)
                                        </li>
                                    </>
                                )}
                            </ul>
                            
                            <p className="font-medium text-foreground pt-2">Optional Columns:</p>
                            <ul className="list-disc list-inside space-y-1 ml-2">
                                {mode === 'update' && (
                                    <>
                                        <li>
                                            <code className="px-1.5 py-0.5 bg-muted rounded text-xs">Product Name</code>
                                        </li>
                                        <li>
                                            <code className="px-1.5 py-0.5 bg-muted rounded text-xs">Weight</code>
                                        </li>
                                    </>
                                )}
                                <li>
                                    <code className="px-1.5 py-0.5 bg-muted rounded text-xs">Category</code>
                                    {' '}- Product category
                                </li>
                                <li>
                                    <code className="px-1.5 py-0.5 bg-muted rounded text-xs">Description</code>
                                    {' '}- Product description
                                </li>
                                <li>
                                    <code className="px-1.5 py-0.5 bg-muted rounded text-xs">Price</code>
                                    {' '}- Product price (₹)
                                </li>
                                <li>
                                    <code className="px-1.5 py-0.5 bg-muted rounded text-xs">Stock</code>
                                    {' '}- Available stock quantity
                                </li>
                            </ul>

                            <p className="text-xs pt-2 text-muted-foreground/70">
                                Valid Categories: Apparel, Accessories, Footwear, Electronics, Home & Living, Beauty & Personal Care, Sports & Outdoors, Books & Stationery, Food & Beverages, Other
                            </p>
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
                                    ? 'border-primary bg-primary/5 scale-[1.02]'
                                    : file
                                    ? 'border-emerald-500/50 bg-emerald-500/5'
                                    : 'border-border hover:border-primary/50 hover:bg-muted/50'
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
                                    Processing...
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
                                        <h4 className="font-semibold">Upload Complete</h4>
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
                                        <p className="text-xs text-emerald-600/70">Successful</p>
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
                                className="gap-2 min-w-[140px]"
                            >
                                {isUploading ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Processing...
                                    </>
                                ) : (
                                    <>
                                        <Sparkles className="h-4 w-4" />
                                        {mode === 'add' ? 'Add Products' : 'Update Products'}
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