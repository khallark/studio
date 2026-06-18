'use client';

import React, { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import {
    Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useDebounce } from 'use-debounce';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Link2, Link2Off, Search, Store, ChevronLeft, ChevronRight, Loader2,
    X, Filter, RefreshCw, Unlink, PackageSearch, Package,
} from 'lucide-react';
import { ParentProductCombobox } from '@/components/parent-product-combobox';
import { useParentProducts } from '@/hooks/use-parent-products';

interface StoreProduct {
    productId: string;
    title: string;
    vendor: string | null;
    status: string | null;
    storeId: string;
    featuredImage: string | null;
    variantCount: number;
    mappedParentId: string | null;
}

interface StoreInfo {
    id: string;
    shopName: string;
}

interface ParentProductMappingsDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    businessId: string;
    user: User | null | undefined;
}

type MappingFilter = 'all' | 'mapped' | 'unmapped';

const rowVariants = {
    hidden: { opacity: 0, y: 10 },
    visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.03, duration: 0.2 } }),
};

const STATUS_STYLES: Record<string, string> = {
    active: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20',
    draft: 'bg-amber-500/10 text-amber-700 border-amber-500/20',
    archived: 'bg-muted text-muted-foreground',
    unlisted: 'bg-muted text-muted-foreground',
};

// ── Mapper cell ──────────────────────────────────────────────
function ParentMapperCell({
    product, businessId, user, parents, parentNameById, onMappingChange,
}: {
    product: StoreProduct;
    businessId: string;
    user: User | null | undefined;
    parents: ReturnType<typeof useParentProducts>['parents'];
    parentNameById: Map<string, string>;
    onMappingChange: () => void;
}) {
    const { toast } = useToast();
    const [isMapping, setIsMapping] = useState(false);
    const [isUnmapping, setIsUnmapping] = useState(false);

    const handleSelect = async (parentProductId: string) => {
        setIsMapping(true);
        try {
            const idToken = await user?.getIdToken();
            const res = await fetch('/api/shopify/parent-products/create-mapping', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
                body: JSON.stringify({
                    businessId,
                    storeId: product.storeId,
                    productId: product.productId,
                    productTitle: product.title,
                    parentProductId,
                }),
            });
            if (!res.ok) {
                const e = await res.json();
                throw new Error(e.message || 'Failed to create mapping');
            }
            toast({ title: 'Mapping Created', description: `Linked to ${parentNameById.get(parentProductId) ?? parentProductId}` });
            onMappingChange();
        } catch (err) {
            toast({ title: 'Mapping Failed', description: err instanceof Error ? err.message : 'Could not create mapping', variant: 'destructive' });
        } finally {
            setIsMapping(false);
        }
    };

    const handleUnmap = async () => {
        setIsUnmapping(true);
        try {
            const idToken = await user?.getIdToken();
            const res = await fetch('/api/shopify/parent-products/remove-mapping', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
                body: JSON.stringify({ businessId, storeId: product.storeId, productId: product.productId }),
            });
            if (!res.ok) {
                const e = await res.json();
                throw new Error(e.message || 'Failed to remove mapping');
            }
            toast({ title: 'Mapping Removed', description: `Unlinked ${product.title}` });
            onMappingChange();
        } catch (err) {
            toast({ title: 'Failed to Remove', description: err instanceof Error ? err.message : 'Could not remove mapping', variant: 'destructive' });
        } finally {
            setIsUnmapping(false);
        }
    };

    if (product.mappedParentId) {
        return (
            <div className="flex items-center gap-2">
                <Badge variant="secondary" className="gap-1.5 bg-emerald-500/10 text-emerald-700 border-emerald-500/20">
                    <Link2 className="h-3 w-3" />
                    {parentNameById.get(product.mappedParentId) ?? product.mappedParentId}
                </Badge>
                <Button variant="ghost" size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={handleUnmap} disabled={isUnmapping}>
                    {isUnmapping ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unlink className="h-3.5 w-3.5" />}
                </Button>
            </div>
        );
    }

    return (
        <div className="w-[240px]">
            {isMapping ? (
                <div className="flex items-center gap-2 h-8 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" /> Mapping...
                </div>
            ) : (
                <ParentProductCombobox
                    parents={parents}
                    value={null}
                    onChange={handleSelect}
                    placeholder="Select parent..."
                />
            )}
        </div>
    );
}

// ── Main dialog ──────────────────────────────────────────────
export function ParentProductMappingsDialog({
    open, onOpenChange, businessId, user,
}: ParentProductMappingsDialogProps) {
    const { toast } = useToast();
    const { parents } = useParentProducts(businessId);
    const parentNameById = React.useMemo(
        () => new Map(parents.map((p) => [p.id, p.name])),
        [parents]
    );

    const [products, setProducts] = useState<StoreProduct[]>([]);
    const [stores, setStores] = useState<StoreInfo[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshKey, setRefreshKey] = useState(0);

    const [selectedStore, setSelectedStore] = useState('all');
    const [mappingFilter, setMappingFilter] = useState<MappingFilter>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearch] = useDebounce(searchQuery, 300);

    const [currentPage, setCurrentPage] = useState(1);
    const rowsPerPage = 10;

    useEffect(() => {
        if (!open || !user || !businessId) return;
        const fetchData = async () => {
            setLoading(true);
            try {
                const idToken = await user.getIdToken();
                const res = await fetch('/api/shopify/parent-products/store-products', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
                    body: JSON.stringify({
                        businessId,
                        storeFilter: selectedStore === 'all' ? null : selectedStore,
                        mappingFilter: mappingFilter === 'all' ? null : mappingFilter,
                        searchQuery: debouncedSearch || null,
                    }),
                });
                if (!res.ok) throw new Error('Failed to fetch store products');
                const data = await res.json();
                setProducts(data.products || []);
                setStores(data.stores || []);
            } catch (err) {
                console.error(err);
                toast({ title: 'Error', description: 'Failed to load store products', variant: 'destructive' });
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [open, user, businessId, selectedStore, mappingFilter, debouncedSearch, refreshKey, toast]);

    useEffect(() => { setCurrentPage(1); }, [selectedStore, mappingFilter, debouncedSearch]);

    const handleRefresh = () => setRefreshKey((k) => k + 1);

    const totalPages = Math.ceil(products.length / rowsPerPage);
    const paginated = products.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);
    const mappedCount = products.filter((p) => p.mappedParentId).length;
    const unmappedCount = products.length - mappedCount;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-6xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
                <DialogHeader className="px-6 py-4 border-b bg-gradient-to-r from-background via-muted/30 to-background">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 ring-1 ring-primary/20">
                            <Link2 className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                            <DialogTitle className="text-xl">Parent → Store Product Mappings</DialogTitle>
                            <DialogDescription>
                                Link parent products to Shopify store products
                            </DialogDescription>
                        </div>
                    </div>
                </DialogHeader>

                {/* Stats */}
                <div className="px-6 py-3 border-b bg-muted/30">
                    <div className="flex items-center gap-6">
                        <span className="text-sm text-muted-foreground flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full bg-blue-500" />
                            Total: <span className="font-semibold text-foreground">{products.length}</span>
                        </span>
                        <span className="text-sm text-muted-foreground flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full bg-emerald-500" />
                            Mapped: <span className="font-semibold text-emerald-600">{mappedCount}</span>
                        </span>
                        <span className="text-sm text-muted-foreground flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full bg-amber-500" />
                            Unmapped: <span className="font-semibold text-amber-600">{unmappedCount}</span>
                        </span>
                    </div>
                </div>

                {/* Filters */}
                <div className="px-6 py-4 border-b">
                    <div className="flex flex-col sm:flex-row gap-3">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input placeholder="Search by product, vendor, or SKU..."
                                value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-9 bg-background" />
                            {searchQuery && (
                                <Button variant="ghost" size="icon"
                                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                                    onClick={() => setSearchQuery('')}>
                                    <X className="h-3 w-3" />
                                </Button>
                            )}
                        </div>

                        <Select value={selectedStore} onValueChange={setSelectedStore}>
                            <SelectTrigger className="w-full sm:w-[200px]">
                                <Store className="h-4 w-4 mr-2 text-muted-foreground" />
                                <SelectValue placeholder="All Stores" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Stores</SelectItem>
                                {stores.map((s) => (
                                    <SelectItem key={s.id} value={s.id}>
                                        {s.shopName.replace('.myshopify.com', '')}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        <Select value={mappingFilter} onValueChange={(v) => setMappingFilter(v as MappingFilter)}>
                            <SelectTrigger className="w-full sm:w-[160px]">
                                <Filter className="h-4 w-4 mr-2 text-muted-foreground" />
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Products</SelectItem>
                                <SelectItem value="mapped">
                                    <span className="flex items-center gap-2"><Link2 className="h-3 w-3 text-emerald-500" /> Mapped</span>
                                </SelectItem>
                                <SelectItem value="unmapped">
                                    <span className="flex items-center gap-2"><Link2Off className="h-3 w-3 text-amber-500" /> Unmapped</span>
                                </SelectItem>
                            </SelectContent>
                        </Select>

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
                                    <Skeleton className="h-8 w-[240px]" />
                                </div>
                            ))}
                        </div>
                    ) : products.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16">
                            <div className="relative">
                                <div className="absolute inset-0 bg-gradient-to-r from-primary/20 via-primary/10 to-primary/20 blur-3xl rounded-full" />
                                <div className="relative p-6 rounded-full bg-gradient-to-br from-muted to-muted/50 ring-1 ring-border/50">
                                    <PackageSearch className="h-12 w-12 text-muted-foreground" />
                                </div>
                            </div>
                            <h3 className="mt-6 text-lg font-semibold">No products found</h3>
                            <p className="mt-2 text-muted-foreground text-center max-w-sm">
                                {searchQuery || selectedStore !== 'all' || mappingFilter !== 'all'
                                    ? 'Try adjusting your filters.'
                                    : 'Connect a Shopify store and sync products to see them here.'}
                            </p>
                            {(searchQuery || selectedStore !== 'all' || mappingFilter !== 'all') && (
                                <Button variant="outline" className="mt-4"
                                    onClick={() => { setSearchQuery(''); setSelectedStore('all'); setMappingFilter('all'); }}>
                                    Clear Filters
                                </Button>
                            )}
                        </div>
                    ) : (
                        <Table>
                            <TableHeader className="bg-muted/50 sticky top-0 z-10">
                                <TableRow className="hover:bg-transparent">
                                    <TableHead className="w-[40%]">Store Product</TableHead>
                                    <TableHead className="w-[12%]">Store</TableHead>
                                    <TableHead className="w-[10%]">Status</TableHead>
                                    <TableHead className="w-[8%] text-right">Variants</TableHead>
                                    <TableHead className="w-[30%]">Parent Product Mapping</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                <AnimatePresence mode="popLayout">
                                    {paginated.map((product, index) => (
                                        <tr
                                            key={`${product.storeId}-${product.productId}`}
                                            className="group border-b hover:bg-muted/50"
                                        >
                                            <TableCell className="py-3">
                                                <div className="flex items-center gap-3">
                                                    {product.featuredImage ? (
                                                        // eslint-disable-next-line @next/next/no-img-element
                                                        <img src={product.featuredImage} alt=""
                                                            className="h-9 w-9 rounded-lg object-cover ring-1 ring-border/50" />
                                                    ) : (
                                                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary/10 to-primary/5 ring-1 ring-primary/10">
                                                            <Package className="h-4 w-4 text-primary" />
                                                        </div>
                                                    )}
                                                    <div className="min-w-0">
                                                        <p className="font-medium text-sm truncate max-w-[280px]">{product.title}</p>
                                                        {product.vendor && (
                                                            <p className="text-xs text-muted-foreground truncate">{product.vendor}</p>
                                                        )}
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className="font-normal text-xs">
                                                    {product.storeId.replace('.myshopify.com', '')}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                {product.status && (
                                                    <Badge variant="outline"
                                                        className={cn('font-normal text-xs capitalize', STATUS_STYLES[product.status] ?? '')}>
                                                        {product.status}
                                                    </Badge>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-right text-sm tabular-nums text-muted-foreground">
                                                {product.variantCount}
                                            </TableCell>
                                            <TableCell>
                                                <ParentMapperCell
                                                    product={product}
                                                    businessId={businessId}
                                                    user={user}
                                                    parents={parents}
                                                    parentNameById={parentNameById}
                                                    onMappingChange={handleRefresh}
                                                />
                                            </TableCell>
                                        </tr>
                                    ))}
                                </AnimatePresence>
                            </TableBody>
                        </Table>
                    )}
                </div>

                {/* Pagination */}
                {products.length > 0 && (
                    <div className="flex items-center justify-between px-6 py-3 border-t bg-muted/30">
                        <p className="text-sm text-muted-foreground">
                            Showing <span className="font-medium">{(currentPage - 1) * rowsPerPage + 1}</span> to{' '}
                            <span className="font-medium">{Math.min(currentPage * rowsPerPage, products.length)}</span> of{' '}
                            <span className="font-medium">{products.length}</span> products
                        </p>
                        <div className="flex items-center gap-1">
                            <Button variant="outline" size="icon" className="h-8 w-8"
                                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1}>
                                <ChevronLeft className="h-4 w-4" />
                            </Button>
                            <span className="text-sm font-medium px-3">{currentPage} / {totalPages || 1}</span>
                            <Button variant="outline" size="icon" className="h-8 w-8"
                                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages}>
                                <ChevronRight className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}