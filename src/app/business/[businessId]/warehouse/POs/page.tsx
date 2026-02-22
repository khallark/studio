'use client';

import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { useBusinessContext } from '../../layout';
import { db } from '@/lib/firebase';
import { User } from 'firebase/auth';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Plus,
    Search,
    RefreshCw,
    Check,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    FileText,
    Trash2,
    Edit3,
    Eye,
    X,
    PackageCheck,
    Send,
    Ban,
    Archive,
    ClipboardList,
    ShoppingCart,
    Clock,
    CheckCircle2,
    XCircle,
    AlertTriangle,
    ArrowUpDown,
    Filter,
    MoreHorizontal,
    Warehouse,
    CalendarDays,
    IndianRupee,
    Hash,
    Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
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
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
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
import { POStatus, PurchaseOrder, Party } from '@/types/warehouse';
import { Timestamp } from 'firebase-admin/firestore';

// ============================================================
// TYPES
// ============================================================

type SortField = 'createdAt' | 'expectedDate' | 'totalAmount' | 'poNumber';
type SortOrder = 'asc' | 'desc';

interface Product {
    id: string;
    sku: string;
    name: string;
    price?: number;
    [key: string]: any;
}

interface WarehouseOption {
    id: string;
    name: string;
    code: string;
}

interface POItemFormRow {
    sku: string;
    productName: string;
    expectedQty: number;
    unitCost: number;
}

const ITEMS_PER_PAGE = 10;

// ============================================================
// HELPERS
// ============================================================

const statusConfig: Record<POStatus, { label: string; color: string; bg: string; icon: React.ElementType }> = {
    draft: { label: 'Draft', color: 'text-slate-600', bg: 'bg-slate-100 border-slate-200', icon: FileText },
    confirmed: { label: 'Confirmed', color: 'text-blue-600', bg: 'bg-blue-50 border-blue-200', icon: Send },
    partially_received: { label: 'Partial', color: 'text-amber-600', bg: 'bg-amber-50 border-amber-200', icon: PackageCheck },
    fully_received: { label: 'Received', color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200', icon: CheckCircle2 },
    closed: { label: 'Closed', color: 'text-gray-600', bg: 'bg-gray-100 border-gray-200', icon: Archive },
    cancelled: { label: 'Cancelled', color: 'text-red-600', bg: 'bg-red-50 border-red-200', icon: XCircle },
};

function formatDate(timestamp: Timestamp | null): string {
    if (!timestamp) return '—';
    try {
        return timestamp.toDate().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch { return '—'; }
}

function formatCurrency(amount: number, currency: string = 'INR'): string {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency, minimumFractionDigits: 2 }).format(amount);
}

function StatusBadge({ status }: { status: POStatus }) {
    const config = statusConfig[status];
    return (
        <Badge variant="outline" className={cn('text-xs font-medium gap-1', config.bg, config.color)}>
            <config.icon className="h-3 w-3" />
            {config.label}
        </Badge>
    );
}

// ============================================================
// HOOKS - DATA FETCHING
// ============================================================

function usePurchaseOrders(businessId: string | null, user: User | null | undefined) {
    return useQuery({
        queryKey: ['purchaseOrders', businessId],
        queryFn: async () => {
            if (!businessId) throw new Error('No business ID');
            const posRef = collection(db, 'users', businessId, 'purchaseOrders');
            const q = query(posRef, orderBy('createdAt', 'desc'));
            const snapshot = await getDocs(q);
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as PurchaseOrder[];
        },
        enabled: !!businessId && !!user,
        staleTime: 15 * 1000,
        refetchInterval: 60 * 1000,
    });
}

function useProducts(businessId: string | null, user: User | null | undefined) {
    return useQuery({
        queryKey: ['products', businessId],
        queryFn: async () => {
            if (!businessId) throw new Error('No business ID');
            const productsRef = collection(db, 'users', businessId, 'products');
            const snapshot = await getDocs(productsRef);
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Product[];
        },
        enabled: !!businessId && !!user,
        staleTime: 60 * 1000,
    });
}

function useSupplierParties(businessId: string | null, user: User | null | undefined) {
    return useQuery({
        queryKey: ['supplierParties', businessId],
        queryFn: async () => {
            if (!businessId) throw new Error('No business ID');
            const partiesRef = collection(db, 'users', businessId, 'parties');
            const snapshot = await getDocs(partiesRef);
            return snapshot.docs
                .map(doc => ({ id: doc.id, ...doc.data() }) as Party)
                .filter(p => p.isActive && (p.type === 'supplier' || p.type === 'both'));
        },
        enabled: !!businessId && !!user,
        staleTime: 30 * 1000,
    });
}

function useWarehouses(businessId: string | null, user: User | null | undefined) {
    return useQuery({
        queryKey: ['warehouses', businessId],
        queryFn: async () => {
            if (!businessId) throw new Error('No business ID');
            const whRef = collection(db, 'users', businessId, 'warehouse');
            const snapshot = await getDocs(whRef);
            return snapshot.docs
                .map(doc => ({ id: doc.id, ...doc.data() }) as WarehouseOption & { isDeleted?: boolean })
                .filter(w => !w.isDeleted)
                .map(({ id, name, code }) => ({ id, name, code }) as WarehouseOption);
        },
        enabled: !!businessId && !!user,
        staleTime: 60 * 1000,
    });
}

// ============================================================
// PRODUCT SEARCH INPUT COMPONENT
// ============================================================

function ProductSearchInput({
    products, selectedSku, onSelect, existingSkus, disabled,
}: {
    products: Product[]; selectedSku: string; onSelect: (product: Product | null) => void;
    existingSkus: string[]; disabled?: boolean;
}) {
    const [searchValue, setSearchValue] = useState(selectedSku);
    const [isOpen, setIsOpen] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);

    useEffect(() => { setSearchValue(selectedSku); }, [selectedSku]);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) setIsOpen(false);
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const filteredProducts = useMemo(() => {
        if (!searchValue.trim()) return products.slice(0, 20);
        const q = searchValue.toLowerCase();
        return products.filter(p => p.sku.toLowerCase().includes(q) || p.name.toLowerCase().includes(q)).slice(0, 20);
    }, [products, searchValue]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSearchValue(e.target.value);
        setIsOpen(true);
        if (selectedSku && e.target.value !== selectedSku) onSelect(null);
    };

    const handleSelect = (product: Product) => {
        setSearchValue(product.sku);
        setIsOpen(false);
        onSelect(product);
    };

    const isDuplicate = (sku: string) => existingSkus.includes(sku);

    return (
        <div ref={wrapperRef} className="relative">
            <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                <Input value={searchValue} onChange={handleInputChange} onFocus={() => setIsOpen(true)}
                    placeholder="Search SKU or name..."
                    className={cn('h-8 text-sm pl-7', selectedSku && 'border-emerald-300 bg-emerald-50/30')}
                    disabled={disabled} />
                {selectedSku && <CheckCircle2 className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-emerald-500" />}
            </div>
            <AnimatePresence>
                {isOpen && filteredProducts.length > 0 && (
                    <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.15 }} className="absolute z-50 mt-1 w-full max-h-48 overflow-auto bg-popover border rounded-md shadow-md">
                        {filteredProducts.map(product => {
                            const duplicate = isDuplicate(product.sku) && product.sku !== selectedSku;
                            return (
                                <button key={product.id} type="button"
                                    className={cn('w-full text-left px-3 py-2 text-sm hover:bg-muted/60 transition-colors flex items-center justify-between',
                                        duplicate && 'opacity-50 cursor-not-allowed', product.sku === selectedSku && 'bg-emerald-50')}
                                    onClick={() => { if (!duplicate) handleSelect(product); }} disabled={duplicate}>
                                    <div className="min-w-0">
                                        <p className="font-mono text-xs font-medium truncate">{product.sku}</p>
                                        <p className="text-xs text-muted-foreground truncate">{product.name}</p>
                                    </div>
                                    {duplicate && <Badge variant="outline" className="text-xs text-amber-600 border-amber-300 ml-2 shrink-0">Already added</Badge>}
                                    {product.sku === selectedSku && <Check className="h-3.5 w-3.5 text-emerald-500 ml-2 shrink-0" />}
                                </button>
                            );
                        })}
                    </motion.div>
                )}
                {isOpen && searchValue.trim() && filteredProducts.length === 0 && (
                    <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                        className="absolute z-50 mt-1 w-full bg-popover border rounded-md shadow-md p-3">
                        <p className="text-xs text-muted-foreground text-center">No product found for &quot;{searchValue}&quot;</p>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

// ============================================================
// SUPPLIER SEARCH INPUT COMPONENT
// ============================================================

function SupplierSearchInput({
    parties, selectedPartyId, onSelect, disabled,
}: {
    parties: Party[]; selectedPartyId: string; onSelect: (party: Party | null) => void; disabled?: boolean;
}) {
    const [searchValue, setSearchValue] = useState('');
    const [isOpen, setIsOpen] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);

    const selectedParty = useMemo(() => parties.find(p => p.id === selectedPartyId) || null, [parties, selectedPartyId]);

    useEffect(() => { setSearchValue(selectedParty?.name || ''); }, [selectedParty]);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setIsOpen(false);
                if (!selectedPartyId) setSearchValue('');
                else setSearchValue(selectedParty?.name || '');
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [selectedPartyId, selectedParty]);

    const filteredParties = useMemo(() => {
        if (!searchValue.trim()) return parties.slice(0, 20);
        const q = searchValue.toLowerCase();
        return parties.filter(p =>
            p.name.toLowerCase().includes(q) || p.code?.toLowerCase().includes(q) ||
            p.gstin?.toLowerCase().includes(q) || p.contactPerson?.toLowerCase().includes(q)
        ).slice(0, 20);
    }, [parties, searchValue]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSearchValue(e.target.value); setIsOpen(true);
        if (selectedPartyId) onSelect(null);
    };

    const handleSelect = (party: Party) => { setSearchValue(party.name); setIsOpen(false); onSelect(party); };

    return (
        <div ref={wrapperRef} className="relative">
            <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input value={searchValue} onChange={handleInputChange} onFocus={() => setIsOpen(true)}
                    placeholder="Search supplier by name, code, GSTIN..."
                    className={cn('pl-8', selectedPartyId && 'border-emerald-300 bg-emerald-50/30')} disabled={disabled} />
                {selectedPartyId && <CheckCircle2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-emerald-500" />}
            </div>
            <AnimatePresence>
                {isOpen && filteredParties.length > 0 && (
                    <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.15 }} className="absolute z-50 mt-1 w-full max-h-52 overflow-auto bg-popover border rounded-md shadow-md">
                        {filteredParties.map(party => (
                            <button key={party.id} type="button"
                                className={cn('w-full text-left px-3 py-2.5 text-sm hover:bg-muted/60 transition-colors flex items-center justify-between',
                                    party.id === selectedPartyId && 'bg-emerald-50')}
                                onClick={() => handleSelect(party)}>
                                <div className="min-w-0">
                                    <p className="font-medium text-sm truncate">{party.name}</p>
                                    <p className="text-xs text-muted-foreground truncate">
                                        {[party.code, party.gstin, party.contactPerson].filter(Boolean).join(' · ')}
                                    </p>
                                </div>
                                {party.id === selectedPartyId && <Check className="h-3.5 w-3.5 text-emerald-500 ml-2 shrink-0" />}
                            </button>
                        ))}
                    </motion.div>
                )}
                {isOpen && searchValue.trim() && filteredParties.length === 0 && (
                    <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                        className="absolute z-50 mt-1 w-full bg-popover border rounded-md shadow-md p-3">
                        <p className="text-xs text-muted-foreground text-center">No supplier found for &quot;{searchValue}&quot;</p>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

// ============================================================
// HOOKS - MUTATIONS
// ============================================================

function useCreatePO(businessId: string | null, user: User | null | undefined) {
    const queryClient = useQueryClient();
    const { toast } = useToast();
    return useMutation({
        mutationFn: async (data: any) => {
            if (!businessId || !user) throw new Error('Invalid parameters');
            const idToken = await user.getIdToken();
            const response = await fetch('/api/business/warehouse/purchase-orders/create', {
                method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
                body: JSON.stringify({ businessId, ...data }),
            });
            if (!response.ok) { const errData = await response.json(); throw new Error(errData.message || errData.error || 'Failed to create PO'); }
            return response.json();
        },
        onSuccess: (data) => { queryClient.invalidateQueries({ queryKey: ['purchaseOrders', businessId] }); toast({ title: 'Purchase Order Created', description: `${data.poNumber} has been created.` }); },
        onError: (error: Error) => { toast({ title: 'Failed to Create PO', description: error.message, variant: 'destructive' }); },
    });
}

function useUpdatePO(businessId: string | null, user: User | null | undefined) {
    const queryClient = useQueryClient();
    const { toast } = useToast();
    return useMutation({
        mutationFn: async (data: any) => {
            if (!businessId || !user) throw new Error('Invalid parameters');
            const idToken = await user.getIdToken();
            const response = await fetch('/api/business/warehouse/purchase-orders/update', {
                method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
                body: JSON.stringify({ businessId, ...data }),
            });
            if (!response.ok) { const errData = await response.json(); throw new Error(errData.message || errData.error || 'Failed to update PO'); }
            return response.json();
        },
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['purchaseOrders', businessId] }); toast({ title: 'Purchase Order Updated', description: 'PO has been updated successfully.' }); },
        onError: (error: Error) => { toast({ title: 'Failed to Update PO', description: error.message, variant: 'destructive' }); },
    });
}

function useDeletePO(businessId: string | null, user: User | null | undefined) {
    const queryClient = useQueryClient();
    const { toast } = useToast();
    return useMutation({
        mutationFn: async (purchaseOrderId: string) => {
            if (!businessId || !user) throw new Error('Invalid parameters');
            const idToken = await user.getIdToken();
            const response = await fetch('/api/business/warehouse/purchase-orders/delete', {
                method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
                body: JSON.stringify({ businessId, purchaseOrderId }),
            });
            if (!response.ok) { const errData = await response.json(); throw new Error(errData.message || errData.error || 'Failed to delete PO'); }
            return response.json();
        },
        onSuccess: (data) => { queryClient.invalidateQueries({ queryKey: ['purchaseOrders', businessId] }); toast({ title: 'Purchase Order Deleted', description: `${data.deletedPoNumber} has been deleted.` }); },
        onError: (error: Error) => { toast({ title: 'Failed to Delete PO', description: error.message, variant: 'destructive' }); },
    });
}

// ============================================================
// CREATE / EDIT PO DIALOG
// ============================================================

function POFormDialog({
    open, onOpenChange, onSubmit, isLoading, editingPO, products, parties, warehouses,
}: {
    open: boolean; onOpenChange: (open: boolean) => void; onSubmit: (data: any) => void;
    isLoading: boolean; editingPO: PurchaseOrder | null; products: Product[];
    parties: Party[]; warehouses: WarehouseOption[];
}) {
    const [supplierPartyId, setSupplierPartyId] = useState('');
    const [supplierName, setSupplierName] = useState('');
    const [warehouseId, setWarehouseId] = useState('');
    const [warehouseName, setWarehouseName] = useState('');
    const [currency, setCurrency] = useState('INR');
    const [expectedDate, setExpectedDate] = useState('');
    const [notes, setNotes] = useState('');
    const [items, setItems] = useState<POItemFormRow[]>([
        { sku: '', productName: '', expectedQty: 1, unitCost: 0 },
    ]);

    React.useEffect(() => {
        if (open) {
            if (editingPO) {
                setSupplierPartyId(editingPO.supplierPartyId);
                setSupplierName(editingPO.supplierName);
                setWarehouseId(editingPO.warehouseId);
                setWarehouseName(editingPO.warehouseName || '');
                setCurrency(editingPO.currency || '₹');
                setExpectedDate(editingPO.expectedDate?.toDate?.()?.toISOString?.()?.split('T')[0] || '');
                setNotes(editingPO.notes || '<No name>');
                setItems(editingPO.items.map(i => ({ sku: i.sku, productName: i.productName, expectedQty: i.expectedQty, unitCost: i.unitCost })));
            } else {
                setSupplierPartyId(''); setSupplierName(''); setWarehouseId(''); setWarehouseName('');
                setCurrency('INR'); setExpectedDate(''); setNotes('');
                setItems([{ sku: '', productName: '', expectedQty: 1, unitCost: 0 }]);
            }
        }
    }, [open, editingPO]);

    const handleSupplierSelect = (party: Party | null) => {
        if (party) { setSupplierPartyId(party.id); setSupplierName(party.name); }
        else { setSupplierPartyId(''); setSupplierName(''); }
    };

    const handleWarehouseSelect = (whId: string) => {
        setWarehouseId(whId);
        const wh = warehouses.find(w => w.id === whId);
        setWarehouseName(wh?.name || '');
    };

    const handleProductSelect = (index: number, product: Product | null) => {
        setItems(prev => prev.map((item, i) => {
            if (i !== index) return item;
            if (!product) return { ...item, sku: '', productName: '', unitCost: 0 };
            return { ...item, sku: product.sku, productName: product.name, unitCost: product.price ?? item.unitCost };
        }));
    };

    const updateItem = (index: number, field: keyof POItemFormRow, value: any) => {
        setItems(prev => prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)));
    };

    const addItem = () => { setItems(prev => [...prev, { sku: '', productName: '', expectedQty: 1, unitCost: 0 }]); };
    const removeItem = (index: number) => { if (items.length <= 1) return; setItems(prev => prev.filter((_, i) => i !== index)); };

    const totalAmount = items.reduce((sum, item) => sum + item.expectedQty * item.unitCost, 0);

    const getExistingSkusForRow = (currentIndex: number): string[] => {
        return items.filter((_, i) => i !== currentIndex).map(i => i.sku).filter(Boolean);
    };

    const hasDuplicates = useMemo(() => {
        const skus = items.map(i => i.sku).filter(Boolean);
        return new Set(skus).size !== skus.length;
    }, [items]);

    const canSubmit = supplierPartyId.trim() && supplierName.trim() && warehouseId.trim() && expectedDate && !hasDuplicates &&
        items.every(i => i.sku.trim() && i.productName && i.expectedQty > 0 && i.unitCost >= 0);

    const handleSubmit = () => {
        onSubmit({
            ...(editingPO ? { purchaseOrderId: editingPO.id } : {}),
            supplierPartyId: supplierPartyId.trim(), supplierName: supplierName.trim(),
            warehouseId: warehouseId.trim(), warehouseName: warehouseName.trim(),
            currency, expectedDate: new Date(expectedDate).toISOString(), notes: notes.trim() || null,
            items: items.map(i => ({ sku: i.sku.trim(), productName: i.productName, expectedQty: i.expectedQty, unitCost: i.unitCost })),
        });
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <div className="p-2 rounded-lg bg-primary/10"><ClipboardList className="h-5 w-5 text-primary" /></div>
                        {editingPO ? `Edit ${editingPO.poNumber}` : 'Create Purchase Order'}
                    </DialogTitle>
                    <DialogDescription>
                        {editingPO ? 'Update the purchase order details.' : 'Fill in the details to create a new purchase order.'}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-5 py-4">
                    {/* Supplier */}
                    <div className="space-y-2">
                        <Label>Supplier <span className="text-destructive">*</span></Label>
                        <SupplierSearchInput parties={parties} selectedPartyId={supplierPartyId} onSelect={handleSupplierSelect} />
                        {supplierPartyId && (
                            <p className="text-xs text-muted-foreground">ID: <span className="font-mono">{supplierPartyId}</span></p>
                        )}
                    </div>

                    {/* Warehouse & Date */}
                    <div className="grid grid-cols-3 gap-4">
                        <div className="space-y-2">
                            <Label>Warehouse <span className="text-destructive">*</span></Label>
                            <Select value={warehouseId} onValueChange={handleWarehouseSelect}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select warehouse..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {warehouses.length === 0 ? (
                                        <div className="p-3 text-center text-sm text-muted-foreground">No warehouses found</div>
                                    ) : warehouses.map(wh => (
                                        <SelectItem key={wh.id} value={wh.id}>
                                            {wh.name} ({wh.code})
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Warehouse Name</Label>
                            <Input value={warehouseName} disabled placeholder="Auto-filled from selection"
                                className={cn('bg-muted/50', warehouseName && 'text-foreground')} />
                        </div>
                        <div className="space-y-2">
                            <Label>Expected Date <span className="text-destructive">*</span></Label>
                            <Input type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} />
                        </div>
                    </div>

                    {/* Currency */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Currency</Label>
                            <Select value={currency} onValueChange={setCurrency}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="INR">INR</SelectItem>
                                    <SelectItem value="USD">USD</SelectItem>
                                    <SelectItem value="EUR">EUR</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {/* Items */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <div>
                                <Label className="text-base font-semibold">Line Items</Label>
                                {hasDuplicates && (
                                    <p className="text-xs text-destructive mt-0.5 flex items-center gap-1">
                                        <AlertTriangle className="h-3 w-3" />Duplicate products detected. Each product can only appear once.
                                    </p>
                                )}
                            </div>
                            <Button type="button" variant="outline" size="sm" onClick={addItem}>
                                <Plus className="h-3.5 w-3.5 mr-1" />Add Item
                            </Button>
                        </div>

                        <div className="space-y-3">
                            {items.map((item, index) => (
                                <div key={index} className="p-3 border rounded-lg space-y-3 relative bg-muted/20">
                                    {items.length > 1 && (
                                        <Button type="button" variant="ghost" size="icon"
                                            className="absolute top-2 right-2 h-6 w-6 text-muted-foreground hover:text-destructive"
                                            onClick={() => removeItem(index)}><X className="h-3.5 w-3.5" /></Button>
                                    )}
                                    <div className="grid grid-cols-2 gap-3 pr-8">
                                        <div className="space-y-1">
                                            <Label className="text-xs">Product SKU <span className="text-destructive">*</span></Label>
                                            <ProductSearchInput products={products} selectedSku={item.sku}
                                                onSelect={(product) => handleProductSelect(index, product)}
                                                existingSkus={getExistingSkusForRow(index)} />
                                        </div>
                                        <div className="space-y-1">
                                            <Label className="text-xs">Product Name</Label>
                                            <Input value={item.productName} disabled placeholder="Auto-filled from product"
                                                className={cn('h-8 text-sm bg-muted/50', item.productName && 'text-foreground')} />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-3 gap-3 pr-8">
                                        <div className="space-y-1">
                                            <Label className="text-xs">Quantity <span className="text-destructive">*</span></Label>
                                            <Input type="number" min={1} value={item.expectedQty}
                                                onChange={(e) => updateItem(index, 'expectedQty', parseInt(e.target.value) || 0)}
                                                className="h-8 text-sm" />
                                        </div>
                                        <div className="space-y-1">
                                            <Label className="text-xs">Unit Cost <span className="text-destructive">*</span></Label>
                                            <Input type="number" min={0} step={0.01} value={item.unitCost}
                                                onChange={(e) => updateItem(index, 'unitCost', parseFloat(e.target.value) || 0)}
                                                className="h-8 text-sm" />
                                        </div>
                                    </div>
                                    <div className="text-xs text-muted-foreground text-right pr-8">
                                        Subtotal: {formatCurrency(item.expectedQty * item.unitCost, currency)}
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="text-right font-semibold text-sm pt-2 border-t">
                            Total: {formatCurrency(totalAmount, currency)}
                        </div>
                    </div>

                    {/* Notes */}
                    <div className="space-y-2">
                        <Label>Notes</Label>
                        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)}
                            placeholder="Optional notes or special instructions..." rows={3} />
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>Cancel</Button>
                    <Button onClick={handleSubmit} disabled={!canSubmit || isLoading}>
                        {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                        {editingPO ? 'Update PO' : 'Create PO'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// ============================================================
// PO DETAIL DIALOG
// ============================================================

function PODetailDialog({ open, onOpenChange, po }: { open: boolean; onOpenChange: (open: boolean) => void; po: PurchaseOrder | null; }) {
    if (!po) return null;
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-primary/10"><ClipboardList className="h-5 w-5 text-primary" /></div>
                        <div><span>{po.poNumber}</span> <StatusBadge status={po.status} /></div>
                    </DialogTitle>
                </DialogHeader>
                <div className="space-y-5 py-4">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                        <div className="space-y-1"><p className="text-muted-foreground">Supplier</p><p className="font-medium">{po.supplierName}</p><p className="text-xs text-muted-foreground">{po.supplierPartyId}</p></div>
                        <div className="space-y-1"><p className="text-muted-foreground">Warehouse</p><p className="font-medium">{po.warehouseName || po.warehouseId}</p></div>
                        <div className="space-y-1"><p className="text-muted-foreground">Expected Date</p><p className="font-medium">{formatDate(po.expectedDate)}</p></div>
                        <div className="space-y-1"><p className="text-muted-foreground">Total Amount</p><p className="font-medium">{formatCurrency(po.totalAmount, po.currency || '₹')}</p></div>
                        <div className="space-y-1"><p className="text-muted-foreground">Created</p><p className="font-medium">{formatDate(po.createdAt)}</p></div>
                        {po.confirmedAt && <div className="space-y-1"><p className="text-muted-foreground">Confirmed</p><p className="font-medium">{formatDate(po.confirmedAt)}</p></div>}
                        {po.completedAt && <div className="space-y-1"><p className="text-muted-foreground">Completed</p><p className="font-medium">{formatDate(po.completedAt)}</p></div>}
                        {po.cancelledAt && <div className="space-y-1"><p className="text-muted-foreground">Cancelled</p><p className="font-medium">{formatDate(po.cancelledAt)}</p>{po.cancelReason && <p className="text-xs text-destructive">{po.cancelReason}</p>}</div>}
                    </div>
                    {po.notes && <div className="p-3 bg-muted/40 rounded-lg text-sm"><p className="text-muted-foreground text-xs mb-1">Notes</p><p>{po.notes}</p></div>}
                    <div className="space-y-2">
                        <h4 className="font-semibold text-sm">Line Items ({po.itemCount})</h4>
                        <div className="border rounded-lg overflow-hidden">
                            <Table>
                                <TableHeader><TableRow className="bg-muted/40">
                                    <TableHead className="text-xs">SKU</TableHead><TableHead className="text-xs">Product</TableHead>
                                    <TableHead className="text-xs text-right">Expected</TableHead><TableHead className="text-xs text-right">Received</TableHead>
                                    <TableHead className="text-xs text-right">Unit Cost</TableHead><TableHead className="text-xs">Status</TableHead>
                                </TableRow></TableHeader>
                                <TableBody>
                                    {po.items.map((item, idx) => (
                                        <TableRow key={idx}>
                                            <TableCell className="font-mono text-xs">{item.sku}</TableCell>
                                            <TableCell className="text-sm">{item.productName}</TableCell>
                                            <TableCell className="text-right text-sm">{item.expectedQty}</TableCell>
                                            <TableCell className="text-right text-sm">{item.receivedQty}</TableCell>
                                            <TableCell className="text-right text-sm">{formatCurrency(item.unitCost, po.currency || '₹')}</TableCell>
                                            <TableCell><Badge variant="outline" className="text-xs capitalize">{item.status.replace('_', ' ')}</Badge></TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </div>
                </div>
                <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button></DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// ============================================================
// CANCEL DIALOG
// ============================================================

function CancelPODialog({ open, onOpenChange, onConfirm, isLoading, poNumber }: {
    open: boolean; onOpenChange: (open: boolean) => void; onConfirm: (reason: string) => void; isLoading: boolean; poNumber: string;
}) {
    const [reason, setReason] = useState('');
    React.useEffect(() => { if (open) setReason(''); }, [open]);
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-destructive"><Ban className="h-5 w-5" />Cancel {poNumber}</DialogTitle>
                    <DialogDescription>This action will cancel the purchase order. Please provide a reason.</DialogDescription>
                </DialogHeader>
                <div className="py-4">
                    <Label>Cancellation Reason</Label>
                    <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for cancellation..." rows={3} className="mt-2" />
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>Go Back</Button>
                    <Button variant="destructive" onClick={() => onConfirm(reason)} disabled={isLoading}>
                        {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Confirm Cancel
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// ============================================================
// MAIN PAGE COMPONENT
// ============================================================

export default function PurchaseOrdersPage() {
    const { businessId, user } = useBusinessContext();
    const { toast } = useToast();
    const queryClient = useQueryClient();

    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<POStatus | 'all'>('all');
    const [sortField, setSortField] = useState<SortField>('createdAt');
    const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
    const [currentPage, setCurrentPage] = useState(1);

    const [createDialogOpen, setCreateDialogOpen] = useState(false);
    const [editingPO, setEditingPO] = useState<PurchaseOrder | null>(null);
    const [viewingPO, setViewingPO] = useState<PurchaseOrder | null>(null);
    const [deletingPO, setDeletingPO] = useState<PurchaseOrder | null>(null);
    const [cancellingPO, setCancellingPO] = useState<PurchaseOrder | null>(null);

    const { data: purchaseOrders = [], isLoading, refetch } = usePurchaseOrders(businessId, user);
    const { data: products = [] } = useProducts(businessId, user);
    const { data: supplierParties = [] } = useSupplierParties(businessId, user);
    const { data: warehouses = [] } = useWarehouses(businessId, user);

    const createMutation = useCreatePO(businessId, user);
    const updateMutation = useUpdatePO(businessId, user);
    const deleteMutation = useDeletePO(businessId, user);

    const filteredAndSorted = useMemo(() => {
        let result = [...purchaseOrders];
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            result = result.filter(po =>
                po.poNumber.toLowerCase().includes(q) || po.supplierName.toLowerCase().includes(q) ||
                po.orderedSkus.some(sku => sku.toLowerCase().includes(q)) || po.warehouseName?.toLowerCase().includes(q)
            );
        }
        if (statusFilter !== 'all') result = result.filter(po => po.status === statusFilter);
        result.sort((a, b) => {
            let aVal: any, bVal: any;
            switch (sortField) {
                case 'poNumber': aVal = a.poNumber; bVal = b.poNumber; break;
                case 'totalAmount': aVal = a.totalAmount; bVal = b.totalAmount; break;
                case 'expectedDate': aVal = a.expectedDate?.toDate?.()?.getTime?.() || 0; bVal = b.expectedDate?.toDate?.()?.getTime?.() || 0; break;
                default: aVal = a.createdAt?.toDate?.()?.getTime?.() || 0; bVal = b.createdAt?.toDate?.()?.getTime?.() || 0; break;
            }
            if (typeof aVal === 'string') return sortOrder === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
            return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
        });
        return result;
    }, [purchaseOrders, searchQuery, statusFilter, sortField, sortOrder]);

    const totalPages = Math.max(1, Math.ceil(filteredAndSorted.length / ITEMS_PER_PAGE));
    const paginatedPOs = filteredAndSorted.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

    React.useEffect(() => { setCurrentPage(1); }, [searchQuery, statusFilter, sortField, sortOrder]);

    const stats = useMemo(() => {
        const counts: Record<POStatus, number> = { draft: 0, confirmed: 0, partially_received: 0, fully_received: 0, closed: 0, cancelled: 0 };
        purchaseOrders.forEach(po => { counts[po.status] = (counts[po.status] || 0) + 1; });
        return counts;
    }, [purchaseOrders]);

    const handleCreateSubmit = (data: any) => { createMutation.mutate(data, { onSuccess: () => setCreateDialogOpen(false) }); };
    const handleEditSubmit = (data: any) => { updateMutation.mutate(data, { onSuccess: () => setEditingPO(null) }); };
    const handleDelete = () => { if (!deletingPO) return; deleteMutation.mutate(deletingPO.id, { onSuccess: () => setDeletingPO(null) }); };
    const handleStatusUpdate = (po: PurchaseOrder, newStatus: POStatus) => { updateMutation.mutate({ purchaseOrderId: po.id, status: newStatus }); };
    const handleCancelConfirm = (reason: string) => {
        if (!cancellingPO) return;
        updateMutation.mutate({ purchaseOrderId: cancellingPO.id, status: 'cancelled', cancelReason: reason || null }, { onSuccess: () => setCancellingPO(null) });
    };
    const handleRefresh = () => {
        queryClient.invalidateQueries({ queryKey: ['purchaseOrders', businessId] });
        queryClient.invalidateQueries({ queryKey: ['products', businessId] });
        queryClient.invalidateQueries({ queryKey: ['supplierParties', businessId] });
        queryClient.invalidateQueries({ queryKey: ['warehouses', businessId] });
        refetch();
    };
    const toggleSort = (field: SortField) => {
        if (sortField === field) setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
        else { setSortField(field); setSortOrder('desc'); }
    };

    const statCards = [
        { key: 'draft' as POStatus, label: 'Draft', icon: FileText, color: 'text-slate-600', bg: 'bg-slate-100' },
        { key: 'confirmed' as POStatus, label: 'Confirmed', icon: Send, color: 'text-blue-600', bg: 'bg-blue-50' },
        { key: 'partially_received' as POStatus, label: 'Partial', icon: PackageCheck, color: 'text-amber-600', bg: 'bg-amber-50' },
        { key: 'fully_received' as POStatus, label: 'Received', icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50' },
        { key: 'closed' as POStatus, label: 'Closed', icon: Archive, color: 'text-gray-600', bg: 'bg-gray-100' },
        { key: 'cancelled' as POStatus, label: 'Cancelled', icon: XCircle, color: 'text-red-600', bg: 'bg-red-50' },
    ];

    return (
        <div className="min-h-full p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div><h1 className="text-2xl font-bold tracking-tight">Purchase Orders</h1><p className="text-muted-foreground">Manage and track your purchase orders</p></div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={handleRefresh}><RefreshCw className="h-4 w-4 mr-2" />Refresh</Button>
                    <Button onClick={() => setCreateDialogOpen(true)}><Plus className="h-4 w-4 mr-2" />Create PO</Button>
                </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {statCards.map(stat => (
                    <Card key={stat.key} className={cn('cursor-pointer transition-all hover:shadow-md', statusFilter === stat.key && 'ring-2 ring-primary')}
                        onClick={() => setStatusFilter(prev => (prev === stat.key ? 'all' : stat.key))}>
                        <CardContent className="p-4">
                            <div className="flex items-center gap-3">
                                <div className={cn('p-2 rounded-lg', stat.bg)}><stat.icon className={cn('h-4 w-4', stat.color)} /></div>
                                <div><p className="text-xl font-bold">{stats[stat.key]}</p><p className="text-xs text-muted-foreground">{stat.label}</p></div>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            <Card><CardContent className="p-4">
                <div className="flex flex-col sm:flex-row gap-3">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input placeholder="Search by PO number, supplier, SKU, warehouse..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" />
                    </div>
                    <Select value={statusFilter} onValueChange={(val) => setStatusFilter(val as POStatus | 'all')}>
                        <SelectTrigger className="w-[160px]"><Filter className="h-4 w-4 mr-2" /><SelectValue placeholder="Status" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Statuses</SelectItem>
                            {Object.entries(statusConfig).map(([key, cfg]) => <SelectItem key={key} value={key}>{cfg.label}</SelectItem>)}
                        </SelectContent>
                    </Select>
                    <Select value={`${sortField}-${sortOrder}`} onValueChange={(val) => { const [field, order] = val.split('-'); setSortField(field as SortField); setSortOrder(order as SortOrder); }}>
                        <SelectTrigger className="w-[180px]"><ArrowUpDown className="h-4 w-4 mr-2" /><SelectValue placeholder="Sort by" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="createdAt-desc">Newest First</SelectItem><SelectItem value="createdAt-asc">Oldest First</SelectItem>
                            <SelectItem value="expectedDate-asc">Expected (Soonest)</SelectItem><SelectItem value="expectedDate-desc">Expected (Latest)</SelectItem>
                            <SelectItem value="totalAmount-desc">Amount (High → Low)</SelectItem><SelectItem value="totalAmount-asc">Amount (Low → High)</SelectItem>
                            <SelectItem value="poNumber-asc">PO # (A → Z)</SelectItem><SelectItem value="poNumber-desc">PO # (Z → A)</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </CardContent></Card>

            <Card>
                {isLoading ? (
                    <CardContent className="p-6 space-y-3">{[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-14 w-full" />)}</CardContent>
                ) : filteredAndSorted.length === 0 ? (
                    <CardContent className="p-12 text-center">
                        <ClipboardList className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                        <h3 className="text-lg font-semibold mb-1">{purchaseOrders.length === 0 ? 'No Purchase Orders Yet' : 'No Matching Results'}</h3>
                        <p className="text-muted-foreground mb-4">{purchaseOrders.length === 0 ? 'Create your first purchase order to get started.' : 'Try adjusting your search or filters.'}</p>
                        {purchaseOrders.length === 0 && <Button onClick={() => setCreateDialogOpen(true)}><Plus className="h-4 w-4 mr-2" />Create PO</Button>}
                    </CardContent>
                ) : (
                    <>
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader><TableRow>
                                    <TableHead className="w-[120px]"><button className="flex items-center gap-1 hover:text-foreground" onClick={() => toggleSort('poNumber')}>
                                        <Hash className="h-3.5 w-3.5" />PO #{sortField === 'poNumber' && <ChevronDown className={cn('h-3 w-3 transition-transform', sortOrder === 'asc' && 'rotate-180')} />}
                                    </button></TableHead>
                                    <TableHead>Supplier</TableHead><TableHead>Warehouse</TableHead><TableHead className="text-center">Items</TableHead>
                                    <TableHead><button className="flex items-center gap-1 hover:text-foreground" onClick={() => toggleSort('totalAmount')}>
                                        <IndianRupee className="h-3.5 w-3.5" />Amount{sortField === 'totalAmount' && <ChevronDown className={cn('h-3 w-3 transition-transform', sortOrder === 'asc' && 'rotate-180')} />}
                                    </button></TableHead>
                                    <TableHead><button className="flex items-center gap-1 hover:text-foreground" onClick={() => toggleSort('expectedDate')}>
                                        <CalendarDays className="h-3.5 w-3.5" />Expected{sortField === 'expectedDate' && <ChevronDown className={cn('h-3 w-3 transition-transform', sortOrder === 'asc' && 'rotate-180')} />}
                                    </button></TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead><button className="flex items-center gap-1 hover:text-foreground" onClick={() => toggleSort('createdAt')}>
                                        Created{sortField === 'createdAt' && <ChevronDown className={cn('h-3 w-3 transition-transform', sortOrder === 'asc' && 'rotate-180')} />}
                                    </button></TableHead>
                                    <TableHead className="w-[50px]"></TableHead>
                                </TableRow></TableHeader>
                                <TableBody>
                                    {paginatedPOs.map(po => (
                                        <TableRow key={po.id} className="cursor-pointer hover:bg-muted/40" onClick={() => setViewingPO(po)}>
                                            <TableCell className="font-mono font-medium text-sm">{po.poNumber}</TableCell>
                                            <TableCell><div><p className="font-medium text-sm">{po.supplierName}</p><p className="text-xs text-muted-foreground">{po.supplierPartyId}</p></div></TableCell>
                                            <TableCell className="text-sm">{po.warehouseName || po.warehouseId}</TableCell>
                                            <TableCell className="text-center text-sm">{po.itemCount}</TableCell>
                                            <TableCell className="font-medium text-sm">{formatCurrency(po.totalAmount, po.currency || '₹')}</TableCell>
                                            <TableCell className="text-sm">{formatDate(po.expectedDate)}</TableCell>
                                            <TableCell><StatusBadge status={po.status} /></TableCell>
                                            <TableCell className="text-sm text-muted-foreground">{formatDate(po.createdAt)}</TableCell>
                                            <TableCell onClick={(e) => e.stopPropagation()}>
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end">
                                                        <DropdownMenuItem onClick={() => setViewingPO(po)}><Eye className="h-4 w-4 mr-2" />View Details</DropdownMenuItem>
                                                        {['draft', 'confirmed'].includes(po.status) && <DropdownMenuItem onClick={() => setEditingPO(po)}><Edit3 className="h-4 w-4 mr-2" />Edit</DropdownMenuItem>}
                                                        <DropdownMenuSeparator />
                                                        {po.status === 'draft' && <DropdownMenuItem onClick={() => handleStatusUpdate(po, 'confirmed')}><Send className="h-4 w-4 mr-2" />Confirm & Send</DropdownMenuItem>}
                                                        {po.status === 'fully_received' && <DropdownMenuItem onClick={() => handleStatusUpdate(po, 'closed')}><Archive className="h-4 w-4 mr-2" />Close PO</DropdownMenuItem>}
                                                        {['draft', 'confirmed'].includes(po.status) && <><DropdownMenuSeparator /><DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setCancellingPO(po)}><Ban className="h-4 w-4 mr-2" />Cancel PO</DropdownMenuItem></>}
                                                        {['draft', 'cancelled'].includes(po.status) && <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeletingPO(po)}><Trash2 className="h-4 w-4 mr-2" />Delete</DropdownMenuItem>}
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                        <div className="flex items-center justify-between px-4 py-3 border-t">
                            <p className="text-sm text-muted-foreground">Showing {((currentPage - 1) * ITEMS_PER_PAGE) + 1}–{Math.min(currentPage * ITEMS_PER_PAGE, filteredAndSorted.length)} of {filteredAndSorted.length}</p>
                            <div className="flex items-center gap-2">
                                <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}><ChevronLeft className="h-4 w-4" /></Button>
                                <div className="flex items-center gap-1">
                                    {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                                        let pageNum: number;
                                        if (totalPages <= 5) pageNum = i + 1;
                                        else if (currentPage <= 3) pageNum = i + 1;
                                        else if (currentPage >= totalPages - 2) pageNum = totalPages - 4 + i;
                                        else pageNum = currentPage - 2 + i;
                                        return <Button key={pageNum} variant={currentPage === pageNum ? 'default' : 'outline'} size="sm" className="w-8 h-8 p-0" onClick={() => setCurrentPage(pageNum)}>{pageNum}</Button>;
                                    })}
                                </div>
                                <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}><ChevronRight className="h-4 w-4" /></Button>
                            </div>
                        </div>
                    </>
                )}
            </Card>

            <POFormDialog open={createDialogOpen} onOpenChange={setCreateDialogOpen} onSubmit={handleCreateSubmit}
                isLoading={createMutation.isPending} editingPO={null} products={products} parties={supplierParties} warehouses={warehouses} />
            <POFormDialog open={!!editingPO} onOpenChange={(open) => { if (!open) setEditingPO(null); }} onSubmit={handleEditSubmit}
                isLoading={updateMutation.isPending} editingPO={editingPO} products={products} parties={supplierParties} warehouses={warehouses} />
            <PODetailDialog open={!!viewingPO} onOpenChange={(open) => { if (!open) setViewingPO(null); }} po={viewingPO} />
            <CancelPODialog open={!!cancellingPO} onOpenChange={(open) => { if (!open) setCancellingPO(null); }}
                onConfirm={handleCancelConfirm} isLoading={updateMutation.isPending} poNumber={cancellingPO?.poNumber || ''} />

            <AlertDialog open={!!deletingPO} onOpenChange={(open) => { if (!open) setDeletingPO(null); }}>
                <AlertDialogContent>
                    <AlertDialogHeader><AlertDialogTitle>Delete {deletingPO?.poNumber}?</AlertDialogTitle>
                        <AlertDialogDescription>This action cannot be undone. This will permanently delete the purchase order.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={deleteMutation.isPending}>
                            {deleteMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}