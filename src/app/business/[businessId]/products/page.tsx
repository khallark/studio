// /business/[businessId]/dashboard/products/page.tsx
'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useBusinessContext } from './../layout';
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
    CardDescription,
    CardHeader,
    CardTitle,
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
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { useDebounce } from 'use-debounce';
import {
    Package,
    Plus,
    Search,
    MoreHorizontal,
    Pencil,
    Trash2,
    PackagePlus,
    Weight,
    Tag,
    Barcode,
    Layers,
    ArrowUpDown,
    Download,
    Upload,
    Filter,
    X,
    ChevronLeft,
    ChevronRight,
    Loader2,
    PackageOpen,
    Sparkles,
    History,
    Link2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { ProductActivityLog } from '@/components/product-activity-log';
import { ProductMappingsDialog } from '@/components/product-mappings-dialog';
import { BulkUploadDialog } from '@/components/bulk-upload-dialog';
import Link from 'next/link';

// ============================================================
// TYPES
// ============================================================

interface Product {
    id: string; // SKU
    name: string;
    sku: string;
    weight: number;
    category: string;
    createdBy?: string;
    createdAt?: Timestamp;
    description?: string;
    price?: number;
    stock?: number;
    status?: 'active' | 'draft' | 'archived';
    mappedVariants?: Array<{
        storeId: string;
        productId: string;
        productTitle: string;
        variantId: number;
        variantTitle: string;
        variantSku: string;
        mappedAt: string;
    }>;
}

interface ProductFormData {
    name: string;
    sku: string;
    weight: string;
    category: string;
    description: string;
    price: string;
    stock: string;
}

const CATEGORIES = [
    'Apparel',
    'Accessories',
    'Footwear',
    'Electronics',
    'Home & Living',
    'Beauty & Personal Care',
    'Sports & Outdoors',
    'Books & Stationery',
    'Food & Beverages',
    'Other',
];

const initialFormData: ProductFormData = {
    name: '',
    sku: '',
    weight: '',
    category: '',
    description: '',
    price: '',
    stock: '',
};

// ============================================================
// ANIMATIONS
// ============================================================

const tableRowVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: (i: number) => ({
        opacity: 1,
        y: 0,
        transition: {
            delay: i * 0.05,
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
// MAIN COMPONENT
// ============================================================

export default function ProductsPage() {
    const { isAuthorized, loading: authLoading, user, businessId } = useBusinessContext();
    const { toast } = useToast();

    // Data state
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);

    // UI state
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearch] = useDebounce(searchQuery, 300);
    const [categoryFilter, setCategoryFilter] = useState<string>('all');
    const [sortField, setSortField] = useState<'name' | 'sku' | 'category' | 'weight' | 'createdAt'>('createdAt');
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
    const [currentPage, setCurrentPage] = useState(1);
    const [rowsPerPage, setRowsPerPage] = useState(10);

    // Dialog state
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [editingProduct, setEditingProduct] = useState<Product | null>(null);
    const [productToDelete, setProductToDelete] = useState<Product | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Activity Log state
    const [activityLogOpen, setActivityLogOpen] = useState(false);
    const [activityLogProduct, setActivityLogProduct] = useState<Product | null>(null);

    // Product Mappings Dialog state
    const [mappingsDialogOpen, setMappingsDialogOpen] = useState(false);

    // Bulk Upload Dialog state
    const [bulkUploadDialogOpen, setBulkUploadDialogOpen] = useState(false);

    // Form state
    const [formData, setFormData] = useState<ProductFormData>(initialFormData);
    const [formErrors, setFormErrors] = useState<Partial<ProductFormData>>({});

    // ============================================================
    // EFFECTS
    // ============================================================

    useEffect(() => {
        document.title = 'Products - Business Dashboard';
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
                        title: 'Error fetching products',
                        description: 'Could not retrieve products. Please try again.',
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
    }, [debouncedSearch, categoryFilter, sortField, sortDirection]);

    // ============================================================
    // COMPUTED VALUES
    // ============================================================

    const filteredProducts = useMemo(() => {
        let result = [...products];

        // Search filter
        if (debouncedSearch) {
            const search = debouncedSearch.toLowerCase();
            result = result.filter(
                (p) =>
                    p.name.toLowerCase().includes(search) ||
                    p.sku.toLowerCase().includes(search) ||
                    p.category?.toLowerCase().includes(search)
            );
        }

        // Category filter
        if (categoryFilter !== 'all') {
            result = result.filter((p) => p.category === categoryFilter);
        }

        // Sort
        result.sort((a, b) => {
            let aVal: any = a[sortField];
            let bVal: any = b[sortField];

            if (sortField === 'createdAt') {
                aVal = aVal?.toMillis?.() || 0;
                bVal = bVal?.toMillis?.() || 0;
            } else if (typeof aVal === 'string') {
                aVal = aVal.toLowerCase();
                bVal = bVal?.toLowerCase() || '';
            }

            if (sortDirection === 'asc') {
                return aVal > bVal ? 1 : -1;
            }
            return aVal < bVal ? 1 : -1;
        });

        return result;
    }, [products, debouncedSearch, categoryFilter, sortField, sortDirection]);

    const paginatedProducts = useMemo(() => {
        const start = (currentPage - 1) * rowsPerPage;
        return filteredProducts.slice(start, start + rowsPerPage);
    }, [filteredProducts, currentPage, rowsPerPage]);

    const totalPages = Math.ceil(filteredProducts.length / rowsPerPage);

    const categoryCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        products.forEach((p) => {
            counts[p.category] = (counts[p.category] || 0) + 1;
        });
        return counts;
    }, [products]);

    // Count products with mappings
    const mappedProductsCount = useMemo(() => {
        return products.filter((p) => p.mappedVariants && p.mappedVariants.length > 0).length;
    }, [products]);

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

    const handleOpenDialog = (product?: Product) => {
        if (product) {
            setEditingProduct(product);
            setFormData({
                name: product.name,
                sku: product.sku,
                weight: product.weight.toString(),
                category: product.category,
                description: product.description || '',
                price: product.price?.toString() || '',
                stock: product.stock?.toString() || '',
            });
        } else {
            setEditingProduct(null);
            setFormData(initialFormData);
        }
        setFormErrors({});
        setIsDialogOpen(true);
    };

    const handleCloseDialog = () => {
        setIsDialogOpen(false);
        setEditingProduct(null);
        setFormData(initialFormData);
        setFormErrors({});
    };

    const handleOpenActivityLog = (product: Product) => {
        setActivityLogProduct(product);
        setActivityLogOpen(true);
    };

    const validateForm = (): boolean => {
        const errors: Partial<ProductFormData> = {};

        if (!formData.name.trim()) errors.name = 'Name is required';
        if (!formData.sku.trim()) errors.sku = 'SKU is required';
        if (!formData.weight || parseFloat(formData.weight) <= 0) {
            errors.weight = 'Valid weight is required';
        }
        if (!formData.category) errors.category = 'Category is required';

        setFormErrors(errors);
        return Object.keys(errors).length === 0;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!validateForm()) return;
        if (!user || !businessId) {
            toast({
                title: 'Authentication Error',
                description: 'You must be logged in.',
                variant: 'destructive',
            });
            return;
        }

        setIsSubmitting(true);

        try {
            const idToken = await user.getIdToken();
            const isEditing = !!editingProduct;

            const productPayload = {
                name: formData.name.trim(),
                sku: formData.sku.trim().toUpperCase(),
                weight: parseFloat(formData.weight),
                category: formData.category,
                description: formData.description.trim() || null,
                price: formData.price ? parseFloat(formData.price) : null,
                stock: formData.stock ? parseInt(formData.stock) : null,
            };

            if (isEditing) {
                // Update existing product
                const response = await fetch('/api/business/products/update', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${idToken}`,
                    },
                    body: JSON.stringify({
                        businessId,
                        sku: editingProduct.sku,
                        product: productPayload,
                    }),
                });

                const result = await response.json();
                if (!response.ok) throw new Error(result.message || 'Failed to update product');

                // Show changes in toast if any
                if (result.changes && result.changes.length > 0) {
                    const changesSummary = result.changes
                        .slice(0, 3)
                        .map((c: any) => c.fieldLabel)
                        .join(', ');
                    toast({
                        title: 'Product Updated',
                        description: `Updated: ${changesSummary}${result.changes.length > 3 ? ` +${result.changes.length - 3} more` : ''}`,
                    });
                } else {
                    toast({
                        title: 'No Changes',
                        description: 'No changes were detected.',
                    });
                }
            } else {
                // Create new product
                const response = await fetch('/api/business/products/create', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${idToken}`,
                    },
                    body: JSON.stringify({
                        businessId,
                        product: productPayload,
                    }),
                });

                const result = await response.json();
                if (!response.ok) throw new Error(result.message || 'Failed to create product');

                toast({
                    title: 'Product Created',
                    description: `${productPayload.name} has been added to your catalog.`,
                });
            }

            handleCloseDialog();
        } catch (error) {
            console.error('Error saving product:', error);
            toast({
                title: 'Error',
                description: error instanceof Error ? error.message : 'Failed to save product.',
                variant: 'destructive',
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async () => {
        if (!productToDelete || !user || !businessId) return;

        try {
            const idToken = await user.getIdToken();
            const response = await fetch('/api/business/products/delete', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${idToken}`,
                },
                body: JSON.stringify({
                    businessId,
                    sku: productToDelete.sku,
                }),
            });

            const result = await response.json();
            if (!response.ok) throw new Error(result.message || 'Failed to delete product');

            toast({
                title: 'Product Deleted',
                description: `${productToDelete.name} has been removed from your catalog.`,
            });
        } catch (error) {
            console.error('Error deleting product:', error);
            toast({
                title: 'Delete Failed',
                description: error instanceof Error ? error.message : 'An error occurred.',
                variant: 'destructive',
            });
        } finally {
            setIsDeleteDialogOpen(false);
            setProductToDelete(null);
        }
    };

    const formatDate = (timestamp?: Timestamp) => {
        if (!timestamp) return '—';
        return timestamp.toDate().toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
        });
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
                        <div className="p-2 rounded-xl bg-primary/10 ring-1 ring-primary/20">
                            <Package className="h-6 w-6 text-primary" />
                        </div>
                        <div>
                            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Products</h1>
                            <p className="text-sm text-muted-foreground">
                                Manage your product catalog
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                    {/* Bulk Upload Button */}
                    <Button
                        variant="outline"
                        onClick={() => setBulkUploadDialogOpen(true)}
                        className="gap-2"
                    >
                        <Upload className="h-4 w-4" />
                        Bulk Upload
                    </Button>

                    {/* Product Mappings Button */}
                    <Button
                        variant="outline"
                        onClick={() => setMappingsDialogOpen(true)}
                        className="gap-2 border-primary/20 hover:bg-primary/5 hover:border-primary/40 transition-all duration-300"
                    >
                        <Link2 className="h-4 w-4 text-primary" />
                        Product Mappings
                        {mappedProductsCount > 0 && (
                            <Badge variant="secondary" className="ml-1 bg-primary/10 text-primary">
                                {mappedProductsCount}
                            </Badge>
                        )}
                    </Button>

                    <Button
                        onClick={() => handleOpenDialog()}
                        className="gap-2 shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all duration-300"
                    >
                        <Plus className="h-4 w-4" />
                        Add Product
                    </Button>
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
                                <Layers className="h-5 w-5 text-blue-600" />
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
                                    Categories
                                </p>
                                <p className="text-2xl font-bold mt-1">
                                    {Object.keys(categoryCounts).length}
                                </p>
                            </div>
                            <div className="p-2 rounded-lg bg-emerald-500/10">
                                <Tag className="h-5 w-5 text-emerald-600" />
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
                                    Avg Weight
                                </p>
                                <p className="text-2xl font-bold mt-1">
                                    {products.length > 0
                                        ? Math.round(
                                            products.reduce((sum, p) => sum + p.weight, 0) /
                                            products.length
                                        )
                                        : 0}
                                    <span className="text-sm font-normal text-muted-foreground ml-1">g</span>
                                </p>
                            </div>
                            <div className="p-2 rounded-lg bg-amber-500/10">
                                <Weight className="h-5 w-5 text-amber-600" />
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
                                    Mapped
                                </p>
                                <p className="text-2xl font-bold mt-1">{mappedProductsCount}</p>
                            </div>
                            <div className="p-2 rounded-lg bg-violet-500/10">
                                <Link2 className="h-5 w-5 text-violet-600" />
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
                                    placeholder="Search products by name, SKU, or category..."
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
                                <SelectTrigger className="w-full sm:w-[200px] bg-background border-0 ring-1 ring-border/50">
                                    <SelectValue placeholder="All Categories" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Categories</SelectItem>
                                    {CATEGORIES.map((cat) => (
                                        <SelectItem key={cat} value={cat}>
                                            {cat}{' '}
                                            {categoryCounts[cat] && (
                                                <span className="text-muted-foreground">
                                                    ({categoryCounts[cat]})
                                                </span>
                                            )}
                                        </SelectItem>
                                    ))}
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
                                <h3 className="mt-6 text-xl font-semibold">No products yet</h3>
                                <p className="mt-2 text-muted-foreground text-center max-w-sm">
                                    Start building your product catalog by adding your first product.
                                </p>
                                <Button onClick={() => handleOpenDialog()} className="mt-6 gap-2">
                                    <Sparkles className="h-4 w-4" />
                                    Add Your First Product
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
                                    }}
                                >
                                    Clear Filters
                                </Button>
                            </div>
                        ) : (
                            <Table>
                                <TableHeader className="bg-muted/50 sticky top-0">
                                    <TableRow className="hover:bg-transparent">
                                        <TableHead className="w-[300px]">
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
                                        <TableHead>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="-ml-3 h-8 gap-1 font-semibold"
                                                onClick={() => handleSort('sku')}
                                            >
                                                SKU
                                                <ArrowUpDown className="h-3 w-3" />
                                            </Button>
                                        </TableHead>
                                        <TableHead>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="-ml-3 h-8 gap-1 font-semibold"
                                                onClick={() => handleSort('category')}
                                            >
                                                Category
                                                <ArrowUpDown className="h-3 w-3" />
                                            </Button>
                                        </TableHead>
                                        <TableHead className="text-right">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="-ml-3 h-8 gap-1 font-semibold"
                                                onClick={() => handleSort('weight')}
                                            >
                                                Weight
                                                <ArrowUpDown className="h-3 w-3" />
                                            </Button>
                                        </TableHead>
                                        <TableHead>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="-ml-3 h-8 gap-1 font-semibold"
                                                onClick={() => handleSort('createdAt')}
                                            >
                                                Added
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
                                        {paginatedProducts.map((product, index) => (
                                            <motion.tr
                                                key={product.id}
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
                                                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-primary/10 to-primary/5 ring-1 ring-primary/10 group-hover:ring-primary/20 transition-all">
                                                            <Package className="h-5 w-5 text-primary" />
                                                        </div>
                                                        <div>
                                                            <div className="flex items-center gap-2">
                                                                <p className="font-medium leading-none">
                                                                    {product.name}
                                                                </p>
                                                                {product.mappedVariants && product.mappedVariants.length > 0 && (
                                                                    <Badge variant="outline" className="h-5 gap-1 text-[10px] bg-emerald-500/10 text-emerald-700 border-emerald-500/20">
                                                                        <Link2 className="h-2.5 w-2.5" />
                                                                        {product.mappedVariants.length}
                                                                    </Badge>
                                                                )}
                                                            </div>
                                                            {product.description && (
                                                                <p className="text-xs text-muted-foreground mt-1 line-clamp-1 max-w-[200px]">
                                                                    {product.description}
                                                                </p>
                                                            )}
                                                        </div>
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <code className="px-2 py-1 rounded bg-muted text-xs font-mono">
                                                        {product.sku}
                                                    </code>
                                                </TableCell>
                                                <TableCell>
                                                    <Badge
                                                        variant="secondary"
                                                        className="font-normal bg-secondary/50"
                                                    >
                                                        {product.category}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-right font-medium tabular-nums">
                                                    {product.weight}
                                                    <span className="text-muted-foreground ml-1">g</span>
                                                </TableCell>
                                                <TableCell className="text-muted-foreground text-sm">
                                                    {formatDate(product.createdAt)}
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
                                                                onClick={() => handleOpenDialog(product)}
                                                                className="gap-2"
                                                            >
                                                                <Pencil className="h-4 w-4" />
                                                                Edit
                                                            </DropdownMenuItem>
                                                            <DropdownMenuItem
                                                                onClick={() => handleOpenActivityLog(product)}
                                                                className="gap-2"
                                                            >
                                                                <History className="h-4 w-4" />
                                                                View History
                                                            </DropdownMenuItem>
                                                            <DropdownMenuSeparator />
                                                            <DropdownMenuItem
                                                                onClick={() => {
                                                                    setProductToDelete(product);
                                                                    setIsDeleteDialogOpen(true);
                                                                }}
                                                                className="gap-2 text-destructive focus:text-destructive"
                                                            >
                                                                <Trash2 className="h-4 w-4" />
                                                                Delete
                                                            </DropdownMenuItem>
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                </TableCell>
                                            </motion.tr>
                                        ))}
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

            {/* Add/Edit Dialog */}
            <Dialog open={isDialogOpen} onOpenChange={(open) => !open && handleCloseDialog()}>
                <DialogContent className="sm:max-w-[500px]">
                    <form onSubmit={handleSubmit}>
                        <DialogHeader>
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-primary/10">
                                    <PackagePlus className="h-5 w-5 text-primary" />
                                </div>
                                <div>
                                    <DialogTitle>
                                        {editingProduct ? 'Edit Product' : 'Add New Product'}
                                    </DialogTitle>
                                    <DialogDescription>
                                        {editingProduct
                                            ? 'Update the product details below.'
                                            : 'Fill in the details to add a new product to your catalog.'}
                                    </DialogDescription>
                                </div>
                            </div>
                        </DialogHeader>

                        <div className="grid gap-5 py-6">
                            {/* Name */}
                            <div className="space-y-2">
                                <Label htmlFor="name" className="text-sm font-medium">
                                    Product Name <span className="text-destructive">*</span>
                                </Label>
                                <Input
                                    id="name"
                                    value={formData.name}
                                    onChange={(e) =>
                                        setFormData({ ...formData, name: e.target.value })
                                    }
                                    placeholder="e.g. Cotton T-Shirt"
                                    className={cn(formErrors.name && 'border-destructive')}
                                />
                                {formErrors.name && (
                                    <p className="text-xs text-destructive">{formErrors.name}</p>
                                )}
                            </div>

                            {/* SKU & Weight */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="sku" className="text-sm font-medium">
                                        SKU <span className="text-destructive">*</span>
                                    </Label>
                                    <div className="relative">
                                        <Barcode className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                        <Input
                                            id="sku"
                                            value={formData.sku}
                                            onChange={(e) =>
                                                setFormData({
                                                    ...formData,
                                                    sku: e.target.value.toUpperCase(),
                                                })
                                            }
                                            placeholder="TSH-001"
                                            className={cn('pl-10', formErrors.sku && 'border-destructive')}
                                            disabled={!!editingProduct}
                                        />
                                    </div>
                                    {formErrors.sku && (
                                        <p className="text-xs text-destructive">{formErrors.sku}</p>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="weight" className="text-sm font-medium">
                                        Weight (grams) <span className="text-destructive">*</span>
                                    </Label>
                                    <div className="relative">
                                        <Weight className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                        <Input
                                            id="weight"
                                            type="number"
                                            min="1"
                                            step="1"
                                            value={formData.weight}
                                            onChange={(e) =>
                                                setFormData({ ...formData, weight: e.target.value })
                                            }
                                            placeholder="250"
                                            className={cn('pl-10', formErrors.weight && 'border-destructive')}
                                        />
                                    </div>
                                    {formErrors.weight && (
                                        <p className="text-xs text-destructive">{formErrors.weight}</p>
                                    )}
                                </div>
                            </div>

                            {/* Category */}
                            <div className="space-y-2">
                                <Label htmlFor="category" className="text-sm font-medium">
                                    Category <span className="text-destructive">*</span>
                                </Label>
                                <Select
                                    value={formData.category}
                                    onValueChange={(value) =>
                                        setFormData({ ...formData, category: value })
                                    }
                                >
                                    <SelectTrigger
                                        className={cn(formErrors.category && 'border-destructive')}
                                    >
                                        <SelectValue placeholder="Select a category" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {CATEGORIES.map((cat) => (
                                            <SelectItem key={cat} value={cat}>
                                                {cat}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                {formErrors.category && (
                                    <p className="text-xs text-destructive">{formErrors.category}</p>
                                )}
                            </div>

                            {/* Description */}
                            <div className="space-y-2">
                                <Label htmlFor="description" className="text-sm font-medium">
                                    Description
                                </Label>
                                <Input
                                    id="description"
                                    value={formData.description}
                                    onChange={(e) =>
                                        setFormData({ ...formData, description: e.target.value })
                                    }
                                    placeholder="Brief product description (optional)"
                                />
                            </div>

                            {/* Price & Stock */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="price" className="text-sm font-medium">
                                        Price (₹)
                                    </Label>
                                    <Input
                                        id="price"
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={formData.price}
                                        onChange={(e) =>
                                            setFormData({ ...formData, price: e.target.value })
                                        }
                                        placeholder="499.00"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="stock" className="text-sm font-medium">
                                        Stock
                                    </Label>
                                    <Input
                                        id="stock"
                                        type="number"
                                        min="0"
                                        step="1"
                                        value={formData.stock}
                                        onChange={(e) =>
                                            setFormData({ ...formData, stock: e.target.value })
                                        }
                                        placeholder="100"
                                    />
                                </div>
                            </div>
                        </div>

                        <DialogFooter>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={handleCloseDialog}
                                disabled={isSubmitting}
                            >
                                Cancel
                            </Button>
                            <Button type="submit" disabled={isSubmitting} className="gap-2">
                                {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                                {editingProduct ? 'Save Changes' : 'Add Product'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation Dialog */}
            <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Product</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to delete{' '}
                            <span className="font-semibold">{productToDelete?.name}</span>? This action
                            cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDelete}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Activity Log Sheet */}
            {activityLogProduct && (
                <ProductActivityLog
                    open={activityLogOpen}
                    onOpenChange={(open) => {
                        setActivityLogOpen(open);
                        if (!open) {
                            // Force cleanup of any lingering pointer-events
                            document.body.style.pointerEvents = '';
                            // Clear the product after animation completes
                            setTimeout(() => setActivityLogProduct(null), 300);
                        }
                    }}
                    businessId={businessId}
                    sku={activityLogProduct.sku}
                    productName={activityLogProduct.name}
                    user={user}
                />
            )}

            {/* Product Mappings Dialog */}
            <ProductMappingsDialog
                open={mappingsDialogOpen}
                onOpenChange={setMappingsDialogOpen}
                businessId={businessId}
                user={user}
            />

            {/* Bulk Product Upload Dialog */}
            <BulkUploadDialog
                open={bulkUploadDialogOpen}
                onOpenChange={setBulkUploadDialogOpen}
                businessId={businessId}
                user={user}
            />
        </div>
    );
}