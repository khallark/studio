'use client';

// /business/[businessId]/b2b/products/page.tsx

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useBusinessContext } from '../../layout';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { Product, ProductionStageConfig, StageName } from '@/types/b2b';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
    Table, TableBody, TableCell, TableHead,
    TableHeader, TableRow,
} from '@/components/ui/table';
import {
    Dialog, DialogContent, DialogHeader,
    DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem,
    DropdownMenuLabel, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    Package, Plus, Search, X, Loader2,
    MoreHorizontal, Pencil, Layers, ChevronRight,
} from 'lucide-react';

interface ProductForm { name: string; sku: string; category: string; description: string; defaultStages: StageName[]; }
const emptyForm = (): ProductForm => ({ name: '', sku: '', category: '', description: '', defaultStages: [] });

export default function B2BProductsPage() {
    const router = useRouter();
    const { businessId, user, isAuthorized, loading: authLoading } = useBusinessContext();

    const [products, setProducts] = useState<Product[]>([]);
    const [stageConfigs, setStageConfigs] = useState<ProductionStageConfig[]>([]);
    const [loading, setLoading]   = useState(true);
    const [search, setSearch]     = useState('');

    const [dialogOpen, setDialogOpen]     = useState(false);
    const [editing, setEditing]           = useState<Product | null>(null);
    const [form, setForm]                 = useState<ProductForm>(emptyForm());
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (!isAuthorized || !businessId) return;
        const q = query(collection(db, 'users', businessId, 'b2bProducts'), orderBy('name'));
        const unsub1 = onSnapshot(q, snap => {
            setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() } as Product)));
            setLoading(false);
        });
        const unsub2 = onSnapshot(
            query(collection(db, 'users', businessId, 'production_stage_config'), orderBy('sortOrder')),
            snap => setStageConfigs(snap.docs.map(d => ({ id: d.id, ...d.data() } as ProductionStageConfig)))
        );
        return () => { unsub1(); unsub2(); };
    }, [businessId, isAuthorized]);

    const filtered = useMemo(() => products.filter(p =>
        !search ||
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.sku.toLowerCase().includes(search.toLowerCase()) ||
        p.category.toLowerCase().includes(search.toLowerCase())
    ), [products, search]);

    const openCreate = () => { setEditing(null); setForm(emptyForm()); setDialogOpen(true); };
    const openEdit = (p: Product) => {
        setEditing(p);
        setForm({ name: p.name, sku: p.sku, category: p.category, description: p.description ?? '', defaultStages: p.defaultStages });
        setDialogOpen(true);
    };

    const toggleStage = (stage: StageName) => {
        setForm(f => ({
            ...f,
            defaultStages: f.defaultStages.includes(stage)
                ? f.defaultStages.filter(s => s !== stage)
                : [...f.defaultStages, stage],
        }));
    };

    const handleSubmit = async () => {
        if (!user) return;
        if (!form.name.trim() || !form.sku.trim() || !form.category.trim() || form.defaultStages.length === 0) {
            toast({ title: 'Fill all required fields', variant: 'destructive' }); return;
        }
        setIsSubmitting(true);
        try {
            const token = await user.getIdToken();
            const endpoint = editing ? '/api/business/b2b/update-product' : '/api/business/b2b/create-product';
            const payload = editing
                ? { businessId, productId: editing.id, name: form.name, category: form.category, description: form.description || null, defaultStages: form.defaultStages }
                : { businessId, name: form.name, sku: form.sku.trim().toUpperCase(), category: form.category, description: form.description || null, defaultStages: form.defaultStages, createdBy: user.displayName || user.email || 'Unknown' };

            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify(payload),
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.error || 'Failed');
            toast({ title: editing ? 'Product Updated' : 'Product Created', description: form.name });
            setDialogOpen(false);
        } catch (err) {
            toast({ title: 'Error', description: (err as Error).message, variant: 'destructive' });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleToggleActive = async (product: Product) => {
        if (!user) return;
        try {
            const token = await user.getIdToken();
            await fetch('/api/business/b2b/update-product', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ businessId, productId: product.id, isActive: !product.isActive }),
            });
        } catch (err) {
            toast({ title: 'Error', description: (err as Error).message, variant: 'destructive' });
        }
    };

    if (authLoading) return <div className="flex items-center justify-center h-64"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
    if (!isAuthorized) return null;

    return (
        <div className="flex flex-col h-full">
            <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }}
                className="flex items-center justify-between gap-4 p-4 md:p-6 border-b bg-gradient-to-r from-background to-muted/20">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-primary/10 ring-1 ring-primary/20">
                        <Package className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold">Products</h1>
                        <p className="text-xs text-muted-foreground">{products.length} finished garment SKUs</p>
                    </div>
                </div>
                <Button onClick={openCreate} className="gap-2 shadow-sm shadow-primary/20">
                    <Plus className="h-4 w-4" /> Add Product
                </Button>
            </motion.div>

            <div className="shrink-0 p-4 border-b">
                <div className="relative max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Search products..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9" />
                    {search && <Button variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7" onClick={() => setSearch('')}><X className="h-3 w-3" /></Button>}
                </div>
            </div>

            <div className="flex-1 overflow-auto">
                {loading ? (
                    <div className="p-6 space-y-3">
                        {Array.from({ length: 5 }).map((_, i) => <div key={i} className="flex gap-4"><Skeleton className="h-5 w-32" /><Skeleton className="h-5 w-20" /><Skeleton className="h-5 w-40" /></div>)}
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-center">
                        <Package className="h-12 w-12 text-muted-foreground/30 mb-3" />
                        <h3 className="font-medium text-muted-foreground">{search ? 'No products found' : 'No products yet'}</h3>
                        {!search && <Button className="mt-4 gap-2" onClick={openCreate}><Plus className="h-4 w-4" />Add First Product</Button>}
                    </div>
                ) : (
                    <Table>
                        <TableHeader className="sticky top-0 bg-card z-10">
                            <TableRow>
                                <TableHead>Product</TableHead>
                                <TableHead>SKU</TableHead>
                                <TableHead>Category</TableHead>
                                <TableHead>Default Stages</TableHead>
                                <TableHead>Active</TableHead>
                                <TableHead>Created</TableHead>
                                <TableHead className="w-10" />
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            <AnimatePresence mode="popLayout">
                                {filtered.map((product, i) => (
                                    <motion.tr key={product.id}
                                        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0, transition: { delay: i * 0.04 } }}
                                        exit={{ opacity: 0 }} layout
                                        className="group border-b hover:bg-muted/40 transition-colors cursor-pointer"
                                        onClick={() => router.push(`/business/${businessId}/b2b/products/${product.id}`)}>
                                        <TableCell>
                                            <div>
                                                <p className="font-medium text-sm">{product.name}</p>
                                                {product.description && <p className="text-xs text-muted-foreground truncate max-w-xs">{product.description}</p>}
                                            </div>
                                        </TableCell>
                                        <TableCell><code className="text-xs bg-muted px-2 py-0.5 rounded font-mono">{product.sku}</code></TableCell>
                                        <TableCell><Badge variant="secondary" className="text-xs font-normal">{product.category}</Badge></TableCell>
                                        <TableCell>
                                            <div className="flex flex-wrap gap-1">
                                                {product.defaultStages.map(s => (
                                                    <Badge key={s} variant="outline" className="text-[10px] px-1.5 py-0">{s}</Badge>
                                                ))}
                                            </div>
                                        </TableCell>
                                        <TableCell onClick={e => e.stopPropagation()}>
                                            <Switch checked={product.isActive} onCheckedChange={() => handleToggleActive(product)} />
                                        </TableCell>
                                        <TableCell className="text-xs text-muted-foreground">
                                            {product.createdAt ? format(product.createdAt.toDate(), 'dd MMM yyyy') : '—'}
                                        </TableCell>
                                        <TableCell onClick={e => e.stopPropagation()}>
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <MoreHorizontal className="h-4 w-4" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                                    <DropdownMenuItem onClick={() => openEdit(product)} className="gap-2"><Pencil className="h-4 w-4" />Edit</DropdownMenuItem>
                                                    <DropdownMenuItem onClick={() => router.push(`/business/${businessId}/b2b/products/${product.id}`)} className="gap-2"><Layers className="h-4 w-4" />View BOM</DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </TableCell>
                                    </motion.tr>
                                ))}
                            </AnimatePresence>
                        </TableBody>
                    </Table>
                )}
            </div>

            {/* Create / Edit Dialog */}
            <Dialog open={dialogOpen} onOpenChange={o => !o && setDialogOpen(false)}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>{editing ? 'Edit Product' : 'Add Product'}</DialogTitle>
                        <DialogDescription>Define the finished garment SKU and its default production pipeline.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-xs">Product Name <span className="text-destructive">*</span></Label>
                                <Input placeholder="e.g. White RN Tshirt" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-xs">SKU <span className="text-destructive">*</span></Label>
                                <Input placeholder="e.g. RN-WHT-001" value={form.sku} onChange={e => setForm(f => ({ ...f, sku: e.target.value.toUpperCase() }))} disabled={!!editing} className="font-mono" />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs">Category <span className="text-destructive">*</span></Label>
                            <Input placeholder="e.g. Tshirt, Denim, Cargo Pants" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs">Description</Label>
                            <Textarea placeholder="Optional description" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs">Default Stage Pipeline <span className="text-destructive">*</span></Label>
                            <div className="flex flex-wrap gap-2">
                                {stageConfigs.map(sc => (
                                    <button
                                        key={sc.name}
                                        type="button"
                                        onClick={() => toggleStage(sc.name as StageName)}
                                        className={cn(
                                            'px-2.5 py-1 text-xs rounded-full border transition-all',
                                            form.defaultStages.includes(sc.name as StageName)
                                                ? 'bg-primary text-primary-foreground border-primary'
                                                : 'bg-background text-muted-foreground border-border hover:border-primary/50'
                                        )}
                                        title={sc.name}
                                    >
                                        {sc.label}
                                    </button>
                                ))}
                            </div>
                            {form.defaultStages.length > 0 && (
                                <p className="text-xs text-muted-foreground">
                                    Pipeline: {form.defaultStages.join(' → ')}
                                </p>
                            )}
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                        <Button onClick={handleSubmit} disabled={isSubmitting} className="gap-2">
                            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                            {editing ? 'Save Changes' : 'Add Product'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}