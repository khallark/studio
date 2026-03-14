'use client';

// /business/[businessId]/b2b/buyers/page.tsx

import React, { useState, useEffect, useMemo } from 'react';
import { useBusinessContext } from '../../layout';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { Buyer } from '@/types/b2b';
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
    DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    Users, Plus, Search, X, Loader2,
    MoreHorizontal, Pencil, Building2,
} from 'lucide-react';

interface BuyerForm {
    name: string; contactPerson: string; phone: string;
    email: string; address: string; gstNumber: string;
}
const emptyForm = (): BuyerForm => ({ name: '', contactPerson: '', phone: '', email: '', address: '', gstNumber: '' });

export default function BuyersPage() {
    const { businessId, user, isAuthorized, loading: authLoading } = useBusinessContext();

    const [buyers, setBuyers]   = useState<Buyer[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch]   = useState('');

    const [dialogOpen, setDialogOpen]     = useState(false);
    const [editing, setEditing]           = useState<Buyer | null>(null);
    const [form, setForm]                 = useState<BuyerForm>(emptyForm());
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (!isAuthorized || !businessId) return;
        const q = query(collection(db, 'users', businessId, 'buyers'), orderBy('name'));
        const unsub = onSnapshot(q, snap => {
            setBuyers(snap.docs.map(d => ({ id: d.id, ...d.data() } as Buyer)));
            setLoading(false);
        });
        return () => unsub();
    }, [businessId, isAuthorized]);

    const filtered = useMemo(() => buyers.filter(b =>
        !search ||
        b.name.toLowerCase().includes(search.toLowerCase()) ||
        b.contactPerson.toLowerCase().includes(search.toLowerCase()) ||
        b.phone.includes(search)
    ), [buyers, search]);

    const openCreate = () => { setEditing(null); setForm(emptyForm()); setDialogOpen(true); };
    const openEdit   = (b: Buyer) => {
        setEditing(b);
        setForm({ name: b.name, contactPerson: b.contactPerson, phone: b.phone, email: b.email, address: b.address, gstNumber: b.gstNumber ?? '' });
        setDialogOpen(true);
    };

    const handleSubmit = async () => {
        if (!user) return;
        if (!form.name.trim() || !form.contactPerson.trim() || !form.phone.trim() || !form.email.trim() || !form.address.trim()) {
            toast({ title: 'Fill all required fields', variant: 'destructive' }); return;
        }
        setIsSubmitting(true);
        try {
            const token = await user.getIdToken();
            const endpoint = editing ? '/api/business/b2b/update-buyer' : '/api/business/b2b/create-buyer';
            const payload = editing
                ? { businessId, buyerId: editing.id, ...form, gstNumber: form.gstNumber || null }
                : { businessId, ...form, gstNumber: form.gstNumber || null, createdBy: user.displayName || user.email || 'Unknown' };

            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify(payload),
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.error || 'Failed');
            toast({ title: editing ? 'Buyer Updated' : 'Buyer Created', description: form.name });
            setDialogOpen(false);
        } catch (err) {
            toast({ title: 'Error', description: (err as Error).message, variant: 'destructive' });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleToggleActive = async (buyer: Buyer) => {
        if (!user) return;
        try {
            const token = await user.getIdToken();
            await fetch('/api/business/b2b/update-buyer', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ businessId, buyerId: buyer.id, isActive: !buyer.isActive }),
            });
        } catch (err) {
            toast({ title: 'Error', description: (err as Error).message, variant: 'destructive' });
        }
    };

    if (authLoading) return <div className="flex items-center justify-center h-64"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
    if (!isAuthorized) return null;

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }}
                className="flex items-center justify-between gap-4 p-4 md:p-6 border-b bg-gradient-to-r from-background to-muted/20">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-primary/10 ring-1 ring-primary/20">
                        <Users className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold">Buyers</h1>
                        <p className="text-xs text-muted-foreground">{buyers.length} buyers registered</p>
                    </div>
                </div>
                <Button onClick={openCreate} className="gap-2 shadow-sm shadow-primary/20">
                    <Plus className="h-4 w-4" /> Add Buyer
                </Button>
            </motion.div>

            {/* Search */}
            <div className="shrink-0 p-4 border-b">
                <div className="relative max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Search buyers..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9" />
                    {search && <Button variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7" onClick={() => setSearch('')}><X className="h-3 w-3" /></Button>}
                </div>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-auto">
                {loading ? (
                    <div className="p-6 space-y-3">
                        {Array.from({ length: 5 }).map((_, i) => <div key={i} className="flex gap-4"><Skeleton className="h-5 w-32" /><Skeleton className="h-5 w-28" /><Skeleton className="h-5 w-48" /></div>)}
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-center">
                        <Building2 className="h-12 w-12 text-muted-foreground/30 mb-3" />
                        <h3 className="font-medium text-muted-foreground">{search ? 'No buyers found' : 'No buyers yet'}</h3>
                        {!search && <Button className="mt-4 gap-2" onClick={openCreate}><Plus className="h-4 w-4" />Add First Buyer</Button>}
                    </div>
                ) : (
                    <Table>
                        <TableHeader className="sticky top-0 bg-card z-10">
                            <TableRow>
                                <TableHead>Name</TableHead>
                                <TableHead>Contact Person</TableHead>
                                <TableHead>Phone</TableHead>
                                <TableHead>Email</TableHead>
                                <TableHead>GST</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Added</TableHead>
                                <TableHead className="w-10" />
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            <AnimatePresence mode="popLayout">
                                {filtered.map((buyer, i) => (
                                    <motion.tr key={buyer.id}
                                        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0, transition: { delay: i * 0.04 } }}
                                        exit={{ opacity: 0 }} layout
                                        className="group border-b hover:bg-muted/40 transition-colors">
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                                                    {buyer.name.charAt(0).toUpperCase()}
                                                </div>
                                                <span className="font-medium text-sm">{buyer.name}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-sm">{buyer.contactPerson}</TableCell>
                                        <TableCell className="font-mono text-sm">{buyer.phone}</TableCell>
                                        <TableCell className="text-sm text-muted-foreground">{buyer.email}</TableCell>
                                        <TableCell className="font-mono text-xs text-muted-foreground">{buyer.gstNumber ?? '—'}</TableCell>
                                        <TableCell>
                                            <Switch checked={buyer.isActive} onCheckedChange={() => handleToggleActive(buyer)} />
                                        </TableCell>
                                        <TableCell className="text-xs text-muted-foreground">
                                            {buyer.createdAt ? format(buyer.createdAt.toDate(), 'dd MMM yyyy') : '—'}
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
                                                    <DropdownMenuItem onClick={() => openEdit(buyer)} className="gap-2">
                                                        <Pencil className="h-4 w-4" /> Edit
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
            </div>

            {/* Create / Edit Dialog */}
            <Dialog open={dialogOpen} onOpenChange={o => !o && setDialogOpen(false)}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>{editing ? 'Edit Buyer' : 'Add Buyer'}</DialogTitle>
                        <DialogDescription>{editing ? 'Update buyer information.' : 'Fill in buyer details.'}</DialogDescription>
                    </DialogHeader>
                    <div className="grid grid-cols-2 gap-4 py-2">
                        <div className="col-span-2 space-y-2">
                            <Label className="text-xs">Company Name <span className="text-destructive">*</span></Label>
                            <Input placeholder="e.g. Rajesh Textiles" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs">Contact Person <span className="text-destructive">*</span></Label>
                            <Input placeholder="e.g. Rajesh Kumar" value={form.contactPerson} onChange={e => setForm(f => ({ ...f, contactPerson: e.target.value }))} />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs">Phone <span className="text-destructive">*</span></Label>
                            <Input placeholder="+91 9876543210" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
                        </div>
                        <div className="col-span-2 space-y-2">
                            <Label className="text-xs">Email <span className="text-destructive">*</span></Label>
                            <Input type="email" placeholder="buyer@company.com" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
                        </div>
                        <div className="col-span-2 space-y-2">
                            <Label className="text-xs">Address <span className="text-destructive">*</span></Label>
                            <Input placeholder="Full business address" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
                        </div>
                        <div className="col-span-2 space-y-2">
                            <Label className="text-xs">GST Number</Label>
                            <Input placeholder="e.g. 22AAAAA0000A1Z5" value={form.gstNumber} onChange={e => setForm(f => ({ ...f, gstNumber: e.target.value }))} className="font-mono" />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                        <Button onClick={handleSubmit} disabled={isSubmitting} className="gap-2">
                            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                            {editing ? 'Save Changes' : 'Add Buyer'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}