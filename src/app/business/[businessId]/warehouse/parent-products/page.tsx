// /business/[businessId]/dashboard/warehouse/parent-products/page.tsx
'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useBusinessContext } from '../../layout';
import { db } from '@/lib/firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import { useParentProducts } from '@/hooks/use-parent-products';
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import {
    Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
    DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { useDebounce } from 'use-debounce';
import {
    Package2, Plus, Search, MoreHorizontal, Pencil, Trash2, Layers, ArrowUpDown,
    X, ChevronLeft, ChevronRight, Loader2, PackageOpen, Sparkles, Boxes, AlertTriangle,
    Link2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { ParentProduct } from '@/types/warehouse';
import { Timestamp } from 'firebase-admin/firestore';
import { Product } from '@/types/warehouse';
import { Ruler } from 'lucide-react';
import { ParentSizeChartDialog } from '@/components/parent-size-chart-dialog';
import { ManagePresetsDialog } from '@/components/manage-presets-dialog';
import { ParentProductMappingsDialog } from '@/components/parent-product-mappings-dialog';
import { Textarea } from '@/components/ui/textarea';

const tableRowVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: (i: number) => ({
        opacity: 1, y: 0,
        transition: { delay: i * 0.05, duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] },
    }),
    exit: { opacity: 0, x: -20, transition: { duration: 0.2 } },
};

const cardVariants = {
    hidden: { opacity: 0, scale: 0.95 },
    visible: { opacity: 1, scale: 1, transition: { duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] } },
};

export default function ParentProductsPage() {
    const { isAuthorized, loading: authLoading, user, businessId } = useBusinessContext();
    const { toast } = useToast();

    const { parents, loading } = useParentProducts(businessId);
    const [childProducts, setChildProducts] = useState<Product[]>([]);

    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearch] = useDebounce(searchQuery, 300);
    const [sortField, setSortField] = useState<'name' | 'count' | 'createdAt'>('createdAt');
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
    const [currentPage, setCurrentPage] = useState(1);
    const [rowsPerPage, setRowsPerPage] = useState(10);

    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editing, setEditing] = useState<ParentProduct | null>(null);
    const [nameInput, setNameInput] = useState('');
    const [idInput, setIdInput] = useState('');
    const [descInput, setDescInput] = useState('');
    const [specFit, setSpecFit] = useState('');
    const [specComposition, setSpecComposition] = useState('');
    const [specTechnique, setSpecTechnique] = useState('');
    const [specFabric, setSpecFabric] = useState('');
    const [nameError, setNameError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [sizeChartParent, setSizeChartParent] = useState<ParentProduct | null>(null);
    const [sizeChartOpen, setSizeChartOpen] = useState(false);
    const [managePresetsOpen, setManagePresetsOpen] = useState(false);
    const [mappingsOpen, setMappingsOpen] = useState(false);

    const [toDelete, setToDelete] = useState<ParentProduct | null>(null);
    const [isDeleteOpen, setIsDeleteOpen] = useState(false);

    useEffect(() => {
        document.title = 'Parent Products - Business Dashboard';
    }, []);

    // Live child products (for counts + size-chart prefill)
    useEffect(() => {
        if (!authLoading && isAuthorized && businessId && user) {
            const ref = collection(db, 'users', businessId, 'products');
            const unsubscribe = onSnapshot(ref, (snapshot) => {
                const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as Product[];
                setChildProducts(list);
            });
            return () => unsubscribe();
        }
    }, [authLoading, isAuthorized, businessId, user]);

    const productCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        for (const p of childProducts) {
            if (p.parentProductId) counts[p.parentProductId] = (counts[p.parentProductId] || 0) + 1;
        }
        return counts;
    }, [childProducts]);

    useEffect(() => { setCurrentPage(1); }, [debouncedSearch, sortField, sortDirection]);

    const filtered = useMemo(() => {
        let result = [...parents];
        if (debouncedSearch) {
            const s = debouncedSearch.toLowerCase();
            result = result.filter((p) => p.name.toLowerCase().includes(s));
        }
        result.sort((a, b) => {
            let av: any, bv: any;
            if (sortField === 'count') {
                av = productCounts[a.id] ?? 0;
                bv = productCounts[b.id] ?? 0;
            } else if (sortField === 'createdAt') {
                av = (a.createdAt as any)?.toMillis?.() ?? 0;
                bv = (b.createdAt as any)?.toMillis?.() ?? 0;
            } else {
                av = a.name.toLowerCase();
                bv = b.name.toLowerCase();
            }
            if (sortDirection === 'asc') return av > bv ? 1 : -1;
            return av < bv ? 1 : -1;
        });
        return result;
    }, [parents, debouncedSearch, sortField, sortDirection, productCounts]);

    const paginated = useMemo(() => {
        const start = (currentPage - 1) * rowsPerPage;
        return filtered.slice(start, start + rowsPerPage);
    }, [filtered, currentPage, rowsPerPage]);

    const totalPages = Math.ceil(filtered.length / rowsPerPage);
    const totalAssigned = useMemo(
        () => Object.values(productCounts).reduce((s, n) => s + n, 0),
        [productCounts]
    );
    const orphanCount = useMemo(
        () => parents.filter((p) => !(productCounts[p.id] > 0)).length,
        [parents, productCounts]
    );

    const handleSort = (field: typeof sortField) => {
        if (sortField === field) setSortDirection((p) => (p === 'asc' ? 'desc' : 'asc'));
        else { setSortField(field); setSortDirection('asc'); }
    };

    const openDialog = (parent?: ParentProduct) => {
        setEditing(parent ?? null);
        setNameInput(parent?.name ?? '');
        setIdInput(parent?.id ?? '');
        setNameError('');
        setIsDialogOpen(true);
        setDescInput(parent?.description ?? '');
        setSpecFit(parent?.specifications?.fit ?? '');
        setSpecComposition(parent?.specifications?.composition ?? '');
        setSpecTechnique(parent?.specifications?.technique ?? '');
        setSpecFabric(parent?.specifications?.fabric ?? '');
    };
    const closeDialog = () => {
        setIsDialogOpen(false);
        setEditing(null);
        setIdInput('');
        setNameInput('');
        setNameError('');
        setDescInput('');
        setSpecFit('');
        setSpecComposition('');
        setSpecTechnique('');
        setSpecFabric('');
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const name = nameInput.trim();
        if (!name) { setNameError('Name is required'); return; }
        if (!user || !businessId) return;

        const description = descInput.trim() ? descInput.trim() : null;
        const fit = specFit.trim();
        const composition = specComposition.trim();
        const technique = specTechnique.trim();
        const fabric = specFabric.trim();
        const specifications = (fit || composition || technique || fabric) ? { fit, composition, technique, fabric } : null;

        const body = editing
            ? { businessId, parentProductId: editing.id, name, description, specifications }
            : { businessId, id: idInput, name, description, specifications };


        setIsSubmitting(true);
        try {
            const idToken = await user.getIdToken();
            const endpoint = editing
                ? '/api/business/parent-products/update'
                : '/api/business/parent-products/create';

            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
                body: JSON.stringify(body),
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.message || 'Request failed');

            toast({
                title: editing ? 'Parent Updated' : 'Parent Created',
                description: editing ? `Updated "${name}".` : `"${name}" has been added.`,
            });
            closeDialog();
        } catch (err) {
            toast({
                title: 'Error',
                description: err instanceof Error ? err.message : 'Failed to save parent product.',
                variant: 'destructive',
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async () => {
        if (!toDelete || !user || !businessId) return;
        try {
            const idToken = await user.getIdToken();
            const res = await fetch('/api/business/parent-products/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
                body: JSON.stringify({ businessId, parentProductId: toDelete.id }),
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.message || 'Failed to delete');
            toast({ title: 'Parent Deleted', description: `"${toDelete.name}" was removed.` });
        } catch (err) {
            toast({
                title: 'Delete Failed',
                description: err instanceof Error ? err.message : 'An error occurred.',
                variant: 'destructive',
            });
        } finally {
            setIsDeleteOpen(false);
            setToDelete(null);
        }
    };

    const formatDate = (timestamp: Timestamp | null | undefined) => {
        if (!timestamp) return '—';
        return (timestamp as any).toDate().toLocaleDateString('en-IN', {
            day: 'numeric', month: 'short', year: 'numeric',
        });
    };

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
    if (!isAuthorized) return null;

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <motion.div
                initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
                className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4 md:p-6 border-b bg-gradient-to-r from-background via-background to-muted/30"
            >
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-primary/10 ring-1 ring-primary/20">
                        <Boxes className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Parent Products</h1>
                        <p className="text-sm text-muted-foreground">Group your product variants under a parent</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={() => setManagePresetsOpen(true)} className="gap-2">
                        <Ruler className="h-4 w-4" />
                        Manage Templates
                    </Button>
                    <Button variant="outline" onClick={() => setMappingsOpen(true)} className="gap-2">
                        <Link2 className="h-4 w-4" />
                        Store Mappings
                    </Button>
                    <Button onClick={() => openDialog()} className="gap-2 shadow-lg shadow-primary/20">
                        <Plus className="h-4 w-4" />
                        Add Parent
                    </Button>
                </div>
            </motion.div>

            {/* Stats */}
            <motion.div
                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.1 }}
                className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 md:px-6"
            >
                <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-blue-500/10 via-blue-500/5 to-transparent">
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Total Parents</p>
                                <p className="text-2xl font-bold mt-1">{parents.length}</p>
                            </div>
                            <div className="p-2 rounded-lg bg-blue-500/10"><Layers className="h-5 w-5 text-blue-600" /></div>
                        </div>
                    </CardContent>
                </Card>
                <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent">
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Products Assigned</p>
                                <p className="text-2xl font-bold mt-1">{totalAssigned}</p>
                            </div>
                            <div className="p-2 rounded-lg bg-emerald-500/10"><Package2 className="h-5 w-5 text-emerald-600" /></div>
                        </div>
                    </CardContent>
                </Card>
                <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-transparent">
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Empty Parents</p>
                                <p className="text-2xl font-bold mt-1">{orphanCount}</p>
                            </div>
                            <div className="p-2 rounded-lg bg-amber-500/10"><AlertTriangle className="h-5 w-5 text-amber-600" /></div>
                        </div>
                    </CardContent>
                </Card>
            </motion.div>

            {/* Table */}
            <motion.div variants={cardVariants} initial="hidden" animate="visible"
                className="flex-1 p-4 md:px-6 md:pb-6 overflow-hidden">
                <Card className="h-full flex flex-col shadow-xl shadow-black/5 border-0 ring-1 ring-border/50">
                    <CardHeader className="pb-4 border-b bg-muted/30">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search parent products by name..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-10 bg-background border-0 ring-1 ring-border/50 focus-visible:ring-2 focus-visible:ring-primary/50"
                            />
                            {searchQuery && (
                                <Button variant="ghost" size="icon"
                                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                                    onClick={() => setSearchQuery('')}>
                                    <X className="h-3 w-3" />
                                </Button>
                            )}
                        </div>
                    </CardHeader>

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
                                        <Skeleton className="h-6 w-16 rounded-full" />
                                    </div>
                                ))}
                            </div>
                        ) : parents.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-20 px-4">
                                <div className="relative">
                                    <div className="absolute inset-0 bg-gradient-to-r from-primary/20 via-primary/10 to-primary/20 blur-3xl rounded-full" />
                                    <div className="relative p-6 rounded-full bg-gradient-to-br from-muted to-muted/50 ring-1 ring-border/50">
                                        <PackageOpen className="h-16 w-16 text-muted-foreground" />
                                    </div>
                                </div>
                                <h3 className="mt-6 text-xl font-semibold">No parent products yet</h3>
                                <p className="mt-2 text-muted-foreground text-center max-w-sm">
                                    Create a parent product to start grouping your variants.
                                </p>
                                <Button onClick={() => openDialog()} className="mt-6 gap-2">
                                    <Sparkles className="h-4 w-4" />
                                    Add Your First Parent
                                </Button>
                            </div>
                        ) : filtered.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-20 px-4">
                                <Search className="h-12 w-12 text-muted-foreground/50" />
                                <h3 className="mt-4 text-lg font-medium">No results found</h3>
                                <Button variant="outline" className="mt-4" onClick={() => setSearchQuery('')}>
                                    Clear Search
                                </Button>
                            </div>
                        ) : (
                            <Table>
                                <TableHeader className="bg-muted/50 sticky top-0">
                                    <TableRow className="hover:bg-transparent">
                                        <TableHead>
                                            <Button variant="ghost" size="sm" className="-ml-3 h-8 gap-1 font-semibold"
                                                onClick={() => handleSort('name')}>
                                                Parent Name <ArrowUpDown className="h-3 w-3" />
                                            </Button>
                                        </TableHead>
                                        <TableHead>
                                            <Button variant="ghost" size="sm" className="-ml-3 h-8 gap-1 font-semibold"
                                                onClick={() => handleSort('count')}>
                                                Products <ArrowUpDown className="h-3 w-3" />
                                            </Button>
                                        </TableHead>
                                        <TableHead>
                                            <Button variant="ghost" size="sm" className="-ml-3 h-8 gap-1 font-semibold"
                                                onClick={() => handleSort('createdAt')}>
                                                Created <ArrowUpDown className="h-3 w-3" />
                                            </Button>
                                        </TableHead>
                                        <TableHead className="w-[60px]"><span className="sr-only">Actions</span></TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    <AnimatePresence mode="popLayout">
                                        {paginated.map((parent, index) => {
                                            const count = productCounts[parent.id] ?? 0;
                                            return (
                                                <motion.tr
                                                    key={parent.id} custom={index} variants={tableRowVariants}
                                                    initial="hidden" animate="visible" exit="exit" layout
                                                    className="group border-b transition-colors hover:bg-muted/50"
                                                >
                                                    <TableCell className="py-3">
                                                        <div className="flex items-center gap-3">
                                                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-primary/10 to-primary/5 ring-1 ring-primary/10">
                                                                <Boxes className="h-5 w-5 text-primary" />
                                                            </div>
                                                            <div>
                                                                <p className="font-medium leading-none">{parent.name}</p>
                                                                <code className="text-[11px] text-muted-foreground font-mono">{parent.id}</code>
                                                            </div>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>
                                                        <Badge variant={count > 0 ? 'secondary' : 'outline'}
                                                            className={cn('font-normal', count > 0 ? 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20' : 'text-muted-foreground')}>
                                                            {count} {count === 1 ? 'product' : 'products'}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="text-muted-foreground text-sm">
                                                        {formatDate(parent.createdAt)}
                                                    </TableCell>
                                                    <TableCell>
                                                        <DropdownMenu>
                                                            <DropdownMenuTrigger asChild>
                                                                <Button variant="ghost" size="icon"
                                                                    className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                    <MoreHorizontal className="h-4 w-4" />
                                                                    <span className="sr-only">Open menu</span>
                                                                </Button>
                                                            </DropdownMenuTrigger>
                                                            <DropdownMenuContent align="end" className="w-48">
                                                                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                                                <DropdownMenuSeparator />
                                                                <DropdownMenuItem
                                                                    onClick={() => {
                                                                        setSizeChartParent(parent);
                                                                        setSizeChartOpen(true);
                                                                    }}
                                                                    className="gap-2"
                                                                >
                                                                    <Ruler className="h-4 w-4" />
                                                                    {parent.sizeChart ? 'Edit Size Chart' : 'Size Chart'}
                                                                </DropdownMenuItem>
                                                                <DropdownMenuItem onClick={() => openDialog(parent)} className="gap-2">
                                                                    <Pencil className="h-4 w-4" /> Edit
                                                                </DropdownMenuItem>
                                                                <DropdownMenuSeparator />
                                                                <DropdownMenuItem
                                                                    disabled={count > 0}
                                                                    onClick={() => { setToDelete(parent); setIsDeleteOpen(true); }}
                                                                    className="gap-2 text-destructive focus:text-destructive">
                                                                    <Trash2 className="h-4 w-4" />
                                                                    {count > 0 ? 'In use' : 'Delete'}
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

                    {filtered.length > 0 && (
                        <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/30">
                            <p className="text-sm text-muted-foreground">
                                Showing <span className="font-medium">{(currentPage - 1) * rowsPerPage + 1}</span> to{' '}
                                <span className="font-medium">{Math.min(currentPage * rowsPerPage, filtered.length)}</span> of{' '}
                                <span className="font-medium">{filtered.length}</span> parents
                            </p>
                            <div className="flex items-center gap-2">
                                <Select value={rowsPerPage.toString()} onValueChange={(v) => setRowsPerPage(Number(v))}>
                                    <SelectTrigger className="w-[70px] h-8"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {['10', '25', '50', '100'].map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                                <div className="flex items-center gap-1">
                                    <Button variant="outline" size="icon" className="h-8 w-8"
                                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1}>
                                        <ChevronLeft className="h-4 w-4" />
                                    </Button>
                                    <span className="text-sm font-medium px-2">{currentPage} / {totalPages || 1}</span>
                                    <Button variant="outline" size="icon" className="h-8 w-8"
                                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages}>
                                        <ChevronRight className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        </div>
                    )}
                </Card>
            </motion.div>

            {/* Add / Rename Dialog */}
            <Dialog open={isDialogOpen} onOpenChange={(o) => !o && closeDialog()}>
                <DialogContent className="sm:max-w-[480px] max-h-[85vh] overflow-y-auto">
                    <form onSubmit={handleSubmit}>
                        <DialogHeader>
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-primary/10"><Boxes className="h-5 w-5 text-primary" /></div>
                                <div>
                                    <DialogTitle>{editing ? 'Edit Parent Product' : 'Add Parent Product'}</DialogTitle>
                                    <DialogDescription>
                                        {editing ? 'Update the parent product details.' : 'Create a new parent to group variants under.'}
                                    </DialogDescription>
                                </div>
                            </div>
                        </DialogHeader>
                        <div className="py-6 space-y-2">
                            {!editing && (
                                <div className="space-y-2">
                                    <Label htmlFor="parentId" className="text-sm font-medium">
                                        Parent ID <span className="text-destructive">*</span>
                                    </Label>
                                    <Input
                                        id="parentId"
                                        value={idInput}
                                        onChange={(e) => setIdInput(e.target.value.toUpperCase())}
                                        placeholder="e.g. 4XPOWERDENIMPANTS"
                                        className="font-mono"
                                    />
                                    <p className="text-[11px] text-muted-foreground">
                                        Uppercased and stripped of spaces/symbols on save. Cannot be changed later.
                                    </p>
                                </div>
                            )}
                            <Label htmlFor="parentName" className="text-sm font-medium">
                                Name <span className="text-destructive">*</span>
                            </Label>
                            <Input id="parentName" value={nameInput}
                                onChange={(e) => { setNameInput(e.target.value); setNameError(''); }}
                                placeholder="e.g. 4X Power Denim Pants"
                                className={cn(nameError && 'border-destructive')} autoFocus />
                            {nameError && <p className="text-xs text-destructive">{nameError}</p>}
                            <div className="space-y-2 pt-2">
                                <Label htmlFor="parentDescription" className="text-sm font-medium">Description</Label>
                                <Textarea
                                    id="parentDescription"
                                    value={descInput}
                                    onChange={(e) => setDescInput(e.target.value)}
                                    placeholder="Short product description shown on the storefront"
                                    rows={3}
                                />
                            </div>

                            <div className="space-y-2 pt-2">
                                <Label className="text-sm font-medium">Specifications</Label>
                                <div className="grid gap-2">
                                    <Input value={specFit} onChange={(e) => setSpecFit(e.target.value)} placeholder="Fit — e.g. Relaxed / Regular" />
                                    <Input value={specFabric} onChange={(e) => setSpecFabric(e.target.value)} placeholder="Fabric — e.g. Denim / Knit" />
                                    <Input value={specComposition} onChange={(e) => setSpecComposition(e.target.value)} placeholder="Composition — e.g. 100% Cotton" />
                                    <Input value={specTechnique} onChange={(e) => setSpecTechnique(e.target.value)} placeholder="Technique — e.g. Garment Dyed" />
                                </div>
                                <p className="text-[11px] text-muted-foreground">Leave all three blank to store no specifications.</p>
                            </div>
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={closeDialog} disabled={isSubmitting}>Cancel</Button>
                            <Button type="submit" disabled={isSubmitting} className="gap-2">
                                {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                                {editing ? 'Save' : 'Create'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Delete Confirm */}
            <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Parent Product</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to delete{' '}
                            <span className="font-semibold">{toDelete?.name}</span>? This cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
            <ParentSizeChartDialog
                open={sizeChartOpen}
                onOpenChange={(o) => {
                    setSizeChartOpen(o);
                    if (!o) setSizeChartParent(null);
                }}
                businessId={businessId}
                user={user}
                parent={sizeChartParent}
                children={
                    sizeChartParent
                        ? childProducts.filter((p) => p.parentProductId === sizeChartParent.id)
                        : []
                }
            />

            <ManagePresetsDialog
                open={managePresetsOpen}
                onOpenChange={setManagePresetsOpen}
                businessId={businessId}
                user={user}
            />

            <ParentProductMappingsDialog
                open={mappingsOpen}
                onOpenChange={setMappingsOpen}
                businessId={businessId}
                user={user}
            />
        </div>
    );
}