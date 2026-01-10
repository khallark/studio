// /business/[businessId]/warehouse/page.tsx
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Warehouse as WarehouseIcon,
    Plus,
    ChevronRight,
    MapPin,
    Grid3X3,
    Layers,
    Package,
    Search,
    RefreshCw,
    Loader2,
    MoreHorizontal,
    Edit,
    Trash2,
    PackageOpen,
    FolderTree,
    AlertTriangle,
    MoveRight,
    Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardDescription,
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
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useBusinessContext } from '../layout';
import { User } from 'firebase/auth';
import { Placement, Rack, Shelf, Warehouse, Zone } from '@/types/warehouse';

type EntityType = 'warehouse' | 'zone' | 'rack' | 'shelf';

interface DeleteTarget {
    type: EntityType;
    id: string;
    name: string;
    hasChildren: boolean;
    childCount: number;
}

interface MoveTarget {
    type: 'zone' | 'rack' | 'shelf';
    id: string;
    name: string;
    warehouseId: string;
    zoneId?: string;
    rackId?: string;
}

// ============================================================
// TREE NODE COMPONENT
// ============================================================

interface TreeNodeProps {
    level: number;
    icon: React.ElementType;
    iconColor: string;
    bgColor: string;
    label: string;
    code?: string;
    stats?: { label: string; value: number }[];
    isExpanded: boolean;
    isLoading: boolean;
    hasChildren: boolean;
    onToggle: () => void;
    onAdd?: () => void;
    addLabel?: string;
    onEdit?: () => void;
    onMove?: () => void;
    onDelete?: () => void;
    children?: React.ReactNode;
}

function TreeNode({
    level,
    icon: Icon,
    iconColor,
    bgColor,
    label,
    code,
    stats,
    isExpanded,
    isLoading,
    hasChildren,
    onToggle,
    onAdd,
    addLabel,
    onEdit,
    onMove,
    onDelete,
    children,
}: TreeNodeProps) {
    return (
        <div className="select-none">
            <div
                className={cn(
                    'group flex items-center gap-2 py-2 px-3 rounded-lg cursor-pointer transition-all duration-200',
                    'hover:bg-muted/60',
                    isExpanded && 'bg-muted/40'
                )}
                style={{ paddingLeft: `${level * 20 + 12}px` }}
                onClick={onToggle}
            >
                <div className="w-5 h-5 flex items-center justify-center">
                    {isLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    ) : hasChildren ? (
                        <motion.div
                            animate={{ rotate: isExpanded ? 90 : 0 }}
                            transition={{ duration: 0.2 }}
                        >
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </motion.div>
                    ) : (
                        <div className="w-4 h-4" />
                    )}
                </div>

                <div className={cn('p-1.5 rounded-md', bgColor)}>
                    <Icon className={cn('h-4 w-4', iconColor)} />
                </div>

                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="font-medium text-sm truncate">{label}</span>
                        {code && (
                            <code className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                {code}
                            </code>
                        )}
                    </div>
                </div>

                {stats && stats.length > 0 && (
                    <div className="hidden sm:flex items-center gap-1.5">
                        {stats.map((stat, index) => (
                            <Badge key={index} variant="secondary" className="text-xs font-normal px-2 py-0.5">
                                {stat.value} {stat.label}
                            </Badge>
                        ))}
                    </div>
                )}

                <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity">
                            <MoreHorizontal className="h-4 w-4" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        {onAdd && (
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onAdd(); }}>
                                <Plus className="h-4 w-4 mr-2" />
                                {addLabel || 'Add'}
                            </DropdownMenuItem>
                        )}
                        {onEdit && (
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(); }}>
                                <Edit className="h-4 w-4 mr-2" />
                                Edit
                            </DropdownMenuItem>
                        )}
                        {onMove && (
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onMove(); }}>
                                <MoveRight className="h-4 w-4 mr-2" />
                                Move
                            </DropdownMenuItem>
                        )}
                        {(onAdd || onEdit || onMove) && onDelete && <DropdownMenuSeparator />}
                        {onDelete && (
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onDelete(); }} className="text-destructive focus:text-destructive">
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete
                            </DropdownMenuItem>
                        )}
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>

            <AnimatePresence>
                {isExpanded && children && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                    >
                        {children}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

// ============================================================
// PLACEMENT ROW COMPONENT
// ============================================================

function PlacementRow({ placement, level }: { placement: Placement; level: number }) {
    return (
        <div
            className="flex items-center gap-2 py-2 px-3 rounded-lg hover:bg-muted/40 transition-colors"
            style={{ paddingLeft: `${level * 20 + 12}px` }}
        >
            <div className="w-5 h-5" />
            <div className="p-1.5 rounded-md bg-violet-500/10">
                <Package className="h-4 w-4 text-violet-600" />
            </div>
            <div className="flex-1 min-w-0">
                <span className="font-medium text-sm">{placement.productId}</span>
            </div>
            <Badge variant="outline" className="font-mono">
                Qty: {placement.quantity}
            </Badge>
        </div>
    );
}

// ============================================================
// WAREHOUSE DIALOG
// ============================================================

interface WarehouseDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess: () => void;
    businessId: string;
    editData?: Warehouse | null;
    user: User | null | undefined;
}

function WarehouseDialog({ open, onOpenChange, onSuccess, businessId, editData, user }: WarehouseDialogProps) {
    const [name, setName] = useState('');
    const [code, setCode] = useState('');
    const [address, setAddress] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const { toast } = useToast();
    const isEdit = !!editData;

    useEffect(() => {
        if (editData) {
            setName(editData.name);
            setCode(editData.code || '');
            setAddress(editData.address || '');
        } else {
            setName('');
            setCode('');
            setAddress('');
        }
        setError(null);
    }, [editData, open]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) return;
        if (!isEdit && !code.trim()) {
            setError('Warehouse code is required');
            return;
        }

        setIsSubmitting(true);
        setError(null);
        try {
            const endpoint = isEdit ? '/api/business/warehouse/update-warehouse' : '/api/business/warehouse/create-warehouse';
            const idToken = await user?.getIdToken();
            const res = await fetch(endpoint, {
                method: isEdit ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
                body: JSON.stringify({
                    businessId,
                    warehouseId: editData?.id,
                    name,
                    code: isEdit ? undefined : code.trim().toUpperCase(),
                    address,
                }),
            });

            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || 'Failed to save warehouse');
            }

            toast({ title: isEdit ? 'Warehouse updated' : 'Warehouse created', description: `${name} has been ${isEdit ? 'updated' : 'created'} successfully.` });
            onOpenChange(false);
            onSuccess();
        } catch (err: any) {
            setError(err.message);
            toast({ title: 'Error', description: err.message || `Failed to ${isEdit ? 'update' : 'create'} warehouse.`, variant: 'destructive' });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <div className="p-2 rounded-lg bg-blue-500/10">
                            <WarehouseIcon className="h-5 w-5 text-blue-600" />
                        </div>
                        {isEdit ? 'Edit Warehouse' : 'Create Warehouse'}
                    </DialogTitle>
                    <DialogDescription>
                        {isEdit ? 'Update warehouse details.' : 'Add a new warehouse to organize your inventory.'}
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="warehouse-name">
                                Warehouse Name <span className="text-destructive">*</span>
                            </Label>
                            <Input
                                id="warehouse-name"
                                placeholder="e.g., Main Warehouse"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="warehouse-code">
                                Code <span className="text-destructive">*</span>
                            </Label>
                            <Input
                                id="warehouse-code"
                                placeholder="e.g., WH01"
                                value={code}
                                onChange={(e) => setCode(e.target.value.toUpperCase())}
                                disabled={isEdit}
                                className={cn(isEdit && 'bg-muted cursor-not-allowed')}
                                required={!isEdit}
                            />
                            {isEdit && (
                                <p className="text-xs text-muted-foreground">Code cannot be changed</p>
                            )}
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="warehouse-address">Address</Label>
                        <Textarea
                            id="warehouse-address"
                            placeholder="Enter warehouse address..."
                            value={address}
                            onChange={(e) => setAddress(e.target.value)}
                            rows={3}
                        />
                    </div>
                    {error && (
                        <p className="text-sm text-destructive">{error}</p>
                    )}
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                        <Button type="submit" disabled={isSubmitting || !name.trim() || (!isEdit && !code.trim())}>
                            {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                            {isEdit ? 'Save Changes' : 'Create Warehouse'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

// ============================================================
// ZONE DIALOG
// ============================================================

interface ZoneDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess: () => void;
    businessId: string;
    warehouseId: string;
    editData?: Zone | null;
    user: User | null | undefined;
}

function ZoneDialog({ open, onOpenChange, onSuccess, businessId, warehouseId, editData, user }: ZoneDialogProps) {
    const [name, setName] = useState('');
    const [code, setCode] = useState('');
    const [description, setDescription] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const { toast } = useToast();
    const isEdit = !!editData;

    useEffect(() => {
        if (editData) {
            setName(editData.name);
            setCode(editData.code || '');
            setDescription(editData.description || '');
        } else {
            setName('');
            setCode('');
            setDescription('');
        }
        setError(null);
    }, [editData, open]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) return;
        if (!isEdit && !code.trim()) {
            setError('Zone code is required');
            return;
        }

        setIsSubmitting(true);
        setError(null);
        try {
            const endpoint = isEdit ? '/api/business/warehouse/update-zone' : '/api/business/warehouse/create-zone';
            const idToken = await user?.getIdToken();
            const res = await fetch(endpoint, {
                method: isEdit ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
                body: JSON.stringify({
                    businessId,
                    zoneId: editData?.id,
                    warehouseId,
                    name,
                    code: isEdit ? undefined : code.trim().toUpperCase(),
                    description,
                }),
            });

            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || 'Failed to save zone');
            }

            toast({ title: isEdit ? 'Zone updated' : 'Zone created', description: `${name} has been ${isEdit ? 'updated' : 'created'} successfully.` });
            onOpenChange(false);
            onSuccess();
        } catch (err: any) {
            setError(err.message);
            toast({ title: 'Error', description: err.message || `Failed to ${isEdit ? 'update' : 'create'} zone.`, variant: 'destructive' });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <div className="p-2 rounded-lg bg-emerald-500/10">
                            <MapPin className="h-5 w-5 text-emerald-600" />
                        </div>
                        {isEdit ? 'Edit Zone' : 'Create Zone'}
                    </DialogTitle>
                    <DialogDescription>
                        {isEdit ? 'Update zone details.' : `Add a new zone to ${warehouseId}.`}
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="zone-name">
                                Zone Name <span className="text-destructive">*</span>
                            </Label>
                            <Input
                                id="zone-name"
                                placeholder="e.g., Zone A"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="zone-code">
                                Code <span className="text-destructive">*</span>
                            </Label>
                            <Input
                                id="zone-code"
                                placeholder="e.g., WH01-Z01"
                                value={code}
                                onChange={(e) => setCode(e.target.value.toUpperCase())}
                                disabled={isEdit}
                                className={cn(isEdit && 'bg-muted cursor-not-allowed')}
                                required={!isEdit}
                            />
                            {isEdit && (
                                <p className="text-xs text-muted-foreground">Code cannot be changed</p>
                            )}
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="zone-description">Description (Optional)</Label>
                        <Textarea
                            id="zone-description"
                            placeholder="Zone description..."
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            rows={2}
                        />
                    </div>
                    {error && (
                        <p className="text-sm text-destructive">{error}</p>
                    )}
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                        <Button type="submit" disabled={isSubmitting || !name.trim() || (!isEdit && !code.trim())}>
                            {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                            {isEdit ? 'Save Changes' : 'Create Zone'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

// ============================================================
// RACK DIALOG
// ============================================================

interface RackDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess: () => void;
    businessId: string;
    zoneId: string;
    warehouseId: string;
    editData?: Rack | null;
    user: User | null | undefined;
}

function RackDialog({ open, onOpenChange, onSuccess, businessId, zoneId, warehouseId, editData, user }: RackDialogProps) {
    const [name, setName] = useState('');
    const [code, setCode] = useState('');
    const [position, setPosition] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const { toast } = useToast();
    const isEdit = !!editData;

    useEffect(() => {
        if (editData) {
            setName(editData.name);
            setCode(editData.code || '');
            setPosition(editData.position?.toString() || '');
        } else {
            setName('');
            setCode('');
            setPosition('');
        }
        setError(null);
    }, [editData, open]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) return;
        if (!isEdit && !code.trim()) {
            setError('Rack code is required');
            return;
        }

        setIsSubmitting(true);
        setError(null);
        try {
            const endpoint = isEdit ? '/api/business/warehouse/update-rack' : '/api/business/warehouse/create-rack';
            const idToken = await user?.getIdToken();
            const res = await fetch(endpoint, {
                method: isEdit ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
                body: JSON.stringify({
                    businessId,
                    rackId: editData?.id,
                    zoneId,
                    warehouseId,
                    name,
                    code: isEdit ? undefined : code.trim().toUpperCase(),
                    position: position ? parseInt(position) : 0,
                }),
            });

            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || 'Failed to save rack');
            }

            toast({ title: isEdit ? 'Rack updated' : 'Rack created', description: `${name} has been ${isEdit ? 'updated' : 'created'} successfully.` });
            onOpenChange(false);
            onSuccess();
        } catch (err: any) {
            setError(err.message);
            toast({ title: 'Error', description: err.message || `Failed to ${isEdit ? 'update' : 'create'} rack.`, variant: 'destructive' });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <div className="p-2 rounded-lg bg-amber-500/10">
                            <Grid3X3 className="h-5 w-5 text-amber-600" />
                        </div>
                        {isEdit ? 'Edit Rack' : 'Create Rack'}
                    </DialogTitle>
                    <DialogDescription>
                        {isEdit ? 'Update rack details.' : `Add a new rack to ${zoneId}.`}
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="rack-name">
                            Rack Name <span className="text-destructive">*</span>
                        </Label>
                        <Input
                            id="rack-name"
                            placeholder="e.g., Rack 1"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            required
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="rack-code">
                                Code <span className="text-destructive">*</span>
                            </Label>
                            <Input
                                id="rack-code"
                                placeholder="e.g., WH01-Z01-R01"
                                value={code}
                                onChange={(e) => setCode(e.target.value.toUpperCase())}
                                disabled={isEdit}
                                className={cn(isEdit && 'bg-muted cursor-not-allowed')}
                                required={!isEdit}
                            />
                            {isEdit && (
                                <p className="text-xs text-muted-foreground">Code cannot be changed</p>
                            )}
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="rack-position">Position</Label>
                            <Input
                                id="rack-position"
                                type="number"
                                placeholder="e.g., 1"
                                value={position}
                                onChange={(e) => setPosition(e.target.value)}
                            />
                        </div>
                    </div>
                    {error && (
                        <p className="text-sm text-destructive">{error}</p>
                    )}
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                        <Button type="submit" disabled={isSubmitting || !name.trim() || (!isEdit && !code.trim())}>
                            {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                            {isEdit ? 'Save Changes' : 'Create Rack'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

// ============================================================
// SHELF DIALOG
// ============================================================

interface ShelfDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess: () => void;
    businessId: string;
    rackId: string;
    zoneId: string;
    warehouseId: string;
    editData?: Shelf | null;
    user: User | null | undefined;
}

function ShelfDialog({ open, onOpenChange, onSuccess, businessId, rackId, zoneId, warehouseId, editData, user }: ShelfDialogProps) {
    const [name, setName] = useState('');
    const [code, setCode] = useState('');
    const [position, setPosition] = useState('');
    const [capacity, setCapacity] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const { toast } = useToast();
    const isEdit = !!editData;

    useEffect(() => {
        if (editData) {
            setName(editData.name);
            setCode(editData.code || '');
            setPosition(editData.position?.toString() || '');
            setCapacity(editData.capacity?.toString() || '');
        } else {
            setName('');
            setCode('');
            setPosition('');
            setCapacity('');
        }
        setError(null);
    }, [editData, open]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) return;
        if (!isEdit && !code.trim()) {
            setError('Shelf code is required');
            return;
        }

        setIsSubmitting(true);
        setError(null);
        try {
            const endpoint = isEdit ? '/api/business/warehouse/update-shelf' : '/api/business/warehouse/create-shelf';
            const idToken = await user?.getIdToken();
            const res = await fetch(endpoint, {
                method: isEdit ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
                body: JSON.stringify({
                    businessId,
                    rackId,
                    zoneId,
                    warehouseId,
                    name,
                    code: isEdit ? undefined : code.trim().toUpperCase(),
                    position: position ? parseInt(position) : 0,
                    capacity: capacity ? parseInt(capacity) : null,
                }),
            });

            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || 'Failed to save shelf');
            }

            toast({ title: isEdit ? 'Shelf updated' : 'Shelf created', description: `${name} has been ${isEdit ? 'updated' : 'created'} successfully.` });
            onOpenChange(false);
            onSuccess();
        } catch (err: any) {
            setError(err.message);
            toast({ title: 'Error', description: err.message || `Failed to ${isEdit ? 'update' : 'create'} shelf.`, variant: 'destructive' });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <div className="p-2 rounded-lg bg-purple-500/10">
                            <Layers className="h-5 w-5 text-purple-600" />
                        </div>
                        {isEdit ? 'Edit Shelf' : 'Create Shelf'}
                    </DialogTitle>
                    <DialogDescription>
                        {isEdit ? 'Update shelf details.' : `Add a new shelf to ${rackId}.`}
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="shelf-name">
                                Shelf Name <span className="text-destructive">*</span>
                            </Label>
                            <Input
                                id="shelf-name"
                                placeholder="e.g., Shelf 1"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="shelf-code">
                                Code <span className="text-destructive">*</span>
                            </Label>
                            <Input
                                id="shelf-code"
                                placeholder="e.g., WH01-Z01-R01-S01"
                                value={code}
                                onChange={(e) => setCode(e.target.value.toUpperCase())}
                                disabled={isEdit}
                                className={cn(isEdit && 'bg-muted cursor-not-allowed')}
                                required={!isEdit}
                            />
                            {isEdit && (
                                <p className="text-xs text-muted-foreground">Code cannot be changed</p>
                            )}
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="shelf-position">Position</Label>
                            <Input
                                id="shelf-position"
                                type="number"
                                placeholder="1"
                                value={position}
                                onChange={(e) => setPosition(e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="shelf-capacity">Capacity</Label>
                            <Input
                                id="shelf-capacity"
                                type="number"
                                placeholder="100"
                                value={capacity}
                                onChange={(e) => setCapacity(e.target.value)}
                            />
                        </div>
                    </div>
                    {error && (
                        <p className="text-sm text-destructive">{error}</p>
                    )}
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                        <Button type="submit" disabled={isSubmitting || !name.trim() || (!isEdit && !code.trim())}>
                            {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                            {isEdit ? 'Save Changes' : 'Create Shelf'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

// ============================================================
// DELETE DIALOG
// ============================================================

interface DeleteDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess: () => void;
    businessId: string;
    target: DeleteTarget | null;
    user: User | null | undefined;
}

function DeleteDialog({ open, onOpenChange, onSuccess, businessId, target, user }: DeleteDialogProps) {
    const [isDeleting, setIsDeleting] = useState(false);
    const { toast } = useToast();

    if (!target) return null;

    const handleDelete = async () => {
        setIsDeleting(true);
        try {
            const idToken = await user?.getIdToken();
            const res = await fetch(`/api/business/warehouse/delete-${target.type}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
                body: JSON.stringify({ businessId, [`${target.type}Id`]: target.id }),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Failed to delete');
            }

            toast({ title: `${target.type.charAt(0).toUpperCase() + target.type.slice(1)} deleted`, description: `${target.name} has been deleted successfully.` });
            onOpenChange(false);
            onSuccess();
        } catch (error: any) {
            toast({ title: 'Error', description: error.message || `Failed to delete ${target.type}.`, variant: 'destructive' });
        } finally {
            setIsDeleting(false);
        }
    };

    const childLabel = { warehouse: 'zones', zone: 'racks', rack: 'shelves', shelf: 'products' }[target.type];

    return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5 text-destructive" />
                        Delete {target.type.charAt(0).toUpperCase() + target.type.slice(1)}
                    </AlertDialogTitle>
                    <AlertDialogDescription className="space-y-2">
                        <p>Are you sure you want to delete <strong>{target.name}</strong>?</p>
                        {target.hasChildren ? (
                            <p className="text-destructive font-medium">
                                ⚠️ This {target.type} has {target.childCount} {childLabel}. You must remove all {childLabel} before deleting.
                            </p>
                        ) : (
                            <p>This action cannot be undone.</p>
                        )}
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={handleDelete}
                        disabled={isDeleting || target.hasChildren}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                        {isDeleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                        Delete
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}

// ============================================================
// MOVE DIALOG - Tree-based selection
// ============================================================

interface MoveDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess: () => void;
    businessId: string;
    target: MoveTarget | null;
    user: User | null | undefined;
}

function MoveDialog({ open, onOpenChange, onSuccess, businessId, target, user }: MoveDialogProps) {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [position, setPosition] = useState('');
    const { toast } = useToast();

    // Tree data
    const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
    const [zones, setZones] = useState<Record<string, Zone[]>>({});
    const [racks, setRacks] = useState<Record<string, Rack[]>>({});

    // Expanded state
    const [expandedWarehouses, setExpandedWarehouses] = useState<Set<string>>(new Set());
    const [expandedZones, setExpandedZones] = useState<Set<string>>(new Set());

    // Loading state
    const [isLoadingWarehouses, setIsLoadingWarehouses] = useState(false);
    const [loadingZones, setLoadingZones] = useState<Set<string>>(new Set());
    const [loadingRacks, setLoadingRacks] = useState<Set<string>>(new Set());

    // Selection
    const [selectedWarehouseId, setSelectedWarehouseId] = useState<string | null>(null);
    const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
    const [selectedRackId, setSelectedRackId] = useState<string | null>(null);

    useEffect(() => {
        if (open && target) {
            setPosition('');
            setSelectedWarehouseId(null);
            setSelectedZoneId(null);
            setSelectedRackId(null);
            setExpandedWarehouses(new Set());
            setExpandedZones(new Set());
            fetchWarehouses();
        }
    }, [open, target]);

    const fetchWarehouses = async () => {
        setIsLoadingWarehouses(true);
        try {
            const idToken = await user?.getIdToken();
            const res = await fetch(`/api/business/warehouse/list-warehouses?businessId=${businessId}`, {
                headers: { Authorization: `Bearer ${idToken}` },
            });
            if (res.ok) {
                const data = await res.json();
                setWarehouses(data.warehouses || []);
            }
        } catch (error) {
            console.error('Error fetching warehouses:', error);
        } finally {
            setIsLoadingWarehouses(false);
        }
    };

    const fetchZones = async (warehouseId: string) => {
        setLoadingZones((prev) => new Set(prev).add(warehouseId));
        try {
            const idToken = await user?.getIdToken();
            const res = await fetch(`/api/business/warehouse/list-zones?businessId=${businessId}&warehouseId=${warehouseId}`, {
                headers: { Authorization: `Bearer ${idToken}` },
            });
            if (res.ok) {
                const data = await res.json();
                setZones((prev) => ({ ...prev, [warehouseId]: data.zones || [] }));
            }
        } catch (error) {
            console.error('Error fetching zones:', error);
        } finally {
            setLoadingZones((prev) => { const n = new Set(prev); n.delete(warehouseId); return n; });
        }
    };

    const fetchRacks = async (zoneId: string) => {
        setLoadingRacks((prev) => new Set(prev).add(zoneId));
        try {
            const idToken = await user?.getIdToken();
            const res = await fetch(`/api/business/warehouse/list-racks?businessId=${businessId}&zoneId=${zoneId}`, {
                headers: { Authorization: `Bearer ${idToken}` },
            });
            if (res.ok) {
                const data = await res.json();
                setRacks((prev) => ({ ...prev, [zoneId]: data.racks || [] }));
            }
        } catch (error) {
            console.error('Error fetching racks:', error);
        } finally {
            setLoadingRacks((prev) => { const n = new Set(prev); n.delete(zoneId); return n; });
        }
    };

    const toggleWarehouse = (warehouseId: string) => {
        const expanding = !expandedWarehouses.has(warehouseId);
        setExpandedWarehouses((prev) => {
            const n = new Set(prev);
            n.has(warehouseId) ? n.delete(warehouseId) : n.add(warehouseId);
            return n;
        });
        if (expanding && !zones[warehouseId]) {
            fetchZones(warehouseId);
        }
    };

    const toggleZone = (zoneId: string) => {
        const expanding = !expandedZones.has(zoneId);
        setExpandedZones((prev) => {
            const n = new Set(prev);
            n.has(zoneId) ? n.delete(zoneId) : n.add(zoneId);
            return n;
        });
        if (expanding && !racks[zoneId]) {
            fetchRacks(zoneId);
        }
    };

    const handleSelectWarehouse = (warehouse: Warehouse) => {
        if (target?.type === 'zone') {
            if (warehouse.id === target.warehouseId) return;
            setSelectedWarehouseId(warehouse.id);
            setSelectedZoneId(null);
            setSelectedRackId(null);
        }
    };

    const handleSelectZone = (zone: Zone) => {
        if (target?.type === 'rack') {
            if (zone.id === target.zoneId) return;
            setSelectedWarehouseId(zone.warehouseId);
            setSelectedZoneId(zone.id);
            setSelectedRackId(null);
        }
    };

    const handleSelectRack = (rack: Rack) => {
        if (target?.type === 'shelf') {
            if (rack.id === target.rackId) return;
            setSelectedWarehouseId(rack.warehouseId);
            setSelectedZoneId(rack.zoneId);
            setSelectedRackId(rack.id);
        }
    };

    const getSelectedInfo = () => {
        if (target?.type === 'zone' && selectedWarehouseId) {
            const warehouse = warehouses.find(w => w.id === selectedWarehouseId);
            return warehouse ? { type: 'warehouse', name: warehouse.code, data: warehouse } : null;
        }
        if (target?.type === 'rack' && selectedZoneId) {
            const zone = Object.values(zones).flat().find(z => z.id === selectedZoneId);
            return zone ? { type: 'zone', name: `${zone.warehouseId} > ${zone.code}`, data: zone } : null;
        }
        if (target?.type === 'shelf' && selectedRackId) {
            const rack = Object.values(racks).flat().find(r => r.id === selectedRackId);
            return rack ? { type: 'rack', name: `${rack.warehouseId} > ${rack.zoneId} > ${rack.code}`, data: rack } : null;
        }
        return null;
    };

    const selectedInfo = getSelectedInfo();
    const canSubmit = !!selectedInfo;

    const handleMove = async () => {
        if (!target || !selectedInfo) return;

        setIsSubmitting(true);
        try {
            const idToken = await user?.getIdToken();
            let endpoint = '';
            let body: any = { businessId };

            if (target.type === 'zone') {
                const warehouse = selectedInfo.data as Warehouse;
                endpoint = '/api/business/warehouse/move-zone';
                body = {
                    ...body,
                    zoneId: target.id,
                    targetWarehouseId: warehouse.id,
                };
            } else if (target.type === 'rack') {
                const zone = selectedInfo.data as Zone;
                endpoint = '/api/business/warehouse/move-rack';
                body = {
                    ...body,
                    rackId: target.id,
                    targetZoneId: zone.id,
                    targetWarehouseId: zone.warehouseId,
                    targetPosition: position ? parseInt(position) : undefined,
                };
            } else if (target.type === 'shelf') {
                const rack = selectedInfo.data as Rack;
                endpoint = '/api/business/warehouse/move-shelf';
                body = {
                    ...body,
                    shelfId: target.id,
                    targetRackId: rack.id,
                    targetZoneId: rack.zoneId,
                    targetWarehouseId: rack.warehouseId,
                    targetPosition: position ? parseInt(position) : undefined,
                };
            }

            const res = await fetch(endpoint, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
                body: JSON.stringify(body),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Failed to move');
            }

            toast({ title: 'Moved successfully', description: `${target.id} has been moved.` });
            onOpenChange(false);
            onSuccess();
        } catch (error: any) {
            toast({ title: 'Error', description: error.message || 'Failed to move.', variant: 'destructive' });
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!target) return null;

    const getDialogInfo = () => {
        if (target.type === 'zone') return { title: 'Move Zone', description: `Select destination warehouse for "${target.id}"`, selectLabel: 'Select a warehouse', icon: <MapPin className="h-5 w-5 text-emerald-600" />, iconBg: 'bg-emerald-500/10' };
        if (target.type === 'rack') return { title: 'Move Rack', description: `Select destination zone for "${target.id}"`, selectLabel: 'Select a zone', icon: <Grid3X3 className="h-5 w-5 text-amber-600" />, iconBg: 'bg-amber-500/10' };
        return { title: 'Move Shelf', description: `Select destination rack for "${target.id}"`, selectLabel: 'Select a rack', icon: <Layers className="h-5 w-5 text-purple-600" />, iconBg: 'bg-purple-500/10' };
    };

    const dialogInfo = getDialogInfo();
    const showZones = target.type === 'rack' || target.type === 'shelf';
    const showRacks = target.type === 'shelf';

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg max-h-[80vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <div className={cn('p-2 rounded-lg', dialogInfo.iconBg)}>{dialogInfo.icon}</div>
                        {dialogInfo.title}
                    </DialogTitle>
                    <DialogDescription>{dialogInfo.description}</DialogDescription>
                </DialogHeader>

                <div className="flex-1 overflow-hidden flex flex-col gap-4 py-2">
                    <div className="text-sm text-muted-foreground">
                        <span className="font-medium">Current location: </span>
                        {target.type === 'zone' && target.warehouseId}
                        {target.type === 'rack' && `${target.warehouseId} > ${target.zoneId}`}
                        {target.type === 'shelf' && `${target.warehouseId} > ${target.zoneId} > ${target.rackId}`}
                    </div>

                    <div className="flex-1 border rounded-lg overflow-auto max-h-[300px]">
                        {isLoadingWarehouses ? (
                            <div className="p-4 space-y-2">
                                {[1, 2, 3].map((i) => (
                                    <div key={i} className="flex items-center gap-2">
                                        <Skeleton className="h-4 w-4" />
                                        <Skeleton className="h-6 w-6 rounded" />
                                        <Skeleton className="h-4 w-32" />
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="py-1">
                                {warehouses.map((warehouse) => {
                                    const isCurrentWarehouse = warehouse.id === target.warehouseId;
                                    const isSelected = target.type === 'zone' && selectedWarehouseId === warehouse.id;
                                    const isExpandable = showZones && warehouse.stats.totalZones > 0;

                                    return (
                                        <div key={warehouse.id}>
                                            <div
                                                className={cn(
                                                    'flex items-center gap-2 py-2 px-3 cursor-pointer transition-colors',
                                                    target.type === 'zone' && !isCurrentWarehouse && 'hover:bg-muted/60',
                                                    isSelected && 'bg-primary/10',
                                                    isCurrentWarehouse && target.type === 'zone' && 'opacity-50 cursor-not-allowed'
                                                )}
                                                onClick={() => {
                                                    if (isExpandable) toggleWarehouse(warehouse.id);
                                                    handleSelectWarehouse(warehouse);
                                                }}
                                            >
                                                <div className="w-5 h-5 flex items-center justify-center">
                                                    {loadingZones.has(warehouse.id) ? (
                                                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                                    ) : isExpandable ? (
                                                        <motion.div animate={{ rotate: expandedWarehouses.has(warehouse.id) ? 90 : 0 }} transition={{ duration: 0.2 }}>
                                                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                                        </motion.div>
                                                    ) : (
                                                        <div className="w-4 h-4" />
                                                    )}
                                                </div>
                                                <div className="p-1.5 rounded-md bg-blue-500/10">
                                                    <WarehouseIcon className="h-4 w-4 text-blue-600" />
                                                </div>
                                                <span className="flex-1 text-sm font-medium truncate">{warehouse.name}</span>
                                                {warehouse.code && <code className="text-xs text-muted-foreground bg-muted px-1 rounded">{warehouse.code}</code>}
                                                {isCurrentWarehouse && target.type === 'zone' && (
                                                    <Badge variant="outline" className="text-xs">current</Badge>
                                                )}
                                                {isSelected && <Check className="h-4 w-4 text-primary" />}
                                            </div>

                                            <AnimatePresence>
                                                {showZones && expandedWarehouses.has(warehouse.id) && (
                                                    <motion.div
                                                        initial={{ opacity: 0, height: 0 }}
                                                        animate={{ opacity: 1, height: 'auto' }}
                                                        exit={{ opacity: 0, height: 0 }}
                                                        transition={{ duration: 0.2 }}
                                                    >
                                                        {zones[warehouse.id]?.map((zone) => {
                                                            const isCurrentZone = zone.id === target.zoneId;
                                                            const isZoneSelected = target.type === 'rack' && selectedZoneId === zone.id;
                                                            const isZoneExpandable = showRacks && zone.stats.totalRacks > 0;

                                                            return (
                                                                <div key={zone.id}>
                                                                    <div
                                                                        className={cn(
                                                                            'flex items-center gap-2 py-2 px-3 cursor-pointer transition-colors',
                                                                            target.type === 'rack' && !isCurrentZone && 'hover:bg-muted/60',
                                                                            isZoneSelected && 'bg-primary/10',
                                                                            isCurrentZone && target.type === 'rack' && 'opacity-50 cursor-not-allowed'
                                                                        )}
                                                                        style={{ paddingLeft: '32px' }}
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            if (isZoneExpandable) toggleZone(zone.id);
                                                                            handleSelectZone(zone);
                                                                        }}
                                                                    >
                                                                        <div className="w-5 h-5 flex items-center justify-center">
                                                                            {loadingRacks.has(zone.id) ? (
                                                                                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                                                            ) : isZoneExpandable ? (
                                                                                <motion.div animate={{ rotate: expandedZones.has(zone.id) ? 90 : 0 }} transition={{ duration: 0.2 }}>
                                                                                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                                                                </motion.div>
                                                                            ) : (
                                                                                <div className="w-4 h-4" />
                                                                            )}
                                                                        </div>
                                                                        <div className="p-1.5 rounded-md bg-emerald-500/10">
                                                                            <MapPin className="h-4 w-4 text-emerald-600" />
                                                                        </div>
                                                                        <span className="flex-1 text-sm font-medium truncate">{zone.name}</span>
                                                                        {zone.code && <code className="text-xs text-muted-foreground bg-muted px-1 rounded">{zone.code}</code>}
                                                                        {isCurrentZone && target.type === 'rack' && (
                                                                            <Badge variant="outline" className="text-xs">current</Badge>
                                                                        )}
                                                                        {isZoneSelected && <Check className="h-4 w-4 text-primary" />}
                                                                    </div>

                                                                    <AnimatePresence>
                                                                        {showRacks && expandedZones.has(zone.id) && (
                                                                            <motion.div
                                                                                initial={{ opacity: 0, height: 0 }}
                                                                                animate={{ opacity: 1, height: 'auto' }}
                                                                                exit={{ opacity: 0, height: 0 }}
                                                                                transition={{ duration: 0.2 }}
                                                                            >
                                                                                {racks[zone.id]?.map((rack) => {
                                                                                    const isCurrentRack = rack.id === target.rackId;
                                                                                    const isRackSelected = target.type === 'shelf' && selectedRackId === rack.id;

                                                                                    return (
                                                                                        <div
                                                                                            key={rack.id}
                                                                                            className={cn(
                                                                                                'flex items-center gap-2 py-2 px-3 cursor-pointer transition-colors',
                                                                                                !isCurrentRack && 'hover:bg-muted/60',
                                                                                                isRackSelected && 'bg-primary/10',
                                                                                                isCurrentRack && 'opacity-50 cursor-not-allowed'
                                                                                            )}
                                                                                            style={{ paddingLeft: '56px' }}
                                                                                            onClick={(e) => {
                                                                                                e.stopPropagation();
                                                                                                handleSelectRack(rack);
                                                                                            }}
                                                                                        >
                                                                                            <div className="w-5 h-5" />
                                                                                            <div className="p-1.5 rounded-md bg-amber-500/10">
                                                                                                <Grid3X3 className="h-4 w-4 text-amber-600" />
                                                                                            </div>
                                                                                            <span className="flex-1 text-sm font-medium truncate">{rack.name}</span>
                                                                                            {rack.code && <code className="text-xs text-muted-foreground bg-muted px-1 rounded">{rack.code}</code>}
                                                                                            {isCurrentRack && (
                                                                                                <Badge variant="outline" className="text-xs">current</Badge>
                                                                                            )}
                                                                                            {isRackSelected && <Check className="h-4 w-4 text-primary" />}
                                                                                        </div>
                                                                                    );
                                                                                })}
                                                                                {racks[zone.id]?.length === 0 && (
                                                                                    <div className="py-2 px-3 text-sm text-muted-foreground italic" style={{ paddingLeft: '56px' }}>
                                                                                        No racks
                                                                                    </div>
                                                                                )}
                                                                            </motion.div>
                                                                        )}
                                                                    </AnimatePresence>
                                                                </div>
                                                            );
                                                        })}
                                                        {zones[warehouse.id]?.length === 0 && (
                                                            <div className="py-2 px-3 text-sm text-muted-foreground italic" style={{ paddingLeft: '32px' }}>
                                                                No zones
                                                            </div>
                                                        )}
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {selectedInfo && (
                        <div className="text-sm">
                            <span className="font-medium text-primary">Selected: </span>
                            {selectedInfo.name}
                        </div>
                    )}

                    {(target.type === 'rack' || target.type === 'shelf') && (
                        <div className="space-y-2">
                            <Label htmlFor="move-position">Position (optional)</Label>
                            <Input
                                id="move-position"
                                type="number"
                                placeholder="Leave empty to append at end"
                                value={position}
                                onChange={(e) => setPosition(e.target.value)}
                                className="w-full"
                            />
                            <p className="text-xs text-muted-foreground">
                                Specify a position to insert at, or leave empty to place at the end.
                            </p>
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={handleMove} disabled={isSubmitting || !canSubmit}>
                        {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                        Move
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// ============================================================
// INSTANT WAREHOUSE DIALOG
// ============================================================

interface InstantWarehouseDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess: () => void;
    businessId: string;
    user: User | null | undefined;
}

function InstantWarehouseDialog({ open, onOpenChange, onSuccess, businessId, user }: InstantWarehouseDialogProps) {
    const [name, setName] = useState('');
    const [code, setCode] = useState('');
    const [address, setAddress] = useState('');
    const [zoneCount, setZoneCount] = useState('3');
    const [racksPerZone, setRacksPerZone] = useState('4');
    const [shelvesPerRack, setShelvesPerRack] = useState('5');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [progress, setProgress] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const { toast } = useToast();

    const zones = parseInt(zoneCount) || 0;
    const racks = parseInt(racksPerZone) || 0;
    const shelves = parseInt(shelvesPerRack) || 0;

    const totalZones = zones;
    const totalRacks = zones * racks;
    const totalShelves = zones * racks * shelves;
    const totalEntities = 1 + totalZones + totalRacks + totalShelves;

    const isValid = name.trim() && code.trim() && zones >= 1 && zones <= 50 && racks >= 1 && racks <= 50 && shelves >= 1 && shelves <= 20 && totalEntities <= 5000;

    useEffect(() => {
        if (open) {
            setName('');
            setCode('');
            setAddress('');
            setZoneCount('3');
            setRacksPerZone('4');
            setShelvesPerRack('5');
            setProgress(null);
            setError(null);
        }
    }, [open]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!isValid) return;

        setIsSubmitting(true);
        setProgress('Creating warehouse structure...');
        setError(null);

        try {
            const idToken = await user?.getIdToken();
            const res = await fetch('/api/business/warehouse/create-instant-warehouse', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
                body: JSON.stringify({
                    businessId,
                    warehouseName: name,
                    warehouseCode: code.trim().toUpperCase(),
                    address,
                    zoneCount: zones,
                    racksPerZone: racks,
                    shelvesPerRack: shelves,
                }),
            });

            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || 'Failed to create warehouse');
            }

            toast({
                title: 'Warehouse created!',
                description: `Created ${data.structure.zones} zones, ${data.structure.racks} racks, and ${data.structure.shelves} shelves.`,
            });
            onOpenChange(false);
            onSuccess();
        } catch (err: any) {
            setError(err.message);
            toast({ title: 'Error', description: err.message || 'Failed to create warehouse.', variant: 'destructive' });
        } finally {
            setIsSubmitting(false);
            setProgress(null);
        }
    };

    // Preview code format
    const previewCode = code.trim().toUpperCase() || 'WH01';

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <div className="p-2 rounded-lg bg-gradient-to-br from-blue-500/20 to-purple-500/20">
                            <WarehouseIcon className="h-5 w-5 text-blue-600" />
                        </div>
                        Quick Warehouse Setup
                    </DialogTitle>
                    <DialogDescription>
                        Instantly create a warehouse with a complete zone, rack, and shelf structure.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-5">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="instant-name">
                                Warehouse Name <span className="text-destructive">*</span>
                            </Label>
                            <Input
                                id="instant-name"
                                placeholder="e.g., Main Warehouse"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="instant-code">
                                Code <span className="text-destructive">*</span>
                            </Label>
                            <Input
                                id="instant-code"
                                placeholder="e.g., WH01"
                                value={code}
                                onChange={(e) => setCode(e.target.value.toUpperCase())}
                                required
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="instant-address">Address (Optional)</Label>
                        <Input
                            id="instant-address"
                            placeholder="Enter warehouse address..."
                            value={address}
                            onChange={(e) => setAddress(e.target.value)}
                        />
                    </div>

                    <div className="space-y-3">
                        <Label className="text-sm font-medium">Structure Configuration</Label>
                        <div className="grid grid-cols-3 gap-3">
                            <div className="space-y-1.5">
                                <Label htmlFor="zone-count" className="text-xs text-muted-foreground">Zones</Label>
                                <Input
                                    id="zone-count"
                                    type="number"
                                    min="1"
                                    max="50"
                                    value={zoneCount}
                                    onChange={(e) => setZoneCount(e.target.value)}
                                    className="text-center font-medium"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="racks-per-zone" className="text-xs text-muted-foreground">Racks/Zone</Label>
                                <Input
                                    id="racks-per-zone"
                                    type="number"
                                    min="1"
                                    max="50"
                                    value={racksPerZone}
                                    onChange={(e) => setRacksPerZone(e.target.value)}
                                    className="text-center font-medium"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="shelves-per-rack" className="text-xs text-muted-foreground">Shelves/Rack</Label>
                                <Input
                                    id="shelves-per-rack"
                                    type="number"
                                    min="1"
                                    max="20"
                                    value={shelvesPerRack}
                                    onChange={(e) => setShelvesPerRack(e.target.value)}
                                    className="text-center font-medium"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                        <p className="text-sm font-medium">Structure Preview</p>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                            <div className="flex items-center gap-2">
                                <div className="p-1 rounded bg-emerald-500/10">
                                    <MapPin className="h-3 w-3 text-emerald-600" />
                                </div>
                                <span className="text-muted-foreground">Zones:</span>
                                <span className="font-medium">{totalZones}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="p-1 rounded bg-amber-500/10">
                                    <Grid3X3 className="h-3 w-3 text-amber-600" />
                                </div>
                                <span className="text-muted-foreground">Racks:</span>
                                <span className="font-medium">{totalRacks}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="p-1 rounded bg-purple-500/10">
                                    <Layers className="h-3 w-3 text-purple-600" />
                                </div>
                                <span className="text-muted-foreground">Shelves:</span>
                                <span className="font-medium">{totalShelves}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="p-1 rounded bg-blue-500/10">
                                    <Package className="h-3 w-3 text-blue-600" />
                                </div>
                                <span className="text-muted-foreground">Total:</span>
                                <span className="font-medium">{totalEntities} entities</span>
                            </div>
                        </div>

                        {totalEntities > 5000 && (
                            <p className="text-xs text-destructive flex items-center gap-1">
                                <AlertTriangle className="h-3 w-3" />
                                Maximum 5000 entities allowed. Reduce the structure size.
                            </p>
                        )}

                        <div className="pt-2 border-t">
                            <p className="text-xs text-muted-foreground mb-1">Naming format:</p>
                            <code className="text-xs bg-muted px-2 py-1 rounded block">
                                Zone 1 → Rack 1 → Shelf 1 ({previewCode}-Z01-R01-S01)
                            </code>
                        </div>
                    </div>

                    {error && (
                        <p className="text-sm text-destructive">{error}</p>
                    )}

                    {progress && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            {progress}
                        </div>
                    )}

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={isSubmitting || !isValid}>
                            {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                            Create Warehouse
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

// ============================================================
// MAIN PAGE COMPONENT
// ============================================================

export default function WarehousePage() {
    const { businessId, user } = useBusinessContext();
    const { toast } = useToast();

    // Data state
    const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');

    // Expanded state
    const [expandedWarehouses, setExpandedWarehouses] = useState<Set<string>>(new Set());
    const [expandedZones, setExpandedZones] = useState<Set<string>>(new Set());
    const [expandedRacks, setExpandedRacks] = useState<Set<string>>(new Set());
    const [expandedShelves, setExpandedShelves] = useState<Set<string>>(new Set());

    // Loaded data
    const [zones, setZones] = useState<Record<string, Zone[]>>({});
    const [racks, setRacks] = useState<Record<string, Rack[]>>({});
    const [shelves, setShelves] = useState<Record<string, Shelf[]>>({});
    const [placements, setPlacements] = useState<Record<string, Placement[]>>({});

    // Loading states
    const [loadingZones, setLoadingZones] = useState<Set<string>>(new Set());
    const [loadingRacks, setLoadingRacks] = useState<Set<string>>(new Set());
    const [loadingShelves, setLoadingShelves] = useState<Set<string>>(new Set());
    const [loadingPlacements, setLoadingPlacements] = useState<Set<string>>(new Set());

    // Dialog states
    const [warehouseDialogOpen, setWarehouseDialogOpen] = useState(false);
    const [editWarehouse, setEditWarehouse] = useState<Warehouse | null>(null);

    const [zoneDialogOpen, setZoneDialogOpen] = useState(false);
    const [editZone, setEditZone] = useState<Zone | null>(null);
    const [zoneParent, setZoneParent] = useState<{ warehouseId: string; } | null>(null);

    const [rackDialogOpen, setRackDialogOpen] = useState(false);
    const [editRack, setEditRack] = useState<Rack | null>(null);
    const [rackParent, setRackParent] = useState<{ zoneId: string; warehouseId: string; } | null>(null);

    const [shelfDialogOpen, setShelfDialogOpen] = useState(false);
    const [editShelf, setEditShelf] = useState<Shelf | null>(null);
    const [shelfParent, setShelfParent] = useState<{ rackId: string; zoneId: string; warehouseId: string; } | null>(null);

    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);

    const [moveDialogOpen, setMoveDialogOpen] = useState(false);
    const [moveTarget, setMoveTarget] = useState<MoveTarget | null>(null);

    const [instantWarehouseDialogOpen, setInstantWarehouseDialogOpen] = useState(false);

    // Fetch functions
    const fetchWarehouses = useCallback(async () => {
        setIsLoading(true);
        try {
            const idToken = await user?.getIdToken();
            const res = await fetch(`/api/business/warehouse/list-warehouses?businessId=${businessId}`, { headers: { Authorization: `Bearer ${idToken}` } });
            if (!res.ok) throw new Error('Failed to fetch warehouses');
            const data = await res.json();
            setWarehouses(data.warehouses || []);
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to load warehouses.', variant: 'destructive' });
        } finally {
            setIsLoading(false);
        }
    }, [businessId, toast, user]);

    useEffect(() => { fetchWarehouses(); }, [fetchWarehouses]);

    const fetchZones = async (warehouseId: string) => {
        setLoadingZones((prev) => new Set(prev).add(warehouseId));
        try {
            const idToken = await user?.getIdToken();
            const res = await fetch(`/api/business/warehouse/list-zones?businessId=${businessId}&warehouseId=${warehouseId}`, { headers: { Authorization: `Bearer ${idToken}` } });
            if (!res.ok) throw new Error('Failed');
            const data = await res.json();
            setZones((prev) => ({ ...prev, [warehouseId]: data.zones || [] }));
        } catch (error) { console.error(error); }
        finally { setLoadingZones((prev) => { const n = new Set(prev); n.delete(warehouseId); return n; }); }
    };

    const fetchRacks = async (zoneId: string) => {
        setLoadingRacks((prev) => new Set(prev).add(zoneId));
        try {
            const idToken = await user?.getIdToken();
            const res = await fetch(`/api/business/warehouse/list-racks?businessId=${businessId}&zoneId=${zoneId}`, { headers: { Authorization: `Bearer ${idToken}` } });
            if (!res.ok) throw new Error('Failed');
            const data = await res.json();
            setRacks((prev) => ({ ...prev, [zoneId]: data.racks || [] }));
        } catch (error) { console.error(error); }
        finally { setLoadingRacks((prev) => { const n = new Set(prev); n.delete(zoneId); return n; }); }
    };

    const fetchShelves = async (rackId: string) => {
        setLoadingShelves((prev) => new Set(prev).add(rackId));
        try {
            const idToken = await user?.getIdToken();
            const res = await fetch(`/api/business/warehouse/list-shelves?businessId=${businessId}&rackId=${rackId}`, { headers: { Authorization: `Bearer ${idToken}` } });
            if (!res.ok) throw new Error('Failed');
            const data = await res.json();
            setShelves((prev) => ({ ...prev, [rackId]: data.shelves || [] }));
        } catch (error) { console.error(error); }
        finally { setLoadingShelves((prev) => { const n = new Set(prev); n.delete(rackId); return n; }); }
    };

    const fetchPlacements = async (shelfId: string) => {
        setLoadingPlacements((prev) => new Set(prev).add(shelfId));
        try {
            const idToken = await user?.getIdToken();
            const res = await fetch(`/api/business/warehouse/list-placements?businessId=${businessId}&shelfId=${shelfId}`, { headers: { Authorization: `Bearer ${idToken}` } });
            if (!res.ok) throw new Error('Failed');
            const data = await res.json();
            setPlacements((prev) => ({ ...prev, [shelfId]: data.placements || [] }));
        } catch (error) { console.error(error); }
        finally { setLoadingPlacements((prev) => { const n = new Set(prev); n.delete(shelfId); return n; }); }
    };

    // Toggle functions
    const toggleWarehouse = (id: string) => { const expanding = !expandedWarehouses.has(id); setExpandedWarehouses((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; }); if (expanding) fetchZones(id); };
    const toggleZone = (id: string) => { const expanding = !expandedZones.has(id); setExpandedZones((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; }); if (expanding) fetchRacks(id); };
    const toggleRack = (id: string) => { const expanding = !expandedRacks.has(id); setExpandedRacks((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; }); if (expanding) fetchShelves(id); };
    const toggleShelf = (id: string) => { const expanding = !expandedShelves.has(id); setExpandedShelves((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; }); if (expanding) fetchPlacements(id); };

    // Dialog handlers
    const handleAddWarehouse = () => { setEditWarehouse(null); setWarehouseDialogOpen(true); };
    const handleEditWarehouse = (w: Warehouse) => { setEditWarehouse(w); setWarehouseDialogOpen(true); };
    const handleDeleteWarehouse = (w: Warehouse) => { setDeleteTarget({ type: 'warehouse', id: w.id, name: w.name, hasChildren: w.stats.totalZones > 0, childCount: w.stats.totalZones }); setDeleteDialogOpen(true); };

    const handleAddZone = (w: Warehouse) => { setEditZone(null); setZoneParent({ warehouseId: w.id }); setZoneDialogOpen(true); };
    const handleEditZone = (z: Zone) => { setEditZone(z); setZoneParent({ warehouseId: z.warehouseId }); setZoneDialogOpen(true); };
    const handleDeleteZone = (z: Zone) => { setDeleteTarget({ type: 'zone', id: z.id, name: z.name, hasChildren: z.stats.totalRacks > 0, childCount: z.stats.totalRacks }); setDeleteDialogOpen(true); };
    const handleMoveZone = (z: Zone) => {
        setMoveTarget({
            type: 'zone',
            id: z.id,
            name: z.name,
            warehouseId: z.warehouseId,
        });
        setMoveDialogOpen(true);
    };

    const handleAddRack = (z: Zone) => { setEditRack(null); setRackParent({ zoneId: z.id, warehouseId: z.warehouseId }); setRackDialogOpen(true); };
    const handleEditRack = (r: Rack) => { setEditRack(r); setRackParent({ zoneId: r.zoneId, warehouseId: r.warehouseId }); setRackDialogOpen(true); };
    const handleDeleteRack = (r: Rack) => { setDeleteTarget({ type: 'rack', id: r.id, name: r.name, hasChildren: r.stats.totalShelves > 0, childCount: r.stats.totalShelves }); setDeleteDialogOpen(true); };
    const handleMoveRack = (r: Rack) => {
        setMoveTarget({
            type: 'rack',
            id: r.id,
            name: r.name,
            warehouseId: r.warehouseId,
            zoneId: r.zoneId,
        });
        setMoveDialogOpen(true);
    };

    const handleAddShelf = (r: Rack, z: Zone) => { setEditShelf(null); setShelfParent({ rackId: r.id, zoneId: z.id, warehouseId: z.warehouseId }); setShelfDialogOpen(true); };
    const handleEditShelf = (s: Shelf) => { setEditShelf(s); setShelfParent({ rackId: s.rackId, zoneId: s.zoneId, warehouseId: s.warehouseId }); setShelfDialogOpen(true); };
    const handleDeleteShelf = (s: Shelf) => { setDeleteTarget({ type: 'shelf', id: s.id, name: s.name, hasChildren: s.stats.totalProducts > 0, childCount: s.stats.totalProducts }); setDeleteDialogOpen(true); };
    const handleMoveShelf = (s: Shelf) => {
        setMoveTarget({
            type: 'shelf',
            id: s.id,
            name: s.name,
            warehouseId: s.warehouseId,
            zoneId: s.zoneId,
            rackId: s.rackId,
        });
        setMoveDialogOpen(true);
    };

    // Success handlers
    const handleWarehouseSuccess = () => fetchWarehouses();
    const handleZoneSuccess = () => { if (zoneParent) { fetchZones(zoneParent.warehouseId); fetchWarehouses(); } };
    const handleRackSuccess = () => { if (rackParent) { fetchRacks(rackParent.zoneId); fetchZones(rackParent.warehouseId); fetchWarehouses(); } };
    const handleShelfSuccess = () => { if (shelfParent) { fetchShelves(shelfParent.rackId); fetchRacks(shelfParent.zoneId); fetchZones(shelfParent.warehouseId); fetchWarehouses(); } };
    const handleDeleteSuccess = () => {
        fetchWarehouses();
        if (deleteTarget?.type === 'zone') {
            const z = Object.values(zones).flat().find(x => x.id === deleteTarget.id);
            if (z) fetchZones(z.warehouseId);
        } else if (deleteTarget?.type === 'rack') {
            const r = Object.values(racks).flat().find(x => x.id === deleteTarget.id);
            if (r) { fetchRacks(r.zoneId); const z = Object.values(zones).flat().find(x => x.id === r.zoneId); if (z) fetchZones(z.warehouseId); }
        } else if (deleteTarget?.type === 'shelf') {
            const s = Object.values(shelves).flat().find(x => x.id === deleteTarget.id);
            if (s) { fetchShelves(s.rackId); const r = Object.values(racks).flat().find(x => x.id === s.rackId); if (r) { fetchRacks(r.zoneId); const z = Object.values(zones).flat().find(x => x.id === r.zoneId); if (z) fetchZones(z.warehouseId); } }
        }
    };
    const handleMoveSuccess = () => { fetchWarehouses(); setZones({}); setRacks({}); setShelves({}); setPlacements({}); };

    // Filter & totals
    const filteredWarehouses = warehouses.filter((w) =>
        w.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        w.code?.toLowerCase().includes(searchQuery.toLowerCase())
    );
    const totals = warehouses.reduce((acc, w) => ({ warehouses: acc.warehouses + 1, zones: acc.zones + w.stats.totalZones, racks: acc.racks + w.stats.totalRacks, shelves: acc.shelves + w.stats.totalShelves, products: acc.products + w.stats.totalProducts }), { warehouses: 0, zones: 0, racks: 0, shelves: 0, products: 0 });

    return (
        <div className="min-h-full p-6 space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Warehouse Overview</h1>
                    <p className="text-muted-foreground">Manage your warehouse locations and inventory structure</p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={() => setInstantWarehouseDialogOpen(true)}>
                        <FolderTree className="h-4 w-4 mr-2" />
                        Quick Setup
                    </Button>
                    <Button onClick={handleAddWarehouse}>
                        <Plus className="h-4 w-4 mr-2" />
                        Add Warehouse
                    </Button>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                {[
                    { label: 'Warehouses', value: totals.warehouses, icon: WarehouseIcon, color: 'text-blue-600', bg: 'bg-blue-500/10' },
                    { label: 'Zones', value: totals.zones, icon: MapPin, color: 'text-emerald-600', bg: 'bg-emerald-500/10' },
                    { label: 'Racks', value: totals.racks, icon: Grid3X3, color: 'text-amber-600', bg: 'bg-amber-500/10' },
                    { label: 'Shelves', value: totals.shelves, icon: Layers, color: 'text-purple-600', bg: 'bg-purple-500/10' },
                    { label: 'Products', value: totals.products, icon: Package, color: 'text-rose-600', bg: 'bg-rose-500/10' },
                ].map((stat) => (
                    <Card key={stat.label}>
                        <CardContent className="p-4">
                            <div className="flex items-center gap-3">
                                <div className={cn('p-2 rounded-lg', stat.bg)}><stat.icon className={cn('h-5 w-5', stat.color)} /></div>
                                <div><p className="text-2xl font-bold">{stat.value}</p><p className="text-xs text-muted-foreground">{stat.label}</p></div>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Tree View */}
            <Card>
                <CardHeader className="border-b">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-primary/10"><FolderTree className="h-5 w-5 text-primary" /></div>
                            <div><CardTitle>Warehouse Structure</CardTitle><CardDescription>Click to expand, use menu for actions</CardDescription></div>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input placeholder="Search by name or code..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9 w-[200px]" />
                            </div>
                            <Button variant="outline" size="icon" onClick={fetchWarehouses} disabled={isLoading}><RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} /></Button>
                        </div>
                    </div>
                </CardHeader>

                <CardContent className="p-0">
                    {isLoading ? (
                        <div className="p-4 space-y-3">{[1, 2, 3].map((i) => (<div key={i} className="flex items-center gap-3 p-3"><Skeleton className="h-5 w-5 rounded" /><Skeleton className="h-8 w-8 rounded-md" /><Skeleton className="h-4 w-48" /></div>))}</div>
                    ) : filteredWarehouses.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 px-4">
                            <div className="p-4 rounded-full bg-muted mb-4"><PackageOpen className="h-10 w-10 text-muted-foreground" /></div>
                            <h3 className="text-lg font-semibold mb-1">No warehouses found</h3>
                            <p className="text-muted-foreground text-center mb-4">{searchQuery ? 'Try a different search term' : 'Create your first warehouse to get started'}</p>
                            {!searchQuery && <Button onClick={handleAddWarehouse}><Plus className="h-4 w-4 mr-2" />Create Warehouse</Button>}
                        </div>
                    ) : (
                        <div className="py-2">
                            {filteredWarehouses.map((warehouse) => (
                                <TreeNode key={warehouse.id} level={0} icon={WarehouseIcon} iconColor="text-blue-600" bgColor="bg-blue-500/10" label={warehouse.name} code={warehouse.code} stats={[{ label: 'zones', value: warehouse.stats.totalZones }, { label: 'products', value: warehouse.stats.totalProducts }]} isExpanded={expandedWarehouses.has(warehouse.id)} isLoading={loadingZones.has(warehouse.id)} hasChildren={true} onToggle={() => toggleWarehouse(warehouse.id)} onAdd={() => handleAddZone(warehouse)} addLabel="Add Zone" onEdit={() => handleEditWarehouse(warehouse)} onDelete={() => handleDeleteWarehouse(warehouse)}>
                                    {zones[warehouse.id]?.map((zone) => (
                                        <TreeNode key={zone.id} level={1} icon={MapPin} iconColor="text-emerald-600" bgColor="bg-emerald-500/10" label={zone.name} code={zone.code} stats={[{ label: 'racks', value: zone.stats.totalRacks }, { label: 'products', value: zone.stats.totalProducts }]} isExpanded={expandedZones.has(zone.id)} isLoading={loadingRacks.has(zone.id)} hasChildren={true} onToggle={() => toggleZone(zone.id)} onAdd={() => handleAddRack(zone)} addLabel="Add Rack" onEdit={() => handleEditZone(zone)} onMove={() => handleMoveZone(zone)} onDelete={() => handleDeleteZone(zone)}>
                                            {racks[zone.id]?.map((rack) => (
                                                <TreeNode key={rack.id} level={2} icon={Grid3X3} iconColor="text-amber-600" bgColor="bg-amber-500/10" label={rack.name} code={rack.code} stats={[{ label: 'shelves', value: rack.stats.totalShelves }, { label: 'products', value: rack.stats.totalProducts }]} isExpanded={expandedRacks.has(rack.id)} isLoading={loadingShelves.has(rack.id)} hasChildren={true} onToggle={() => toggleRack(rack.id)} onAdd={() => handleAddShelf(rack, zone)} addLabel="Add Shelf" onEdit={() => handleEditRack(rack)} onMove={() => handleMoveRack(rack)} onDelete={() => handleDeleteRack(rack)}>
                                                    {shelves[rack.id]?.map((shelf) => (
                                                        <TreeNode key={shelf.id} level={3} icon={Layers} iconColor="text-purple-600" bgColor="bg-purple-500/10" label={shelf.name} code={shelf.code} stats={[{ label: 'products', value: shelf.stats.totalProducts }]} isExpanded={expandedShelves.has(shelf.id)} isLoading={loadingPlacements.has(shelf.id)} hasChildren={shelf.stats.totalProducts > 0} onToggle={() => toggleShelf(shelf.id)} onEdit={() => handleEditShelf(shelf)} onMove={() => handleMoveShelf(shelf)} onDelete={() => handleDeleteShelf(shelf)}>
                                                            {placements[shelf.id]?.map((p) => <PlacementRow key={p.id} placement={p} level={4} />)}
                                                            {placements[shelf.id]?.length === 0 && <div className="py-3 px-3 text-sm text-muted-foreground italic" style={{ paddingLeft: `${4 * 20 + 12}px` }}>No products</div>}
                                                        </TreeNode>
                                                    ))}
                                                    {shelves[rack.id]?.length === 0 && <div className="py-3 px-3 text-sm text-muted-foreground italic" style={{ paddingLeft: `${3 * 20 + 12}px` }}>No shelves</div>}
                                                </TreeNode>
                                            ))}
                                            {racks[zone.id]?.length === 0 && <div className="py-3 px-3 text-sm text-muted-foreground italic" style={{ paddingLeft: `${2 * 20 + 12}px` }}>No racks</div>}
                                        </TreeNode>
                                    ))}
                                    {zones[warehouse.id]?.length === 0 && <div className="py-3 px-3 text-sm text-muted-foreground italic" style={{ paddingLeft: `${1 * 20 + 12}px` }}>No zones</div>}
                                </TreeNode>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Dialogs */}
            <WarehouseDialog open={warehouseDialogOpen} onOpenChange={setWarehouseDialogOpen} onSuccess={handleWarehouseSuccess} businessId={businessId} editData={editWarehouse} user={user} />
            {zoneParent && <ZoneDialog open={zoneDialogOpen} onOpenChange={setZoneDialogOpen} onSuccess={handleZoneSuccess} businessId={businessId} warehouseId={zoneParent.warehouseId} editData={editZone} user={user} />}
            {rackParent && <RackDialog open={rackDialogOpen} onOpenChange={setRackDialogOpen} onSuccess={handleRackSuccess} businessId={businessId} zoneId={rackParent.zoneId} warehouseId={rackParent.warehouseId} editData={editRack} user={user} />}
            {shelfParent && <ShelfDialog open={shelfDialogOpen} onOpenChange={setShelfDialogOpen} onSuccess={handleShelfSuccess} businessId={businessId} rackId={shelfParent.rackId} zoneId={shelfParent.zoneId} warehouseId={shelfParent.warehouseId} editData={editShelf} user={user} />}
            <DeleteDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen} onSuccess={handleDeleteSuccess} businessId={businessId} target={deleteTarget} user={user} />
            <MoveDialog open={moveDialogOpen} onOpenChange={setMoveDialogOpen} onSuccess={handleMoveSuccess} businessId={businessId} target={moveTarget} user={user} />
            <InstantWarehouseDialog open={instantWarehouseDialogOpen} onOpenChange={setInstantWarehouseDialogOpen} onSuccess={handleWarehouseSuccess} businessId={businessId} user={user} />
        </div>
    );
}