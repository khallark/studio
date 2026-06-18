'use client';

import React, { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import {
    Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useDebounce } from 'use-debounce';
import { cn } from '@/lib/utils';
import {
    Link2, Link2Off, Search, ChevronLeft, ChevronRight, Loader2,
    X, RefreshCw, Unlink, PackageSearch, Package,
} from 'lucide-react';
import { useParentProducts } from '@/hooks/use-parent-products';
import { ParentProduct } from '@/types/warehouse';

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

const STATUS_STYLES: Record<string, string> = {
    active: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20',
    draft: 'bg-amber-500/10 text-amber-700 border-amber-500/20',
    archived: 'bg-muted text-muted-foreground',
    unlisted: 'bg-muted text-muted-foreground',
};

// ── Mapper cell: plain native <select> ───────────────────────
function ParentMapperCell({
    product, businessId, user, parents, parentNameById, onMappingChange,
}: {
    product: StoreProduct;
    businessId: string;
    user: User | null | undefined;
    parents: ParentProduct[];
    parentNameById: Map<string, string>;
    onMappingChange: () => void;
}) {
    const { toast } = useToast();
    const [isMapping, setIsMapping] = useState(false);
    const [isUnmapping, setIsUnmapping] = useState(false);

    const handleSelect = async (parentProductId: string) => {
        if (!parentProductId) return;
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

    if (isMapping) {
        return (
            <div className="flex items-center gap-2 h-9 text-xs text-muted-foreground w-[240px]">
                <Loader2 className="h-3 w-3 animate-spin" /> Mapping...
            </div>
        );
    }

    return (
        <select
            defaultValue=""
            onChange={(e) => handleSelect(e.target.value)}
            className="w-[240px] h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
        >
            <option value="" disabled>Select parent...</option>
            {parents.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
            ))}
        </select>
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
                <DialogHeader className="px-6 py-4 border-b">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-xl bg-primary/10 ring-1 ring-primary/20">
                            <Link2 className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                            <DialogTitle className="text-xl">Parent → Store Product Mappings</DialogTitle>
                            <DialogDescription>Link parent products to Shopify store products</DialogDescription>
                        </div>
                    </div>
                </DialogHeader>

                {/* Stats */}
                <div className="px-6 py-3 border-b bg-muted/30">
                    <div className="flex items-center gap-6 text-sm text-muted-foreground">
                        <span>Total: <span className="font-semibold text-foreground">{products.length}</span></span>
                        <span>Mapped: <span className="font-semibold text-emerald-600">{mappedCount}</span></span>
                        <span>Unmapped: <span className="font-semibold text-amber-600">{unmappedCount}</span></span>
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

                        <select
                            value={selectedStore}
                            onChange={(e) => setSelectedStore(e.target.value)}
                            className="h-9 rounded-md border border-input bg-background px-3 text-sm sm:w-[200px]"
                        >
                            <option value="all">All Stores</option>
                            {stores.map((s) => (
                                <option key={s.id} value={s.id}>{s.shopName.replace('.myshopify.com', '')}</option>
                            ))}
                        </select>

                        <select
                            value={mappingFilter}
                            onChange={(e) => setMappingFilter(e.target.value as MappingFilter)}
                            className="h-9 rounded-md border border-input bg-background px-3 text-sm sm:w-[160px]"
                        >
                            <option value="all">All Products</option>
                            <option value="mapped">Mapped</option>
                            <option value="unmapped">Unmapped</option>
                        </select>

                        <Button variant="outline" size="icon" onClick={handleRefresh} disabled={loading}>
                            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
                        </Button>
                    </div>
                </div>

                {/* Table */}
                <div className="flex-1 overflow-auto">
                    {loading ? (
                        <div className="p-6 space-y-3">
                            {[...Array(6)].map((_, i) => (
                                <div key={i} className="h-12 rounded bg-muted/40 animate-pulse" />
                            ))}
                        </div>
                    ) : products.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16">
                            <PackageSearch className="h-12 w-12 text-muted-foreground/50" />
                            <h3 className="mt-4 text-lg font-semibold">No products found</h3>
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
                        <table className="w-full text-sm">
                            <thead className="bg-muted/50 sticky top-0 z-10">
                                <tr className="border-b">
                                    <th className="text-left font-medium px-4 py-2 w-[40%]">Store Product</th>
                                    <th className="text-left font-medium px-4 py-2 w-[12%]">Store</th>
                                    <th className="text-left font-medium px-4 py-2 w-[10%]">Status</th>
                                    <th className="text-right font-medium px-4 py-2 w-[8%]">Variants</th>
                                    <th className="text-left font-medium px-4 py-2 w-[30%]">Parent Product Mapping</th>
                                </tr>
                            </thead>
                            <tbody>
                                {paginated.map((product) => (
                                    <tr key={`${product.storeId}-${product.productId}`} className="border-b hover:bg-muted/40">
                                        <td className="px-4 py-2">
                                            <div className="flex items-center gap-3">
                                                {product.featuredImage ? (
                                                    // eslint-disable-next-line @next/next/no-img-element
                                                    <img src={product.featuredImage} alt=""
                                                        className="h-9 w-9 rounded-lg object-cover ring-1 ring-border/50" />
                                                ) : (
                                                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 ring-1 ring-primary/10">
                                                        <Package className="h-4 w-4 text-primary" />
                                                    </div>
                                                )}
                                                <div className="min-w-0">
                                                    <p className="font-medium truncate max-w-[280px]">{product.title}</p>
                                                    {product.vendor && (
                                                        <p className="text-xs text-muted-foreground truncate">{product.vendor}</p>
                                                    )}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-2">
                                            <Badge variant="outline" className="font-normal text-xs">
                                                {product.storeId.replace('.myshopify.com', '')}
                                            </Badge>
                                        </td>
                                        <td className="px-4 py-2">
                                            {product.status && (
                                                <Badge variant="outline"
                                                    className={cn('font-normal text-xs capitalize', STATUS_STYLES[product.status] ?? '')}>
                                                    {product.status}
                                                </Badge>
                                            )}
                                        </td>
                                        <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                                            {product.variantCount}
                                        </td>
                                        <td className="px-4 py-2">
                                            <ParentMapperCell
                                                product={product}
                                                businessId={businessId}
                                                user={user}
                                                parents={parents}
                                                parentNameById={parentNameById}
                                                onMappingChange={handleRefresh}
                                            />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
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