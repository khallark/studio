'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { collection, getDocs, query, orderBy, onSnapshot, where } from 'firebase/firestore';
import { useBusinessContext } from '../../layout';
import { db } from '@/lib/firebase';
import { User } from 'firebase/auth';
import { cn } from '@/lib/utils';
import {
    Plus,
    Search,
    RefreshCw,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    FileText,
    Trash2,
    Eye,
    PackageCheck,
    Ban,
    ClipboardCheck,
    CheckCircle2,
    XCircle,
    ArrowUpDown,
    Filter,
    MoreHorizontal,
    IndianRupee,
    Hash,
    Loader2,
    Package,
    AlertTriangle,
    Link2,
    PackagePlus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
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

type SortField = 'createdAt' | 'receivedAt' | 'totalReceivedValue' | 'grnNumber';
type SortOrder = 'asc' | 'desc';

interface GRNItemFormRow {
    sku: string;
    productName: string;
    expectedQty: number;
    receivedQty: number;
    notReceivedQty: number;
    unitCost: number;
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
    if (!timestamp) return '\u2014';
    try {
        return timestamp.toDate().toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
        });
    } catch {
        return '\u2014';
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

/**
 * Real-time listener for POs that can receive GRNs.
 * Listens to POs with status 'confirmed' or 'partially_received' via onSnapshot.
 * PO is only closed manually by the user.
 */
function useReceivablePOs(businessId: string | null) {
    const [receivablePOs, setReceivablePOs] = useState<PurchaseOrder[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!businessId) {
            setReceivablePOs([]);
            setIsLoading(false);
            return;
        }

        const posRef = collection(db, 'users', businessId, 'purchaseOrders');
        const q = query(
            posRef,
            where('status', 'in', ['confirmed', 'partially_received'])
        );

        const unsubscribe = onSnapshot(
            q,
            (snapshot) => {
                const pos = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data(),
                })) as PurchaseOrder[];
                setReceivablePOs(pos);
                setIsLoading(false);
            },
            (error) => {
                console.error('❌ Receivable POs listener error:', error);
                setIsLoading(false);
            }
        );

        return () => unsubscribe();
    }, [businessId]);

    return { data: receivablePOs, isLoading };
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
            queryClient.invalidateQueries({ queryKey: ['purchaseOrders', businessId] });
            toast({ title: 'GRN Deleted', description: `${data.deletedGrnNumber} has been deleted.` });
        },
        onError: (error: Error) => {
            toast({ title: 'Failed to Delete GRN', description: error.message, variant: 'destructive' });
        },
    });
}

function useConfirmPutAway(businessId: string | null, user: User | null | undefined) {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    return useMutation({
        mutationFn: async (grnId: string) => {
            if (!businessId || !user) throw new Error('Invalid parameters');

            const idToken = await user.getIdToken();
            const response = await fetch('/api/business/warehouse/grns/confirm-put-away', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${idToken}`,
                },
                body: JSON.stringify({ businessId, grnId }),
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.message || errData.error || 'Failed to confirm put away');
            }

            return response.json();
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ['grns', businessId] });
            queryClient.invalidateQueries({ queryKey: ['purchaseOrders', businessId] });
            toast({
                title: 'Put Away Confirmed',
                description: `${data.totalUPCsCreated} UPC(s) created from ${data.grnNumber}. GRN marked as completed.`,
            });
        },
        onError: (error: Error) => {
            toast({ title: 'Put Away Failed', description: error.message, variant: 'destructive' });
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
    const [billNumber, setBillNumber] = useState('');
    const [notes, setNotes] = useState('');
    const [items, setItems] = useState<GRNItemFormRow[]>([]);

    const selectedPO = receivablePOs.find(po => po.id === selectedPOId) || null;

    // When PO is selected, populate items with expected quantities.
    // Expected = expectedQty - receivedSoFar (from PO tracking).
    // All items shown since GRNs are allowed until PO is manually closed.
    React.useEffect(() => {
        if (selectedPO) {
            const formItems: GRNItemFormRow[] = selectedPO.items.map(item => {
                const expectedQty = Math.max(0, item.expectedQty - (item.receivedQty || 0));
                return {
                    sku: item.sku,
                    productName: item.productName,
                    expectedQty,
                    receivedQty: expectedQty, // Default: received = expected
                    notReceivedQty: 0,
                    unitCost: item.unitCost,
                };
            });
            setItems(formItems);
        } else {
            setItems([]);
        }
    }, [selectedPO]);

    React.useEffect(() => {
        if (open) {
            setSelectedPOId('');
            setNotes('');
            setItems([]);
            setBillNumber('');
        }
    }, [open]);

    const updateReceivedQty = (index: number, value: number) => {
        setItems(prev => prev.map((item, i) => {
            if (i !== index) return item;
            const receivedQty = Math.max(0, value);
            return {
                ...item,
                receivedQty,
                notReceivedQty: Math.max(0, item.expectedQty - receivedQty),
            };
        }));
    };

    const totalReceivedValue = items.reduce((sum, i) => sum + i.receivedQty * i.unitCost, 0);

    // At least one item must have received > 0
    const canSubmit =
        selectedPOId &&
        items.length > 0 &&
        items.some(i => i.receivedQty > 0);

    const handleSubmit = () => {
        if (!selectedPO) return;
        // Only send items that have received > 0
        const itemsToSend = items.filter(i => i.receivedQty > 0);
        onSubmit({
            poId: selectedPOId,
            poNumber: selectedPO.poNumber,
            billNumber: billNumber,
            warehouseId: selectedPO.warehouseId,
            warehouseName: selectedPO.warehouseName || '',
            items: itemsToSend.map(i => ({
                sku: i.sku,
                productName: i.productName,
                expectedQty: i.expectedQty,
                receivedQty: i.receivedQty,
                unitCost: i.unitCost,
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
                                            <span className="text-muted-foreground ml-2">{'\u2014'} {po.supplierName}</span>
                                        </SelectItem>
                                    ))
                                )}
                            </SelectContent>
                        </Select>
                    </div>

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

                    <div className="space-y-2">
                        <Label>Bill / Invoice Number</Label>
                        <Input
                            value={billNumber}
                            onChange={(e) => setBillNumber(e.target.value)}
                            placeholder="Supplier invoice or bill number..."
                        />
                    </div>

                    {items.length > 0 && (
                        <div className="space-y-3">
                            <Label className="text-base font-semibold">Received Items</Label>
                            <div className="space-y-3">
                                {items.map((item, index) => (
                                    <div key={item.sku} className="p-3 border rounded-lg space-y-3 bg-muted/20">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <p className="font-medium text-sm">{item.productName}</p>
                                                <p className="text-xs text-muted-foreground font-mono">{item.sku}</p>
                                            </div>
                                            {item.expectedQty === 0 && (
                                                <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">
                                                    Fully received on PO
                                                </Badge>
                                            )}
                                        </div>
                                        <div className="grid grid-cols-4 gap-3">
                                            <div className="space-y-1">
                                                <Label className="text-xs">Expected</Label>
                                                <Input
                                                    type="number"
                                                    value={item.expectedQty}
                                                    disabled
                                                    className="h-8 text-sm bg-muted"
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <Label className="text-xs">Received <span className="text-destructive">*</span></Label>
                                                <Input
                                                    type="number"
                                                    min={0}
                                                    value={item.receivedQty}
                                                    onChange={(e) => updateReceivedQty(index, parseInt(e.target.value) || 0)}
                                                    className={cn(
                                                        'h-8 text-sm',
                                                        item.receivedQty > item.expectedQty && 'border-amber-400 bg-amber-50/30'
                                                    )}
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <Label className="text-xs">Not Received</Label>
                                                <Input
                                                    type="number"
                                                    value={item.notReceivedQty}
                                                    disabled
                                                    className="h-8 text-sm bg-muted"
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <Label className="text-xs">Unit Cost</Label>
                                                <Input
                                                    type="number"
                                                    value={item.unitCost}
                                                    disabled
                                                    className="h-8 text-sm bg-muted"
                                                />
                                            </div>
                                        </div>
                                        {item.receivedQty > item.expectedQty && (
                                            <p className="text-xs text-amber-600 flex items-center gap-1">
                                                <AlertTriangle className="h-3 w-3" />
                                                Over-received by {item.receivedQty - item.expectedQty} unit(s)
                                            </p>
                                        )}
                                        <div className="text-xs text-muted-foreground text-right">
                                            Received value: {formatCurrency(item.receivedQty * item.unitCost)}
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <div className="text-right font-semibold text-sm pt-2 border-t">
                                Total Received Value: {formatCurrency(totalReceivedValue)}
                            </div>
                        </div>
                    )}

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
                    <div className="grid grid-cols-2 gap-4 text-sm">
                        <div className="space-y-1">
                            <p className="text-muted-foreground">Linked PO</p>
                            <p className="font-medium font-mono">{grn.poNumber}</p>
                        </div>
                        <div className="space-y-1">
                            <p className="text-muted-foreground">Bill / Invoice #</p>
                            <p className="font-medium font-mono">{grn.billNumber}</p>
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
                            <p className="text-muted-foreground">Total Received Value</p>
                            <p className="font-medium">{formatCurrency(grn.totalReceivedValue)}</p>
                        </div>
                        <div className="space-y-1">
                            <p className="text-muted-foreground">Received By</p>
                            <p className="font-medium">{grn.receivedBy}</p>
                        </div>
                        {(grn as any).totalUPCsCreated > 0 && (
                            <div className="space-y-1">
                                <p className="text-muted-foreground">UPCs Created</p>
                                <p className="font-medium">{(grn as any).totalUPCsCreated}</p>
                            </div>
                        )}
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                        <div className="p-3 bg-blue-50 rounded-lg text-center">
                            <p className="text-xl font-bold text-blue-700">{grn.totalExpectedQty}</p>
                            <p className="text-xs text-blue-600">Expected</p>
                        </div>
                        <div className="p-3 bg-emerald-50 rounded-lg text-center">
                            <p className="text-xl font-bold text-emerald-700">{grn.totalReceivedQty}</p>
                            <p className="text-xs text-emerald-600">Received</p>
                        </div>
                        <div className="p-3 bg-amber-50 rounded-lg text-center">
                            <p className="text-xl font-bold text-amber-700">{grn.totalNotReceivedQty}</p>
                            <p className="text-xs text-amber-600">Not Received</p>
                        </div>
                    </div>

                    {grn.notes && (
                        <div className="p-3 bg-muted/40 rounded-lg text-sm">
                            <p className="text-muted-foreground text-xs mb-1">Notes</p>
                            <p>{grn.notes}</p>
                        </div>
                    )}

                    <div className="space-y-2">
                        <h4 className="font-semibold text-sm">Line Items ({grn.items.length})</h4>
                        <div className="border rounded-lg overflow-hidden">
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-muted/40">
                                        <TableHead className="text-xs">SKU</TableHead>
                                        <TableHead className="text-xs">Product</TableHead>
                                        <TableHead className="text-xs text-right">Expected</TableHead>
                                        <TableHead className="text-xs text-right">Received</TableHead>
                                        <TableHead className="text-xs text-right">Not Received</TableHead>
                                        <TableHead className="text-xs text-right">Value</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {grn.items.map((item, idx) => (
                                        <TableRow key={idx}>
                                            <TableCell className="font-mono text-xs">{item.sku}</TableCell>
                                            <TableCell className="text-sm">{item.productName}</TableCell>
                                            <TableCell className="text-right text-sm">{item.expectedQty}</TableCell>
                                            <TableCell className="text-right text-sm">
                                                <span className={cn(
                                                    'font-medium',
                                                    item.receivedQty > item.expectedQty
                                                        ? 'text-amber-600'
                                                        : 'text-emerald-600'
                                                )}>
                                                    {item.receivedQty}
                                                </span>
                                                {item.receivedQty > item.expectedQty && (
                                                    <span className="text-xs text-amber-500 ml-1">
                                                        (+{item.receivedQty - item.expectedQty})
                                                    </span>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-right text-sm">
                                                {item.notReceivedQty > 0 ? (
                                                    <span className="text-amber-600 font-medium">{item.notReceivedQty}</span>
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
// CONFIRM PUT AWAY DIALOG
// ============================================================

function ConfirmPutAwayDialog({
    open,
    onOpenChange,
    grn,
    onConfirm,
    isLoading,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    grn: GRN | null;
    onConfirm: (grnId: string) => void;
    isLoading: boolean;
}) {
    if (!grn) return null;

    const itemsWithReceived = grn.items.filter(item => item.receivedQty > 0);
    const totalUPCs = itemsWithReceived.reduce((sum, i) => sum + i.receivedQty, 0);

    return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
            <AlertDialogContent className="sm:max-w-lg">
                <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2">
                        <PackagePlus className="h-5 w-5 text-emerald-600" />
                        Confirm Put Away {'\u2014'} {grn.grnNumber}
                    </AlertDialogTitle>
                    <AlertDialogDescription asChild>
                        <div className="space-y-3">
                            <p>
                                This will create <span className="font-semibold text-foreground">{totalUPCs} UPC(s)</span> for the
                                received items and mark the GRN as <span className="font-semibold text-emerald-600">completed</span>.
                            </p>
                            <p>
                                UPCs will be created with <span className="font-mono text-xs bg-muted px-1 py-0.5 rounded">putAway: &quot;inbound&quot;</span> status.
                                The actual warehouse placement will be handled via the Put Away page.
                            </p>

                            <div className="border rounded-lg overflow-hidden mt-3">
                                <Table>
                                    <TableHeader>
                                        <TableRow className="bg-muted/40">
                                            <TableHead className="text-xs">Product</TableHead>
                                            <TableHead className="text-xs text-right">Received Qty</TableHead>
                                            <TableHead className="text-xs text-right">UPCs to Create</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {itemsWithReceived.map((item, idx) => (
                                            <TableRow key={idx}>
                                                <TableCell className="text-sm">
                                                    <div>
                                                        <p className="font-medium">{item.productName}</p>
                                                        <p className="text-xs text-muted-foreground font-mono">{item.sku}</p>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-right text-sm font-medium">
                                                    {item.receivedQty}
                                                </TableCell>
                                                <TableCell className="text-right text-sm font-medium text-emerald-600">
                                                    {item.receivedQty}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>

                            <div className="text-right text-sm font-semibold pt-1">
                                Total UPCs: {totalUPCs}
                            </div>
                        </div>
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={() => onConfirm(grn.id)}
                        className="bg-emerald-600 hover:bg-emerald-700"
                        disabled={isLoading || totalUPCs === 0}
                    >
                        {isLoading ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                            <PackagePlus className="h-4 w-4 mr-2" />
                        )}
                        Confirm ({totalUPCs} UPCs)
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
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
    const [confirmingPutAway, setConfirmingPutAway] = useState<GRN | null>(null);

    // Data
    const { data: grns = [], isLoading, refetch } = useGRNs(businessId, user);
    const { data: receivablePOs = [] } = useReceivablePOs(businessId);

    // Mutations
    const createMutation = useCreateGRN(businessId, user);
    const updateMutation = useUpdateGRN(businessId, user);
    const deleteMutation = useDeleteGRN(businessId, user);
    const confirmPutAwayMutation = useConfirmPutAway(businessId, user);

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
                case 'grnNumber': aVal = a.grnNumber; bVal = b.grnNumber; break;
                case 'totalReceivedValue': aVal = a.totalReceivedValue; bVal = b.totalReceivedValue; break;
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
        const totalExpected = grns.reduce((s, g) => s + g.totalExpectedQty, 0);
        const totalReceived = grns.reduce((s, g) => s + g.totalReceivedQty, 0);
        const totalNotReceived = grns.reduce((s, g) => s + g.totalNotReceivedQty, 0);
        return { counts, totalExpected, totalReceived, totalNotReceived };
    }, [grns]);

    // Handlers
    const handleCreateSubmit = (data: any) => {
        createMutation.mutate(data, { onSuccess: () => setCreateDialogOpen(false) });
    };

    const handleStatusUpdate = (grn: GRN, newStatus: GRNStatus) => {
        updateMutation.mutate({ grnId: grn.id, status: newStatus });
    };

    const handleConfirmPutAway = (grnId: string) => {
        confirmPutAwayMutation.mutate(grnId, {
            onSuccess: () => setConfirmingPutAway(null),
        });
    };

    const handleDelete = () => {
        if (!deletingGRN) return;
        deleteMutation.mutate(deletingGRN.id, { onSuccess: () => setDeletingGRN(null) });
    };

    const handleRefresh = () => {
        queryClient.invalidateQueries({ queryKey: ['grns', businessId] });
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
                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-blue-50">
                                <Package className="h-4 w-4 text-blue-600" />
                            </div>
                            <div>
                                <p className="text-xl font-bold">{stats.totalExpected}</p>
                                <p className="text-xs text-muted-foreground">Total Expected</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-emerald-50">
                                <PackageCheck className="h-4 w-4 text-emerald-600" />
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
                            <div className="p-2 rounded-lg bg-amber-50">
                                <AlertTriangle className="h-4 w-4 text-amber-600" />
                            </div>
                            <div>
                                <p className="text-xl font-bold">{stats.totalNotReceived}</p>
                                <p className="text-xs text-muted-foreground">Not Received</p>
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
                                <SelectItem value="totalReceivedValue-desc">Value (High {'\u2192'} Low)</SelectItem>
                                <SelectItem value="totalReceivedValue-asc">Value (Low {'\u2192'} High)</SelectItem>
                                <SelectItem value="grnNumber-asc">GRN # (A {'\u2192'} Z)</SelectItem>
                                <SelectItem value="grnNumber-desc">GRN # (Z {'\u2192'} A)</SelectItem>
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
                                        <TableHead className="text-center">Expected</TableHead>
                                        <TableHead className="text-center">Received</TableHead>
                                        <TableHead className="text-center">Not Received</TableHead>
                                        <TableHead>
                                            <button
                                                className="flex items-center gap-1 hover:text-foreground"
                                                onClick={() => toggleSort('totalReceivedValue')}
                                            >
                                                <IndianRupee className="h-3.5 w-3.5" />
                                                Value
                                                {sortField === 'totalReceivedValue' && (
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
                                                {grn.totalExpectedQty}
                                            </TableCell>
                                            <TableCell className="text-center text-sm font-medium text-emerald-600">
                                                {grn.totalReceivedQty}
                                            </TableCell>
                                            <TableCell className="text-center text-sm">
                                                {grn.totalNotReceivedQty > 0 ? (
                                                    <span className="text-amber-600 font-medium">{grn.totalNotReceivedQty}</span>
                                                ) : (
                                                    '0'
                                                )}
                                            </TableCell>
                                            <TableCell className="font-medium text-sm">
                                                {formatCurrency(grn.totalReceivedValue)}
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
                                                                    onClick={() => setConfirmingPutAway(grn)}
                                                                >
                                                                    <PackagePlus className="h-4 w-4 mr-2" />
                                                                    Confirm Put Away
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

                                                        {['cancelled'].includes(grn.status) && (
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
                                Showing {((currentPage - 1) * ITEMS_PER_PAGE) + 1}{'\u2013'}{Math.min(currentPage * ITEMS_PER_PAGE, filteredAndSorted.length)} of {filteredAndSorted.length}
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

            <ConfirmPutAwayDialog
                open={!!confirmingPutAway}
                onOpenChange={(open) => { if (!open) setConfirmingPutAway(null); }}
                grn={confirmingPutAway}
                onConfirm={handleConfirmPutAway}
                isLoading={confirmPutAwayMutation.isPending}
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