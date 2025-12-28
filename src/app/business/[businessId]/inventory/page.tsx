// /business/[businessId]/inventory/page.tsx
'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useBusinessContext } from '../layout';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, Timestamp } from 'firebase/firestore';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import {
    Card,
    CardContent,
    CardHeader,
} from '@/components/ui/card';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { useDebounce } from 'use-debounce';
import {
    Package,
    Search,
    X,
    ChevronLeft,
    ChevronRight,
    Loader2,
    PackageOpen,
    Warehouse,
    TrendingUp,
    TrendingDown,
    ArrowUpDown,
    Plus,
    Minus,
    AlertCircle,
    CheckCircle2,
    ArrowRight,
    Box,
    ShieldCheck,
    PackageCheck,
    Info,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';

// ============================================================
// TYPES
// ============================================================

interface InventoryData {
    openingStock: number;
    inwardAddition: number;
    deduction: number;
    autoAddition: number;
    autoDeduction: number;
    blockedStock: number;
}

interface Product {
    id: string; // SKU
    name: string;
    sku: string;
    category: string;
    weight: number;
    inventory?: InventoryData;
    createdAt?: Timestamp;
}

interface InventoryProduct extends Product {
    // Computed values
    physicalStock: number;
    availableStock: number;
}

type AdjustmentType = 'inward' | 'deduction';

// ============================================================
// HELPER FUNCTIONS
// ============================================================

function getInventoryValues(inventory?: InventoryData): InventoryData {
    return {
        openingStock: inventory?.openingStock ?? 0,
        inwardAddition: inventory?.inwardAddition ?? 0,
        deduction: inventory?.deduction ?? 0,
        autoAddition: inventory?.autoAddition ?? 0,
        autoDeduction: inventory?.autoDeduction ?? 0,
        blockedStock: inventory?.blockedStock ?? 0,
    };
}

function calculatePhysicalStock(inv: InventoryData): number {
    return inv.openingStock + inv.inwardAddition - inv.deduction + inv.autoAddition - inv.autoDeduction;
}

function calculateAvailableStock(physicalStock: number, blockedStock: number): number {
    return physicalStock - blockedStock;
}

// ============================================================
// ANIMATIONS
// ============================================================

const tableRowVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: (i: number) => ({
        opacity: 1,
        y: 0,
        transition: {
            delay: i * 0.03,
            duration: 0.25,
            ease: [0.25, 0.46, 0.45, 0.94],
        },
    }),
    exit: { opacity: 0, x: -20, transition: { duration: 0.2 } },
};

const cardVariants = {
    hidden: { opacity: 0, scale: 0.95 },
    visible: {
        opacity: 1,
        scale: 1,
        transition: { duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] },
    },
};

// ============================================================
// ADJUSTMENT DIALOG COMPONENT
// ============================================================

interface AdjustmentDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    product: InventoryProduct | null;
    type: AdjustmentType;
    user: any;
    businessId: string;
}

function AdjustmentDialog({
    open,
    onOpenChange,
    product,
    type,
    user,
    businessId,
}: AdjustmentDialogProps) {
    const { toast } = useToast();
    const [value, setValue] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Reset value when dialog opens/closes
    useEffect(() => {
        if (open) {
            setValue('');
        }
    }, [open]);

    if (!product) return null;

    const currentValue = type === 'inward'
        ? product.inventory?.inwardAddition ?? 0
        : product.inventory?.deduction ?? 0;

    const addAmount = parseInt(value) || 0;
    const newValue = currentValue + addAmount;

    // Calculate preview values
    const inv = getInventoryValues(product.inventory);
    const previewInv = { ...inv };

    if (type === 'inward') {
        previewInv.inwardAddition = newValue;
    } else {
        previewInv.deduction = newValue;
    }

    const previewPhysicalStock = calculatePhysicalStock(previewInv);
    const previewAvailableStock = calculateAvailableStock(previewPhysicalStock, previewInv.blockedStock);

    // Validation for deduction
    const isDeductionInvalid = type === 'deduction' && previewPhysicalStock < 0;

    const handleSubmit = async () => {
        if (!value || addAmount <= 0) {
            toast({
                title: 'Invalid Value',
                description: 'Please enter a positive number',
                variant: 'destructive',
            });
            return;
        }

        if (isDeductionInvalid) {
            toast({
                title: 'Cannot Deduct',
                description: 'Deduction would result in negative physical stock',
                variant: 'destructive',
            });
            return;
        }

        setIsSubmitting(true);

        try {
            const idToken = await user?.getIdToken();
            const response = await fetch('/api/business/inventory/adjust', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${idToken}`,
                },
                body: JSON.stringify({
                    businessId,
                    sku: product.sku,
                    type,
                    amount: addAmount,
                }),
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.message || 'Failed to adjust inventory');
            }

            toast({
                title: type === 'inward' ? 'Stock Added' : 'Stock Deducted',
                description: `${product.name}: ${type === 'inward' ? '+' : '-'}${addAmount} units`,
            });

            onOpenChange(false);
        } catch (error) {
            toast({
                title: 'Error',
                description: error instanceof Error ? error.message : 'Failed to adjust inventory',
                variant: 'destructive',
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[480px]">
                <DialogHeader>
                    <div className="flex items-center gap-3">
                        <div className={cn(
                            'p-2.5 rounded-xl ring-1',
                            type === 'inward'
                                ? 'bg-emerald-500/10 ring-emerald-500/20'
                                : 'bg-rose-500/10 ring-rose-500/20'
                        )}>
                            {type === 'inward' ? (
                                <Plus className="h-5 w-5 text-emerald-600" />
                            ) : (
                                <Minus className="h-5 w-5 text-rose-600" />
                            )}
                        </div>
                        <div>
                            <DialogTitle className="text-xl">
                                {type === 'inward' ? 'Add Inward Stock' : 'Deduct Stock'}
                            </DialogTitle>
                            <DialogDescription>
                                {product.name} ({product.sku})
                            </DialogDescription>
                        </div>
                    </div>
                </DialogHeader>

                <div className="space-y-6 py-4">
                    {/* Current State */}
                    <div className="rounded-lg border bg-muted/30 p-4">
                        <p className="text-sm font-medium text-muted-foreground mb-3">Current Inventory</p>
                        <div className="grid grid-cols-2 gap-3 text-sm">
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">
                                    {type === 'inward' ? 'Inward Addition' : 'Deduction'}:
                                </span>
                                <span className="font-medium">{currentValue}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Physical Stock:</span>
                                <span className="font-medium">{product.physicalStock}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Blocked Stock:</span>
                                <span className="font-medium">{product.inventory?.blockedStock ?? 0}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Available Stock:</span>
                                <span className="font-medium">{product.availableStock}</span>
                            </div>
                        </div>
                    </div>

                    {/* Input */}
                    <div className="space-y-2">
                        <Label htmlFor="amount" className="text-sm font-medium">
                            {type === 'inward' ? 'Quantity to Add' : 'Quantity to Deduct'}
                        </Label>
                        <div className="relative">
                            {type === 'inward' ? (
                                <Plus className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-500" />
                            ) : (
                                <Minus className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-rose-500" />
                            )}
                            <Input
                                id="amount"
                                type="number"
                                min="1"
                                step="1"
                                value={value}
                                onChange={(e) => setValue(e.target.value)}
                                placeholder="Enter quantity..."
                                className={cn(
                                    'pl-10 text-lg font-medium',
                                    isDeductionInvalid && 'border-destructive focus-visible:ring-destructive'
                                )}
                                autoFocus
                            />
                        </div>
                        {isDeductionInvalid && (
                            <p className="text-xs text-destructive flex items-center gap-1">
                                <AlertCircle className="h-3 w-3" />
                                Cannot deduct more than available physical stock
                            </p>
                        )}
                    </div>

                    {/* Preview */}
                    {addAmount > 0 && (
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className={cn(
                                'rounded-lg border p-4',
                                isDeductionInvalid
                                    ? 'bg-destructive/5 border-destructive/20'
                                    : 'bg-emerald-500/5 border-emerald-500/20'
                            )}
                        >
                            <p className="text-sm font-medium mb-3 flex items-center gap-2">
                                {isDeductionInvalid ? (
                                    <AlertCircle className="h-4 w-4 text-destructive" />
                                ) : (
                                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                                )}
                                Preview After {type === 'inward' ? 'Addition' : 'Deduction'}
                            </p>
                            <div className="space-y-2 text-sm">
                                <div className="flex items-center gap-2">
                                    <span className="text-muted-foreground w-28">
                                        {type === 'inward' ? 'Inward Addition' : 'Deduction'}:
                                    </span>
                                    <span className="font-medium">{currentValue}</span>
                                    <ArrowRight className="h-3 w-3 text-muted-foreground" />
                                    <span className={cn(
                                        'font-bold',
                                        type === 'inward' ? 'text-emerald-600' : 'text-rose-600'
                                    )}>
                                        {newValue}
                                    </span>
                                    <Badge variant="outline" className={cn(
                                        'text-xs',
                                        type === 'inward'
                                            ? 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20'
                                            : 'bg-rose-500/10 text-rose-700 border-rose-500/20'
                                    )}>
                                        {type === 'inward' ? '+' : '+'}{addAmount}
                                    </Badge>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-muted-foreground w-28">Physical Stock:</span>
                                    <span className="font-medium">{product.physicalStock}</span>
                                    <ArrowRight className="h-3 w-3 text-muted-foreground" />
                                    <span className={cn(
                                        'font-bold',
                                        isDeductionInvalid ? 'text-destructive' : 'text-foreground'
                                    )}>
                                        {previewPhysicalStock}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-muted-foreground w-28">Available Stock:</span>
                                    <span className="font-medium">{product.availableStock}</span>
                                    <ArrowRight className="h-3 w-3 text-muted-foreground" />
                                    <span className={cn(
                                        'font-bold',
                                        previewAvailableStock < 0 ? 'text-destructive' : 'text-foreground'
                                    )}>
                                        {previewAvailableStock}
                                    </span>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </div>

                <DialogFooter>
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                        disabled={isSubmitting}
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={handleSubmit}
                        disabled={isSubmitting || !value || addAmount <= 0 || isDeductionInvalid}
                        className={cn(
                            'gap-2',
                            type === 'inward'
                                ? 'bg-emerald-600 hover:bg-emerald-700'
                                : 'bg-rose-600 hover:bg-rose-700'
                        )}
                    >
                        {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                        {type === 'inward' ? 'Add Stock' : 'Deduct Stock'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export default function InventoryPage() {
    const { isAuthorized, loading: authLoading, user, businessId } = useBusinessContext();
    const { toast } = useToast();

    // Data state
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);

    // UI state
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearch] = useDebounce(searchQuery, 300);
    const [categoryFilter, setCategoryFilter] = useState<string>('all');
    const [stockFilter, setStockFilter] = useState<string>('all');
    const [sortField, setSortField] = useState<'name' | 'sku' | 'physicalStock' | 'availableStock'>('name');
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
    const [currentPage, setCurrentPage] = useState(1);
    const [rowsPerPage, setRowsPerPage] = useState(10);

    // Dialog state
    const [adjustmentDialogOpen, setAdjustmentDialogOpen] = useState(false);
    const [selectedProduct, setSelectedProduct] = useState<InventoryProduct | null>(null);
    const [adjustmentType, setAdjustmentType] = useState<AdjustmentType>('inward');

    // ============================================================
    // EFFECTS
    // ============================================================

    useEffect(() => {
        document.title = 'Inventory - Business Dashboard';
    }, []);

    useEffect(() => {
        if (!authLoading && isAuthorized && businessId && user) {
            setLoading(true);

            const productsRef = collection(db, 'users', businessId, 'products');

            const unsubscribe = onSnapshot(
                productsRef,
                (snapshot) => {
                    const fetchedProducts = snapshot.docs.map((doc) => ({
                        id: doc.id,
                        ...doc.data(),
                    })) as Product[];
                    setProducts(fetchedProducts);
                    setLoading(false);
                },
                (error) => {
                    console.error('Error fetching products:', error);
                    toast({
                        title: 'Error fetching inventory',
                        description: 'Could not retrieve inventory data. Please try again.',
                        variant: 'destructive',
                    });
                    setLoading(false);
                }
            );

            return () => unsubscribe();
        }
    }, [authLoading, isAuthorized, businessId, user, toast]);

    // Reset page when filters change
    useEffect(() => {
        setCurrentPage(1);
    }, [debouncedSearch, categoryFilter, stockFilter, sortField, sortDirection]);

    // ============================================================
    // COMPUTED VALUES
    // ============================================================

    const inventoryProducts: InventoryProduct[] = useMemo(() => {
        return products.map((product) => {
            const inv = getInventoryValues(product.inventory);
            const physicalStock = calculatePhysicalStock(inv);
            const availableStock = calculateAvailableStock(physicalStock, inv.blockedStock);

            return {
                ...product,
                physicalStock,
                availableStock,
            };
        });
    }, [products]);

    const filteredProducts = useMemo(() => {
        let result = [...inventoryProducts];

        // Search filter
        if (debouncedSearch) {
            const search = debouncedSearch.toLowerCase();
            result = result.filter(
                (p) =>
                    p.name.toLowerCase().includes(search) ||
                    p.sku.toLowerCase().includes(search)
            );
        }

        // Category filter
        if (categoryFilter !== 'all') {
            result = result.filter((p) => p.category === categoryFilter);
        }

        // Stock filter
        if (stockFilter === 'in-stock') {
            result = result.filter((p) => p.availableStock > 0);
        } else if (stockFilter === 'low-stock') {
            result = result.filter((p) => p.availableStock > 0 && p.availableStock <= 10);
        } else if (stockFilter === 'out-of-stock') {
            result = result.filter((p) => p.availableStock <= 0);
        }

        // Sort
        result.sort((a, b) => {
            let aVal: any = a[sortField];
            let bVal: any = b[sortField];

            if (typeof aVal === 'string') {
                aVal = aVal.toLowerCase();
                bVal = bVal?.toLowerCase() || '';
            }

            if (sortDirection === 'asc') {
                return aVal > bVal ? 1 : -1;
            }
            return aVal < bVal ? 1 : -1;
        });

        return result;
    }, [inventoryProducts, debouncedSearch, categoryFilter, stockFilter, sortField, sortDirection]);

    const paginatedProducts = useMemo(() => {
        const start = (currentPage - 1) * rowsPerPage;
        return filteredProducts.slice(start, start + rowsPerPage);
    }, [filteredProducts, currentPage, rowsPerPage]);

    const totalPages = Math.ceil(filteredProducts.length / rowsPerPage);

    const categories = useMemo(() => {
        const cats = new Set<string>();
        products.forEach((p) => {
            if (p.category) cats.add(p.category);
        });
        return Array.from(cats).sort();
    }, [products]);

    // Stats
    const stats = useMemo(() => {
        const totalPhysical = inventoryProducts.reduce((sum, p) => sum + p.physicalStock, 0);
        const totalAvailable = inventoryProducts.reduce((sum, p) => sum + p.availableStock, 0);
        const totalBlocked = inventoryProducts.reduce((sum, p) => sum + (p.inventory?.blockedStock ?? 0), 0);
        const outOfStock = inventoryProducts.filter((p) => p.availableStock <= 0).length;
        const lowStock = inventoryProducts.filter((p) => p.availableStock > 0 && p.availableStock <= 10).length;

        return { totalPhysical, totalAvailable, totalBlocked, outOfStock, lowStock };
    }, [inventoryProducts]);

    // ============================================================
    // HANDLERS
    // ============================================================

    const handleSort = (field: typeof sortField) => {
        if (sortField === field) {
            setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortField(field);
            setSortDirection('asc');
        }
    };

    const handleOpenAdjustment = (product: InventoryProduct, type: AdjustmentType) => {
        // For deduction, check if physical stock > 0
        if (type === 'deduction' && product.physicalStock <= 0) {
            toast({
                title: 'Cannot Deduct',
                description: 'Physical stock must be greater than 0 to deduct',
                variant: 'destructive',
            });
            return;
        }

        setSelectedProduct(product);
        setAdjustmentType(type);
        setAdjustmentDialogOpen(true);
    };

    // ============================================================
    // LOADING / AUTH STATES
    // ============================================================

    if (authLoading) {
        return (
            <div className="flex items-center justify-center h-screen">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="text-muted-foreground">Loading...</p>
                </div>
            </div>
        );
    }

    if (!isAuthorized) {
        return null;
    }

    // ============================================================
    // RENDER
    // ============================================================

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4 md:p-6 border-b bg-gradient-to-r from-background via-background to-muted/30"
            >
                <div className="space-y-1">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-xl bg-gradient-to-br from-indigo-500/20 to-indigo-500/5 ring-1 ring-indigo-500/20">
                            <Warehouse className="h-6 w-6 text-indigo-600" />
                        </div>
                        <div>
                            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Stock Overview</h1>
                            <p className="text-sm text-muted-foreground">
                                Track and manage your inventory levels
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                    <Button
                        variant="outline"
                        asChild
                        className="gap-2"
                    >
                        <Link href={`/business/${businessId}/products`}>
                            <Package className="h-4 w-4" />
                            Products
                        </Link>
                    </Button>
                </div>
            </motion.div>

            {/* Stats Cards */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.1 }}
                className="grid grid-cols-2 md:grid-cols-5 gap-4 p-4 md:px-6"
            >
                <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-blue-500/10 via-blue-500/5 to-transparent">
                    <div className="absolute top-0 right-0 w-16 h-16 bg-blue-500/10 rounded-full -translate-y-1/2 translate-x-1/2" />
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                    Physical Stock
                                </p>
                                <p className="text-2xl font-bold mt-1">{stats.totalPhysical.toLocaleString()}</p>
                            </div>
                            <div className="p-2 rounded-lg bg-blue-500/10">
                                <Box className="h-5 w-5 text-blue-600" />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent">
                    <div className="absolute top-0 right-0 w-16 h-16 bg-emerald-500/10 rounded-full -translate-y-1/2 translate-x-1/2" />
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                    Available Stock
                                </p>
                                <p className="text-2xl font-bold mt-1">{stats.totalAvailable.toLocaleString()}</p>
                            </div>
                            <div className="p-2 rounded-lg bg-emerald-500/10">
                                <PackageCheck className="h-5 w-5 text-emerald-600" />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-transparent">
                    <div className="absolute top-0 right-0 w-16 h-16 bg-amber-500/10 rounded-full -translate-y-1/2 translate-x-1/2" />
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                    Blocked Stock
                                </p>
                                <p className="text-2xl font-bold mt-1">{stats.totalBlocked.toLocaleString()}</p>
                            </div>
                            <div className="p-2 rounded-lg bg-amber-500/10">
                                <ShieldCheck className="h-5 w-5 text-amber-600" />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-orange-500/10 via-orange-500/5 to-transparent">
                    <div className="absolute top-0 right-0 w-16 h-16 bg-orange-500/10 rounded-full -translate-y-1/2 translate-x-1/2" />
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                    Low Stock
                                </p>
                                <p className="text-2xl font-bold mt-1">{stats.lowStock}</p>
                            </div>
                            <div className="p-2 rounded-lg bg-orange-500/10">
                                <TrendingDown className="h-5 w-5 text-orange-600" />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-rose-500/10 via-rose-500/5 to-transparent">
                    <div className="absolute top-0 right-0 w-16 h-16 bg-rose-500/10 rounded-full -translate-y-1/2 translate-x-1/2" />
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                    Out of Stock
                                </p>
                                <p className="text-2xl font-bold mt-1">{stats.outOfStock}</p>
                            </div>
                            <div className="p-2 rounded-lg bg-rose-500/10">
                                <AlertCircle className="h-5 w-5 text-rose-600" />
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </motion.div>

            {/* Main Content */}
            <motion.div
                variants={cardVariants}
                initial="hidden"
                animate="visible"
                className="flex-1 p-4 md:px-6 md:pb-6 overflow-hidden"
            >
                <Card className="h-full flex flex-col shadow-xl shadow-black/5 border-0 ring-1 ring-border/50">
                    {/* Filters */}
                    <CardHeader className="pb-4 border-b bg-muted/30">
                        <div className="flex flex-col sm:flex-row gap-4">
                            {/* Search */}
                            <div className="relative flex-1">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Search by product name or SKU..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="pl-10 bg-background border-0 ring-1 ring-border/50 focus-visible:ring-2 focus-visible:ring-primary/50"
                                />
                                {searchQuery && (
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                                        onClick={() => setSearchQuery('')}
                                    >
                                        <X className="h-3 w-3" />
                                    </Button>
                                )}
                            </div>

                            {/* Category Filter */}
                            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                                <SelectTrigger className="w-full sm:w-[180px] bg-background border-0 ring-1 ring-border/50">
                                    <SelectValue placeholder="All Categories" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Categories</SelectItem>
                                    {categories.map((cat) => (
                                        <SelectItem key={cat} value={cat}>
                                            {cat}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>

                            {/* Stock Filter */}
                            <Select value={stockFilter} onValueChange={setStockFilter}>
                                <SelectTrigger className="w-full sm:w-[160px] bg-background border-0 ring-1 ring-border/50">
                                    <SelectValue placeholder="All Stock" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Stock</SelectItem>
                                    <SelectItem value="in-stock">
                                        <span className="flex items-center gap-2">
                                            <span className="h-2 w-2 rounded-full bg-emerald-500" />
                                            In Stock
                                        </span>
                                    </SelectItem>
                                    <SelectItem value="low-stock">
                                        <span className="flex items-center gap-2">
                                            <span className="h-2 w-2 rounded-full bg-amber-500" />
                                            Low Stock
                                        </span>
                                    </SelectItem>
                                    <SelectItem value="out-of-stock">
                                        <span className="flex items-center gap-2">
                                            <span className="h-2 w-2 rounded-full bg-rose-500" />
                                            Out of Stock
                                        </span>
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </CardHeader>

                    {/* Table */}
                    <CardContent className="flex-1 p-0 overflow-auto">
                        {loading ? (
                            <div className="p-6 space-y-4">
                                {[...Array(5)].map((_, i) => (
                                    <div key={i} className="flex items-center gap-4">
                                        <Skeleton className="h-10 w-10 rounded-lg" />
                                        <div className="flex-1 space-y-2">
                                            <Skeleton className="h-4 w-1/3" />
                                            <Skeleton className="h-3 w-1/4" />
                                        </div>
                                        <Skeleton className="h-6 w-16" />
                                        <Skeleton className="h-6 w-16" />
                                        <Skeleton className="h-6 w-16" />
                                    </div>
                                ))}
                            </div>
                        ) : products.length === 0 ? (
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="flex flex-col items-center justify-center py-20 px-4"
                            >
                                <div className="relative">
                                    <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/20 via-indigo-500/10 to-indigo-500/20 blur-3xl rounded-full" />
                                    <div className="relative p-6 rounded-full bg-gradient-to-br from-muted to-muted/50 ring-1 ring-border/50">
                                        <PackageOpen className="h-16 w-16 text-muted-foreground" />
                                    </div>
                                </div>
                                <h3 className="mt-6 text-xl font-semibold">No products yet</h3>
                                <p className="mt-2 text-muted-foreground text-center max-w-sm">
                                    Add products to your catalog to start managing inventory.
                                </p>
                                <Button asChild className="mt-6 gap-2">
                                    <Link href={`/business/${businessId}/products`}>
                                        <Package className="h-4 w-4" />
                                        Go to Products
                                    </Link>
                                </Button>
                            </motion.div>
                        ) : filteredProducts.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-20 px-4">
                                <Search className="h-12 w-12 text-muted-foreground/50" />
                                <h3 className="mt-4 text-lg font-medium">No results found</h3>
                                <p className="mt-1 text-muted-foreground">
                                    Try adjusting your search or filters
                                </p>
                                <Button
                                    variant="outline"
                                    className="mt-4"
                                    onClick={() => {
                                        setSearchQuery('');
                                        setCategoryFilter('all');
                                        setStockFilter('all');
                                    }}
                                >
                                    Clear Filters
                                </Button>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <Table>
                                    <TableHeader className="bg-muted/50 sticky top-0 z-10">
                                        <TableRow className="hover:bg-transparent">
                                            <TableHead className="min-w-[200px]">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="-ml-3 h-8 gap-1 font-semibold"
                                                    onClick={() => handleSort('name')}
                                                >
                                                    Product
                                                    <ArrowUpDown className="h-3 w-3" />
                                                </Button>
                                            </TableHead>
                                            <TableHead className="text-center min-w-[90px]">
                                                <TooltipProvider>
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <span className="flex items-center justify-center gap-1 cursor-help">
                                                                Opening
                                                                <Info className="h-3 w-3 text-muted-foreground" />
                                                            </span>
                                                        </TooltipTrigger>
                                                        <TooltipContent>
                                                            <p>Initial stock when product was created</p>
                                                        </TooltipContent>
                                                    </Tooltip>
                                                </TooltipProvider>
                                            </TableHead>
                                            <TableHead className="text-center min-w-[100px]">
                                                <TooltipProvider>
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <span className="flex items-center justify-center gap-1 cursor-help text-emerald-600">
                                                                <TrendingUp className="h-3 w-3" />
                                                                Inward
                                                            </span>
                                                        </TooltipTrigger>
                                                        <TooltipContent>
                                                            <p>Manually added stock (click to edit)</p>
                                                        </TooltipContent>
                                                    </Tooltip>
                                                </TooltipProvider>
                                            </TableHead>
                                            <TableHead className="text-center min-w-[100px]">
                                                <TooltipProvider>
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <span className="flex items-center justify-center gap-1 cursor-help text-rose-600">
                                                                <TrendingDown className="h-3 w-3" />
                                                                Deduction
                                                            </span>
                                                        </TooltipTrigger>
                                                        <TooltipContent>
                                                            <p>Manually deducted stock (click to edit)</p>
                                                        </TooltipContent>
                                                    </Tooltip>
                                                </TooltipProvider>
                                            </TableHead>
                                            <TableHead className="text-center min-w-[90px]">
                                                <TooltipProvider>
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <span className="flex items-center justify-center gap-1 cursor-help text-blue-600">
                                                                Auto +
                                                            </span>
                                                        </TooltipTrigger>
                                                        <TooltipContent>
                                                            <p>Auto-added from cancelled/returned orders</p>
                                                        </TooltipContent>
                                                    </Tooltip>
                                                </TooltipProvider>
                                            </TableHead>
                                            <TableHead className="text-center min-w-[90px]">
                                                <TooltipProvider>
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <span className="flex items-center justify-center gap-1 cursor-help text-violet-600">
                                                                Auto −
                                                            </span>
                                                        </TooltipTrigger>
                                                        <TooltipContent>
                                                            <p>Auto-deducted from fulfilled orders</p>
                                                        </TooltipContent>
                                                    </Tooltip>
                                                </TooltipProvider>
                                            </TableHead>
                                            <TableHead className="text-center min-w-[100px]">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-8 gap-1 font-semibold"
                                                    onClick={() => handleSort('physicalStock')}
                                                >
                                                    Physical
                                                    <ArrowUpDown className="h-3 w-3" />
                                                </Button>
                                            </TableHead>
                                            <TableHead className="text-center min-w-[90px]">
                                                <TooltipProvider>
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <span className="flex items-center justify-center gap-1 cursor-help text-amber-600">
                                                                Blocked
                                                            </span>
                                                        </TooltipTrigger>
                                                        <TooltipContent>
                                                            <p>Reserved for pending orders</p>
                                                        </TooltipContent>
                                                    </Tooltip>
                                                </TooltipProvider>
                                            </TableHead>
                                            <TableHead className="text-center min-w-[100px]">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-8 gap-1 font-semibold"
                                                    onClick={() => handleSort('availableStock')}
                                                >
                                                    Available
                                                    <ArrowUpDown className="h-3 w-3" />
                                                </Button>
                                            </TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        <AnimatePresence mode="popLayout">
                                            {paginatedProducts.map((product, index) => {
                                                const inv = getInventoryValues(product.inventory);
                                                const stockStatus = product.availableStock <= 0
                                                    ? 'out'
                                                    : product.availableStock <= 10
                                                        ? 'low'
                                                        : 'ok';

                                                return (
                                                    <motion.tr
                                                        key={product.id}
                                                        custom={index}
                                                        variants={tableRowVariants}
                                                        initial="hidden"
                                                        animate="visible"
                                                        exit="exit"
                                                        layout
                                                        className="group border-b transition-colors hover:bg-muted/50"
                                                    >
                                                        <TableCell className="py-3">
                                                            <div className="flex items-center gap-3">
                                                                <div className={cn(
                                                                    'flex h-10 w-10 items-center justify-center rounded-lg ring-1 transition-all',
                                                                    stockStatus === 'out'
                                                                        ? 'bg-rose-500/10 ring-rose-500/20'
                                                                        : stockStatus === 'low'
                                                                            ? 'bg-amber-500/10 ring-amber-500/20'
                                                                            : 'bg-emerald-500/10 ring-emerald-500/20'
                                                                )}>
                                                                    <Package className={cn(
                                                                        'h-5 w-5',
                                                                        stockStatus === 'out'
                                                                            ? 'text-rose-600'
                                                                            : stockStatus === 'low'
                                                                                ? 'text-amber-600'
                                                                                : 'text-emerald-600'
                                                                    )} />
                                                                </div>
                                                                <div>
                                                                    <p className="font-medium leading-none">
                                                                        {product.name}
                                                                    </p>
                                                                    <code className="text-xs text-muted-foreground mt-1">
                                                                        {product.sku}
                                                                    </code>
                                                                </div>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="text-center font-medium tabular-nums">
                                                            {inv.openingStock}
                                                        </TableCell>
                                                        <TableCell className="text-center">
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                className="h-8 gap-1 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-500/10"
                                                                onClick={() => handleOpenAdjustment(product, 'inward')}
                                                            >
                                                                <Plus className="h-3 w-3" />
                                                                {inv.inwardAddition}
                                                            </Button>
                                                        </TableCell>
                                                        <TableCell className="text-center">
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                className={cn(
                                                                    'h-8 gap-1',
                                                                    product.physicalStock > 0
                                                                        ? 'text-rose-600 hover:text-rose-700 hover:bg-rose-500/10'
                                                                        : 'text-muted-foreground cursor-not-allowed'
                                                                )}
                                                                onClick={() => handleOpenAdjustment(product, 'deduction')}
                                                                disabled={product.physicalStock <= 0}
                                                            >
                                                                <Minus className="h-3 w-3" />
                                                                {inv.deduction}
                                                            </Button>
                                                        </TableCell>
                                                        <TableCell className="text-center font-medium tabular-nums text-blue-600">
                                                            {inv.autoAddition > 0 ? `+${inv.autoAddition}` : inv.autoAddition}
                                                        </TableCell>
                                                        <TableCell className="text-center font-medium tabular-nums text-violet-600">
                                                            {inv.autoDeduction > 0 ? `-${inv.autoDeduction}` : inv.autoDeduction}
                                                        </TableCell>
                                                        <TableCell className="text-center">
                                                            <span className={cn(
                                                                'font-bold tabular-nums',
                                                                product.physicalStock <= 0 && 'text-rose-600'
                                                            )}>
                                                                {product.physicalStock}
                                                            </span>
                                                        </TableCell>
                                                        <TableCell className="text-center font-medium tabular-nums text-amber-600">
                                                            {inv.blockedStock}
                                                        </TableCell>
                                                        <TableCell className="text-center">
                                                            <Badge
                                                                variant="outline"
                                                                className={cn(
                                                                    'font-bold tabular-nums',
                                                                    stockStatus === 'out'
                                                                        ? 'bg-rose-500/10 text-rose-700 border-rose-500/20'
                                                                        : stockStatus === 'low'
                                                                            ? 'bg-amber-500/10 text-amber-700 border-amber-500/20'
                                                                            : 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20'
                                                                )}
                                                            >
                                                                {product.availableStock}
                                                            </Badge>
                                                        </TableCell>
                                                    </motion.tr>
                                                );
                                            })}
                                        </AnimatePresence>
                                    </TableBody>
                                </Table>
                            </div>
                        )}
                    </CardContent>

                    {/* Pagination */}
                    {filteredProducts.length > 0 && (
                        <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/30">
                            <p className="text-sm text-muted-foreground">
                                Showing{' '}
                                <span className="font-medium">
                                    {(currentPage - 1) * rowsPerPage + 1}
                                </span>{' '}
                                to{' '}
                                <span className="font-medium">
                                    {Math.min(currentPage * rowsPerPage, filteredProducts.length)}
                                </span>{' '}
                                of <span className="font-medium">{filteredProducts.length}</span> products
                            </p>

                            <div className="flex items-center gap-2">
                                <Select
                                    value={rowsPerPage.toString()}
                                    onValueChange={(v) => setRowsPerPage(Number(v))}
                                >
                                    <SelectTrigger className="w-[70px] h-8">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="10">10</SelectItem>
                                        <SelectItem value="25">25</SelectItem>
                                        <SelectItem value="50">50</SelectItem>
                                        <SelectItem value="100">100</SelectItem>
                                    </SelectContent>
                                </Select>

                                <div className="flex items-center gap-1">
                                    <Button
                                        variant="outline"
                                        size="icon"
                                        className="h-8 w-8"
                                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                                        disabled={currentPage === 1}
                                    >
                                        <ChevronLeft className="h-4 w-4" />
                                    </Button>
                                    <span className="text-sm font-medium px-2">
                                        {currentPage} / {totalPages || 1}
                                    </span>
                                    <Button
                                        variant="outline"
                                        size="icon"
                                        className="h-8 w-8"
                                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                                        disabled={currentPage >= totalPages}
                                    >
                                        <ChevronRight className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        </div>
                    )}
                </Card>
            </motion.div>

            {/* Adjustment Dialog */}
            <AdjustmentDialog
                open={adjustmentDialogOpen}
                onOpenChange={setAdjustmentDialogOpen}
                product={selectedProduct}
                type={adjustmentType}
                user={user}
                businessId={businessId}
            />
        </div>
    );
}