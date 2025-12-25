// /business/[businessId]/products/from-stores/page.tsx
'use client';

import React, { useState, useEffect, useMemo, Suspense } from 'react';
import { useBusinessContext } from '../../layout';
import { db, auth } from '@/lib/firebase';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import Link from 'next/link';
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
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { useDebounce } from 'use-debounce';
import {
    Package,
    Search,
    MoreHorizontal,
    ExternalLink,
    Store,
    Tag,
    Layers,
    ArrowUpDown,
    Filter,
    X,
    ChevronLeft,
    ChevronRight,
    Loader2,
    PackageOpen,
    Image as ImageIcon,
    Box,
    Barcode,
    Eye,
    RefreshCw,
    Download,
    CheckCircle2,
    AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

// ============================================================
// TYPES
// ============================================================

interface ProductVariant {
    id: number;
    title: string;
    sku: string | null;
    barcode: string | null;
    price: number | null;
    compareAtPrice: number | null;
    inventoryQuantity: number | null;
    option1: string | null;
    option2: string | null;
    option3: string | null;
    weight: number | null;
    weightUnit: string | null;
}

interface ProductImage {
    id: number;
    src: string;
    alt: string | null;
    width: number;
    height: number;
}

interface StoreProduct {
    id: string; // Document ID (productId)
    productId: number;
    storeId: string;
    title: string;
    handle: string;
    bodyHtml: string | null;
    vendor: string | null;
    productType: string | null;
    tags: string[];
    status: 'active' | 'draft' | 'archived';
    variants: ProductVariant[];
    variantCount: number;
    skus: string[];
    images: ProductImage[];
    featuredImage: ProductImage | null;
    options: { name: string; values: string[] }[];
    shopifyCreatedAt: string;
    shopifyUpdatedAt: string;
    isDeleted?: boolean;
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
            duration: 0.3,
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
// HELPER FUNCTIONS
// ============================================================

function formatStoreName(storeId: string): string {
    // Convert "cool-store.myshopify.com" to "Cool Store"
    return storeId
        .replace('.myshopify.com', '')
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

function formatDate(dateString: string): string {
    if (!dateString) return '—';
    return new Date(dateString).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    });
}

function formatPrice(price: number | null): string {
    if (price === null || price === undefined) return '—';
    return `₹${price.toLocaleString('en-IN')}`;
}

function getTotalInventory(variants: ProductVariant[]): number {
    return variants.reduce((sum, v) => sum + (v.inventoryQuantity || 0), 0);
}

function getPriceRange(variants: ProductVariant[]): string {
    const prices = variants
        .map(v => v.price)
        .filter((p): p is number => p !== null && p !== undefined);

    if (prices.length === 0) return '—';

    const min = Math.min(...prices);
    const max = Math.max(...prices);

    if (min === max) return formatPrice(min);
    return `${formatPrice(min)} - ${formatPrice(max)}`;
}

function getStatusColor(status: string): string {
    switch (status) {
        case 'active':
            return 'bg-emerald-500/10 text-emerald-600 border-emerald-200';
        case 'draft':
            return 'bg-amber-500/10 text-amber-600 border-amber-200';
        case 'archived':
            return 'bg-gray-500/10 text-gray-600 border-gray-200';
        default:
            return 'bg-gray-500/10 text-gray-600 border-gray-200';
    }
}

// ============================================================
// PRODUCT DETAIL DIALOG
// ============================================================

function ProductDetailDialog({
    product,
    open,
    onOpenChange,
}: {
    product: StoreProduct | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}) {
    if (!product) return null;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
                <DialogHeader>
                    <div className="flex items-start gap-4">
                        {product.featuredImage ? (
                            <img
                                src={product.featuredImage.src}
                                alt={product.featuredImage.alt || product.title}
                                className="w-20 h-20 object-cover rounded-lg border"
                            />
                        ) : (
                            <div className="w-20 h-20 rounded-lg border bg-muted flex items-center justify-center">
                                <ImageIcon className="h-8 w-8 text-muted-foreground" />
                            </div>
                        )}
                        <div className="flex-1 min-w-0">
                            <DialogTitle className="text-xl">{product.title}</DialogTitle>
                            <DialogDescription className="mt-1">
                                <span className="flex items-center gap-2 flex-wrap">
                                    <Badge variant="outline" className={getStatusColor(product.status)}>
                                        {product.status}
                                    </Badge>
                                    {product.vendor && (
                                        <Badge variant="secondary">{product.vendor}</Badge>
                                    )}
                                    {product.productType && (
                                        <Badge variant="outline">{product.productType}</Badge>
                                    )}
                                </span>
                            </DialogDescription>
                        </div>
                    </div>
                </DialogHeader>

                <ScrollArea className="flex-1 -mx-6 px-6">
                    <div className="space-y-6 py-4">
                        {/* Store Info */}
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Store className="h-4 w-4" />
                            <span>{formatStoreName(product.storeId)}</span>
                            <span className="text-muted-foreground/50">•</span>
                            <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                                {product.storeId}
                            </code>
                        </div>

                        {/* Tags */}
                        {product.tags.length > 0 && (
                            <div>
                                <h4 className="text-sm font-medium mb-2">Tags</h4>
                                <div className="flex flex-wrap gap-1.5">
                                    {product.tags.map((tag, idx) => (
                                        <Badge key={idx} variant="outline" className="text-xs">
                                            {tag}
                                        </Badge>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Variants Table */}
                        <div>
                            <h4 className="text-sm font-medium mb-2">
                                Variants ({product.variantCount})
                            </h4>
                            <div className="border rounded-lg overflow-hidden">
                                <Table>
                                    <TableHeader>
                                        <TableRow className="bg-muted/50">
                                            <TableHead>Variant</TableHead>
                                            <TableHead>SKU</TableHead>
                                            <TableHead className="text-right">Price</TableHead>
                                            <TableHead className="text-right">Stock</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {product.variants.map((variant) => (
                                            <TableRow key={variant.id}>
                                                <TableCell className="font-medium">
                                                    {variant.title}
                                                    {variant.option1 && variant.title === 'Default Title' && (
                                                        <span className="text-muted-foreground ml-1">
                                                            ({variant.option1}
                                                            {variant.option2 && ` / ${variant.option2}`}
                                                            {variant.option3 && ` / ${variant.option3}`})
                                                        </span>
                                                    )}
                                                </TableCell>
                                                <TableCell>
                                                    {variant.sku ? (
                                                        <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                                                            {variant.sku}
                                                        </code>
                                                    ) : (
                                                        <span className="text-muted-foreground">—</span>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    {formatPrice(variant.price)}
                                                    {variant.compareAtPrice && variant.compareAtPrice > (variant.price || 0) && (
                                                        <span className="text-xs text-muted-foreground line-through ml-1">
                                                            {formatPrice(variant.compareAtPrice)}
                                                        </span>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <span className={cn(
                                                        "font-medium",
                                                        (variant.inventoryQuantity || 0) <= 0 && "text-red-600",
                                                        (variant.inventoryQuantity || 0) > 0 && (variant.inventoryQuantity || 0) <= 10 && "text-amber-600"
                                                    )}>
                                                        {variant.inventoryQuantity ?? '—'}
                                                    </span>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        </div>

                        {/* Images */}
                        {product.images.length > 0 && (
                            <div>
                                <h4 className="text-sm font-medium mb-2">
                                    Images ({product.images.length})
                                </h4>
                                <div className="grid grid-cols-4 gap-2">
                                    {product.images.map((img) => (
                                        <img
                                            key={img.id}
                                            src={img.src}
                                            alt={img.alt || product.title}
                                            className="w-full aspect-square object-cover rounded-lg border"
                                        />
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Metadata */}
                        <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                                <span className="text-muted-foreground">Created on Shopify</span>
                                <p className="font-medium">{formatDate(product.shopifyCreatedAt)}</p>
                            </div>
                            <div>
                                <span className="text-muted-foreground">Last updated</span>
                                <p className="font-medium">{formatDate(product.shopifyUpdatedAt)}</p>
                            </div>
                        </div>
                    </div>
                </ScrollArea>
            </DialogContent>
        </Dialog>
    );
}

// ============================================================
// MAIN COMPONENT
// ============================================================

function StoreProductsContent() {
    const { isAuthorized, loading: authLoading, user, businessId, stores } = useBusinessContext();
    const { toast } = useToast();

    // Data state
    const [products, setProducts] = useState<StoreProduct[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingStores, setLoadingStores] = useState<Set<string>>(new Set());

    // UI state
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearch] = useDebounce(searchQuery, 300);
    const [storeFilter, setStoreFilter] = useState<string>('all');
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [vendorFilter, setVendorFilter] = useState<string>('all');
    const [sortField, setSortField] = useState<'title' | 'vendor' | 'updatedAt' | 'inventory'>('updatedAt');
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
    const [currentPage, setCurrentPage] = useState(1);
    const [rowsPerPage, setRowsPerPage] = useState(25);

    // Dialog state
    const [selectedProduct, setSelectedProduct] = useState<StoreProduct | null>(null);
    const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);

    // Sync state
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncingStore, setSyncingStore] = useState<string | null>(null);
    const [isSyncDialogOpen, setIsSyncDialogOpen] = useState(false);
    const [syncResult, setSyncResult] = useState<{
        success: boolean;
        store: string;
        stats?: { total: number; created: number; updated: number; deleted: number; errors: number };
        error?: string;
    } | null>(null);

    // ============================================================
    // EFFECTS
    // ============================================================

    useEffect(() => {
        document.title = 'Store Products - Business Dashboard';
    }, []);

    // Fetch products from all stores
    useEffect(() => {
        if (!authLoading && isAuthorized && stores && stores.length > 0) {
            setLoading(true);
            setLoadingStores(new Set(stores));

            const unsubscribes: (() => void)[] = [];

            stores.forEach((storeId) => {
                const productsRef = collection(db, 'accounts', storeId, 'products');
                const q = query(productsRef, where('isDeleted', '==', false));

                const unsubscribe = onSnapshot(
                    q,
                    (snapshot) => {
                        const storeProducts = snapshot.docs.map((doc) => ({
                            id: doc.id,
                            storeId,
                            ...doc.data(),
                        })) as StoreProduct[];

                        setProducts((prev) => {
                            // Remove old products from this store and add new ones
                            const filtered = prev.filter((p) => p.storeId !== storeId);
                            return [...filtered, ...storeProducts];
                        });

                        setLoadingStores((prev) => {
                            const next = new Set(prev);
                            next.delete(storeId);
                            return next;
                        });
                    },
                    (error) => {
                        console.error(`Error fetching products from ${storeId}:`, error);
                        toast({
                            title: 'Error',
                            description: `Failed to load products from ${formatStoreName(storeId)}`,
                            variant: 'destructive',
                        });
                        setLoadingStores((prev) => {
                            const next = new Set(prev);
                            next.delete(storeId);
                            return next;
                        });
                    }
                );

                unsubscribes.push(unsubscribe);
            });

            // Set loading to false once all stores have been processed
            const checkLoading = setInterval(() => {
                setLoadingStores((current) => {
                    if (current.size === 0) {
                        setLoading(false);
                        clearInterval(checkLoading);
                    }
                    return current;
                });
            }, 100);

            return () => {
                unsubscribes.forEach((unsub) => unsub());
                clearInterval(checkLoading);
            };
        } else if (!authLoading && stores?.length === 0) {
            setLoading(false);
        }
    }, [authLoading, isAuthorized, stores, toast]);

    // Reset page when filters change
    useEffect(() => {
        setCurrentPage(1);
    }, [debouncedSearch, storeFilter, statusFilter, vendorFilter, sortField, sortDirection]);

    // ============================================================
    // COMPUTED VALUES
    // ============================================================

    const vendors = useMemo(() => {
        const vendorSet = new Set<string>();
        products.forEach((p) => {
            if (p.vendor) vendorSet.add(p.vendor);
        });
        return Array.from(vendorSet).sort();
    }, [products]);

    const storeCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        products.forEach((p) => {
            counts[p.storeId] = (counts[p.storeId] || 0) + 1;
        });
        return counts;
    }, [products]);

    const filteredProducts = useMemo(() => {
        let result = [...products];

        // Search filter
        if (debouncedSearch) {
            const search = debouncedSearch.toLowerCase();
            result = result.filter(
                (p) =>
                    p.title.toLowerCase().includes(search) ||
                    p.vendor?.toLowerCase().includes(search) ||
                    p.productType?.toLowerCase().includes(search) ||
                    p.skus.some((sku) => sku.toLowerCase().includes(search)) ||
                    p.tags.some((tag) => tag.toLowerCase().includes(search))
            );
        }

        // Store filter
        if (storeFilter !== 'all') {
            result = result.filter((p) => p.storeId === storeFilter);
        }

        // Status filter
        if (statusFilter !== 'all') {
            result = result.filter((p) => p.status === statusFilter);
        }

        // Vendor filter
        if (vendorFilter !== 'all') {
            result = result.filter((p) => p.vendor === vendorFilter);
        }

        // Sort
        result.sort((a, b) => {
            let aVal: any;
            let bVal: any;

            switch (sortField) {
                case 'title':
                    aVal = a.title.toLowerCase();
                    bVal = b.title.toLowerCase();
                    break;
                case 'vendor':
                    aVal = (a.vendor || '').toLowerCase();
                    bVal = (b.vendor || '').toLowerCase();
                    break;
                case 'updatedAt':
                    aVal = new Date(a.shopifyUpdatedAt).getTime();
                    bVal = new Date(b.shopifyUpdatedAt).getTime();
                    break;
                case 'inventory':
                    aVal = getTotalInventory(a.variants);
                    bVal = getTotalInventory(b.variants);
                    break;
                default:
                    return 0;
            }

            if (sortDirection === 'asc') {
                return aVal > bVal ? 1 : -1;
            }
            return aVal < bVal ? 1 : -1;
        });

        return result;
    }, [products, debouncedSearch, storeFilter, statusFilter, vendorFilter, sortField, sortDirection]);

    const paginatedProducts = useMemo(() => {
        const start = (currentPage - 1) * rowsPerPage;
        return filteredProducts.slice(start, start + rowsPerPage);
    }, [filteredProducts, currentPage, rowsPerPage]);

    const totalPages = Math.ceil(filteredProducts.length / rowsPerPage);

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

    const handleViewProduct = (product: StoreProduct) => {
        setSelectedProduct(product);
        setIsDetailDialogOpen(true);
    };

    const clearFilters = () => {
        setSearchQuery('');
        setStoreFilter('all');
        setStatusFilter('all');
        setVendorFilter('all');
    };

    const hasActiveFilters = searchQuery || storeFilter !== 'all' || statusFilter !== 'all' || vendorFilter !== 'all';

    const handleSyncProducts = async (storeId: string) => {
        if (!user || !businessId) {
            toast({
                title: 'Error',
                description: 'You must be logged in to sync products.',
                variant: 'destructive',
            });
            return;
        }

        setIsSyncing(true);
        setSyncingStore(storeId);
        setSyncResult(null);

        try {
            const idToken = await user.getIdToken();

            const response = await fetch('/api/shopify/products/sync', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`,
                },
                body: JSON.stringify({
                    businessId,
                    store: storeId,
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || data.error || 'Failed to sync products');
            }

            setSyncResult({
                success: true,
                store: storeId,
                stats: data.stats,
            });

            toast({
                title: 'Sync Complete',
                description: `Synced ${data.stats.total} products from ${formatStoreName(storeId)}`,
            });
        } catch (error: any) {
            console.error('Sync error:', error);

            setSyncResult({
                success: false,
                store: storeId,
                error: error.message || 'An unexpected error occurred',
            });

            toast({
                title: 'Sync Failed',
                description: error.message || 'Failed to sync products from store.',
                variant: 'destructive',
            });
        } finally {
            setIsSyncing(false);
            setSyncingStore(null);
        }
    };

    const handleSyncAllStores = async () => {
        if (!stores || stores.length === 0) return;

        setIsSyncDialogOpen(false);

        for (const storeId of stores) {
            await handleSyncProducts(storeId);
        }
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
                        <Button
                            variant="outline"
                            size="icon"
                            asChild
                            className="h-9 w-9"
                        >
                            <Link href={`/business/${businessId}/dashboard/orders`}>
                                <ChevronLeft className="h-4 w-4" />
                            </Link>
                        </Button>
                        <div className="p-2 rounded-xl bg-primary/10 ring-1 ring-primary/20">
                            <Store className="h-6 w-6 text-primary" />
                        </div>
                        <div>
                            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Store Products</h1>
                            <p className="text-sm text-muted-foreground">
                                Products synced from your Shopify stores
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Box className="h-4 w-4" />
                        <span>
                            {products.length} products from {stores?.length || 0} stores
                        </span>
                    </div>

                    {/* Sync Button */}
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={isSyncing || !stores || stores.length === 0}
                                className="gap-2"
                            >
                                {isSyncing ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <RefreshCw className="h-4 w-4" />
                                )}
                                {isSyncing ? `Syncing ${formatStoreName(syncingStore || '')}...` : 'Sync Products'}
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56">
                            <DropdownMenuLabel>Select Store to Sync</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            {stores?.map((storeId) => (
                                <DropdownMenuItem
                                    key={storeId}
                                    onClick={() => handleSyncProducts(storeId)}
                                    disabled={isSyncing}
                                    className="gap-2"
                                >
                                    <Store className="h-4 w-4" />
                                    {formatStoreName(storeId)}
                                    {syncingStore === storeId && (
                                        <Loader2 className="h-3 w-3 animate-spin ml-auto" />
                                    )}
                                </DropdownMenuItem>
                            ))}
                            {stores && stores.length > 1 && (
                                <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                        onClick={() => setIsSyncDialogOpen(true)}
                                        disabled={isSyncing}
                                        className="gap-2"
                                    >
                                        <Download className="h-4 w-4" />
                                        Sync All Stores
                                    </DropdownMenuItem>
                                </>
                            )}
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </motion.div>

            {/* Stats Cards */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.1 }}
                className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 md:px-6"
            >
                <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-blue-500/10 via-blue-500/5 to-transparent">
                    <div className="absolute top-0 right-0 w-20 h-20 bg-blue-500/10 rounded-full -translate-y-1/2 translate-x-1/2" />
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                    Total Products
                                </p>
                                <p className="text-2xl font-bold mt-1">{products.length}</p>
                            </div>
                            <div className="p-2 rounded-lg bg-blue-500/10">
                                <Package className="h-5 w-5 text-blue-600" />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent">
                    <div className="absolute top-0 right-0 w-20 h-20 bg-emerald-500/10 rounded-full -translate-y-1/2 translate-x-1/2" />
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                    Stores
                                </p>
                                <p className="text-2xl font-bold mt-1">{stores?.length || 0}</p>
                            </div>
                            <div className="p-2 rounded-lg bg-emerald-500/10">
                                <Store className="h-5 w-5 text-emerald-600" />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-transparent">
                    <div className="absolute top-0 right-0 w-20 h-20 bg-amber-500/10 rounded-full -translate-y-1/2 translate-x-1/2" />
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                    Vendors
                                </p>
                                <p className="text-2xl font-bold mt-1">{vendors.length}</p>
                            </div>
                            <div className="p-2 rounded-lg bg-amber-500/10">
                                <Tag className="h-5 w-5 text-amber-600" />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-violet-500/10 via-violet-500/5 to-transparent">
                    <div className="absolute top-0 right-0 w-20 h-20 bg-violet-500/10 rounded-full -translate-y-1/2 translate-x-1/2" />
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                    Filtered
                                </p>
                                <p className="text-2xl font-bold mt-1">{filteredProducts.length}</p>
                            </div>
                            <div className="p-2 rounded-lg bg-violet-500/10">
                                <Filter className="h-5 w-5 text-violet-600" />
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
                        <div className="flex flex-col gap-4">
                            {/* Search */}
                            <div className="relative flex-1">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Search by title, SKU, vendor, or tags..."
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

                            {/* Filter Row */}
                            <div className="flex flex-wrap gap-2">
                                {/* Store Filter */}
                                <Select value={storeFilter} onValueChange={setStoreFilter}>
                                    <SelectTrigger className="w-[200px] bg-background border-0 ring-1 ring-border/50">
                                        <Store className="h-4 w-4 mr-2 text-muted-foreground" />
                                        <SelectValue placeholder="All Stores" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All Stores</SelectItem>
                                        {stores?.map((store) => (
                                            <SelectItem key={store} value={store}>
                                                {formatStoreName(store)}{' '}
                                                {storeCounts[store] && (
                                                    <span className="text-muted-foreground">
                                                        ({storeCounts[store]})
                                                    </span>
                                                )}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>

                                {/* Status Filter */}
                                <Select value={statusFilter} onValueChange={setStatusFilter}>
                                    <SelectTrigger className="w-[140px] bg-background border-0 ring-1 ring-border/50">
                                        <SelectValue placeholder="All Status" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All Status</SelectItem>
                                        <SelectItem value="active">Active</SelectItem>
                                        <SelectItem value="draft">Draft</SelectItem>
                                        <SelectItem value="archived">Archived</SelectItem>
                                    </SelectContent>
                                </Select>

                                {/* Vendor Filter */}
                                {vendors.length > 0 && (
                                    <Select value={vendorFilter} onValueChange={setVendorFilter}>
                                        <SelectTrigger className="w-[180px] bg-background border-0 ring-1 ring-border/50">
                                            <SelectValue placeholder="All Vendors" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">All Vendors</SelectItem>
                                            {vendors.map((vendor) => (
                                                <SelectItem key={vendor} value={vendor}>
                                                    {vendor}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                )}

                                {/* Clear Filters */}
                                {hasActiveFilters && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={clearFilters}
                                        className="text-muted-foreground"
                                    >
                                        <X className="h-4 w-4 mr-1" />
                                        Clear
                                    </Button>
                                )}
                            </div>
                        </div>
                    </CardHeader>

                    {/* Table */}
                    <CardContent className="flex-1 p-0 overflow-auto">
                        {loading ? (
                            <div className="p-6 space-y-4">
                                {[...Array(8)].map((_, i) => (
                                    <div key={i} className="flex items-center gap-4">
                                        <Skeleton className="h-12 w-12 rounded-lg" />
                                        <div className="flex-1 space-y-2">
                                            <Skeleton className="h-4 w-1/3" />
                                            <Skeleton className="h-3 w-1/4" />
                                        </div>
                                        <Skeleton className="h-6 w-20 rounded-full" />
                                        <Skeleton className="h-4 w-16" />
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
                                    <div className="absolute inset-0 bg-gradient-to-r from-primary/20 via-primary/10 to-primary/20 blur-3xl rounded-full" />
                                    <div className="relative p-6 rounded-full bg-gradient-to-br from-muted to-muted/50 ring-1 ring-border/50">
                                        <PackageOpen className="h-16 w-16 text-muted-foreground" />
                                    </div>
                                </div>
                                <h3 className="mt-6 text-xl font-semibold">No products synced yet</h3>
                                <p className="mt-2 text-muted-foreground text-center max-w-sm">
                                    Products will appear here once they are synced from your Shopify stores via webhooks.
                                </p>
                            </motion.div>
                        ) : filteredProducts.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-20 px-4">
                                <Search className="h-12 w-12 text-muted-foreground/50" />
                                <h3 className="mt-4 text-lg font-medium">No results found</h3>
                                <p className="mt-1 text-muted-foreground">
                                    Try adjusting your search or filters
                                </p>
                                <Button variant="outline" className="mt-4" onClick={clearFilters}>
                                    Clear Filters
                                </Button>
                            </div>
                        ) : (
                            <Table>
                                <TableHeader className="bg-muted/50 sticky top-0">
                                    <TableRow className="hover:bg-transparent">
                                        <TableHead className="w-[350px]">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="-ml-3 h-8 gap-1 font-semibold"
                                                onClick={() => handleSort('title')}
                                            >
                                                Product
                                                <ArrowUpDown className="h-3 w-3" />
                                            </Button>
                                        </TableHead>
                                        <TableHead>Store</TableHead>
                                        <TableHead>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="-ml-3 h-8 gap-1 font-semibold"
                                                onClick={() => handleSort('vendor')}
                                            >
                                                Vendor
                                                <ArrowUpDown className="h-3 w-3" />
                                            </Button>
                                        </TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead className="text-right">Price</TableHead>
                                        <TableHead className="text-right">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="-ml-3 h-8 gap-1 font-semibold"
                                                onClick={() => handleSort('inventory')}
                                            >
                                                Inventory
                                                <ArrowUpDown className="h-3 w-3" />
                                            </Button>
                                        </TableHead>
                                        <TableHead>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="-ml-3 h-8 gap-1 font-semibold"
                                                onClick={() => handleSort('updatedAt')}
                                            >
                                                Updated
                                                <ArrowUpDown className="h-3 w-3" />
                                            </Button>
                                        </TableHead>
                                        <TableHead className="w-[60px]">
                                            <span className="sr-only">Actions</span>
                                        </TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    <AnimatePresence mode="popLayout">
                                        {paginatedProducts.map((product, index) => {
                                            const totalInventory = getTotalInventory(product.variants);
                                            return (
                                                <motion.tr
                                                    key={`${product.storeId}-${product.id}`}
                                                    custom={index}
                                                    variants={tableRowVariants}
                                                    initial="hidden"
                                                    animate="visible"
                                                    exit="exit"
                                                    layout
                                                    className="group border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted"
                                                >
                                                    <TableCell className="py-3">
                                                        <div className="flex items-center gap-3">
                                                            {product.featuredImage ? (
                                                                <img
                                                                    src={product.featuredImage.src}
                                                                    alt={product.title}
                                                                    className="h-12 w-12 rounded-lg object-cover border"
                                                                />
                                                            ) : (
                                                                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted border">
                                                                    <ImageIcon className="h-5 w-5 text-muted-foreground" />
                                                                </div>
                                                            )}
                                                            <div className="min-w-0">
                                                                <p className="font-medium leading-none truncate max-w-[250px]">
                                                                    {product.title}
                                                                </p>
                                                                <p className="text-xs text-muted-foreground mt-1">
                                                                    {product.variantCount} variant{product.variantCount !== 1 && 's'}
                                                                    {product.skus.length > 0 && (
                                                                        <span className="ml-1">
                                                                            • {product.skus.length} SKU{product.skus.length !== 1 && 's'}
                                                                        </span>
                                                                    )}
                                                                </p>
                                                            </div>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>
                                                        <TooltipProvider>
                                                            <Tooltip>
                                                                <TooltipTrigger>
                                                                    <Badge variant="outline" className="font-normal">
                                                                        {formatStoreName(product.storeId).slice(0, 15)}
                                                                        {formatStoreName(product.storeId).length > 15 && '...'}
                                                                    </Badge>
                                                                </TooltipTrigger>
                                                                <TooltipContent>
                                                                    {product.storeId}
                                                                </TooltipContent>
                                                            </Tooltip>
                                                        </TooltipProvider>
                                                    </TableCell>
                                                    <TableCell>
                                                        {product.vendor ? (
                                                            <span className="text-sm">{product.vendor}</span>
                                                        ) : (
                                                            <span className="text-muted-foreground">—</span>
                                                        )}
                                                    </TableCell>
                                                    <TableCell>
                                                        <Badge
                                                            variant="outline"
                                                            className={cn('capitalize', getStatusColor(product.status))}
                                                        >
                                                            {product.status}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="text-right font-medium">
                                                        {getPriceRange(product.variants)}
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <span
                                                            className={cn(
                                                                'font-medium',
                                                                totalInventory <= 0 && 'text-red-600',
                                                                totalInventory > 0 && totalInventory <= 10 && 'text-amber-600'
                                                            )}
                                                        >
                                                            {totalInventory}
                                                        </span>
                                                    </TableCell>
                                                    <TableCell className="text-muted-foreground text-sm">
                                                        {formatDate(product.shopifyUpdatedAt)}
                                                    </TableCell>
                                                    <TableCell>
                                                        <DropdownMenu>
                                                            <DropdownMenuTrigger asChild>
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                                                                >
                                                                    <MoreHorizontal className="h-4 w-4" />
                                                                    <span className="sr-only">Open menu</span>
                                                                </Button>
                                                            </DropdownMenuTrigger>
                                                            <DropdownMenuContent align="end" className="w-48">
                                                                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                                                <DropdownMenuSeparator />
                                                                <DropdownMenuItem
                                                                    onClick={() => handleViewProduct(product)}
                                                                    className="gap-2"
                                                                >
                                                                    <Eye className="h-4 w-4" />
                                                                    View Details
                                                                </DropdownMenuItem>
                                                                <DropdownMenuItem
                                                                    onClick={() => {
                                                                        window.open(
                                                                            `https://${product.storeId}/admin/products/${product.productId}`,
                                                                            '_blank'
                                                                        );
                                                                    }}
                                                                    className="gap-2"
                                                                >
                                                                    <ExternalLink className="h-4 w-4" />
                                                                    Open in Shopify
                                                                </DropdownMenuItem>
                                                            </DropdownMenuContent>
                                                        </DropdownMenu>
                                                    </TableCell>
                                                </motion.tr>
                                            );
                                        })}
                                    </AnimatePresence>
                                </TableBody>
                            </Table>
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

            {/* Product Detail Dialog */}
            <ProductDetailDialog
                product={selectedProduct}
                open={isDetailDialogOpen}
                onOpenChange={setIsDetailDialogOpen}
            />

            {/* Sync All Confirmation Dialog */}
            <Dialog open={isSyncDialogOpen} onOpenChange={setIsSyncDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Sync All Stores</DialogTitle>
                        <DialogDescription>
                            This will sync products from all {stores?.length || 0} stores. This may take a few minutes depending on the number of products.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                        <p className="text-sm text-muted-foreground">Stores to sync:</p>
                        <ul className="mt-2 space-y-1">
                            {stores?.map((storeId) => (
                                <li key={storeId} className="flex items-center gap-2 text-sm">
                                    <Store className="h-4 w-4 text-muted-foreground" />
                                    {formatStoreName(storeId)}
                                </li>
                            ))}
                        </ul>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsSyncDialogOpen(false)}>
                            Cancel
                        </Button>
                        <Button onClick={handleSyncAllStores} className="gap-2">
                            <RefreshCw className="h-4 w-4" />
                            Sync All Stores
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Sync Result Dialog */}
            <Dialog open={syncResult !== null} onOpenChange={() => setSyncResult(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            {syncResult?.success ? (
                                <>
                                    <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                                    Sync Complete
                                </>
                            ) : (
                                <>
                                    <AlertCircle className="h-5 w-5 text-red-600" />
                                    Sync Failed
                                </>
                            )}
                        </DialogTitle>
                        <DialogDescription>
                            {syncResult?.success
                                ? `Products from ${formatStoreName(syncResult.store)} have been synced.`
                                : syncResult?.error}
                        </DialogDescription>
                    </DialogHeader>
                    {syncResult?.success && syncResult.stats && (
                        <div className="py-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="p-3 rounded-lg bg-muted/50">
                                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Total</p>
                                    <p className="text-2xl font-bold">{syncResult.stats.total}</p>
                                </div>
                                <div className="p-3 rounded-lg bg-emerald-500/10">
                                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Created</p>
                                    <p className="text-2xl font-bold text-emerald-600">{syncResult.stats.created}</p>
                                </div>
                                <div className="p-3 rounded-lg bg-blue-500/10">
                                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Updated</p>
                                    <p className="text-2xl font-bold text-blue-600">{syncResult.stats.updated}</p>
                                </div>
                                <div className="p-3 rounded-lg bg-amber-500/10">
                                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Deleted</p>
                                    <p className="text-2xl font-bold text-amber-600">{syncResult.stats.deleted}</p>
                                </div>
                            </div>
                            {syncResult.stats.errors > 0 && (
                                <p className="mt-3 text-sm text-red-600">
                                    {syncResult.stats.errors} products failed to sync
                                </p>
                            )}
                        </div>
                    )}
                    <DialogFooter>
                        <Button onClick={() => setSyncResult(null)}>Close</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

// ============================================================
// LOADING FALLBACK
// ============================================================

function StoreProductsLoading() {
    return (
        <div className="flex items-center justify-center h-screen">
            <div className="flex flex-col items-center gap-4">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-muted-foreground">Loading store products...</p>
            </div>
        </div>
    );
}

// ============================================================
// MAIN EXPORT
// ============================================================

export default function StoreProductsPage() {
    return (
        <Suspense fallback={<StoreProductsLoading />}>
            <StoreProductsContent />
        </Suspense>
    );
}