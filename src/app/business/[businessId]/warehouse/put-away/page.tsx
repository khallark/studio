'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { useBusinessContext } from '../../layout';
import { db } from '@/lib/firebase';
import { User } from 'firebase/auth';
import { UPC } from '@/types/warehouse';
import { Order } from '@/types/order';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Package,
    PackageOpen,
    Truck,
    RotateCcw,
    ArrowDownToLine,
    Search,
    RefreshCw,
    Check,
    AlertCircle,
    ChevronDown,
    Store,
    FileText,
    TrendingUp,
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
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

// ============================================================
// TYPES
// ============================================================

interface GroupedUPC extends UPC {
    orderName: string;
    orderStatus: string;
    storeName: string;
}

interface Warehouse {
    id: string;
    name: string;
    code: string;
}

interface Zone {
    id: string;
    name: string;
    code: string;
    warehouseId: string;
}

interface Rack {
    id: string;
    name: string;
    code: string;
    zoneId: string;
    warehouseId: string;
}

interface Shelf {
    id: string;
    name: string;
    code: string;
    rackId: string;
    zoneId: string;
    warehouseId: string;
}

// ============================================================
// HOOKS - DATA FETCHING
// ============================================================

function usePutAwayUPCs(businessId: string | null, user: User | null | undefined) {
    return useQuery({
        queryKey: ['putAwayUPCs', businessId],
        queryFn: async () => {
            if (!businessId) throw new Error('No business ID');

            // Fetch all UPCs client-side from Firestore
            const upcsRef = collection(db, 'users', businessId, 'upcs');
            const snapshot = await getDocs(upcsRef);

            const upcs = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
            })) as UPC[];

            // Filter client-side for putAway status
            return upcs.filter(upc =>
                upc.putAway === 'outbound' ||
                upc.putAway === 'inbound' ||
                upc.putAway === null
            );
        },
        enabled: !!businessId && !!user,
        staleTime: 10 * 1000,
        refetchInterval: 30 * 1000,
    });
}

function useGroupedInboundUPCs(
    upcs: UPC[],
    stores: string[],
    businessId: string | null
) {
    return useQuery({
        queryKey: ['groupedInboundUPCs', upcs.length, businessId, stores.join(',')],
        queryFn: async () => {
            const inboundUPCs = upcs.filter(upc => upc.putAway === 'inbound');

            if (inboundUPCs.length === 0) {
                return { rtoUPCs: [], dtoUPCs: [], unknownUPCs: [] };
            }

            // Group UPCs by their order association
            const rtoUPCs: GroupedUPC[] = [];
            const dtoUPCs: GroupedUPC[] = [];
            const unknownUPCs: GroupedUPC[] = [];

            for (const upc of inboundUPCs) {
                if (!upc.storeId || !upc.orderId) {
                    unknownUPCs.push({
                        ...upc,
                        orderName: 'Unknown',
                        orderStatus: 'No Order',
                        storeName: upc.storeId || 'Unknown',
                    });
                    continue;
                }

                const orderDoc = await getDoc(doc(db, 'accounts', String(upc.storeId), 'orders', String(upc.orderId)));
                const orderData = orderDoc.data() as Order;

                const groupedUPC: GroupedUPC = {
                    ...upc,
                    orderName: String(orderData?.name || 'Unknown'),
                    orderStatus: String(orderData?.customStatus || 'Unknown'),
                    storeName: String(upc.storeId),
                };

                if (!orderDoc.exists() || !orderData) {
                    unknownUPCs.push(groupedUPC);
                } else if (orderData.customStatus === 'RTO Processed' || orderData.customStatus === 'RTO Closed') {
                    rtoUPCs.push(groupedUPC);
                } else if (orderData.customStatus === 'Pending Refunds') {
                    dtoUPCs.push(groupedUPC);
                } else {
                    unknownUPCs.push(groupedUPC);
                }
            }

            return { rtoUPCs, dtoUPCs, unknownUPCs };
        },
        enabled: upcs.length > 0 && stores.length > 0 && !!businessId,
        staleTime: 10 * 1000,
        refetchInterval: 60 * 1000, // Refresh every minute
    });
}

// ============================================================
// HOOKS - MUTATIONS
// ============================================================

function usePutAwayBatch(businessId: string | null, user: User | null | undefined) {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    return useMutation({
        mutationFn: async ({
            upcIds,
            warehouseId,
            zoneId,
            rackId,
            shelfId,
        }: {
            upcIds: string[];
            warehouseId: string;
            zoneId: string;
            rackId: string;
            shelfId: string;
        }) => {
            if (!businessId || !user) throw new Error('Invalid parameters');

            const idToken = await user.getIdToken();
            const response = await fetch('/api/business/warehouse/put-away-batch', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${idToken}`,
                },
                body: JSON.stringify({
                    businessId,
                    upcIds,
                    warehouseId,
                    zoneId,
                    rackId,
                    shelfId,
                }),
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Failed to put away UPCs');
            }

            return response.json();
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ['putAwayUPCs', businessId] });
            toast({
                title: 'Put Away Successful',
                description: `${data.count} UPCs have been placed in the warehouse.`,
            });
        },
        onError: (error: Error) => {
            toast({
                title: 'Put Away Failed',
                description: error.message,
                variant: 'destructive',
            });
        },
    });
}

// ============================================================
// LOCATION SELECTOR DIALOG
// ============================================================

function useWarehouseHierarchy(
    open: boolean,
    businessId: string,
    user: User | null | undefined
) {
    const [warehouses, setWarehouses] = React.useState<Warehouse[]>([]);
    const [zones, setZones] = React.useState<Zone[]>([]);
    const [racks, setRacks] = React.useState<Rack[]>([]);
    const [shelves, setShelves] = React.useState<Shelf[]>([]);

    const [selectedWarehouse, setSelectedWarehouse] = React.useState('');
    const [selectedZone, setSelectedZone] = React.useState('');
    const [selectedRack, setSelectedRack] = React.useState('');
    const [selectedShelf, setSelectedShelf] = React.useState('');

    const [isLoadingWarehouses, setIsLoadingWarehouses] = React.useState(false);
    const [isLoadingZones, setIsLoadingZones] = React.useState(false);
    const [isLoadingRacks, setIsLoadingRacks] = React.useState(false);
    const [isLoadingShelves, setIsLoadingShelves] = React.useState(false);

    // ─────────────────────────────────────────────
    // Fetch Warehouses
    // ─────────────────────────────────────────────
    React.useEffect(() => {
        if (!open) return;

        const fetchWarehouses = async () => {
            setIsLoadingWarehouses(true);

            const idToken = await user?.getIdToken();

            const res = await fetch(
                `/api/business/warehouse/list-warehouses?businessId=${businessId}`,
                { headers: { Authorization: `Bearer ${idToken}` } }
            );

            const data = await res.json();
            setWarehouses(data.warehouses || []);
            setIsLoadingWarehouses(false);
        };

        fetchWarehouses();
    }, [open, businessId, user]);

    // Reset children when warehouse changes
    React.useEffect(() => {
        setSelectedZone('');
        setSelectedRack('');
        setSelectedShelf('');
        setZones([]);
        setRacks([]);
        setShelves([]);
    }, [selectedWarehouse]);

    // ─────────────────────────────────────────────
    // Fetch Zones
    // ─────────────────────────────────────────────
    React.useEffect(() => {
        if (!selectedWarehouse) return;

        const fetchZones = async () => {
            setIsLoadingZones(true);

            const idToken = await user?.getIdToken();

            const res = await fetch(
                `/api/business/warehouse/list-zones?businessId=${businessId}&warehouseId=${selectedWarehouse}`,
                { headers: { Authorization: `Bearer ${idToken}` } }
            );

            const data = await res.json();
            setZones(data.zones || []);
            setIsLoadingZones(false);
        };

        fetchZones();
    }, [selectedWarehouse, businessId, user]);

    // Reset racks & shelves when zone changes
    React.useEffect(() => {
        setSelectedRack('');
        setSelectedShelf('');
        setRacks([]);
        setShelves([]);
    }, [selectedZone]);

    // ─────────────────────────────────────────────
    // Fetch Racks
    // ─────────────────────────────────────────────
    React.useEffect(() => {
        if (!selectedZone) return;

        const fetchRacks = async () => {
            setIsLoadingRacks(true);

            const idToken = await user?.getIdToken();

            const res = await fetch(
                `/api/business/warehouse/list-racks?businessId=${businessId}&zoneId=${selectedZone}`,
                { headers: { Authorization: `Bearer ${idToken}` } }
            );

            const data = await res.json();
            setRacks(data.racks || []);
            setIsLoadingRacks(false);
        };

        fetchRacks();
    }, [selectedZone, businessId, user]);

    // Reset shelves when rack changes
    React.useEffect(() => {
        setSelectedShelf('');
        setShelves([]);
    }, [selectedRack]);

    // ─────────────────────────────────────────────
    // Fetch Shelves
    // ─────────────────────────────────────────────
    React.useEffect(() => {
        if (!selectedRack) return;

        const fetchShelves = async () => {
            setIsLoadingShelves(true);

            const idToken = await user?.getIdToken();

            const res = await fetch(
                `/api/business/warehouse/list-shelves?businessId=${businessId}&rackId=${selectedRack}`,
                { headers: { Authorization: `Bearer ${idToken}` } }
            );

            const data = await res.json();
            setShelves(data.shelves || []);
            setIsLoadingShelves(false);
        };

        fetchShelves();
    }, [selectedRack, businessId, user]);

    return {
        warehouses,
        zones,
        racks,
        shelves,

        selectedWarehouse,
        setSelectedWarehouse,

        selectedZone,
        setSelectedZone,

        selectedRack,
        setSelectedRack,

        selectedShelf,
        setSelectedShelf,

        isLoadingWarehouses,
        isLoadingZones,
        isLoadingRacks,
        isLoadingShelves,
    };
}


function LocationSelectorDialog({
    open,
    onOpenChange,
    onConfirm,
    selectedUPCs,
    businessId,
    user,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onConfirm: (location: {
        warehouseId: string;
        zoneId: string;
        rackId: string;
        shelfId: string;
    }) => void;
    selectedUPCs: GroupedUPC[];
    businessId: string;
    user: User | null | undefined;
}) {

    const {
        warehouses,
        zones,
        racks,
        shelves,

        selectedWarehouse,
        setSelectedWarehouse,

        selectedZone,
        setSelectedZone,

        selectedRack,
        setSelectedRack,

        selectedShelf,
        setSelectedShelf,

        isLoadingWarehouses,
        isLoadingZones,
        isLoadingRacks,
        isLoadingShelves,
    } = useWarehouseHierarchy(open, businessId, user);

    const handleConfirm = () => {
        onConfirm({
            warehouseId: selectedWarehouse,
            zoneId: selectedZone,
            rackId: selectedRack,
            shelfId: selectedShelf,
        });

        onOpenChange(false);
    };

    const canConfirm =
        selectedWarehouse &&
        selectedZone &&
        selectedRack &&
        selectedShelf;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <div className="p-2 rounded-lg bg-primary/10">
                            <ArrowDownToLine className="h-5 w-5 text-primary" />
                        </div>
                        Select Put Away Location
                    </DialogTitle>

                    <DialogDescription>
                        Choose the warehouse location for {selectedUPCs.length} UPC(s)
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">

                    {/* WAREHOUSE */}
                    <div className="space-y-2">
                        <Label>Warehouse</Label>

                        <Select
                            value={selectedWarehouse}
                            onValueChange={setSelectedWarehouse}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="Select warehouse" />
                            </SelectTrigger>

                            <SelectContent>
                                {isLoadingWarehouses ? (
                                    <div className="p-2 text-center text-sm text-muted-foreground">
                                        Loading...
                                    </div>
                                ) : (
                                    warehouses.map(w => (
                                        <SelectItem key={w.id} value={w.id}>
                                            {w.name} ({w.code})
                                        </SelectItem>
                                    ))
                                )}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* ZONE */}
                    <div className="space-y-2">
                        <Label>Zone</Label>

                        <Select
                            value={selectedZone}
                            onValueChange={setSelectedZone}
                            disabled={!selectedWarehouse}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="Select zone" />
                            </SelectTrigger>

                            <SelectContent>
                                {isLoadingZones ? (
                                    <div className="p-2 text-center text-sm text-muted-foreground">
                                        Loading...
                                    </div>
                                ) : (
                                    zones.map(z => (
                                        <SelectItem key={z.id} value={z.id}>
                                            {z.name} ({z.code})
                                        </SelectItem>
                                    ))
                                )}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* RACK */}
                    <div className="space-y-2">
                        <Label>Rack</Label>

                        <Select
                            value={selectedRack}
                            onValueChange={setSelectedRack}
                            disabled={!selectedZone}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="Select rack" />
                            </SelectTrigger>

                            <SelectContent>
                                {isLoadingRacks ? (
                                    <div className="p-2 text-center text-sm text-muted-foreground">
                                        Loading...
                                    </div>
                                ) : (
                                    racks.map(r => (
                                        <SelectItem key={r.id} value={r.id}>
                                            {r.name} ({r.code})
                                        </SelectItem>
                                    ))
                                )}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* SHELF */}
                    <div className="space-y-2">
                        <Label>Shelf</Label>

                        <Select
                            value={selectedShelf}
                            onValueChange={setSelectedShelf}
                            disabled={!selectedRack}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="Select shelf" />
                            </SelectTrigger>

                            <SelectContent>
                                {isLoadingShelves ? (
                                    <div className="p-2 text-center text-sm text-muted-foreground">
                                        Loading...
                                    </div>
                                ) : (
                                    shelves.map(s => (
                                        <SelectItem key={s.id} value={s.id}>
                                            {s.name} ({s.code})
                                        </SelectItem>
                                    ))
                                )}
                            </SelectContent>
                        </Select>
                    </div>

                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>

                    <Button onClick={handleConfirm} disabled={!canConfirm}>
                        <Check className="h-4 w-4 mr-2" />
                        Confirm Location
                    </Button>
                </DialogFooter>

            </DialogContent>
        </Dialog>
    );
}


// ============================================================
// UPC GROUP CARD
// ============================================================

function UPCGroupCard({
    title,
    icon: Icon,
    iconColor,
    bgColor,
    upcs,
    onPutAway,
}: {
    title: string;
    icon: React.ElementType;
    iconColor: string;
    bgColor: string;
    upcs: GroupedUPC[];
    onPutAway: (upcs: GroupedUPC[]) => void;
}) {
    const [isExpanded, setIsExpanded] = useState(false);
    const [selectedUPCs, setSelectedUPCs] = useState<Set<string>>(new Set());
    const [searchQuery, setSearchQuery] = useState('');

    const filteredUPCs = upcs.filter(upc =>
        upc.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        upc.orderName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        upc.productId.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const toggleSelectAll = () => {
        if (selectedUPCs.size === filteredUPCs.length) {
            setSelectedUPCs(new Set());
        } else {
            setSelectedUPCs(new Set(filteredUPCs.map(u => u.id)));
        }
    };

    const toggleSelect = (id: string) => {
        const newSet = new Set(selectedUPCs);
        if (newSet.has(id)) {
            newSet.delete(id);
        } else {
            newSet.add(id);
        }
        setSelectedUPCs(newSet);
    };

    const handlePutAway = () => {
        const selected = upcs.filter(u => selectedUPCs.has(u.id));
        onPutAway(selected);
    };

    return (
        <Card>
            <CardHeader
                className="cursor-pointer hover:bg-muted/40 transition-colors"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className={cn('p-2 rounded-lg', bgColor)}>
                            <Icon className={cn('h-5 w-5', iconColor)} />
                        </div>
                        <div>
                            <CardTitle className="text-lg">{title}</CardTitle>
                            <CardDescription>{upcs.length} UPC(s)</CardDescription>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {selectedUPCs.size > 0 && (
                            <Badge variant="secondary">{selectedUPCs.size} selected</Badge>
                        )}
                        <motion.div
                            animate={{ rotate: isExpanded ? 180 : 0 }}
                            transition={{ duration: 0.2 }}
                        >
                            <ChevronDown className="h-5 w-5 text-muted-foreground" />
                        </motion.div>
                    </div>
                </div>
            </CardHeader>

            <AnimatePresence>
                {isExpanded && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                    >
                        <CardContent className="pt-0 space-y-4">
                            <div className="flex items-center gap-2">
                                <div className="relative flex-1">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        placeholder="Search UPCs..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="pl-9"
                                    />
                                </div>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={toggleSelectAll}
                                >
                                    {selectedUPCs.size === filteredUPCs.length ? 'Deselect All' : 'Select All'}
                                </Button>
                                <Button
                                    size="sm"
                                    onClick={handlePutAway}
                                    disabled={selectedUPCs.size === 0}
                                >
                                    <ArrowDownToLine className="h-4 w-4 mr-2" />
                                    Put Away ({selectedUPCs.size})
                                </Button>
                            </div>

                            <div className="border rounded-lg divide-y max-h-[400px] overflow-auto">
                                {filteredUPCs.length === 0 ? (
                                    <div className="p-8 text-center text-muted-foreground">
                                        No UPCs found
                                    </div>
                                ) : (
                                    filteredUPCs.map((upc) => (
                                        <div
                                            key={upc.id}
                                            className="p-3 hover:bg-muted/40 transition-colors flex items-center gap-3"
                                        >
                                            <Checkbox
                                                checked={selectedUPCs.has(upc.id)}
                                                onCheckedChange={() => toggleSelect(upc.id)}
                                            />
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <code className="text-sm font-mono font-medium">{upc.id}</code>
                                                    <Badge variant="outline" className="text-xs">
                                                        {upc.productId}
                                                    </Badge>
                                                </div>
                                                {upc.orderName && (
                                                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                                        <FileText className="h-3 w-3" />
                                                        <span>{upc.orderName}</span>
                                                        {upc.storeName && (
                                                            <>
                                                                <span>•</span>
                                                                <Store className="h-3 w-3" />
                                                                <span>{upc.storeName}</span>
                                                            </>
                                                        )}
                                                        {upc.orderStatus && (
                                                            <>
                                                                <span>•</span>
                                                                <Badge variant="secondary" className="text-xs h-5">
                                                                    {upc.orderStatus}
                                                                </Badge>
                                                            </>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </CardContent>
                    </motion.div>
                )}
            </AnimatePresence>
        </Card>
    );
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export default function PutAwayPage() {
    const { businessId, user, stores } = useBusinessContext();
    const { toast } = useToast();
    const [locationDialogOpen, setLocationDialogOpen] = useState(false);
    const [selectedUPCsForPutAway, setSelectedUPCsForPutAway] = useState<GroupedUPC[]>([]);

    // Data fetching
    const { data: upcs = [], isLoading } = usePutAwayUPCs(businessId, user);
    const { data: grouped, isLoading: isLoadingGrouped } = useGroupedInboundUPCs(
        upcs,
        stores,
        businessId
    );

    // Mutations
    const putAwayMutation = usePutAwayBatch(businessId, user);

    // Categorize UPCs
    const outboundUPCs = upcs.filter(u => u.putAway === 'outbound');
    const dispatchedUPCs = upcs.filter(u => u.putAway === null);

    // Stats
    const stats = [
        { label: 'Inbound', value: (grouped?.rtoUPCs.length || 0) + (grouped?.dtoUPCs.length || 0) + (grouped?.unknownUPCs.length || 0), icon: ArrowDownToLine, color: 'text-blue-600', bg: 'bg-blue-500/10' },
        { label: 'RTO', value: grouped?.rtoUPCs.length || 0, icon: RotateCcw, color: 'text-amber-600', bg: 'bg-amber-500/10' },
        { label: 'DTO', value: grouped?.dtoUPCs.length || 0, icon: TrendingUp, color: 'text-emerald-600', bg: 'bg-emerald-500/10' },
        { label: 'Outbound', value: outboundUPCs.length, icon: Truck, color: 'text-purple-600', bg: 'bg-purple-500/10' },
        { label: 'Dispatched', value: dispatchedUPCs.length, icon: Package, color: 'text-rose-600', bg: 'bg-rose-500/10' },
    ];

    const handlePutAway = (upcs: GroupedUPC[]) => {
        setSelectedUPCsForPutAway(upcs);
        setLocationDialogOpen(true);
    };

    const handleConfirmLocation = (location: {
        warehouseId: string;
        zoneId: string;
        rackId: string;
        shelfId: string;
    }) => {
        putAwayMutation.mutate({
            upcIds: selectedUPCsForPutAway.map(u => u.id),
            ...location,
        });
    };

    return (
        <div className="min-h-full p-6 space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Put Away Management</h1>
                    <p className="text-muted-foreground">Process and organize returning inventory</p>
                </div>
                <Button variant="outline" onClick={() => window.location.reload()}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Refresh
                </Button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                {stats.map((stat) => (
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

            {/* Tabs */}
            <Tabs defaultValue="inbound" className="space-y-4">
                <TabsList>
                    <TabsTrigger value="inbound">
                        <ArrowDownToLine className="h-4 w-4 mr-2" />
                        Inbound
                    </TabsTrigger>
                    <TabsTrigger value="outbound">
                        <Truck className="h-4 w-4 mr-2" />
                        Outbound
                    </TabsTrigger>
                    <TabsTrigger value="dispatched">
                        <Package className="h-4 w-4 mr-2" />
                        Dispatched
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="inbound" className="space-y-4">
                    {isLoadingGrouped ? (
                        <div className="space-y-4">
                            {[1, 2, 3].map(i => (
                                <Card key={i}>
                                    <CardHeader>
                                        <Skeleton className="h-8 w-48" />
                                    </CardHeader>
                                </Card>
                            ))}
                        </div>
                    ) : (
                        <>
                            {grouped?.rtoUPCs && grouped.rtoUPCs.length > 0 && (
                                <UPCGroupCard
                                    title="RTO Returns"
                                    icon={RotateCcw}
                                    iconColor="text-amber-600"
                                    bgColor="bg-amber-500/10"
                                    upcs={grouped.rtoUPCs}
                                    onPutAway={handlePutAway}
                                />
                            )}

                            {grouped?.dtoUPCs && grouped.dtoUPCs.length > 0 && (
                                <UPCGroupCard
                                    title="DTO Returns"
                                    icon={TrendingUp}
                                    iconColor="text-emerald-600"
                                    bgColor="bg-emerald-500/10"
                                    upcs={grouped.dtoUPCs}
                                    onPutAway={handlePutAway}
                                />
                            )}

                            {grouped?.unknownUPCs && grouped.unknownUPCs.length > 0 && (
                                <UPCGroupCard
                                    title="Unknown Returns"
                                    icon={AlertCircle}
                                    iconColor="text-rose-600"
                                    bgColor="bg-rose-500/10"
                                    upcs={grouped.unknownUPCs}
                                    onPutAway={handlePutAway}
                                />
                            )}

                            {(!grouped || (grouped.rtoUPCs.length === 0 && grouped.dtoUPCs.length === 0 && grouped.unknownUPCs.length === 0)) && (
                                <Card>
                                    <CardContent className="p-12 text-center">
                                        <PackageOpen className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                                        <h3 className="text-lg font-semibold mb-1">No Inbound UPCs</h3>
                                        <p className="text-muted-foreground">
                                            There are no UPCs waiting to be put away
                                        </p>
                                    </CardContent>
                                </Card>
                            )}
                        </>
                    )}
                </TabsContent>

                <TabsContent value="outbound" className="space-y-4">
                    {isLoading ? (
                        <Card>
                            <CardHeader>
                                <Skeleton className="h-8 w-48" />
                            </CardHeader>
                        </Card>
                    ) : outboundUPCs.length > 0 ? (
                        <Card>
                            <CardHeader>
                                <div className="flex items-center gap-3">
                                    <div className="p-2 rounded-lg bg-purple-500/10">
                                        <Truck className="h-5 w-5 text-purple-600" />
                                    </div>
                                    <div>
                                        <CardTitle className="text-lg">Ready for Pickup</CardTitle>
                                        <CardDescription>
                                            {outboundUPCs.length} UPC(s) waiting for courier
                                        </CardDescription>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="border rounded-lg divide-y max-h-[500px] overflow-auto">
                                    {outboundUPCs.map((upc) => (
                                        <div
                                            key={upc.id}
                                            className="p-3 hover:bg-muted/40 transition-colors"
                                        >
                                            <div className="flex items-center gap-2 mb-1">
                                                <Package className="h-4 w-4 text-purple-600" />
                                                <code className="text-sm font-mono font-medium">{upc.id}</code>
                                                <Badge variant="outline" className="text-xs">
                                                    {upc.productId}
                                                </Badge>
                                            </div>
                                            <p className="text-xs text-muted-foreground ml-6">
                                                Updated: {upc.updatedAt.toDate().toLocaleString()}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    ) : (
                        <Card>
                            <CardContent className="p-12 text-center">
                                <Truck className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                                <h3 className="text-lg font-semibold mb-1">No Outbound UPCs</h3>
                                <p className="text-muted-foreground">
                                    No UPCs are currently waiting for pickup
                                </p>
                            </CardContent>
                        </Card>
                    )}
                </TabsContent>

                <TabsContent value="dispatched" className="space-y-4">
                    {isLoading ? (
                        <Card>
                            <CardHeader>
                                <Skeleton className="h-8 w-48" />
                            </CardHeader>
                        </Card>
                    ) : dispatchedUPCs.length > 0 ? (
                        <Card>
                            <CardHeader>
                                <div className="flex items-center gap-3">
                                    <div className="p-2 rounded-lg bg-rose-500/10">
                                        <Package className="h-5 w-5 text-rose-600" />
                                    </div>
                                    <div>
                                        <CardTitle className="text-lg">Out for Delivery</CardTitle>
                                        <CardDescription>
                                            {dispatchedUPCs.length} UPC(s) currently dispatched
                                        </CardDescription>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="border rounded-lg divide-y max-h-[500px] overflow-auto">
                                    {dispatchedUPCs.map((upc) => (
                                        <div
                                            key={upc.id}
                                            className="p-3 hover:bg-muted/40 transition-colors"
                                        >
                                            <div className="flex items-center gap-2 mb-1">
                                                <Package className="h-4 w-4 text-rose-600" />
                                                <code className="text-sm font-mono font-medium">{upc.id}</code>
                                                <Badge variant="outline" className="text-xs">
                                                    {upc.productId}
                                                </Badge>
                                            </div>
                                            <p className="text-xs text-muted-foreground ml-6">
                                                Dispatched: {upc.updatedAt.toDate().toLocaleString()}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    ) : (
                        <Card>
                            <CardContent className="p-12 text-center">
                                <Package className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                                <h3 className="text-lg font-semibold mb-1">No Dispatched UPCs</h3>
                                <p className="text-muted-foreground">
                                    No UPCs are currently out for delivery
                                </p>
                            </CardContent>
                        </Card>
                    )}
                </TabsContent>
            </Tabs>

            {/* Location Selector Dialog */}
            <LocationSelectorDialog
                open={locationDialogOpen}
                onOpenChange={setLocationDialogOpen}
                onConfirm={handleConfirmLocation}
                selectedUPCs={selectedUPCsForPutAway}
                businessId={businessId || ''}
                user={user}
            />
        </div>
    );
}