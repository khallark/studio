// /business/[businessId]/warehouse/page.tsx
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Warehouse,
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

// ============================================================
// TYPES
// ============================================================

interface WarehouseStats {
    totalZones: number;
    totalRacks: number;
    totalShelves: number;
    totalProducts: number;
}

interface WarehouseData {
    id: string;
    name: string;
    address: string;
    stats: WarehouseStats;
    isDeleted: boolean;
}

interface ZoneData {
    id: string;
    name: string;
    code: string;
    description?: string;
    warehouseId: string;
    warehouseName: string;
    stats: {
        totalRacks: number;
        totalShelves: number;
        totalProducts: number;
    };
}

interface RackData {
    id: string;
    name: string;
    code: string;
    zoneId: string;
    zoneName: string;
    warehouseId: string;
    warehouseName: string;
    position: number;
    stats: {
        totalShelves: number;
        totalProducts: number;
    };
}

interface ShelfData {
    id: string;
    name: string;
    code: string;
    rackId: string;
    rackName: string;
    zoneId: string;
    zoneName: string;
    warehouseId: string;
    warehouseName: string;
    position: number;
    path: string;
    capacity?: number;
    stats: {
        totalProducts: number;
        currentOccupancy: number;
    };
    coordinates?: {
        aisle: string;
        bay: number;
        level: number;
    };
}

interface PlacementData {
    id: string;
    productId: string;
    productSKU: string;
    quantity: number;
    shelfId: string;
    locationPath: string;
}

type EntityType = 'warehouse' | 'zone' | 'rack' | 'shelf';

interface DeleteTarget {
    type: EntityType;
    id: string;
    name: string;
    hasChildren: boolean;
    childCount: number;
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
                        {(onAdd || onEdit) && onDelete && <DropdownMenuSeparator />}
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

function PlacementRow({ placement, level }: { placement: PlacementData; level: number }) {
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
                <span className="font-medium text-sm">{placement.productSKU}</span>
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
    editData?: WarehouseData | null;
    user: User | null | undefined;
}

function WarehouseDialog({ open, onOpenChange, onSuccess, businessId, editData, user }: WarehouseDialogProps) {
    const [name, setName] = useState('');
    const [address, setAddress] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { toast } = useToast();
    const isEdit = !!editData;

    useEffect(() => {
        if (editData) {
            setName(editData.name);
            setAddress(editData.address || '');
        } else {
            setName('');
            setAddress('');
        }
    }, [editData, open]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) return;

        setIsSubmitting(true);
        try {
            const endpoint = isEdit ? '/api/business/warehouse/update-warehouse' : '/api/business/warehouse/create-warehouse';
            const idToken = await user?.getIdToken();
            const res = await fetch(endpoint, {
                method: isEdit ? 'PUT' : 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${idToken}`,
                },
                body: JSON.stringify({ businessId, warehouseId: editData?.id, name, address }),
            });
            if (!res.ok) throw new Error('Failed to save warehouse');

            toast({ title: isEdit ? 'Warehouse updated' : 'Warehouse created', description: `${name} has been ${isEdit ? 'updated' : 'created'} successfully.` });
            onOpenChange(false);
            onSuccess();
        } catch (error) {
            toast({ title: 'Error', description: `Failed to ${isEdit ? 'update' : 'create'} warehouse.`, variant: 'destructive' });
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
                            <Warehouse className="h-5 w-5 text-blue-600" />
                        </div>
                        {isEdit ? 'Edit Warehouse' : 'Create Warehouse'}
                    </DialogTitle>
                    <DialogDescription>
                        {isEdit ? 'Update warehouse details.' : 'Add a new warehouse to organize your inventory.'}
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="warehouse-name">Warehouse Name</Label>
                        <Input id="warehouse-name" placeholder="e.g., Main Warehouse" value={name} onChange={(e) => setName(e.target.value)} required />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="warehouse-address">Address</Label>
                        <Textarea id="warehouse-address" placeholder="Enter warehouse address..." value={address} onChange={(e) => setAddress(e.target.value)} rows={3} />
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                        <Button type="submit" disabled={isSubmitting || !name.trim()}>
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
    warehouseName: string;
    editData?: ZoneData | null;
    user: User | null | undefined;
}

function ZoneDialog({ open, onOpenChange, onSuccess, businessId, warehouseId, warehouseName, editData, user }: ZoneDialogProps) {
    const [name, setName] = useState('');
    const [code, setCode] = useState('');
    const [description, setDescription] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
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
    }, [editData, open]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) return;

        setIsSubmitting(true);
        try {
            const endpoint = isEdit ? '/api/business/warehouse/update-zone' : '/api/business/warehouse/create-zone';
            const idToken = user?.getIdToken();
            const res = await fetch(endpoint, {
                method: isEdit ? 'PUT' : 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${idToken}`,
                },
                body: JSON.stringify({ businessId, zoneId: editData?.id, warehouseId, warehouseName, name, code, description }),
            });
            if (!res.ok) throw new Error('Failed to save zone');

            toast({ title: isEdit ? 'Zone updated' : 'Zone created', description: `${name} has been ${isEdit ? 'updated' : 'created'} successfully.` });
            onOpenChange(false);
            onSuccess();
        } catch (error) {
            toast({ title: 'Error', description: `Failed to ${isEdit ? 'update' : 'create'} zone.`, variant: 'destructive' });
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
                        {isEdit ? 'Update zone details.' : `Add a new zone to ${warehouseName}.`}
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="zone-name">Zone Name</Label>
                        <Input id="zone-name" placeholder="e.g., Zone A" value={name} onChange={(e) => setName(e.target.value)} required />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="zone-code">Code</Label>
                        <Input id="zone-code" placeholder="e.g., Z-001" value={code} onChange={(e) => setCode(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="zone-description">Description (Optional)</Label>
                        <Textarea id="zone-description" placeholder="Zone description..." value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                        <Button type="submit" disabled={isSubmitting || !name.trim()}>
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
    zoneName: string;
    warehouseId: string;
    warehouseName: string;
    editData?: RackData | null;
    user: User | null | undefined;
}

function RackDialog({ open, onOpenChange, onSuccess, businessId, zoneId, zoneName, warehouseId, warehouseName, editData, user }: RackDialogProps) {
    const [name, setName] = useState('');
    const [code, setCode] = useState('');
    const [position, setPosition] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
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
    }, [editData, open]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) return;

        setIsSubmitting(true);
        try {
            const endpoint = isEdit ? '/api/business/warehouse/update-rack' : '/api/business/warehouse/create-rack';
            const idToken = await user?.getIdToken();
            const res = await fetch(endpoint, {
                method: isEdit ? 'PUT' : 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${idToken}`,
                },
                body: JSON.stringify({ businessId, rackId: editData?.id, zoneId, zoneName, warehouseId, warehouseName, name, code, position: position ? parseInt(position) : 0 }),
            });
            if (!res.ok) throw new Error('Failed to save rack');

            toast({ title: isEdit ? 'Rack updated' : 'Rack created', description: `${name} has been ${isEdit ? 'updated' : 'created'} successfully.` });
            onOpenChange(false);
            onSuccess();
        } catch (error) {
            toast({ title: 'Error', description: `Failed to ${isEdit ? 'update' : 'create'} rack.`, variant: 'destructive' });
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
                        {isEdit ? 'Update rack details.' : `Add a new rack to ${zoneName}.`}
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="rack-name">Rack Name</Label>
                        <Input id="rack-name" placeholder="e.g., Rack 1" value={name} onChange={(e) => setName(e.target.value)} required />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="rack-code">Code</Label>
                            <Input id="rack-code" placeholder="e.g., R-001" value={code} onChange={(e) => setCode(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="rack-position">Position</Label>
                            <Input id="rack-position" type="number" placeholder="e.g., 1" value={position} onChange={(e) => setPosition(e.target.value)} />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                        <Button type="submit" disabled={isSubmitting || !name.trim()}>
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
    rackName: string;
    zoneId: string;
    zoneName: string;
    warehouseId: string;
    warehouseName: string;
    editData?: ShelfData | null;
    user: User | null | undefined;
}

function ShelfDialog({ open, onOpenChange, onSuccess, businessId, rackId, rackName, zoneId, zoneName, warehouseId, warehouseName, editData, user }: ShelfDialogProps) {
    const [name, setName] = useState('');
    const [code, setCode] = useState('');
    const [position, setPosition] = useState('');
    const [capacity, setCapacity] = useState('');
    const [aisle, setAisle] = useState('');
    const [bay, setBay] = useState('');
    const [level, setLevel] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { toast } = useToast();
    const isEdit = !!editData;

    useEffect(() => {
        if (editData) {
            setName(editData.name);
            setCode(editData.code || '');
            setPosition(editData.position?.toString() || '');
            setCapacity(editData.capacity?.toString() || '');
            setAisle(editData.coordinates?.aisle || '');
            setBay(editData.coordinates?.bay?.toString() || '');
            setLevel(editData.coordinates?.level?.toString() || '');
        } else {
            setName('');
            setCode('');
            setPosition('');
            setCapacity('');
            setAisle('');
            setBay('');
            setLevel('');
        }
    }, [editData, open]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) return;

        setIsSubmitting(true);
        try {
            const endpoint = isEdit ? '/api/business/warehouse/update-shelf' : '/api/business/warehouse/create-shelf';
            const coordinates = aisle || bay || level ? { aisle: aisle || '', bay: bay ? parseInt(bay) : 0, level: level ? parseInt(level) : 0 } : null;
            const idToken = await user?.getIdToken();
            const res = await fetch(endpoint, {
                method: isEdit ? 'PUT' : 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${idToken}`,
                },
                body: JSON.stringify({
                    businessId, shelfId: editData?.id, rackId, rackName, zoneId, zoneName, warehouseId, warehouseName,
                    name, code, position: position ? parseInt(position) : 0, capacity: capacity ? parseInt(capacity) : null, coordinates,
                }),
            });
            if (!res.ok) throw new Error('Failed to save shelf');

            toast({ title: isEdit ? 'Shelf updated' : 'Shelf created', description: `${name} has been ${isEdit ? 'updated' : 'created'} successfully.` });
            onOpenChange(false);
            onSuccess();
        } catch (error) {
            toast({ title: 'Error', description: `Failed to ${isEdit ? 'update' : 'create'} shelf.`, variant: 'destructive' });
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
                        {isEdit ? 'Update shelf details.' : `Add a new shelf to ${rackName}.`}
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="shelf-name">Shelf Name</Label>
                        <Input id="shelf-name" placeholder="e.g., Shelf 1" value={name} onChange={(e) => setName(e.target.value)} required />
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="shelf-code">Code</Label>
                            <Input id="shelf-code" placeholder="S-001" value={code} onChange={(e) => setCode(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="shelf-position">Position</Label>
                            <Input id="shelf-position" type="number" placeholder="1" value={position} onChange={(e) => setPosition(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="shelf-capacity">Capacity</Label>
                            <Input id="shelf-capacity" type="number" placeholder="100" value={capacity} onChange={(e) => setCapacity(e.target.value)} />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label>Coordinates (Optional)</Label>
                        <div className="grid grid-cols-3 gap-4">
                            <Input placeholder="Aisle (A)" value={aisle} onChange={(e) => setAisle(e.target.value)} />
                            <Input type="number" placeholder="Bay (1)" value={bay} onChange={(e) => setBay(e.target.value)} />
                            <Input type="number" placeholder="Level (1)" value={level} onChange={(e) => setLevel(e.target.value)} />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                        <Button type="submit" disabled={isSubmitting || !name.trim()}>
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
    user: User | null | undefined
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
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${idToken}`,
                },
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
// MAIN PAGE COMPONENT
// ============================================================

export default function WarehousePage() {
    const { businessId, user } = useBusinessContext();
    const { toast } = useToast();

    // Data state
    const [warehouses, setWarehouses] = useState<WarehouseData[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');

    // Expanded state
    const [expandedWarehouses, setExpandedWarehouses] = useState<Set<string>>(new Set());
    const [expandedZones, setExpandedZones] = useState<Set<string>>(new Set());
    const [expandedRacks, setExpandedRacks] = useState<Set<string>>(new Set());
    const [expandedShelves, setExpandedShelves] = useState<Set<string>>(new Set());

    // Loaded data
    const [zones, setZones] = useState<Record<string, ZoneData[]>>({});
    const [racks, setRacks] = useState<Record<string, RackData[]>>({});
    const [shelves, setShelves] = useState<Record<string, ShelfData[]>>({});
    const [placements, setPlacements] = useState<Record<string, PlacementData[]>>({});

    // Loading states
    const [loadingZones, setLoadingZones] = useState<Set<string>>(new Set());
    const [loadingRacks, setLoadingRacks] = useState<Set<string>>(new Set());
    const [loadingShelves, setLoadingShelves] = useState<Set<string>>(new Set());
    const [loadingPlacements, setLoadingPlacements] = useState<Set<string>>(new Set());

    // Dialog states
    const [warehouseDialogOpen, setWarehouseDialogOpen] = useState(false);
    const [editWarehouse, setEditWarehouse] = useState<WarehouseData | null>(null);

    const [zoneDialogOpen, setZoneDialogOpen] = useState(false);
    const [editZone, setEditZone] = useState<ZoneData | null>(null);
    const [zoneParent, setZoneParent] = useState<{ warehouseId: string; warehouseName: string } | null>(null);

    const [rackDialogOpen, setRackDialogOpen] = useState(false);
    const [editRack, setEditRack] = useState<RackData | null>(null);
    const [rackParent, setRackParent] = useState<{ zoneId: string; zoneName: string; warehouseId: string; warehouseName: string } | null>(null);

    const [shelfDialogOpen, setShelfDialogOpen] = useState(false);
    const [editShelf, setEditShelf] = useState<ShelfData | null>(null);
    const [shelfParent, setShelfParent] = useState<{ rackId: string; rackName: string; zoneId: string; zoneName: string; warehouseId: string; warehouseName: string } | null>(null);

    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);

    // Fetch functions
    const fetchWarehouses = useCallback(async () => {
        setIsLoading(true);
        try {
            const idToken = await user?.getIdToken();
            const res = await fetch(`/api/business/warehouse/list-warehouses?businessId=${businessId}`, {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${idToken}`,
                },
            });
            if (!res.ok) throw new Error('Failed to fetch warehouses');
            const data = await res.json();
            setWarehouses(data.warehouses || []);
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to load warehouses.', variant: 'destructive' });
        } finally {
            setIsLoading(false);
        }
    }, [businessId, toast]);

    useEffect(() => { fetchWarehouses(); }, [fetchWarehouses]);

    const fetchZones = async (warehouseId: string, force = false) => {
        if (zones[warehouseId] && !force) return;
        setLoadingZones((prev) => new Set(prev).add(warehouseId));
        try {
            const idToken = await user?.getIdToken();
            const res = await fetch(`/api/business/warehouse/list-zones?businessId=${businessId}&warehouseId=${warehouseId}`, {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${idToken}`,
                }
            });
            if (!res.ok) throw new Error('Failed');
            const data = await res.json();
            setZones((prev) => ({ ...prev, [warehouseId]: data.zones || [] }));
        } catch (error) { console.error(error); }
        finally { setLoadingZones((prev) => { const n = new Set(prev); n.delete(warehouseId); return n; }); }
    };

    const fetchRacks = async (zoneId: string, force = false) => {
        if (racks[zoneId] && !force) return;
        setLoadingRacks((prev) => new Set(prev).add(zoneId));
        try {
            const idToken = await user?.getIdToken();
            const res = await fetch(`/api/business/warehouse/list-racks?businessId=${businessId}&zoneId=${zoneId}`, {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${idToken}`,
                }
            });
            if (!res.ok) throw new Error('Failed');
            const data = await res.json();
            setRacks((prev) => ({ ...prev, [zoneId]: data.racks || [] }));
        } catch (error) { console.error(error); }
        finally { setLoadingRacks((prev) => { const n = new Set(prev); n.delete(zoneId); return n; }); }
    };

    const fetchShelves = async (rackId: string, force = false) => {
        if (shelves[rackId] && !force) return;
        setLoadingShelves((prev) => new Set(prev).add(rackId));
        try {
            const idToken = await user?.getIdToken();
            const res = await fetch(`/api/business/warehouse/list-shelves?businessId=${businessId}&rackId=${rackId}`, {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${idToken}`,
                }
            });
            if (!res.ok) throw new Error('Failed');
            const data = await res.json();
            setShelves((prev) => ({ ...prev, [rackId]: data.shelves || [] }));
        } catch (error) { console.error(error); }
        finally { setLoadingShelves((prev) => { const n = new Set(prev); n.delete(rackId); return n; }); }
    };

    const fetchPlacements = async (shelfId: string, force = false) => {
        if (placements[shelfId] && !force) return;
        setLoadingPlacements((prev) => new Set(prev).add(shelfId));
        try {
            const idToken = await user?.getIdToken();
            const res = await fetch(`/api/business/warehouse/list-placements?businessId=${businessId}&shelfId=${shelfId}`, {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${idToken}`,
                }
            });
            if (!res.ok) throw new Error('Failed');
            const data = await res.json();
            setPlacements((prev) => ({ ...prev, [shelfId]: data.placements || [] }));
        } catch (error) { console.error(error); }
        finally { setLoadingPlacements((prev) => { const n = new Set(prev); n.delete(shelfId); return n; }); }
    };

    // Toggle functions
    const toggleWarehouse = (id: string) => {
        const expanding = !expandedWarehouses.has(id);
        setExpandedWarehouses((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
        if (expanding) fetchZones(id);
    };

    const toggleZone = (id: string) => {
        const expanding = !expandedZones.has(id);
        setExpandedZones((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
        if (expanding) fetchRacks(id);
    };

    const toggleRack = (id: string) => {
        const expanding = !expandedRacks.has(id);
        setExpandedRacks((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
        if (expanding) fetchShelves(id);
    };

    const toggleShelf = (id: string) => {
        const expanding = !expandedShelves.has(id);
        setExpandedShelves((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
        if (expanding) fetchPlacements(id);
    };

    // Dialog handlers
    const handleAddWarehouse = () => { setEditWarehouse(null); setWarehouseDialogOpen(true); };
    const handleEditWarehouse = (w: WarehouseData) => { setEditWarehouse(w); setWarehouseDialogOpen(true); };
    const handleDeleteWarehouse = (w: WarehouseData) => { setDeleteTarget({ type: 'warehouse', id: w.id, name: w.name, hasChildren: w.stats.totalZones > 0, childCount: w.stats.totalZones }); setDeleteDialogOpen(true); };

    const handleAddZone = (w: WarehouseData) => { setEditZone(null); setZoneParent({ warehouseId: w.id, warehouseName: w.name }); setZoneDialogOpen(true); };
    const handleEditZone = (z: ZoneData) => { setEditZone(z); setZoneParent({ warehouseId: z.warehouseId, warehouseName: z.warehouseName }); setZoneDialogOpen(true); };
    const handleDeleteZone = (z: ZoneData) => { setDeleteTarget({ type: 'zone', id: z.id, name: z.name, hasChildren: z.stats.totalRacks > 0, childCount: z.stats.totalRacks }); setDeleteDialogOpen(true); };

    const handleAddRack = (z: ZoneData) => { setEditRack(null); setRackParent({ zoneId: z.id, zoneName: z.name, warehouseId: z.warehouseId, warehouseName: z.warehouseName }); setRackDialogOpen(true); };
    const handleEditRack = (r: RackData) => { setEditRack(r); setRackParent({ zoneId: r.zoneId, zoneName: r.zoneName, warehouseId: r.warehouseId, warehouseName: r.warehouseName }); setRackDialogOpen(true); };
    const handleDeleteRack = (r: RackData) => { setDeleteTarget({ type: 'rack', id: r.id, name: r.name, hasChildren: r.stats.totalShelves > 0, childCount: r.stats.totalShelves }); setDeleteDialogOpen(true); };

    const handleAddShelf = (r: RackData, z: ZoneData) => { setEditShelf(null); setShelfParent({ rackId: r.id, rackName: r.name, zoneId: z.id, zoneName: z.name, warehouseId: z.warehouseId, warehouseName: z.warehouseName }); setShelfDialogOpen(true); };
    const handleEditShelf = (s: ShelfData) => { setEditShelf(s); setShelfParent({ rackId: s.rackId, rackName: s.rackName, zoneId: s.zoneId, zoneName: s.zoneName, warehouseId: s.warehouseId, warehouseName: s.warehouseName }); setShelfDialogOpen(true); };
    const handleDeleteShelf = (s: ShelfData) => { setDeleteTarget({ type: 'shelf', id: s.id, name: s.name, hasChildren: s.stats.totalProducts > 0, childCount: s.stats.totalProducts }); setDeleteDialogOpen(true); };

    // Success handlers
    const handleWarehouseSuccess = () => fetchWarehouses();
    const handleZoneSuccess = () => { if (zoneParent) { fetchZones(zoneParent.warehouseId, true); fetchWarehouses(); } };
    const handleRackSuccess = () => { if (rackParent) { fetchRacks(rackParent.zoneId, true); fetchZones(rackParent.warehouseId, true); fetchWarehouses(); } };
    const handleShelfSuccess = () => { if (shelfParent) { fetchShelves(shelfParent.rackId, true); fetchRacks(shelfParent.zoneId, true); fetchZones(shelfParent.warehouseId, true); fetchWarehouses(); } };
    const handleDeleteSuccess = () => {
        fetchWarehouses();
        if (deleteTarget?.type === 'zone') {
            const z = Object.values(zones).flat().find(x => x.id === deleteTarget.id);
            if (z) fetchZones(z.warehouseId, true);
        } else if (deleteTarget?.type === 'rack') {
            const r = Object.values(racks).flat().find(x => x.id === deleteTarget.id);
            if (r) { fetchRacks(r.zoneId, true); const z = Object.values(zones).flat().find(x => x.id === r.zoneId); if (z) fetchZones(z.warehouseId, true); }
        } else if (deleteTarget?.type === 'shelf') {
            const s = Object.values(shelves).flat().find(x => x.id === deleteTarget.id);
            if (s) { fetchShelves(s.rackId, true); const r = Object.values(racks).flat().find(x => x.id === s.rackId); if (r) { fetchRacks(r.zoneId, true); const z = Object.values(zones).flat().find(x => x.id === r.zoneId); if (z) fetchZones(z.warehouseId, true); } }
        }
    };

    // Filter & totals
    const filteredWarehouses = warehouses.filter((w) => w.name.toLowerCase().includes(searchQuery.toLowerCase()));
    const totals = warehouses.reduce((acc, w) => ({ warehouses: acc.warehouses + 1, zones: acc.zones + w.stats.totalZones, racks: acc.racks + w.stats.totalRacks, shelves: acc.shelves + w.stats.totalShelves, products: acc.products + w.stats.totalProducts }), { warehouses: 0, zones: 0, racks: 0, shelves: 0, products: 0 });

    return (
        <div className="min-h-full p-6 space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Warehouse Overview</h1>
                    <p className="text-muted-foreground">Manage your warehouse locations and inventory structure</p>
                </div>
                <Button onClick={handleAddWarehouse}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Warehouse
                </Button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                {[
                    { label: 'Warehouses', value: totals.warehouses, icon: Warehouse, color: 'text-blue-600', bg: 'bg-blue-500/10' },
                    { label: 'Zones', value: totals.zones, icon: MapPin, color: 'text-emerald-600', bg: 'bg-emerald-500/10' },
                    { label: 'Racks', value: totals.racks, icon: Grid3X3, color: 'text-amber-600', bg: 'bg-amber-500/10' },
                    { label: 'Shelves', value: totals.shelves, icon: Layers, color: 'text-purple-600', bg: 'bg-purple-500/10' },
                    { label: 'Products', value: totals.products, icon: Package, color: 'text-rose-600', bg: 'bg-rose-500/10' },
                ].map((stat) => (
                    <Card key={stat.label}>
                        <CardContent className="p-4">
                            <div className="flex items-center gap-3">
                                <div className={cn('p-2 rounded-lg', stat.bg)}>
                                    <stat.icon className={cn('h-5 w-5', stat.color)} />
                                </div>
                                <div>
                                    <p className="text-2xl font-bold">{stat.value}</p>
                                    <p className="text-xs text-muted-foreground">{stat.label}</p>
                                </div>
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
                            <div className="p-2 rounded-lg bg-primary/10">
                                <FolderTree className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                                <CardTitle>Warehouse Structure</CardTitle>
                                <CardDescription>Click to expand, use menu for actions</CardDescription>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input placeholder="Search warehouses..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9 w-[200px]" />
                            </div>
                            <Button variant="outline" size="icon" onClick={fetchWarehouses} disabled={isLoading}>
                                <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
                            </Button>
                        </div>
                    </div>
                </CardHeader>

                <CardContent className="p-0">
                    {isLoading ? (
                        <div className="p-4 space-y-3">
                            {[1, 2, 3].map((i) => (
                                <div key={i} className="flex items-center gap-3 p-3">
                                    <Skeleton className="h-5 w-5 rounded" />
                                    <Skeleton className="h-8 w-8 rounded-md" />
                                    <Skeleton className="h-4 w-48" />
                                </div>
                            ))}
                        </div>
                    ) : filteredWarehouses.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 px-4">
                            <div className="p-4 rounded-full bg-muted mb-4">
                                <PackageOpen className="h-10 w-10 text-muted-foreground" />
                            </div>
                            <h3 className="text-lg font-semibold mb-1">No warehouses found</h3>
                            <p className="text-muted-foreground text-center mb-4">{searchQuery ? 'Try a different search term' : 'Create your first warehouse to get started'}</p>
                            {!searchQuery && <Button onClick={handleAddWarehouse}><Plus className="h-4 w-4 mr-2" />Create Warehouse</Button>}
                        </div>
                    ) : (
                        <div className="py-2">
                            {filteredWarehouses.map((warehouse) => (
                                <TreeNode
                                    key={warehouse.id}
                                    level={0}
                                    icon={Warehouse}
                                    iconColor="text-blue-600"
                                    bgColor="bg-blue-500/10"
                                    label={warehouse.name}
                                    stats={[{ label: 'zones', value: warehouse.stats.totalZones }, { label: 'products', value: warehouse.stats.totalProducts }]}
                                    isExpanded={expandedWarehouses.has(warehouse.id)}
                                    isLoading={loadingZones.has(warehouse.id)}
                                    hasChildren={true}
                                    onToggle={() => toggleWarehouse(warehouse.id)}
                                    onAdd={() => handleAddZone(warehouse)}
                                    addLabel="Add Zone"
                                    onEdit={() => handleEditWarehouse(warehouse)}
                                    onDelete={() => handleDeleteWarehouse(warehouse)}
                                >
                                    {zones[warehouse.id]?.map((zone) => (
                                        <TreeNode
                                            key={zone.id}
                                            level={1}
                                            icon={MapPin}
                                            iconColor="text-emerald-600"
                                            bgColor="bg-emerald-500/10"
                                            label={zone.name}
                                            code={zone.code}
                                            stats={[{ label: 'racks', value: zone.stats.totalRacks }, { label: 'products', value: zone.stats.totalProducts }]}
                                            isExpanded={expandedZones.has(zone.id)}
                                            isLoading={loadingRacks.has(zone.id)}
                                            hasChildren={true}
                                            onToggle={() => toggleZone(zone.id)}
                                            onAdd={() => handleAddRack(zone)}
                                            addLabel="Add Rack"
                                            onEdit={() => handleEditZone(zone)}
                                            onDelete={() => handleDeleteZone(zone)}
                                        >
                                            {racks[zone.id]?.map((rack) => (
                                                <TreeNode
                                                    key={rack.id}
                                                    level={2}
                                                    icon={Grid3X3}
                                                    iconColor="text-amber-600"
                                                    bgColor="bg-amber-500/10"
                                                    label={rack.name}
                                                    code={rack.code}
                                                    stats={[{ label: 'shelves', value: rack.stats.totalShelves }, { label: 'products', value: rack.stats.totalProducts }]}
                                                    isExpanded={expandedRacks.has(rack.id)}
                                                    isLoading={loadingShelves.has(rack.id)}
                                                    hasChildren={true}
                                                    onToggle={() => toggleRack(rack.id)}
                                                    onAdd={() => handleAddShelf(rack, zone)}
                                                    addLabel="Add Shelf"
                                                    onEdit={() => handleEditRack(rack)}
                                                    onDelete={() => handleDeleteRack(rack)}
                                                >
                                                    {shelves[rack.id]?.map((shelf) => (
                                                        <TreeNode
                                                            key={shelf.id}
                                                            level={3}
                                                            icon={Layers}
                                                            iconColor="text-purple-600"
                                                            bgColor="bg-purple-500/10"
                                                            label={shelf.name}
                                                            code={shelf.code}
                                                            stats={[{ label: 'products', value: shelf.stats.totalProducts }]}
                                                            isExpanded={expandedShelves.has(shelf.id)}
                                                            isLoading={loadingPlacements.has(shelf.id)}
                                                            hasChildren={shelf.stats.totalProducts > 0}
                                                            onToggle={() => toggleShelf(shelf.id)}
                                                            onEdit={() => handleEditShelf(shelf)}
                                                            onDelete={() => handleDeleteShelf(shelf)}
                                                        >
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
            {zoneParent && <ZoneDialog open={zoneDialogOpen} onOpenChange={setZoneDialogOpen} onSuccess={handleZoneSuccess} businessId={businessId} warehouseId={zoneParent.warehouseId} warehouseName={zoneParent.warehouseName} editData={editZone} user={user} />}
            {rackParent && <RackDialog open={rackDialogOpen} onOpenChange={setRackDialogOpen} onSuccess={handleRackSuccess} businessId={businessId} zoneId={rackParent.zoneId} zoneName={rackParent.zoneName} warehouseId={rackParent.warehouseId} warehouseName={rackParent.warehouseName} editData={editRack} user={user} />}
            {shelfParent && <ShelfDialog open={shelfDialogOpen} onOpenChange={setShelfDialogOpen} onSuccess={handleShelfSuccess} businessId={businessId} rackId={shelfParent.rackId} rackName={shelfParent.rackName} zoneId={shelfParent.zoneId} zoneName={shelfParent.zoneName} warehouseId={shelfParent.warehouseId} warehouseName={shelfParent.warehouseName} editData={editShelf} user={user} />}
            <DeleteDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen} onSuccess={handleDeleteSuccess} businessId={businessId} target={deleteTarget} user={user} />
        </div>
    );
}