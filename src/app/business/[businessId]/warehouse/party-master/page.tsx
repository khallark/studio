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
    Trash2,
    Edit3,
    Eye,
    ArrowUpDown,
    Filter,
    MoreHorizontal,
    Hash,
    Loader2,
    Users,
    UserCheck,
    UserX,
    Building2,
    Phone,
    Mail,
    MapPin,
    FileText,
    ShieldCheck,
    Ban,
    RotateCcw,
    Landmark,
    CreditCard,
    Globe,
    Copy,
    CheckCircle2,
    XCircle,
    ArrowLeftRight,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Timestamp } from 'firebase-admin/firestore';
import { Party } from '@/types/warehouse';

// ============================================================
// TYPES
// ============================================================

type PartyType = 'supplier' | 'customer' | 'both';
type SortField = 'createdAt' | 'name' | 'type';
type SortOrder = 'asc' | 'desc';

interface PartyFormData {
    name: string;
    type: PartyType;
    code: string;
    contactPerson: string;
    phone: string;
    email: string;
    addressLine1: string;
    addressLine2: string;
    city: string;
    state: string;
    pincode: string;
    country: string;
    gstin: string;
    pan: string;
    bankAccountName: string;
    bankAccountNumber: string;
    bankIfsc: string;
    bankName: string;
    defaultPaymentTerms: string;
    notes: string;
}

const ITEMS_PER_PAGE = 10;

const emptyForm: PartyFormData = {
    name: '',
    type: 'supplier',
    code: '',
    contactPerson: '',
    phone: '',
    email: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    state: '',
    pincode: '',
    country: 'India',
    gstin: '',
    pan: '',
    bankAccountName: '',
    bankAccountNumber: '',
    bankIfsc: '',
    bankName: '',
    defaultPaymentTerms: '',
    notes: '',
};

// ============================================================
// HELPERS
// ============================================================

const typeConfig: Record<PartyType, { label: string; color: string; bg: string; icon: React.ElementType }> = {
    supplier: { label: 'Supplier', color: 'text-blue-600', bg: 'bg-blue-50 border-blue-200', icon: Building2 },
    customer: { label: 'Customer', color: 'text-violet-600', bg: 'bg-violet-50 border-violet-200', icon: Users },
    both: { label: 'Both', color: 'text-amber-600', bg: 'bg-amber-50 border-amber-200', icon: ArrowLeftRight },
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

function PartyTypeBadge({ type }: { type: PartyType }) {
    const config = typeConfig[type];
    return (
        <Badge variant="outline" className={cn('text-xs font-medium gap-1', config.bg, config.color)}>
            <config.icon className="h-3 w-3" />
            {config.label}
        </Badge>
    );
}

function StatusBadge({ isActive }: { isActive: boolean }) {
    return isActive ? (
        <Badge variant="outline" className="text-xs font-medium gap-1 bg-emerald-50 border-emerald-200 text-emerald-600">
            <CheckCircle2 className="h-3 w-3" />
            Active
        </Badge>
    ) : (
        <Badge variant="outline" className="text-xs font-medium gap-1 bg-red-50 border-red-200 text-red-600">
            <XCircle className="h-3 w-3" />
            Inactive
        </Badge>
    );
}

// ============================================================
// HOOKS - DATA FETCHING
// ============================================================

function useParties(businessId: string | null, user: User | null | undefined) {
    return useQuery({
        queryKey: ['parties', businessId],
        queryFn: async () => {
            if (!businessId) throw new Error('No business ID');

            const partiesRef = collection(db, 'users', businessId, 'parties');
            const q = query(partiesRef, orderBy('createdAt', 'desc'));
            const snapshot = await getDocs(q);

            return snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
            })) as Party[];
        },
        enabled: !!businessId && !!user,
        staleTime: 15 * 1000,
        refetchInterval: 60 * 1000,
    });
}

// ============================================================
// HOOKS - MUTATIONS
// ============================================================

function useCreateParty(businessId: string | null, user: User | null | undefined) {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    return useMutation({
        mutationFn: async (data: any) => {
            if (!businessId || !user) throw new Error('Invalid parameters');

            const idToken = await user.getIdToken();
            const response = await fetch('/api/business/warehouse/party/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
                body: JSON.stringify({ businessId, ...data }),
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.message || errData.error || 'Failed to create party');
            }

            return response.json();
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ['parties', businessId] });
            toast({ title: 'Party Created', description: `"${data.party?.name}" has been added.` });
        },
        onError: (error: Error) => {
            toast({ title: 'Failed to Create Party', description: error.message, variant: 'destructive' });
        },
    });
}

function useUpdateParty(businessId: string | null, user: User | null | undefined) {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    return useMutation({
        mutationFn: async (data: any) => {
            if (!businessId || !user) throw new Error('Invalid parameters');

            const idToken = await user.getIdToken();
            const response = await fetch('/api/business/warehouse/party/update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
                body: JSON.stringify({ businessId, ...data }),
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.message || errData.error || 'Failed to update party');
            }

            return response.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['parties', businessId] });
            toast({ title: 'Party Updated', description: 'Party has been updated successfully.' });
        },
        onError: (error: Error) => {
            toast({ title: 'Failed to Update Party', description: error.message, variant: 'destructive' });
        },
    });
}

function useDeleteParty(businessId: string | null, user: User | null | undefined) {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    return useMutation({
        mutationFn: async (partyId: string) => {
            if (!businessId || !user) throw new Error('Invalid parameters');

            const idToken = await user.getIdToken();
            const response = await fetch('/api/business/warehouse/party/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
                body: JSON.stringify({ businessId, partyId }),
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.message || errData.error || 'Failed to deactivate party');
            }

            return response.json();
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ['parties', businessId] });
            toast({ title: 'Party Deactivated', description: `"${data.partyName}" has been deactivated.` });
        },
        onError: (error: Error) => {
            toast({ title: 'Failed to Deactivate Party', description: error.message, variant: 'destructive' });
        },
    });
}

function useReactivateParty(businessId: string | null, user: User | null | undefined) {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    return useMutation({
        mutationFn: async (partyId: string) => {
            if (!businessId || !user) throw new Error('Invalid parameters');

            const idToken = await user.getIdToken();
            const response = await fetch('/api/business/warehouse/party/update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
                body: JSON.stringify({ businessId, partyId, isActive: true }),
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.message || errData.error || 'Failed to reactivate party');
            }

            return response.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['parties', businessId] });
            toast({ title: 'Party Reactivated', description: 'Party is now active again.' });
        },
        onError: (error: Error) => {
            toast({ title: 'Failed to Reactivate', description: error.message, variant: 'destructive' });
        },
    });
}

// ============================================================
// PARTY FORM DIALOG (Create / Edit)
// ============================================================

function PartyFormDialog({
    open,
    onOpenChange,
    onSubmit,
    isLoading,
    editingParty,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSubmit: (data: any) => void;
    isLoading: boolean;
    editingParty: Party | null;
}) {
    const [form, setForm] = useState<PartyFormData>(emptyForm);
    const [activeTab, setActiveTab] = useState('basic');

    const isEditing = !!editingParty;

    // Populate form when editing
    React.useEffect(() => {
        if (open && editingParty) {
            setForm({
                name: editingParty.name,
                type: editingParty.type,
                code: editingParty.code || '',
                contactPerson: editingParty.contactPerson || '',
                phone: editingParty.phone || '',
                email: editingParty.email || '',
                addressLine1: editingParty.address?.line1 || '',
                addressLine2: editingParty.address?.line2 || '',
                city: editingParty.address?.city || '',
                state: editingParty.address?.state || '',
                pincode: editingParty.address?.pincode || '',
                country: editingParty.address?.country || 'India',
                gstin: editingParty.gstin || '',
                pan: editingParty.pan || '',
                bankAccountName: editingParty.bankDetails?.accountName || '',
                bankAccountNumber: editingParty.bankDetails?.accountNumber || '',
                bankIfsc: editingParty.bankDetails?.ifsc || '',
                bankName: editingParty.bankDetails?.bankName || '',
                defaultPaymentTerms: editingParty.defaultPaymentTerms || '',
                notes: editingParty.notes || '',
            });
            setActiveTab('basic');
        } else if (open) {
            setForm(emptyForm);
            setActiveTab('basic');
        }
    }, [open, editingParty]);

    const updateField = (field: keyof PartyFormData, value: string) => {
        setForm(prev => ({ ...prev, [field]: value }));
    };

    const canSubmit = form.name.trim().length > 0 && form.type;

    const handleSubmit = () => {
        const payload: any = {
            name: form.name,
            code: form.code || null,
            contactPerson: form.contactPerson || null,
            phone: form.phone || null,
            email: form.email || null,
            gstin: form.gstin || null,
            pan: form.pan || null,
            defaultPaymentTerms: form.defaultPaymentTerms || null,
            notes: form.notes || null,
        };

        // Address — only include if any field is filled
        const hasAddress = form.addressLine1 || form.addressLine2 || form.city || form.state || form.pincode;
        payload.address = hasAddress
            ? {
                  line1: form.addressLine1 || null,
                  line2: form.addressLine2 || null,
                  city: form.city || null,
                  state: form.state || null,
                  pincode: form.pincode || null,
                  country: form.country || 'India',
              }
            : null;

        // Bank — only include if any field is filled
        const hasBank = form.bankAccountName || form.bankAccountNumber || form.bankIfsc || form.bankName;
        payload.bankDetails = hasBank
            ? {
                  accountName: form.bankAccountName || null,
                  accountNumber: form.bankAccountNumber || null,
                  ifsc: form.bankIfsc || null,
                  bankName: form.bankName || null,
              }
            : null;

        if (isEditing) {
            payload.partyId = editingParty!.id;
            // type is never sent on update
        } else {
            payload.type = form.type;
        }

        onSubmit(payload);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <div className="p-2 rounded-lg bg-primary/10">
                            <Building2 className="h-5 w-5 text-primary" />
                        </div>
                        {isEditing ? `Edit Party — ${editingParty!.name}` : 'Add New Party'}
                    </DialogTitle>
                    <DialogDescription>
                        {isEditing
                            ? 'Update party details. Type cannot be changed.'
                            : 'Add a new supplier, customer, or combined party.'}
                    </DialogDescription>
                </DialogHeader>

                <Tabs value={activeTab} onValueChange={setActiveTab} className="py-4">
                    <TabsList className="grid grid-cols-4 w-full">
                        <TabsTrigger value="basic">Basic</TabsTrigger>
                        <TabsTrigger value="address">Address</TabsTrigger>
                        <TabsTrigger value="tax">Tax & Legal</TabsTrigger>
                        <TabsTrigger value="bank">Banking</TabsTrigger>
                    </TabsList>

                    {/* BASIC TAB */}
                    <TabsContent value="basic" className="space-y-4 mt-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2 col-span-2">
                                <Label>Party Name <span className="text-destructive">*</span></Label>
                                <Input
                                    value={form.name}
                                    onChange={(e) => updateField('name', e.target.value)}
                                    placeholder="e.g. Raj Textiles Pvt Ltd"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label>
                                    Type <span className="text-destructive">*</span>
                                    {isEditing && <span className="text-xs text-muted-foreground ml-1">(locked)</span>}
                                </Label>
                                <Select
                                    value={form.type}
                                    onValueChange={(val) => updateField('type', val)}
                                    disabled={isEditing}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select type" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="supplier">Supplier</SelectItem>
                                        <SelectItem value="customer">Customer</SelectItem>
                                        <SelectItem value="both">Both</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label>Code</Label>
                                <Input
                                    value={form.code}
                                    onChange={(e) => updateField('code', e.target.value)}
                                    placeholder="e.g. RAJ-TEX"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label>Contact Person</Label>
                                <Input
                                    value={form.contactPerson}
                                    onChange={(e) => updateField('contactPerson', e.target.value)}
                                    placeholder="e.g. Amit Sharma"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label>Phone</Label>
                                <Input
                                    value={form.phone}
                                    onChange={(e) => updateField('phone', e.target.value)}
                                    placeholder="e.g. +91 98765 43210"
                                />
                            </div>

                            <div className="space-y-2 col-span-2">
                                <Label>Email</Label>
                                <Input
                                    type="email"
                                    value={form.email}
                                    onChange={(e) => updateField('email', e.target.value)}
                                    placeholder="e.g. contact@rajtextiles.com"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label>Payment Terms</Label>
                                <Input
                                    value={form.defaultPaymentTerms}
                                    onChange={(e) => updateField('defaultPaymentTerms', e.target.value)}
                                    placeholder="e.g. Net 30, Advance"
                                />
                            </div>
                        </div>
                    </TabsContent>

                    {/* ADDRESS TAB */}
                    <TabsContent value="address" className="space-y-4 mt-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2 col-span-2">
                                <Label>Address Line 1</Label>
                                <Input
                                    value={form.addressLine1}
                                    onChange={(e) => updateField('addressLine1', e.target.value)}
                                    placeholder="Street, Building"
                                />
                            </div>

                            <div className="space-y-2 col-span-2">
                                <Label>Address Line 2</Label>
                                <Input
                                    value={form.addressLine2}
                                    onChange={(e) => updateField('addressLine2', e.target.value)}
                                    placeholder="Area, Landmark"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label>City</Label>
                                <Input
                                    value={form.city}
                                    onChange={(e) => updateField('city', e.target.value)}
                                    placeholder="e.g. Mumbai"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label>State</Label>
                                <Input
                                    value={form.state}
                                    onChange={(e) => updateField('state', e.target.value)}
                                    placeholder="e.g. Maharashtra"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label>Pincode</Label>
                                <Input
                                    value={form.pincode}
                                    onChange={(e) => updateField('pincode', e.target.value)}
                                    placeholder="e.g. 400001"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label>Country</Label>
                                <Input
                                    value={form.country}
                                    onChange={(e) => updateField('country', e.target.value)}
                                    placeholder="India"
                                />
                            </div>
                        </div>
                    </TabsContent>

                    {/* TAX TAB */}
                    <TabsContent value="tax" className="space-y-4 mt-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>GSTIN</Label>
                                <Input
                                    value={form.gstin}
                                    onChange={(e) => updateField('gstin', e.target.value.toUpperCase())}
                                    placeholder="e.g. 27AABCU9603R1ZM"
                                    maxLength={15}
                                />
                                <p className="text-xs text-muted-foreground">15-character GST Identification Number</p>
                            </div>

                            <div className="space-y-2">
                                <Label>PAN</Label>
                                <Input
                                    value={form.pan}
                                    onChange={(e) => updateField('pan', e.target.value.toUpperCase())}
                                    placeholder="e.g. AABCU9603R"
                                    maxLength={10}
                                />
                                <p className="text-xs text-muted-foreground">10-character PAN</p>
                            </div>
                        </div>
                    </TabsContent>

                    {/* BANK TAB */}
                    <TabsContent value="bank" className="space-y-4 mt-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Account Holder Name</Label>
                                <Input
                                    value={form.bankAccountName}
                                    onChange={(e) => updateField('bankAccountName', e.target.value)}
                                    placeholder="e.g. Raj Textiles Pvt Ltd"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label>Bank Name</Label>
                                <Input
                                    value={form.bankName}
                                    onChange={(e) => updateField('bankName', e.target.value)}
                                    placeholder="e.g. HDFC Bank"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label>Account Number</Label>
                                <Input
                                    value={form.bankAccountNumber}
                                    onChange={(e) => updateField('bankAccountNumber', e.target.value)}
                                    placeholder="e.g. 50200012345678"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label>IFSC Code</Label>
                                <Input
                                    value={form.bankIfsc}
                                    onChange={(e) => updateField('bankIfsc', e.target.value.toUpperCase())}
                                    placeholder="e.g. HDFC0001234"
                                />
                            </div>
                        </div>
                    </TabsContent>
                </Tabs>

                {/* Notes (always visible) */}
                <div className="space-y-2">
                    <Label>Notes</Label>
                    <Textarea
                        value={form.notes}
                        onChange={(e) => updateField('notes', e.target.value)}
                        placeholder="Internal notes about this party..."
                        rows={2}
                    />
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
                        Cancel
                    </Button>
                    <Button onClick={handleSubmit} disabled={!canSubmit || isLoading}>
                        {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                        {isEditing ? 'Save Changes' : 'Create Party'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// ============================================================
// PARTY DETAIL DIALOG
// ============================================================

function PartyDetailDialog({
    open,
    onOpenChange,
    party,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    party: Party | null;
}) {
    const { toast } = useToast();

    if (!party) return null;

    const copyToClipboard = (text: string, label: string) => {
        navigator.clipboard.writeText(text);
        toast({ title: 'Copied', description: `${label} copied to clipboard.` });
    };

    const hasAddress = party.address && (party.address.line1 || party.address.city);
    const hasBank = party.bankDetails && (party.bankDetails.accountNumber || party.bankDetails.bankName);

    const addressString = party.address
        ? [party.address.line1, party.address.line2, party.address.city, party.address.state, party.address.pincode, party.address.country]
              .filter(Boolean)
              .join(', ')
        : null;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-primary/10">
                            <Building2 className="h-5 w-5 text-primary" />
                        </div>
                        <div className="flex items-center gap-2">
                            <span>{party.name}</span>
                            <PartyTypeBadge type={party.type} />
                            <StatusBadge isActive={party.isActive} />
                        </div>
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-5 py-4">
                    {/* Identity */}
                    <div className="grid grid-cols-2 gap-4 text-sm">
                        {party.code && (
                            <div className="space-y-1">
                                <p className="text-muted-foreground">Code</p>
                                <p className="font-medium font-mono">{party.code}</p>
                            </div>
                        )}
                        <div className="space-y-1">
                            <p className="text-muted-foreground">Created</p>
                            <p className="font-medium">{formatDate(party.createdAt)}</p>
                        </div>
                        {party.defaultPaymentTerms && (
                            <div className="space-y-1">
                                <p className="text-muted-foreground">Payment Terms</p>
                                <p className="font-medium">{party.defaultPaymentTerms}</p>
                            </div>
                        )}
                    </div>

                    {/* Contact */}
                    {(party.contactPerson || party.phone || party.email) && (
                        <div className="space-y-3">
                            <h4 className="font-semibold text-sm flex items-center gap-2">
                                <Phone className="h-4 w-4 text-muted-foreground" />
                                Contact
                            </h4>
                            <div className="grid grid-cols-2 gap-3 text-sm">
                                {party.contactPerson && (
                                    <div className="space-y-1">
                                        <p className="text-muted-foreground">Contact Person</p>
                                        <p className="font-medium">{party.contactPerson}</p>
                                    </div>
                                )}
                                {party.phone && (
                                    <div className="space-y-1">
                                        <p className="text-muted-foreground">Phone</p>
                                        <div className="flex items-center gap-2">
                                            <p className="font-medium">{party.phone}</p>
                                            <button onClick={() => copyToClipboard(party.phone!, 'Phone')}>
                                                <Copy className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                                            </button>
                                        </div>
                                    </div>
                                )}
                                {party.email && (
                                    <div className="space-y-1 col-span-2">
                                        <p className="text-muted-foreground">Email</p>
                                        <div className="flex items-center gap-2">
                                            <p className="font-medium">{party.email}</p>
                                            <button onClick={() => copyToClipboard(party.email!, 'Email')}>
                                                <Copy className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Address */}
                    {hasAddress && (
                        <div className="space-y-2">
                            <h4 className="font-semibold text-sm flex items-center gap-2">
                                <MapPin className="h-4 w-4 text-muted-foreground" />
                                Address
                            </h4>
                            <p className="text-sm bg-muted/40 p-3 rounded-lg">{addressString}</p>
                        </div>
                    )}

                    {/* Tax */}
                    {(party.gstin || party.pan) && (
                        <div className="space-y-3">
                            <h4 className="font-semibold text-sm flex items-center gap-2">
                                <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                                Tax & Legal
                            </h4>
                            <div className="grid grid-cols-2 gap-3 text-sm">
                                {party.gstin && (
                                    <div className="space-y-1">
                                        <p className="text-muted-foreground">GSTIN</p>
                                        <div className="flex items-center gap-2">
                                            <p className="font-medium font-mono">{party.gstin}</p>
                                            <button onClick={() => copyToClipboard(party.gstin!, 'GSTIN')}>
                                                <Copy className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                                            </button>
                                        </div>
                                    </div>
                                )}
                                {party.pan && (
                                    <div className="space-y-1">
                                        <p className="text-muted-foreground">PAN</p>
                                        <div className="flex items-center gap-2">
                                            <p className="font-medium font-mono">{party.pan}</p>
                                            <button onClick={() => copyToClipboard(party.pan!, 'PAN')}>
                                                <Copy className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Bank */}
                    {hasBank && (
                        <div className="space-y-3">
                            <h4 className="font-semibold text-sm flex items-center gap-2">
                                <Landmark className="h-4 w-4 text-muted-foreground" />
                                Bank Details
                            </h4>
                            <div className="grid grid-cols-2 gap-3 text-sm">
                                {party.bankDetails?.bankName && (
                                    <div className="space-y-1">
                                        <p className="text-muted-foreground">Bank</p>
                                        <p className="font-medium">{party.bankDetails.bankName}</p>
                                    </div>
                                )}
                                {party.bankDetails?.accountName && (
                                    <div className="space-y-1">
                                        <p className="text-muted-foreground">Account Name</p>
                                        <p className="font-medium">{party.bankDetails.accountName}</p>
                                    </div>
                                )}
                                {party.bankDetails?.accountNumber && (
                                    <div className="space-y-1">
                                        <p className="text-muted-foreground">Account No.</p>
                                        <div className="flex items-center gap-2">
                                            <p className="font-medium font-mono">{party.bankDetails.accountNumber}</p>
                                            <button onClick={() => copyToClipboard(party.bankDetails!.accountNumber!, 'Account Number')}>
                                                <Copy className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                                            </button>
                                        </div>
                                    </div>
                                )}
                                {party.bankDetails?.ifsc && (
                                    <div className="space-y-1">
                                        <p className="text-muted-foreground">IFSC</p>
                                        <div className="flex items-center gap-2">
                                            <p className="font-medium font-mono">{party.bankDetails.ifsc}</p>
                                            <button onClick={() => copyToClipboard(party.bankDetails!.ifsc!, 'IFSC')}>
                                                <Copy className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Notes */}
                    {party.notes && (
                        <div className="p-3 bg-muted/40 rounded-lg text-sm">
                            <p className="text-muted-foreground text-xs mb-1">Notes</p>
                            <p>{party.notes}</p>
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

export default function PartyMasterPage() {
    const { businessId, user } = useBusinessContext();
    const { toast } = useToast();
    const queryClient = useQueryClient();

    // State
    const [searchQuery, setSearchQuery] = useState('');
    const [typeFilter, setTypeFilter] = useState<PartyType | 'all'>('all');
    const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('active');
    const [sortField, setSortField] = useState<SortField>('createdAt');
    const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
    const [currentPage, setCurrentPage] = useState(1);

    // Dialogs
    const [formDialogOpen, setFormDialogOpen] = useState(false);
    const [editingParty, setEditingParty] = useState<Party | null>(null);
    const [viewingParty, setViewingParty] = useState<Party | null>(null);
    const [deactivatingParty, setDeactivatingParty] = useState<Party | null>(null);

    // Data
    const { data: parties = [], isLoading, refetch } = useParties(businessId, user);

    // Mutations
    const createMutation = useCreateParty(businessId, user);
    const updateMutation = useUpdateParty(businessId, user);
    const deleteMutation = useDeleteParty(businessId, user);
    const reactivateMutation = useReactivateParty(businessId, user);

    // Filter + Sort + Paginate
    const filteredAndSorted = useMemo(() => {
        let result = [...parties];

        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            result = result.filter(
                p =>
                    p.name.toLowerCase().includes(q) ||
                    p.code?.toLowerCase().includes(q) ||
                    p.contactPerson?.toLowerCase().includes(q) ||
                    p.gstin?.toLowerCase().includes(q) ||
                    p.phone?.includes(q) ||
                    p.email?.toLowerCase().includes(q)
            );
        }

        if (typeFilter !== 'all') {
            result = result.filter(p => p.type === typeFilter);
        }

        if (statusFilter === 'active') {
            result = result.filter(p => p.isActive);
        } else if (statusFilter === 'inactive') {
            result = result.filter(p => !p.isActive);
        }

        result.sort((a, b) => {
            let aVal: any, bVal: any;
            switch (sortField) {
                case 'name':
                    aVal = a.name.toLowerCase();
                    bVal = b.name.toLowerCase();
                    break;
                case 'type':
                    aVal = a.type;
                    bVal = b.type;
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
    }, [parties, searchQuery, typeFilter, statusFilter, sortField, sortOrder]);

    const totalPages = Math.max(1, Math.ceil(filteredAndSorted.length / ITEMS_PER_PAGE));
    const paginatedParties = filteredAndSorted.slice(
        (currentPage - 1) * ITEMS_PER_PAGE,
        currentPage * ITEMS_PER_PAGE
    );

    React.useEffect(() => {
        setCurrentPage(1);
    }, [searchQuery, typeFilter, statusFilter, sortField, sortOrder]);

    // Stats
    const stats = useMemo(() => {
        const total = parties.length;
        const active = parties.filter(p => p.isActive).length;
        const inactive = total - active;
        const suppliers = parties.filter(p => p.type === 'supplier' || p.type === 'both').length;
        const customers = parties.filter(p => p.type === 'customer' || p.type === 'both').length;
        return { total, active, inactive, suppliers, customers };
    }, [parties]);

    // Handlers
    const handleOpenCreate = () => {
        setEditingParty(null);
        setFormDialogOpen(true);
    };

    const handleOpenEdit = (party: Party) => {
        setEditingParty(party);
        setFormDialogOpen(true);
    };

    const handleFormSubmit = (data: any) => {
        if (editingParty) {
            updateMutation.mutate(data, { onSuccess: () => setFormDialogOpen(false) });
        } else {
            createMutation.mutate(data, { onSuccess: () => setFormDialogOpen(false) });
        }
    };

    const handleDeactivate = () => {
        if (!deactivatingParty) return;
        deleteMutation.mutate(deactivatingParty.id, {
            onSuccess: () => setDeactivatingParty(null),
        });
    };

    const handleReactivate = (party: Party) => {
        reactivateMutation.mutate(party.id);
    };

    const handleRefresh = () => {
        queryClient.invalidateQueries({ queryKey: ['parties', businessId] });
        refetch();
    };

    const toggleSort = (field: SortField) => {
        if (sortField === field) {
            setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortField(field);
            setSortOrder('asc');
        }
    };

    const statCards = [
        { label: 'Total', value: stats.total, icon: Users, color: 'text-slate-600', bg: 'bg-slate-100', filterKey: null },
        { label: 'Active', value: stats.active, icon: UserCheck, color: 'text-emerald-600', bg: 'bg-emerald-50', filterKey: 'active' },
        { label: 'Inactive', value: stats.inactive, icon: UserX, color: 'text-red-600', bg: 'bg-red-50', filterKey: 'inactive' },
        { label: 'Suppliers', value: stats.suppliers, icon: Building2, color: 'text-blue-600', bg: 'bg-blue-50', filterKey: null },
        { label: 'Customers', value: stats.customers, icon: Users, color: 'text-violet-600', bg: 'bg-violet-50', filterKey: null },
    ];

    return (
        <div className="min-h-full p-6 space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Party Master</h1>
                    <p className="text-muted-foreground">Manage your suppliers, customers, and business partners</p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={handleRefresh}>
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Refresh
                    </Button>
                    <Button onClick={handleOpenCreate}>
                        <Plus className="h-4 w-4 mr-2" />
                        Add Party
                    </Button>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                {statCards.map(stat => (
                    <Card key={stat.label}>
                        <CardContent className="p-4">
                            <div className="flex items-center gap-3">
                                <div className={cn('p-2 rounded-lg', stat.bg)}>
                                    <stat.icon className={cn('h-4 w-4', stat.color)} />
                                </div>
                                <div>
                                    <p className="text-xl font-bold">{stat.value}</p>
                                    <p className="text-xs text-muted-foreground">{stat.label}</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Filters & Search */}
            <Card>
                <CardContent className="p-4">
                    <div className="flex flex-col sm:flex-row gap-3">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search by name, code, contact, GSTIN, phone, email..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-9"
                            />
                        </div>
                        <Select
                            value={typeFilter}
                            onValueChange={(val) => setTypeFilter(val as PartyType | 'all')}
                        >
                            <SelectTrigger className="w-[140px]">
                                <Filter className="h-4 w-4 mr-2" />
                                <SelectValue placeholder="Type" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Types</SelectItem>
                                <SelectItem value="supplier">Supplier</SelectItem>
                                <SelectItem value="customer">Customer</SelectItem>
                                <SelectItem value="both">Both</SelectItem>
                            </SelectContent>
                        </Select>
                        <Select
                            value={statusFilter}
                            onValueChange={(val) => setStatusFilter(val as 'all' | 'active' | 'inactive')}
                        >
                            <SelectTrigger className="w-[140px]">
                                <SelectValue placeholder="Status" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All</SelectItem>
                                <SelectItem value="active">Active</SelectItem>
                                <SelectItem value="inactive">Inactive</SelectItem>
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
                            <SelectTrigger className="w-[170px]">
                                <ArrowUpDown className="h-4 w-4 mr-2" />
                                <SelectValue placeholder="Sort by" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="createdAt-desc">Newest First</SelectItem>
                                <SelectItem value="createdAt-asc">Oldest First</SelectItem>
                                <SelectItem value="name-asc">Name (A → Z)</SelectItem>
                                <SelectItem value="name-desc">Name (Z → A)</SelectItem>
                                <SelectItem value="type-asc">Type (A → Z)</SelectItem>
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
                        <Building2 className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                        <h3 className="text-lg font-semibold mb-1">
                            {parties.length === 0 ? 'No Parties Yet' : 'No Matching Results'}
                        </h3>
                        <p className="text-muted-foreground mb-4">
                            {parties.length === 0
                                ? 'Add your first supplier or customer to get started.'
                                : 'Try adjusting your search or filters.'}
                        </p>
                        {parties.length === 0 && (
                            <Button onClick={handleOpenCreate}>
                                <Plus className="h-4 w-4 mr-2" />
                                Add Party
                            </Button>
                        )}
                    </CardContent>
                ) : (
                    <>
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>
                                            <button
                                                className="flex items-center gap-1 hover:text-foreground"
                                                onClick={() => toggleSort('name')}
                                            >
                                                Name
                                                {sortField === 'name' && (
                                                    <ChevronDown className={cn('h-3 w-3 transition-transform', sortOrder === 'asc' && 'rotate-180')} />
                                                )}
                                            </button>
                                        </TableHead>
                                        <TableHead>Code</TableHead>
                                        <TableHead>
                                            <button
                                                className="flex items-center gap-1 hover:text-foreground"
                                                onClick={() => toggleSort('type')}
                                            >
                                                Type
                                                {sortField === 'type' && (
                                                    <ChevronDown className={cn('h-3 w-3 transition-transform', sortOrder === 'asc' && 'rotate-180')} />
                                                )}
                                            </button>
                                        </TableHead>
                                        <TableHead>Contact</TableHead>
                                        <TableHead>Phone</TableHead>
                                        <TableHead>GSTIN</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead>
                                            <button
                                                className="flex items-center gap-1 hover:text-foreground"
                                                onClick={() => toggleSort('createdAt')}
                                            >
                                                Created
                                                {sortField === 'createdAt' && (
                                                    <ChevronDown className={cn('h-3 w-3 transition-transform', sortOrder === 'asc' && 'rotate-180')} />
                                                )}
                                            </button>
                                        </TableHead>
                                        <TableHead className="w-[50px]"></TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {paginatedParties.map(party => (
                                        <TableRow
                                            key={party.id}
                                            className={cn(
                                                'cursor-pointer hover:bg-muted/40',
                                                !party.isActive && 'opacity-60'
                                            )}
                                            onClick={() => setViewingParty(party)}
                                        >
                                            <TableCell>
                                                <div>
                                                    <p className="font-medium text-sm">{party.name}</p>
                                                    {party.email && (
                                                        <p className="text-xs text-muted-foreground">{party.email}</p>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell className="font-mono text-xs text-muted-foreground">
                                                {party.code || '—'}
                                            </TableCell>
                                            <TableCell>
                                                <PartyTypeBadge type={party.type} />
                                            </TableCell>
                                            <TableCell className="text-sm">
                                                {party.contactPerson || '—'}
                                            </TableCell>
                                            <TableCell className="text-sm text-muted-foreground">
                                                {party.phone || '—'}
                                            </TableCell>
                                            <TableCell className="font-mono text-xs text-muted-foreground">
                                                {party.gstin || '—'}
                                            </TableCell>
                                            <TableCell>
                                                <StatusBadge isActive={party.isActive} />
                                            </TableCell>
                                            <TableCell className="text-sm text-muted-foreground">
                                                {formatDate(party.createdAt)}
                                            </TableCell>
                                            <TableCell onClick={(e) => e.stopPropagation()}>
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" size="icon" className="h-8 w-8">
                                                            <MoreHorizontal className="h-4 w-4" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end">
                                                        <DropdownMenuItem onClick={() => setViewingParty(party)}>
                                                            <Eye className="h-4 w-4 mr-2" />
                                                            View Details
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem onClick={() => handleOpenEdit(party)}>
                                                            <Edit3 className="h-4 w-4 mr-2" />
                                                            Edit
                                                        </DropdownMenuItem>
                                                        <DropdownMenuSeparator />
                                                        {party.isActive ? (
                                                            <DropdownMenuItem
                                                                className="text-destructive focus:text-destructive"
                                                                onClick={() => setDeactivatingParty(party)}
                                                            >
                                                                <Ban className="h-4 w-4 mr-2" />
                                                                Deactivate
                                                            </DropdownMenuItem>
                                                        ) : (
                                                            <DropdownMenuItem onClick={() => handleReactivate(party)}>
                                                                <RotateCcw className="h-4 w-4 mr-2" />
                                                                Reactivate
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
            <PartyFormDialog
                open={formDialogOpen}
                onOpenChange={setFormDialogOpen}
                onSubmit={handleFormSubmit}
                isLoading={createMutation.isPending || updateMutation.isPending}
                editingParty={editingParty}
            />

            <PartyDetailDialog
                open={!!viewingParty}
                onOpenChange={(open) => { if (!open) setViewingParty(null); }}
                party={viewingParty}
            />

            {/* Deactivate Confirmation */}
            <AlertDialog open={!!deactivatingParty} onOpenChange={(open) => { if (!open) setDeactivatingParty(null); }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Deactivate &ldquo;{deactivatingParty?.name}&rdquo;?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will soft-delete the party. They won&apos;t appear in supplier/customer dropdowns anymore.
                            Existing POs and records will remain intact. You can reactivate later if needed.
                            This action will be blocked if there are any open (non-closed) purchase orders for this party.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDeactivate}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            disabled={deleteMutation.isPending}
                        >
                            {deleteMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                            Deactivate
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}