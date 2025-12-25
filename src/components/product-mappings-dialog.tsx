'use client';

import React, { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from '@/components/ui/command';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useDebounce } from 'use-debounce';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Link2,
    Link2Off,
    Search,
    Store,
    ChevronLeft,
    ChevronRight,
    Loader2,
    ChevronsUpDown,
    X,
    Filter,
    RefreshCw,
    Unlink,
    PackageSearch,
    ArrowRight,
    Layers,
} from 'lucide-react';

// ============================================================
// TYPES
// ============================================================

interface StoreVariant {
    variantId: number;
    variantTitle: string;
    variantSku: string | null;
    productId: string;
    productTitle: string;
    vendor: string | null;
    storeId: string;
    mappedBusinessSku: string | null;
    price: string | null;
    inventoryQuantity: number | null;
}

interface BusinessProductSearchResult {
    sku: string;
    name: string;
}

interface StoreInfo {
    id: string;
    shopName: string;
}

interface ProductMappingsDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    businessId: string;
    user: User | null | undefined;
}

type MappingFilter = 'all' | 'mapped' | 'unmapped';

// ============================================================
// ANIMATIONS
// ============================================================

const rowVariants = {
    hidden: { opacity: 0, y: 10 },
    visible: (i: number) => ({
        opacity: 1,
        y: 0,
        transition: { delay: i * 0.03, duration: 0.2 },
    }),
};

// ============================================================
// SKU MAPPER CELL COMPONENT
// ============================================================

interface SkuMapperCellProps {
    variant: StoreVariant;
    businessId: string;
    user: User | null | undefined;
    onMappingChange: () => void;
}

function SkuMapperCell({ variant, businessId, user, onMappingChange }: SkuMapperCellProps) {
    const { toast } = useToast();
    const [open, setOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearch] = useDebounce(searchQuery, 300);
    const [searchResults, setSearchResults] = useState<BusinessProductSearchResult[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [isMapping, setIsMapping] = useState(false);
    const [isUnmapping, setIsUnmapping] = useState(false);

    // Search for business products
    useEffect(() => {
        const searchBusinessProducts = async () => {
            if (debouncedSearch.trim().length < 2) {
                setSearchResults([]);
                return;
            }

            setIsSearching(true);
            try {
                const idToken = await user?.getIdToken();
                const response = await fetch('/api/shopify/products/search-business-products', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${idToken}`,
                    },
                    body: JSON.stringify({
                        businessId,
                        query: debouncedSearch.trim(),
                    }),
                });

                if (!response.ok) throw new Error('Search failed');

                const data = await response.json();
                setSearchResults(data.products || []);
            } catch (error) {
                console.error('Search error:', error);
                setSearchResults([]);
            } finally {
                setIsSearching(false);
            }
        };

        searchBusinessProducts();
    }, [debouncedSearch, businessId, user]);

    const handleSelectSku = async (businessSku: string) => {
        setIsMapping(true);
        try {
            const idToken = await user?.getIdToken();
            const response = await fetch('/api/shopify/products/create-mapping', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${idToken}`,
                },
                body: JSON.stringify({
                    businessId,
                    storeId: variant.storeId,
                    productId: variant.productId,
                    variantId: variant.variantId,
                    variantSku: variant.variantSku,
                    variantTitle: variant.variantTitle,
                    productTitle: variant.productTitle,
                    businessProductSku: businessSku,
                }),
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Failed to create mapping');
            }

            toast({
                title: 'Mapping Created',
                description: (
                    <span className="flex items-center gap-2">
                        <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{businessSku}</code>
                        <ArrowRight className="h-3 w-3" />
                        <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{variant.variantSku || variant.variantTitle}</code>
                    </span>
                ),
            });

            setOpen(false);
            setSearchQuery('');
            onMappingChange();
        } catch (error) {
            toast({
                title: 'Mapping Failed',
                description: error instanceof Error ? error.message : 'Could not create mapping',
                variant: 'destructive',
            });
        } finally {
            setIsMapping(false);
        }
    };

    const handleUnmap = async () => {
        setIsUnmapping(true);
        try {
            const idToken = await user?.getIdToken();
            const response = await fetch('/api/shopify/products/remove-mapping', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${idToken}`,
                },
                body: JSON.stringify({
                    businessId,
                    storeId: variant.storeId,
                    productId: variant.productId,
                    variantId: variant.variantId,
                }),
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Failed to remove mapping');
            }

            toast({
                title: 'Mapping Removed',
                description: `Unlinked ${variant.variantSku || variant.variantTitle}`,
            });

            onMappingChange();
        } catch (error) {
            toast({
                title: 'Failed to Remove Mapping',
                description: error instanceof Error ? error.message : 'Could not remove mapping',
                variant: 'destructive',
            });
        } finally {
            setIsUnmapping(false);
        }
    };

    // If already mapped, show the mapping with option to unmap
    if (variant.mappedBusinessSku) {
        return (
            <div className="flex items-center gap-2">
                <Badge variant="secondary" className="gap-1.5 bg-emerald-500/10 text-emerald-700 border-emerald-500/20">
                    <Link2 className="h-3 w-3" />
                    {variant.mappedBusinessSku}
                </Badge>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={handleUnmap}
                    disabled={isUnmapping}
                >
                    {isUnmapping ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                        <Unlink className="h-3.5 w-3.5" />
                    )}
                </Button>
            </div>
        );
    }

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className="w-[200px] justify-between text-muted-foreground font-normal h-8 text-xs"
                    disabled={isMapping}
                >
                    {isMapping ? (
                        <span className="flex items-center gap-2">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Mapping...
                        </span>
                    ) : (
                        <>
                            <span className="flex items-center gap-1.5">
                                <Link2Off className="h-3 w-3" />
                                Select SKU...
                            </span>
                            <ChevronsUpDown className="h-3 w-3 shrink-0 opacity-50" />
                        </>
                    )}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[280px] p-0" align="start">
                <Command shouldFilter={false}>
                    <CommandInput
                        placeholder="Search by name or SKU..."
                        value={searchQuery}
                        onValueChange={setSearchQuery}
                        className="h-9"
                    />
                    <CommandList>
                        {searchQuery.trim().length < 2 ? (
                            <div className="py-6 text-center text-sm text-muted-foreground">
                                <PackageSearch className="h-8 w-8 mx-auto mb-2 opacity-50" />
                                Type at least 2 characters to search
                            </div>
                        ) : isSearching ? (
                            <div className="py-6 text-center text-sm text-muted-foreground">
                                <Loader2 className="h-5 w-5 mx-auto mb-2 animate-spin" />
                                Searching...
                            </div>
                        ) : searchResults.length === 0 ? (
                            <CommandEmpty>No products found.</CommandEmpty>
                        ) : (
                            <CommandGroup heading="Business Products">
                                {searchResults.map((product) => (
                                    <CommandItem
                                        key={product.sku}
                                        value={product.sku}
                                        onSelect={() => handleSelectSku(product.sku)}
                                        className="flex flex-col items-start gap-0.5 py-2"
                                    >
                                        <div className="flex items-center gap-2 w-full">
                                            <code className="text-xs font-semibold bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                                                {product.sku}
                                            </code>
                                        </div>
                                        <span className="text-xs text-muted-foreground truncate max-w-full">
                                            {product.name}
                                        </span>
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                        )}
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export function ProductMappingsDialog({
    open,
    onOpenChange,
    businessId,
    user,
}: ProductMappingsDialogProps) {
    const { toast } = useToast();

    // Data state
    const [variants, setVariants] = useState<StoreVariant[]>([]);
    const [stores, setStores] = useState<StoreInfo[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshKey, setRefreshKey] = useState(0);

    // Filter state
    const [selectedStore, setSelectedStore] = useState<string>('all');
    const [mappingFilter, setMappingFilter] = useState<MappingFilter>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearch] = useDebounce(searchQuery, 300);

    // Pagination state
    const [currentPage, setCurrentPage] = useState(1);
    const rowsPerPage = 10;

    // Fetch stores and variants
    useEffect(() => {
        if (!open || !user || !businessId) return;

        const fetchData = async () => {
            setLoading(true);
            try {
                const idToken = await user.getIdToken();
                const response = await fetch('/api/shopify/products/store-variants', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${idToken}`,
                    },
                    body: JSON.stringify({
                        businessId,
                        storeFilter: selectedStore === 'all' ? null : selectedStore,
                        mappingFilter: mappingFilter === 'all' ? null : mappingFilter,
                        searchQuery: debouncedSearch || null,
                    }),
                });

                if (!response.ok) throw new Error('Failed to fetch store variants');

                const data = await response.json();
                setVariants(data.variants || []);
                setStores(data.stores || []);
            } catch (error) {
                console.error('Error fetching data:', error);
                toast({
                    title: 'Error',
                    description: 'Failed to load store variants',
                    variant: 'destructive',
                });
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [open, user, businessId, selectedStore, mappingFilter, debouncedSearch, refreshKey, toast]);

    // Reset page when filters change
    useEffect(() => {
        setCurrentPage(1);
    }, [selectedStore, mappingFilter, debouncedSearch]);

    const handleRefresh = () => {
        setRefreshKey((k) => k + 1);
    };

    // Pagination
    const totalPages = Math.ceil(variants.length / rowsPerPage);
    const paginatedVariants = variants.slice(
        (currentPage - 1) * rowsPerPage,
        currentPage * rowsPerPage
    );

    // Stats
    const mappedCount = variants.filter((v) => v.mappedBusinessSku).length;
    const unmappedCount = variants.length - mappedCount;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-6xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
                {/* Header */}
                <DialogHeader className="px-6 py-4 border-b bg-gradient-to-r from-background via-muted/30 to-background">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 ring-1 ring-primary/20">
                            <Link2 className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                            <DialogTitle className="text-xl">Product Variant Mappings</DialogTitle>
                            <DialogDescription>
                                Link your business products to store product variants for unified inventory management
                            </DialogDescription>
                        </div>
                    </div>
                </DialogHeader>

                {/* Stats Bar */}
                <div className="px-6 py-3 border-b bg-muted/30">
                    <div className="flex items-center gap-6">
                        <div className="flex items-center gap-2">
                            <div className="h-2 w-2 rounded-full bg-blue-500" />
                            <span className="text-sm text-muted-foreground">
                                Total Variants: <span className="font-semibold text-foreground">{variants.length}</span>
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="h-2 w-2 rounded-full bg-emerald-500" />
                            <span className="text-sm text-muted-foreground">
                                Mapped: <span className="font-semibold text-emerald-600">{mappedCount}</span>
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="h-2 w-2 rounded-full bg-amber-500" />
                            <span className="text-sm text-muted-foreground">
                                Unmapped: <span className="font-semibold text-amber-600">{unmappedCount}</span>
                            </span>
                        </div>
                    </div>
                </div>

                {/* Filters */}
                <div className="px-6 py-4 border-b">
                    <div className="flex flex-col sm:flex-row gap-3">
                        {/* Search */}
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search by product, variant, or SKU..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-9 bg-background"
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

                        {/* Store Filter */}
                        <Select value={selectedStore} onValueChange={setSelectedStore}>
                            <SelectTrigger className="w-full sm:w-[200px]">
                                <Store className="h-4 w-4 mr-2 text-muted-foreground" />
                                <SelectValue placeholder="All Stores" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Stores</SelectItem>
                                {stores.map((store) => (
                                    <SelectItem key={store.id} value={store.id}>
                                        {store.shopName.replace('.myshopify.com', '')}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        {/* Mapping Filter */}
                        <Select value={mappingFilter} onValueChange={(v) => setMappingFilter(v as MappingFilter)}>
                            <SelectTrigger className="w-full sm:w-[160px]">
                                <Filter className="h-4 w-4 mr-2 text-muted-foreground" />
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Variants</SelectItem>
                                <SelectItem value="mapped">
                                    <span className="flex items-center gap-2">
                                        <Link2 className="h-3 w-3 text-emerald-500" />
                                        Mapped
                                    </span>
                                </SelectItem>
                                <SelectItem value="unmapped">
                                    <span className="flex items-center gap-2">
                                        <Link2Off className="h-3 w-3 text-amber-500" />
                                        Unmapped
                                    </span>
                                </SelectItem>
                            </SelectContent>
                        </Select>

                        {/* Refresh */}
                        <Button variant="outline" size="icon" onClick={handleRefresh} disabled={loading}>
                            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
                        </Button>
                    </div>
                </div>

                {/* Table */}
                <div className="flex-1 overflow-auto">
                    {loading ? (
                        <div className="p-6 space-y-4">
                            {[...Array(5)].map((_, i) => (
                                <div key={i} className="flex items-center gap-4">
                                    <Skeleton className="h-10 w-10 rounded-lg" />
                                    <div className="flex-1 space-y-2">
                                        <Skeleton className="h-4 w-1/3" />
                                        <Skeleton className="h-3 w-1/4" />
                                    </div>
                                    <Skeleton className="h-8 w-[200px]" />
                                </div>
                            ))}
                        </div>
                    ) : variants.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16">
                            <div className="relative">
                                <div className="absolute inset-0 bg-gradient-to-r from-primary/20 via-primary/10 to-primary/20 blur-3xl rounded-full" />
                                <div className="relative p-6 rounded-full bg-gradient-to-br from-muted to-muted/50 ring-1 ring-border/50">
                                    <PackageSearch className="h-12 w-12 text-muted-foreground" />
                                </div>
                            </div>
                            <h3 className="mt-6 text-lg font-semibold">No variants found</h3>
                            <p className="mt-2 text-muted-foreground text-center max-w-sm">
                                {searchQuery || selectedStore !== 'all' || mappingFilter !== 'all'
                                    ? 'Try adjusting your filters to see more variants.'
                                    : 'Connect a Shopify store and sync products to see variants here.'}
                            </p>
                            {(searchQuery || selectedStore !== 'all' || mappingFilter !== 'all') && (
                                <Button
                                    variant="outline"
                                    className="mt-4"
                                    onClick={() => {
                                        setSearchQuery('');
                                        setSelectedStore('all');
                                        setMappingFilter('all');
                                    }}
                                >
                                    Clear Filters
                                </Button>
                            )}
                        </div>
                    ) : (
                        <Table>
                            <TableHeader className="bg-muted/50 sticky top-0 z-10">
                                <TableRow className="hover:bg-transparent">
                                    <TableHead className="w-[30%]">Product / Variant</TableHead>
                                    <TableHead className="w-[15%]">Variant SKU</TableHead>
                                    <TableHead className="w-[12%]">Store</TableHead>
                                    <TableHead className="w-[10%] text-right">Price</TableHead>
                                    <TableHead className="w-[8%] text-right">Stock</TableHead>
                                    <TableHead className="w-[25%]">Business Product Mapping</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                <AnimatePresence mode="popLayout">
                                    {paginatedVariants.map((variant, index) => (
                                        <motion.tr
                                            key={`${variant.storeId}-${variant.productId}-${variant.variantId}`}
                                            custom={index}
                                            variants={rowVariants}
                                            initial="hidden"
                                            animate="visible"
                                            className="group border-b hover:bg-muted/50"
                                        >
                                            <TableCell className="py-3">
                                                <div className="flex items-center gap-3">
                                                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary/10 to-primary/5 ring-1 ring-primary/10">
                                                        <Layers className="h-4 w-4 text-primary" />
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className="font-medium text-sm truncate max-w-[220px]">
                                                            {variant.productTitle}
                                                        </p>
                                                        <p className="text-xs text-muted-foreground truncate">
                                                            {variant.variantTitle !== 'Default Title' ? variant.variantTitle : '—'}
                                                        </p>
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                {variant.variantSku ? (
                                                    <code className="px-1.5 py-0.5 rounded bg-muted text-xs font-mono">
                                                        {variant.variantSku}
                                                    </code>
                                                ) : (
                                                    <span className="text-xs text-muted-foreground">No SKU</span>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className="font-normal text-xs">
                                                    {variant.storeId.replace('.myshopify.com', '')}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-right text-sm tabular-nums">
                                                {variant.price != null ? `₹${variant.price}` : '—'}
                                            </TableCell>
                                            <TableCell className="text-right text-sm tabular-nums">
                                                {variant.inventoryQuantity ?? '—'}
                                            </TableCell>
                                            <TableCell>
                                                <SkuMapperCell
                                                    variant={variant}
                                                    businessId={businessId}
                                                    user={user}
                                                    onMappingChange={handleRefresh}
                                                />
                                            </TableCell>
                                        </motion.tr>
                                    ))}
                                </AnimatePresence>
                            </TableBody>
                        </Table>
                    )}
                </div>

                {/* Pagination */}
                {variants.length > 0 && (
                    <div className="flex items-center justify-between px-6 py-3 border-t bg-muted/30">
                        <p className="text-sm text-muted-foreground">
                            Showing{' '}
                            <span className="font-medium">
                                {(currentPage - 1) * rowsPerPage + 1}
                            </span>{' '}
                            to{' '}
                            <span className="font-medium">
                                {Math.min(currentPage * rowsPerPage, variants.length)}
                            </span>{' '}
                            of <span className="font-medium">{variants.length}</span> variants
                        </p>

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
                            <span className="text-sm font-medium px-3">
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
                )}
            </DialogContent>
        </Dialog>
    );
}