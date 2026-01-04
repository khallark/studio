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
    ChevronDown,
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
    Building,
    FolderTree,
    Box,
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
    position: number;
    path: string;
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
                {/* Expand/Collapse Icon */}
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

                {/* Icon */}
                <div className={cn('p-1.5 rounded-md', bgColor)}>
                    <Icon className={cn('h-4 w-4', iconColor)} />
                </div>

                {/* Label */}
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

                {/* Stats Badges */}
                {stats && stats.length > 0 && (
                    <div className="hidden sm:flex items-center gap-1.5">
                        {stats.map((stat, index) => (
                            <Badge
                                key={index}
                                variant="secondary"
                                className="text-xs font-normal px-2 py-0.5"
                            >
                                {stat.value} {stat.label}
                            </Badge>
                        ))}
                    </div>
                )}

                {/* Actions Menu */}
                <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                            <MoreHorizontal className="h-4 w-4" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        {onEdit && (
                            <DropdownMenuItem onClick={onEdit}>
                                <Edit className="h-4 w-4 mr-2" />
                                Edit
                            </DropdownMenuItem>
                        )}
                        {onDelete && (
                            <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                    onClick={onDelete}
                                    className="text-destructive focus:text-destructive"
                                >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Delete
                                </DropdownMenuItem>
                            </>
                        )}
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>

            {/* Children */}
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

interface PlacementRowProps {
    placement: PlacementData;
    level: number;
}

function PlacementRow({ placement, level }: PlacementRowProps) {
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
// CREATE WAREHOUSE DIALOG
// ============================================================

interface CreateWarehouseDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess: () => void;
    businessId: string;
}

function CreateWarehouseDialog({
    open,
    onOpenChange,
    onSuccess,
    businessId,
}: CreateWarehouseDialogProps) {
    const [name, setName] = useState('');
    const [address, setAddress] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { toast } = useToast();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) return;

        setIsSubmitting(true);
        try {
            const res = await fetch('/api/business/warehouse/create-warehouse', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ businessId, name, address }),
            });

            if (!res.ok) throw new Error('Failed to create warehouse');

            toast({
                title: 'Warehouse created',
                description: `${name} has been created successfully.`,
            });

            setName('');
            setAddress('');
            onOpenChange(false);
            onSuccess();
        } catch (error) {
            toast({
                title: 'Error',
                description: 'Failed to create warehouse. Please try again.',
                variant: 'destructive',
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <div className="p-2 rounded-lg bg-primary/10">
                            <Warehouse className="h-5 w-5 text-primary" />
                        </div>
                        Create Warehouse
                    </DialogTitle>
                    <DialogDescription>
                        Add a new warehouse to organize your inventory storage.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="name">Warehouse Name</Label>
                        <Input
                            id="name"
                            placeholder="e.g., Main Warehouse"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            required
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="address">Address</Label>
                        <Textarea
                            id="address"
                            placeholder="Enter warehouse address..."
                            value={address}
                            onChange={(e) => setAddress(e.target.value)}
                            rows={3}
                        />
                    </div>

                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                        >
                            Cancel
                        </Button>
                        <Button type="submit" disabled={isSubmitting || !name.trim()}>
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
    const params = useParams();
    const businessId = params.businessId as string;
    const { toast } = useToast();

    // State
    const [warehouses, setWarehouses] = useState<WarehouseData[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [createDialogOpen, setCreateDialogOpen] = useState(false);

    // Expanded state for tree nodes
    const [expandedWarehouses, setExpandedWarehouses] = useState<Set<string>>(new Set());
    const [expandedZones, setExpandedZones] = useState<Set<string>>(new Set());
    const [expandedRacks, setExpandedRacks] = useState<Set<string>>(new Set());
    const [expandedShelves, setExpandedShelves] = useState<Set<string>>(new Set());

    // Loaded data for tree nodes
    const [zones, setZones] = useState<Record<string, ZoneData[]>>({});
    const [racks, setRacks] = useState<Record<string, RackData[]>>({});
    const [shelves, setShelves] = useState<Record<string, ShelfData[]>>({});
    const [placements, setPlacements] = useState<Record<string, PlacementData[]>>({});

    // Loading states
    const [loadingZones, setLoadingZones] = useState<Set<string>>(new Set());
    const [loadingRacks, setLoadingRacks] = useState<Set<string>>(new Set());
    const [loadingShelves, setLoadingShelves] = useState<Set<string>>(new Set());
    const [loadingPlacements, setLoadingPlacements] = useState<Set<string>>(new Set());

    // Fetch warehouses
    const fetchWarehouses = useCallback(async () => {
        setIsLoading(true);
        try {
            const res = await fetch(`/api/business/warehouse/list-warehouses?businessId=${businessId}`);
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || 'Failed to fetch warehouses');
            }
            setWarehouses(data.warehouses || []);
        } catch (error) {
            toast({
                title: 'Error',
                description: 'Failed to load warehouses.',
                variant: 'destructive',
            });
        } finally {
            setIsLoading(false);
        }
    }, [businessId, toast]);

    useEffect(() => {
        fetchWarehouses();
    }, [fetchWarehouses]);

    // Fetch zones for a warehouse
    const fetchZones = async (warehouseId: string) => {
        if (zones[warehouseId]) return;

        setLoadingZones((prev) => new Set(prev).add(warehouseId));
        try {
            const res = await fetch(
                `/api/business/warehouse/list-zones?businessId=${businessId}&warehouseId=${warehouseId}`
            );
            if (!res.ok) throw new Error('Failed to fetch zones');
            const data = await res.json();
            setZones((prev) => ({ ...prev, [warehouseId]: data.zones || [] }));
        } catch (error) {
            console.error('Error fetching zones:', error);
        } finally {
            setLoadingZones((prev) => {
                const next = new Set(prev);
                next.delete(warehouseId);
                return next;
            });
        }
    };

    // Fetch racks for a zone
    const fetchRacks = async (zoneId: string) => {
        if (racks[zoneId]) return;

        setLoadingRacks((prev) => new Set(prev).add(zoneId));
        try {
            const res = await fetch(
                `/api/business/warehouse/list-racks?businessId=${businessId}&zoneId=${zoneId}`
            );
            if (!res.ok) throw new Error('Failed to fetch racks');
            const data = await res.json();
            setRacks((prev) => ({ ...prev, [zoneId]: data.racks || [] }));
        } catch (error) {
            console.error('Error fetching racks:', error);
        } finally {
            setLoadingRacks((prev) => {
                const next = new Set(prev);
                next.delete(zoneId);
                return next;
            });
        }
    };

    // Fetch shelves for a rack
    const fetchShelves = async (rackId: string) => {
        if (shelves[rackId]) return;

        setLoadingShelves((prev) => new Set(prev).add(rackId));
        try {
            const res = await fetch(
                `/api/business/warehouse/list-shelves?businessId=${businessId}&rackId=${rackId}`
            );
            if (!res.ok) throw new Error('Failed to fetch shelves');
            const data = await res.json();
            setShelves((prev) => ({ ...prev, [rackId]: data.shelves || [] }));
        } catch (error) {
            console.error('Error fetching shelves:', error);
        } finally {
            setLoadingShelves((prev) => {
                const next = new Set(prev);
                next.delete(rackId);
                return next;
            });
        }
    };

    // Fetch placements for a shelf
    const fetchPlacements = async (shelfId: string) => {
        if (placements[shelfId]) return;

        setLoadingPlacements((prev) => new Set(prev).add(shelfId));
        try {
            const res = await fetch(
                `/api/business/warehouse/list-placements?businessId=${businessId}&shelfId=${shelfId}`
            );
            if (!res.ok) throw new Error('Failed to fetch placements');
            const data = await res.json();
            setPlacements((prev) => ({ ...prev, [shelfId]: data.placements || [] }));
        } catch (error) {
            console.error('Error fetching placements:', error);
        } finally {
            setLoadingPlacements((prev) => {
                const next = new Set(prev);
                next.delete(shelfId);
                return next;
            });
        }
    };

    // Toggle handlers
    const toggleWarehouse = (warehouseId: string) => {
        const isExpanding = !expandedWarehouses.has(warehouseId);
        setExpandedWarehouses((prev) => {
            const next = new Set(prev);
            if (next.has(warehouseId)) {
                next.delete(warehouseId);
            } else {
                next.add(warehouseId);
            }
            return next;
        });

        if (isExpanding) {
            fetchZones(warehouseId);
        }
    };

    const toggleZone = (zoneId: string) => {
        const isExpanding = !expandedZones.has(zoneId);
        setExpandedZones((prev) => {
            const next = new Set(prev);
            if (next.has(zoneId)) {
                next.delete(zoneId);
            } else {
                next.add(zoneId);
            }
            return next;
        });

        if (isExpanding) {
            fetchRacks(zoneId);
        }
    };

    const toggleRack = (rackId: string) => {
        const isExpanding = !expandedRacks.has(rackId);
        setExpandedRacks((prev) => {
            const next = new Set(prev);
            if (next.has(rackId)) {
                next.delete(rackId);
            } else {
                next.add(rackId);
            }
            return next;
        });

        if (isExpanding) {
            fetchShelves(rackId);
        }
    };

    const toggleShelf = (shelfId: string) => {
        const isExpanding = !expandedShelves.has(shelfId);
        setExpandedShelves((prev) => {
            const next = new Set(prev);
            if (next.has(shelfId)) {
                next.delete(shelfId);
            } else {
                next.add(shelfId);
            }
            return next;
        });

        if (isExpanding) {
            fetchPlacements(shelfId);
        }
    };

    // Filter warehouses based on search
    const filteredWarehouses = warehouses.filter((w) =>
        w.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    // Calculate totals
    const totals = warehouses.reduce(
        (acc, w) => ({
            warehouses: acc.warehouses + 1,
            zones: acc.zones + w.stats.totalZones,
            racks: acc.racks + w.stats.totalRacks,
            shelves: acc.shelves + w.stats.totalShelves,
            products: acc.products + w.stats.totalProducts,
        }),
        { warehouses: 0, zones: 0, racks: 0, shelves: 0, products: 0 }
    );

    return (
        <div className="min-h-full p-6 space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Warehouse Overview</h1>
                    <p className="text-muted-foreground">
                        Manage your warehouse locations and inventory structure
                    </p>
                </div>
                <Button onClick={() => setCreateDialogOpen(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Warehouse
                </Button>
            </div>

            {/* Stats Cards */}
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

            {/* Main Tree View */}
            <Card>
                <CardHeader className="border-b">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-primary/10">
                                <FolderTree className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                                <CardTitle>Warehouse Structure</CardTitle>
                                <CardDescription>
                                    Click on any item to expand and view contents
                                </CardDescription>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Search warehouses..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="pl-9 w-[200px]"
                                />
                            </div>
                            <Button
                                variant="outline"
                                size="icon"
                                onClick={fetchWarehouses}
                                disabled={isLoading}
                            >
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
                                    <div className="flex-1" />
                                    <Skeleton className="h-5 w-20 rounded-full" />
                                </div>
                            ))}
                        </div>
                    ) : filteredWarehouses.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 px-4">
                            <div className="p-4 rounded-full bg-muted mb-4">
                                <PackageOpen className="h-10 w-10 text-muted-foreground" />
                            </div>
                            <h3 className="text-lg font-semibold mb-1">No warehouses found</h3>
                            <p className="text-muted-foreground text-center mb-4">
                                {searchQuery
                                    ? 'Try a different search term'
                                    : 'Create your first warehouse to get started'}
                            </p>
                            {!searchQuery && (
                                <Button onClick={() => setCreateDialogOpen(true)}>
                                    <Plus className="h-4 w-4 mr-2" />
                                    Create Warehouse
                                </Button>
                            )}
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
                                    stats={[
                                        { label: 'zones', value: warehouse.stats.totalZones },
                                        { label: 'products', value: warehouse.stats.totalProducts },
                                    ]}
                                    isExpanded={expandedWarehouses.has(warehouse.id)}
                                    isLoading={loadingZones.has(warehouse.id)}
                                    hasChildren={warehouse.stats.totalZones > 0}
                                    onToggle={() => toggleWarehouse(warehouse.id)}
                                    onEdit={() => console.log('Edit warehouse', warehouse.id)}
                                    onDelete={() => console.log('Delete warehouse', warehouse.id)}
                                >
                                    {/* Zones */}
                                    {zones[warehouse.id]?.map((zone) => (
                                        <TreeNode
                                            key={zone.id}
                                            level={1}
                                            icon={MapPin}
                                            iconColor="text-emerald-600"
                                            bgColor="bg-emerald-500/10"
                                            label={zone.name}
                                            code={zone.code}
                                            stats={[
                                                { label: 'racks', value: zone.stats.totalRacks },
                                                { label: 'products', value: zone.stats.totalProducts },
                                            ]}
                                            isExpanded={expandedZones.has(zone.id)}
                                            isLoading={loadingRacks.has(zone.id)}
                                            hasChildren={zone.stats.totalRacks > 0}
                                            onToggle={() => toggleZone(zone.id)}
                                            onEdit={() => console.log('Edit zone', zone.id)}
                                            onDelete={() => console.log('Delete zone', zone.id)}
                                        >
                                            {/* Racks */}
                                            {racks[zone.id]?.map((rack) => (
                                                <TreeNode
                                                    key={rack.id}
                                                    level={2}
                                                    icon={Grid3X3}
                                                    iconColor="text-amber-600"
                                                    bgColor="bg-amber-500/10"
                                                    label={rack.name}
                                                    code={rack.code}
                                                    stats={[
                                                        { label: 'shelves', value: rack.stats.totalShelves },
                                                        { label: 'products', value: rack.stats.totalProducts },
                                                    ]}
                                                    isExpanded={expandedRacks.has(rack.id)}
                                                    isLoading={loadingShelves.has(rack.id)}
                                                    hasChildren={rack.stats.totalShelves > 0}
                                                    onToggle={() => toggleRack(rack.id)}
                                                    onEdit={() => console.log('Edit rack', rack.id)}
                                                    onDelete={() => console.log('Delete rack', rack.id)}
                                                >
                                                    {/* Shelves */}
                                                    {shelves[rack.id]?.map((shelf) => (
                                                        <TreeNode
                                                            key={shelf.id}
                                                            level={3}
                                                            icon={Layers}
                                                            iconColor="text-purple-600"
                                                            bgColor="bg-purple-500/10"
                                                            label={shelf.name}
                                                            code={shelf.code}
                                                            stats={[
                                                                { label: 'products', value: shelf.stats.totalProducts },
                                                            ]}
                                                            isExpanded={expandedShelves.has(shelf.id)}
                                                            isLoading={loadingPlacements.has(shelf.id)}
                                                            hasChildren={shelf.stats.totalProducts > 0}
                                                            onToggle={() => toggleShelf(shelf.id)}
                                                            onEdit={() => console.log('Edit shelf', shelf.id)}
                                                            onDelete={() => console.log('Delete shelf', shelf.id)}
                                                        >
                                                            {/* Placements/Products */}
                                                            {placements[shelf.id]?.map((placement) => (
                                                                <PlacementRow
                                                                    key={placement.id}
                                                                    placement={placement}
                                                                    level={4}
                                                                />
                                                            ))}
                                                            {placements[shelf.id]?.length === 0 && (
                                                                <div
                                                                    className="py-3 px-3 text-sm text-muted-foreground italic"
                                                                    style={{ paddingLeft: `${4 * 20 + 12}px` }}
                                                                >
                                                                    No products on this shelf
                                                                </div>
                                                            )}
                                                        </TreeNode>
                                                    ))}
                                                    {shelves[rack.id]?.length === 0 && (
                                                        <div
                                                            className="py-3 px-3 text-sm text-muted-foreground italic"
                                                            style={{ paddingLeft: `${3 * 20 + 12}px` }}
                                                        >
                                                            No shelves in this rack
                                                        </div>
                                                    )}
                                                </TreeNode>
                                            ))}
                                            {racks[zone.id]?.length === 0 && (
                                                <div
                                                    className="py-3 px-3 text-sm text-muted-foreground italic"
                                                    style={{ paddingLeft: `${2 * 20 + 12}px` }}
                                                >
                                                    No racks in this zone
                                                </div>
                                            )}
                                        </TreeNode>
                                    ))}
                                    {zones[warehouse.id]?.length === 0 && (
                                        <div
                                            className="py-3 px-3 text-sm text-muted-foreground italic"
                                            style={{ paddingLeft: `${1 * 20 + 12}px` }}
                                        >
                                            No zones in this warehouse
                                        </div>
                                    )}
                                </TreeNode>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Create Warehouse Dialog */}
            <CreateWarehouseDialog
                open={createDialogOpen}
                onOpenChange={setCreateDialogOpen}
                onSuccess={fetchWarehouses}
                businessId={businessId}
            />
        </div>
    );
}