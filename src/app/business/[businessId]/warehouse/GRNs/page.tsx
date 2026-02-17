'use client';

import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { useBusinessContext } from '../../layout';
import { db } from '@/lib/firebase';
import { User } from 'firebase/auth';
import { cn } from '@/lib/utils';
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
    Ban,
    Archive,
    ClipboardCheck,
    CheckCircle2,
    XCircle,
    ArrowUpDown,
    Filter,
    MoreHorizontal,
    Warehouse,
    CalendarDays,
    IndianRupee,
    Hash,
    Loader2,
    Package,
    ShieldCheck,
    AlertTriangle,
    Link2,
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
import { Timestamp } from 'firebase-admin/firestore';
import { GRN, GRNStatus, PurchaseOrder } from '@/types/warehouse';

// ============================================================
// TYPES
// ============================================================

// type GRNStatus = 'draft' | 'completed' | 'cancelled';
// type POStatus = 'draft' | 'confirmed' | 'partially_received' | 'fully_received' | 'closed' | 'cancelled';
type SortField = 'createdAt' | 'receivedAt' | 'totalAcceptedValue' | 'grnNumber';
type SortOrder = 'asc' | 'desc';

interface GRNItemFormRow {
    sku: string;
    productId: string;
    productName: string;
    receivedQty: number;
    acceptedQty: number;
    rejectedQty: number;
    rejectionReason: string | null;
    unitCost: number;
    maxQty: number; // remaining qty from PO
}

const ITEMS_PER_PAGE = 10;

// ============================================================
// HELPERS
// ============================================================

const statusConfig: Record<GRNStatus, { label: string; color: string; bg: string; icon: React.ElementType }> = {
    draft: { label: 'Draft', color: 'text-slate-600', bg: 'bg-slate-100 border-slate-200', icon: FileText },
    completed: { label: 'Completed', color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200', icon: CheckCircle2 },
    cancelled: { label: 'Cancelled', color: 'text-red-600', bg: 'bg-red-50 border-red-200', icon: XCircle },
};

function formatDate(timestamp: Timestamp | null): string {
    if (!timestamp) return '—';
    try {
        return timestamp.toDate().toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
        });
    } catch {
        return '—';
    }
}

function formatCurrency(amount: number, currency: string = 'INR'): string {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency,
        minimumFractionDigits: 2,
    }).format(amount);
}

function GRNStatusBadge({ status }: { status: GRNStatus }) {
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

function useGRNs(businessId: string | null, user: User | null | undefined) {
    return useQuery({
        queryKey: ['grns', businessId],
        queryFn: async () => {
            if (!businessId) throw new Error('No business ID');

            const grnsRef = collection(db, 'users', businessId, 'grns');
            const q = query(grnsRef, orderBy('createdAt', 'desc'));
            const snapshot = await getDocs(q);

            return snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
            })) as GRN[];
        },
        enabled: !!businessId && !!user,
        staleTime: 15 * 1000,
        refetchInterval: 60 * 1000,
    });
}

function useReceivablePOs(businessId: string | null, user: User | null | undefined) {
    return useQuery({
        queryKey: ['receivablePOs', businessId],
        queryFn: async () => {
            if (!businessId) throw new Error('No business ID');

            const posRef = collection(db, 'users', businessId, 'purchaseOrders');
            const snapshot = await getDocs(posRef);

            const allPOs = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
            })) as PurchaseOrder[];

            // Only POs that can receive goods
            return allPOs.filter(po =>
                po.status === 'confirmed' || po.status === 'partially_received'
            );
        },
        enabled: !!businessId && !!user,
        staleTime: 30 * 1000,
    });
}

// ============================================================
// HOOKS - MUTATIONS
// ============================================================

function useCreateGRN(businessId: string | null, user: User | null | undefined) {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    return useMutation({
        mutationFn: async (data: any) => {
            if (!businessId || !user) throw new Error('Invalid parameters');

            const idToken = await user.getIdToken();
            const response = await fetch('/api/business/warehouse/grns/create', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${idToken}`,
                },
                body: JSON.stringify({ businessId, ...data }),
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.message || errData.error || 'Failed to create GRN');
            }

            return response.json();
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ['grns', businessId] });
            queryClient.invalidateQueries({ queryKey: ['receivablePOs', businessId] });
            queryClient.invalidateQueries({ queryKey: ['purchaseOrders', businessId] });
            toast({ title: 'GRN Created', description: `${data.grnNumber} has been created.` });
        },
        onError: (error: Error) => {
            toast({ title: 'Failed to Create GRN', description: error.message, variant: 'destructive' });
        },
    });
}

function useUpdateGRN(businessId: string | null, user: User | null | undefined) {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    return useMutation({
        mutationFn: async (data: any) => {
            if (!businessId || !user) throw new Error('Invalid parameters');

            const idToken = await user.getIdToken();
            const response = await fetch('/api/business/warehouse/grns/update', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${idToken}`,
                },
                body: JSON.stringify({ businessId, ...data }),
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.message || errData.error || 'Failed to update GRN');
            }

            return response.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['grns', businessId] });
            queryClient.invalidateQueries({ queryKey: ['receivablePOs', businessId] });
            queryClient.invalidateQueries({ queryKey: ['purchaseOrders', businessId] });
            toast({ title: 'GRN Updated', description: 'GRN has been updated successfully.' });
        },
        onError: (error: Error) => {
            toast({ title: 'Failed to Update GRN', description: error.message, variant: 'destructive' });
        },
    });
}

function useDeleteGRN(businessId: string | null, user: User | null | undefined) {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    return useMutation({
        mutationFn: async (grnId: string) => {
            if (!businessId || !user) throw new Error('Invalid parameters');

            const idToken = await user.getIdToken();
            const response = await fetch('/api/business/warehouse/grns/delete', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${idToken}`,
                },
                body: JSON.stringify({ businessId, grnId }),
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.message || errData.error || 'Failed to delete GRN');
            }

            return response.json();
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ['grns', businessId] });
            queryClient.invalidateQueries({ queryKey: ['receivablePOs', businessId] });
            queryClient.invalidateQueries({ queryKey: ['purchaseOrders', businessId] });
            toast({ title: 'GRN Deleted', description: `${data.deletedGrnNumber} has been deleted.` });
        },
        onError: (error: Error) => {
            toast({ title: 'Failed to Delete GRN', description: error.message, variant: 'destructive' });
        },
    });
}

// ============================================================
// CREATE GRN DIALOG
// ============================================================

function GRNFormDialog({
    open,
    onOpenChange,
    onSubmit,
    isLoading,
    receivablePOs,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSubmit: (data: any) => void;
    isLoading: boolean;
    receivablePOs: PurchaseOrder[];
}) {
    const [selectedPOId, setSelectedPOId] = useState('');
    const [notes, setNotes] = useState('');
    const [items, setItems] = useState<GRNItemFormRow[]>([]);

    const selectedPO = receivablePOs.find(po => po.id === selectedPOId) || null;

    // When PO is selected, populate items from PO's unfulfilled line items
    React.useEffect(() => {
        if (selectedPO) {
            const formItems: GRNItemFormRow[] = selectedPO.items
                .filter(item => item.receivedQty < item.orderedQty)
                .map(item => {
                    const remaining = item.orderedQty - item.receivedQty;
                    return {
                        sku: item.sku,
                        productId: item.productId,
                        productName: item.productName,
                        receivedQty: remaining,
                        acceptedQty: remaining,
                        rejectedQty: 0,
                        rejectionReason: null,
                        unitCost: item.unitCost,
                        maxQty: remaining,
                    };
                });
            setItems(formItems);
        } else {
            setItems([]);
        }
    }, [selectedPO]);

    // Reset form on open
    React.useEffect(() => {
        if (open) {
            setSelectedPOId('');
            setNotes('');
            setItems([]);
        }
    }, [open]);

    const updateItem = (index: number, field: keyof GRNItemFormRow, value: any) => {
        setItems(prev => prev.map((item, i) => {
            if (i !== index) return item;

            const updated = { ...item, [field]: value };

            // Auto-calculate rejectedQty
            if (field === 'receivedQty' || field === 'acceptedQty') {
                const received = field === 'receivedQty' ? value : updated.receivedQty;
                const accepted = field === 'acceptedQty' ? value : updated.acceptedQty;
                updated.rejectedQty = Math.max(0, received - accepted);
            }

            return updated;
        }));
    };

    const totalAcceptedValue = items.reduce((sum, i) => sum + i.acceptedQty * i.unitCost, 0);

    const canSubmit =
        selectedPOId &&
        items.length > 0 &&
        items.every(i => i.receivedQty > 0 && i.acceptedQty >= 0 && i.acceptedQty <= i.receivedQty);

    const handleSubmit = () => {
        if (!selectedPO) return;

        onSubmit({
            poId: selectedPOId,
            poNumber: selectedPO.poNumber,
            warehouseId: selectedPO.warehouseId,
            warehouseName: selectedPO.warehouseName || '',
            items: items.map(i => ({
                sku: i.sku,
                productId: i.productId,
                productName: i.productName,
                receivedQty: i.receivedQty,
                acceptedQty: i.acceptedQty,
                rejectedQty: i.rejectedQty,
                rejectionReason: i.rejectionReason,
                unitCost: i.unitCost,
                putInLocations: [],
            })),
            notes: notes.trim() || null,
        });
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <div className="p-2 rounded-lg bg-primary/10">
                            <ClipboardCheck className="h-5 w-5 text-primary" />
                        </div>
                        Create Goods Receipt Note
                    </DialogTitle>
                    <DialogDescription>
                        Record goods received against a purchase order.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-5 py-4">
                    {/* PO Selection */}
                    <div className="space-y-2">
                        <Label>Purchase Order <span className="text-destructive">*</span></Label>
                        <Select value={selectedPOId} onValueChange={setSelectedPOId}>
                            <SelectTrigger>
                                <SelectValue placeholder="Select a purchase order..." />
                            </SelectTrigger>
                            <SelectContent>
                                {receivablePOs.length === 0 ? (
                                    <div className="p-3 text-center text-sm text-muted-foreground">
                                        No receivable POs found. POs must be in &apos;Confirmed&apos; or &apos;Partially Received&apos; status.
                                    </div>
                                ) : (
                                    receivablePOs.map(po => (
                                        <SelectItem key={po.id} value={po.id}>
                                            <span className="font-mono">{po.poNumber}</span>
                                            <span className="text-muted-foreground ml-2">— {po.supplierName}</span>
                                        </SelectItem>
                                    ))
                                )}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Selected PO Info */}
                    {selectedPO && (
                        <div className="p-3 bg-blue-50/50 border border-blue-200 rounded-lg text-sm">
                            <div className="flex items-center gap-2 mb-2">
                                <Link2 className="h-4 w-4 text-blue-600" />
                                <span className="font-medium text-blue-900">Linked to {selectedPO.poNumber}</span>
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-blue-800">
                                <div>Supplier: <span className="font-medium">{selectedPO.supplierName}</span></div>
                                <div>Warehouse: <span className="font-medium">{selectedPO.warehouseName || selectedPO.warehouseId}</span></div>
                            </div>
                        </div>
                    )}

                    {/* Items */}
                    {items.length > 0 && (
                        <div className="space-y-3">
                            <Label className="text-base font-semibold">Received Items</Label>

                            <div className="space-y-3">
                                {items.map((item, index) => (
                                    <div
                                        key={item.sku}
                                        className="p-3 border rounded-lg space-y-3 bg-muted/20"
                                    >
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <p className="font-medium text-sm">{item.productName}</p>
                                                <p className="text-xs text-muted-foreground font-mono">{item.sku}</p>
                                            </div>
                                            <Badge variant="outline" className="text-xs">
                                                Max: {item.maxQty} remaining
                                            </Badge>
                                        </div>

                                        <div className="grid grid-cols-4 gap-3">
                                            <div className="space-y-1">
                                                <Label className="text-xs">Received Qty</Label>
                                                <Input
                                                    type="number"
                                                    min={1}
                                                    value={item.receivedQty}
                                                    onChange={(e) => updateItem(index, 'receivedQty', parseInt(e.target.value) || 0)}
                                                    className="h-8 text-sm"
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <Label className="text-xs">Accepted Qty</Label>
                                                <Input
                                                    type="number"
                                                    min={0}
                                                    max={item.receivedQty}
                                                    value={item.acceptedQty}
                                                    onChange={(e) => updateItem(index, 'acceptedQty', parseInt(e.target.value) || 0)}
                                                    className="h-8 text-sm"
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <Label className="text-xs">Rejected Qty</Label>
                                                <Input
                                                    type="number"
                                                    value={item.rejectedQty}
                                                    disabled
                                                    className="h-8 text-sm bg-muted"
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <Label className="text-xs">Unit Cost</Label>
                                                <Input
                                                    type="number"
                                                    value={item.unitCost}
                                                    onChange={(e) => updateItem(index, 'unitCost', parseFloat(e.target.value) || 0)}
                                                    className="h-8 text-sm"
                                                />
                                            </div>
                                        </div>

                                        {item.rejectedQty > 0 && (
                                            <div className="space-y-1">
                                                <Label className="text-xs">Rejection Reason</Label>
                                                <Input
                                                    value={item.rejectionReason || ''}
                                                    onChange={(e) => updateItem(index, 'rejectionReason', e.target.value || null)}
                                                    placeholder="e.g. Damaged, wrong variant, expired..."
                                                    className="h-8 text-sm"
                                                />
                                            </div>
                                        )}

                                        <div className="text-xs text-muted-foreground text-right">
                                            Accepted value: {formatCurrency(item.acceptedQty * item.unitCost)}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="text-right font-semibold text-sm pt-2 border-t">
                                Total Accepted Value: {formatCurrency(totalAcceptedValue)}
                            </div>
                        </div>
                    )}

                    {/* Notes */}
                    <div className="space-y-2">
                        <Label>Notes</Label>
                        <Textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="Delivery condition, carrier info, special notes..."
                            rows={3}
                        />
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
                        Cancel
                    </Button>
                    <Button onClick={handleSubmit} disabled={!canSubmit || isLoading}>
                        {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                        Create GRN
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// ============================================================
// GRN DETAIL DIALOG
// ============================================================

function GRNDetailDialog({
    open,
    onOpenChange,
    grn,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    grn: GRN | null;
}) {
    if (!grn) return null;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-primary/10">
                            <ClipboardCheck className="h-5 w-5 text-primary" />
                        </div>
                        <div className="flex items-center gap-2">
                            <span>{grn.grnNumber}</span>
                            <GRNStatusBadge status={grn.status} />
                        </div>
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-5 py-4">
                    {/* Info Grid */}
                    <div className="grid grid-cols-2 gap-4 text-sm">
                        <div className="space-y-1">
                            <p className="text-muted-foreground">Linked PO</p>
                            <p className="font-medium font-mono">{grn.poNumber}</p>
                        </div>
                        <div className="space-y-1">
                            <p className="text-muted-foreground">Warehouse</p>
                            <p className="font-medium">{grn.warehouseName || grn.warehouseId}</p>
                        </div>
                        <div className="space-y-1">
                            <p className="text-muted-foreground">Received At</p>
                            <p className="font-medium">{formatDate(grn.receivedAt)}</p>
                        </div>
                        <div className="space-y-1">
                            <p className="text-muted-foreground">Total Accepted Value</p>
                            <p className="font-medium">{formatCurrency(grn.totalAcceptedValue)}</p>
                        </div>
                        <div className="space-y-1">
                            <p className="text-muted-foreground">Received By</p>
                            <p className="font-medium">{grn.receivedBy}</p>
                        </div>
                        {grn.inspectedBy && (
                            <div className="space-y-1">
                                <p className="text-muted-foreground">Inspected By</p>
                                <p className="font-medium">{grn.inspectedBy}</p>
                            </div>
                        )}
                    </div>

                    {/* Summary Stats */}
                    <div className="grid grid-cols-3 gap-3">
                        <div className="p-3 bg-blue-50 rounded-lg text-center">
                            <p className="text-xl font-bold text-blue-700">{grn.totalReceivedQty}</p>
                            <p className="text-xs text-blue-600">Received</p>
                        </div>
                        <div className="p-3 bg-emerald-50 rounded-lg text-center">
                            <p className="text-xl font-bold text-emerald-700">{grn.totalAcceptedQty}</p>
                            <p className="text-xs text-emerald-600">Accepted</p>
                        </div>
                        <div className="p-3 bg-red-50 rounded-lg text-center">
                            <p className="text-xl font-bold text-red-700">{grn.totalRejectedQty}</p>
                            <p className="text-xs text-red-600">Rejected</p>
                        </div>
                    </div>

                    {grn.notes && (
                        <div className="p-3 bg-muted/40 rounded-lg text-sm">
                            <p className="text-muted-foreground text-xs mb-1">Notes</p>
                            <p>{grn.notes}</p>
                        </div>
                    )}

                    {/* Items Table */}
                    <div className="space-y-2">
                        <h4 className="font-semibold text-sm">Line Items ({grn.items.length})</h4>
                        <div className="border rounded-lg overflow-hidden">
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-muted/40">
                                        <TableHead className="text-xs">SKU</TableHead>
                                        <TableHead className="text-xs">Product</TableHead>
                                        <TableHead className="text-xs text-right">Received</TableHead>
                                        <TableHead className="text-xs text-right">Accepted</TableHead>
                                        <TableHead className="text-xs text-right">Rejected</TableHead>
                                        <TableHead className="text-xs text-right">Value</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {grn.items.map((item, idx) => (
                                        <TableRow key={idx}>
                                            <TableCell className="font-mono text-xs">{item.sku}</TableCell>
                                            <TableCell className="text-sm">{item.productName}</TableCell>
                                            <TableCell className="text-right text-sm">{item.receivedQty}</TableCell>
                                            <TableCell className="text-right text-sm font-medium text-emerald-600">
                                                {item.acceptedQty}
                                            </TableCell>
                                            <TableCell className="text-right text-sm">
                                                {item.rejectedQty > 0 ? (
                                                    <div>
                                                        <span className="text-destructive font-medium">{item.rejectedQty}</span>
                                                        {item.rejectionReason && (
                                                            <p className="text-xs text-muted-foreground">{item.rejectionReason}</p>
                                                        )}
                                                    </div>
                                                ) : (
                                                    '0'
                                                )}
                                            </TableCell>
                                            <TableCell className="text-right text-sm">
                                                {formatCurrency(item.totalCost)}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </div>

                    {/* Put-in Locations (if any item has them) */}
                    {grn.items.some(i => i.putInLocations.length > 0) && (
                        <div className="space-y-2">
                            <h4 className="font-semibold text-sm">Storage Locations</h4>
                            <div className="space-y-2">
                                {grn.items
                                    .filter(i => i.putInLocations.length > 0)
                                    .map((item, idx) => (
                                        <div key={idx} className="p-2 border rounded-lg text-sm">
                                            <p className="font-medium mb-1">{item.sku} — {item.productName}</p>
                                            <div className="flex flex-wrap gap-2">
                                                {item.putInLocations.map((loc, locIdx) => (
                                                    <Badge key={locIdx} variant="outline" className="text-xs">
                                                        <Warehouse className="h-3 w-3 mr-1" />
                                                        {loc.shelfName || loc.shelfId}: {loc.qty} units
                                                    </Badge>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                            </div>
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Close
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// ============================================================
// MAIN PAGE COMPONENT
// ============================================================

export default function GRNsPage() {
    const { businessId, user } = useBusinessContext();
    const { toast } = useToast();
    const queryClient = useQueryClient();

    // State
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<GRNStatus | 'all'>('all');
    const [sortField, setSortField] = useState<SortField>('createdAt');
    const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
    const [currentPage, setCurrentPage] = useState(1);

    // Dialogs
    const [createDialogOpen, setCreateDialogOpen] = useState(false);
    const [viewingGRN, setViewingGRN] = useState<GRN | null>(null);
    const [deletingGRN, setDeletingGRN] = useState<GRN | null>(null);

    // Data
    const { data: grns = [], isLoading, refetch } = useGRNs(businessId, user);
    const { data: receivablePOs = [] } = useReceivablePOs(businessId, user);

    // Mutations
    const createMutation = useCreateGRN(businessId, user);
    const updateMutation = useUpdateGRN(businessId, user);
    const deleteMutation = useDeleteGRN(businessId, user);

    // Filter + Sort + Paginate
    const filteredAndSorted = useMemo(() => {
        let result = [...grns];

        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            result = result.filter(
                grn =>
                    grn.grnNumber.toLowerCase().includes(q) ||
                    grn.poNumber.toLowerCase().includes(q) ||
                    grn.receivedSkus.some(sku => sku.toLowerCase().includes(q)) ||
                    grn.warehouseName?.toLowerCase().includes(q)
            );
        }

        if (statusFilter !== 'all') {
            result = result.filter(grn => grn.status === statusFilter);
        }

        result.sort((a, b) => {
            let aVal: any, bVal: any;

            switch (sortField) {
                case 'grnNumber':
                    aVal = a.grnNumber;
                    bVal = b.grnNumber;
                    break;
                case 'totalAcceptedValue':
                    aVal = a.totalAcceptedValue;
                    bVal = b.totalAcceptedValue;
                    break;
                case 'receivedAt':
                    aVal = a.receivedAt?.toDate?.()?.getTime?.() || 0;
                    bVal = b.receivedAt?.toDate?.()?.getTime?.() || 0;
                    break;
                case 'createdAt':
                default:
                    aVal = a.createdAt?.toDate?.()?.getTime?.() || 0;
                    bVal = b.createdAt?.toDate?.()?.getTime?.() || 0;
                    break;
            }

            if (typeof aVal === 'string') {
                return sortOrder === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
            }
            return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
        });

        return result;
    }, [grns, searchQuery, statusFilter, sortField, sortOrder]);

    const totalPages = Math.max(1, Math.ceil(filteredAndSorted.length / ITEMS_PER_PAGE));
    const paginatedGRNs = filteredAndSorted.slice(
        (currentPage - 1) * ITEMS_PER_PAGE,
        currentPage * ITEMS_PER_PAGE
    );

    React.useEffect(() => {
        setCurrentPage(1);
    }, [searchQuery, statusFilter, sortField, sortOrder]);

    // Stats
    const stats = useMemo(() => {
        const counts: Record<GRNStatus, number> = { draft: 0, completed: 0, cancelled: 0 };
        grns.forEach(grn => { counts[grn.status] = (counts[grn.status] || 0) + 1; });

        const totalReceived = grns.reduce((s, g) => s + g.totalReceivedQty, 0);
        const totalAccepted = grns.reduce((s, g) => s + g.totalAcceptedQty, 0);
        const totalRejected = grns.reduce((s, g) => s + g.totalRejectedQty, 0);

        return { counts, totalReceived, totalAccepted, totalRejected };
    }, [grns]);

    // Handlers
    const handleCreateSubmit = (data: any) => {
        createMutation.mutate(data, { onSuccess: () => setCreateDialogOpen(false) });
    };

    const handleStatusUpdate = (grn: GRN, newStatus: GRNStatus) => {
        updateMutation.mutate({ grnId: grn.id, status: newStatus });
    };

    const handleDelete = () => {
        if (!deletingGRN) return;
        deleteMutation.mutate(deletingGRN.id, { onSuccess: () => setDeletingGRN(null) });
    };

    const handleRefresh = () => {
        queryClient.invalidateQueries({ queryKey: ['grns', businessId] });
        queryClient.invalidateQueries({ queryKey: ['receivablePOs', businessId] });
        refetch();
    };

    const toggleSort = (field: SortField) => {
        if (sortField === field) {
            setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortField(field);
            setSortOrder('desc');
        }
    };

    const statCards = [
        { key: 'draft' as GRNStatus, label: 'Draft', icon: FileText, color: 'text-slate-600', bg: 'bg-slate-100' },
        { key: 'completed' as GRNStatus, label: 'Completed', icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50' },
        { key: 'cancelled' as GRNStatus, label: 'Cancelled', icon: XCircle, color: 'text-red-600', bg: 'bg-red-50' },
    ];

    return (
        <div className="min-h-full p-6 space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Goods Receipt Notes</h1>
                    <p className="text-muted-foreground">Record and track goods received against purchase orders</p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={handleRefresh}>
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Refresh
                    </Button>
                    <Button onClick={() => setCreateDialogOpen(true)}>
                        <Plus className="h-4 w-4 mr-2" />
                        Create GRN
                    </Button>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {statCards.map(stat => (
                    <Card
                        key={stat.key}
                        className={cn(
                            'cursor-pointer transition-all hover:shadow-md',
                            statusFilter === stat.key && 'ring-2 ring-primary'
                        )}
                        onClick={() => setStatusFilter(prev => (prev === stat.key ? 'all' : stat.key))}
                    >
                        <CardContent className="p-4">
                            <div className="flex items-center gap-3">
                                <div className={cn('p-2 rounded-lg', stat.bg)}>
                                    <stat.icon className={cn('h-4 w-4', stat.color)} />
                                </div>
                                <div>
                                    <p className="text-xl font-bold">{stats.counts[stat.key]}</p>
                                    <p className="text-xs text-muted-foreground">{stat.label}</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                ))}

                {/* Aggregate stats */}
                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-blue-50">
                                <Package className="h-4 w-4 text-blue-600" />
                            </div>
                            <div>
                                <p className="text-xl font-bold">{stats.totalReceived}</p>
                                <p className="text-xs text-muted-foreground">Total Received</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-emerald-50">
                                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                            </div>
                            <div>
                                <p className="text-xl font-bold">{stats.totalAccepted}</p>
                                <p className="text-xs text-muted-foreground">Total Accepted</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-red-50">
                                <AlertTriangle className="h-4 w-4 text-red-600" />
                            </div>
                            <div>
                                <p className="text-xl font-bold">{stats.totalRejected}</p>
                                <p className="text-xs text-muted-foreground">Total Rejected</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Filters & Search */}
            <Card>
                <CardContent className="p-4">
                    <div className="flex flex-col sm:flex-row gap-3">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search by GRN number, PO number, SKU, warehouse..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-9"
                            />
                        </div>
                        <Select
                            value={statusFilter}
                            onValueChange={(val) => setStatusFilter(val as GRNStatus | 'all')}
                        >
                            <SelectTrigger className="w-[160px]">
                                <Filter className="h-4 w-4 mr-2" />
                                <SelectValue placeholder="Status" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Statuses</SelectItem>
                                {Object.entries(statusConfig).map(([key, cfg]) => (
                                    <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Select
                            value={`${sortField}-${sortOrder}`}
                            onValueChange={(val) => {
                                const [field, order] = val.split('-');
                                setSortField(field as SortField);
                                setSortOrder(order as SortOrder);
                            }}
                        >
                            <SelectTrigger className="w-[180px]">
                                <ArrowUpDown className="h-4 w-4 mr-2" />
                                <SelectValue placeholder="Sort by" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="createdAt-desc">Newest First</SelectItem>
                                <SelectItem value="createdAt-asc">Oldest First</SelectItem>
                                <SelectItem value="receivedAt-desc">Received (Latest)</SelectItem>
                                <SelectItem value="receivedAt-asc">Received (Earliest)</SelectItem>
                                <SelectItem value="totalAcceptedValue-desc">Value (High → Low)</SelectItem>
                                <SelectItem value="totalAcceptedValue-asc">Value (Low → High)</SelectItem>
                                <SelectItem value="grnNumber-asc">GRN # (A → Z)</SelectItem>
                                <SelectItem value="grnNumber-desc">GRN # (Z → A)</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </CardContent>
            </Card>

            {/* Table */}
            <Card>
                {isLoading ? (
                    <CardContent className="p-6 space-y-3">
                        {[1, 2, 3, 4, 5].map(i => (
                            <Skeleton key={i} className="h-14 w-full" />
                        ))}
                    </CardContent>
                ) : filteredAndSorted.length === 0 ? (
                    <CardContent className="p-12 text-center">
                        <ClipboardCheck className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                        <h3 className="text-lg font-semibold mb-1">
                            {grns.length === 0 ? 'No GRNs Yet' : 'No Matching Results'}
                        </h3>
                        <p className="text-muted-foreground mb-4">
                            {grns.length === 0
                                ? 'Create a GRN when goods arrive against a purchase order.'
                                : 'Try adjusting your search or filters.'}
                        </p>
                        {grns.length === 0 && (
                            <Button onClick={() => setCreateDialogOpen(true)}>
                                <Plus className="h-4 w-4 mr-2" />
                                Create GRN
                            </Button>
                        )}
                    </CardContent>
                ) : (
                    <>
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-[120px]">
                                            <button
                                                className="flex items-center gap-1 hover:text-foreground"
                                                onClick={() => toggleSort('grnNumber')}
                                            >
                                                <Hash className="h-3.5 w-3.5" />
                                                GRN #
                                                {sortField === 'grnNumber' && (
                                                    <ChevronDown className={cn('h-3 w-3 transition-transform', sortOrder === 'asc' && 'rotate-180')} />
                                                )}
                                            </button>
                                        </TableHead>
                                        <TableHead>
                                            <div className="flex items-center gap-1">
                                                <Link2 className="h-3.5 w-3.5" />
                                                PO #
                                            </div>
                                        </TableHead>
                                        <TableHead>Warehouse</TableHead>
                                        <TableHead className="text-center">Received</TableHead>
                                        <TableHead className="text-center">Accepted</TableHead>
                                        <TableHead className="text-center">Rejected</TableHead>
                                        <TableHead>
                                            <button
                                                className="flex items-center gap-1 hover:text-foreground"
                                                onClick={() => toggleSort('totalAcceptedValue')}
                                            >
                                                <IndianRupee className="h-3.5 w-3.5" />
                                                Value
                                                {sortField === 'totalAcceptedValue' && (
                                                    <ChevronDown className={cn('h-3 w-3 transition-transform', sortOrder === 'asc' && 'rotate-180')} />
                                                )}
                                            </button>
                                        </TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead>
                                            <button
                                                className="flex items-center gap-1 hover:text-foreground"
                                                onClick={() => toggleSort('receivedAt')}
                                            >
                                                Received
                                                {sortField === 'receivedAt' && (
                                                    <ChevronDown className={cn('h-3 w-3 transition-transform', sortOrder === 'asc' && 'rotate-180')} />
                                                )}
                                            </button>
                                        </TableHead>
                                        <TableHead className="w-[50px]"></TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {paginatedGRNs.map(grn => (
                                        <TableRow
                                            key={grn.id}
                                            className="cursor-pointer hover:bg-muted/40"
                                            onClick={() => setViewingGRN(grn)}
                                        >
                                            <TableCell className="font-mono font-medium text-sm">
                                                {grn.grnNumber}
                                            </TableCell>
                                            <TableCell className="font-mono text-sm text-muted-foreground">
                                                {grn.poNumber}
                                            </TableCell>
                                            <TableCell className="text-sm">
                                                {grn.warehouseName || grn.warehouseId}
                                            </TableCell>
                                            <TableCell className="text-center text-sm">
                                                {grn.totalReceivedQty}
                                            </TableCell>
                                            <TableCell className="text-center text-sm font-medium text-emerald-600">
                                                {grn.totalAcceptedQty}
                                            </TableCell>
                                            <TableCell className="text-center text-sm">
                                                {grn.totalRejectedQty > 0 ? (
                                                    <span className="text-destructive font-medium">{grn.totalRejectedQty}</span>
                                                ) : (
                                                    '0'
                                                )}
                                            </TableCell>
                                            <TableCell className="font-medium text-sm">
                                                {formatCurrency(grn.totalAcceptedValue)}
                                            </TableCell>
                                            <TableCell>
                                                <GRNStatusBadge status={grn.status} />
                                            </TableCell>
                                            <TableCell className="text-sm text-muted-foreground">
                                                {formatDate(grn.receivedAt)}
                                            </TableCell>
                                            <TableCell onClick={(e) => e.stopPropagation()}>
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" size="icon" className="h-8 w-8">
                                                            <MoreHorizontal className="h-4 w-4" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end">
                                                        <DropdownMenuItem onClick={() => setViewingGRN(grn)}>
                                                            <Eye className="h-4 w-4 mr-2" />
                                                            View Details
                                                        </DropdownMenuItem>

                                                        {grn.status === 'draft' && (
                                                            <>
                                                                <DropdownMenuSeparator />
                                                                <DropdownMenuItem
                                                                    onClick={() => handleStatusUpdate(grn, 'completed')}
                                                                >
                                                                    <CheckCircle2 className="h-4 w-4 mr-2" />
                                                                    Mark Completed
                                                                </DropdownMenuItem>
                                                                <DropdownMenuSeparator />
                                                                <DropdownMenuItem
                                                                    className="text-destructive focus:text-destructive"
                                                                    onClick={() => handleStatusUpdate(grn, 'cancelled')}
                                                                >
                                                                    <Ban className="h-4 w-4 mr-2" />
                                                                    Cancel GRN
                                                                </DropdownMenuItem>
                                                            </>
                                                        )}

                                                        {['draft', 'cancelled'].includes(grn.status) && (
                                                            <DropdownMenuItem
                                                                className="text-destructive focus:text-destructive"
                                                                onClick={() => setDeletingGRN(grn)}
                                                            >
                                                                <Trash2 className="h-4 w-4 mr-2" />
                                                                Delete
                                                            </DropdownMenuItem>
                                                        )}
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>

                        {/* Pagination */}
                        <div className="flex items-center justify-between px-4 py-3 border-t">
                            <p className="text-sm text-muted-foreground">
                                Showing {((currentPage - 1) * ITEMS_PER_PAGE) + 1}–{Math.min(currentPage * ITEMS_PER_PAGE, filteredAndSorted.length)} of {filteredAndSorted.length}
                            </p>
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                    disabled={currentPage === 1}
                                >
                                    <ChevronLeft className="h-4 w-4" />
                                </Button>
                                <div className="flex items-center gap-1">
                                    {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                                        let pageNum: number;
                                        if (totalPages <= 5) {
                                            pageNum = i + 1;
                                        } else if (currentPage <= 3) {
                                            pageNum = i + 1;
                                        } else if (currentPage >= totalPages - 2) {
                                            pageNum = totalPages - 4 + i;
                                        } else {
                                            pageNum = currentPage - 2 + i;
                                        }
                                        return (
                                            <Button
                                                key={pageNum}
                                                variant={currentPage === pageNum ? 'default' : 'outline'}
                                                size="sm"
                                                className="w-8 h-8 p-0"
                                                onClick={() => setCurrentPage(pageNum)}
                                            >
                                                {pageNum}
                                            </Button>
                                        );
                                    })}
                                </div>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                    disabled={currentPage === totalPages}
                                >
                                    <ChevronRight className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    </>
                )}
            </Card>

            {/* Dialogs */}
            <GRNFormDialog
                open={createDialogOpen}
                onOpenChange={setCreateDialogOpen}
                onSubmit={handleCreateSubmit}
                isLoading={createMutation.isPending}
                receivablePOs={receivablePOs}
            />

            <GRNDetailDialog
                open={!!viewingGRN}
                onOpenChange={(open) => { if (!open) setViewingGRN(null); }}
                grn={viewingGRN}
            />

            {/* Delete Confirmation */}
            <AlertDialog open={!!deletingGRN} onOpenChange={(open) => { if (!open) setDeletingGRN(null); }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete {deletingGRN?.grnNumber}?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This action cannot be undone. This will permanently delete the GRN and revert any PO quantity updates it caused.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDelete}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            disabled={deleteMutation.isPending}
                        >
                            {deleteMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}