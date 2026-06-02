// /business/[businessId]/warehouse/item-finder/page.tsx

'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import {
    collection,
    doc as firestoreDoc,
    getDoc,
    onSnapshot,
    query,
    where,
    Unsubscribe,
} from 'firebase/firestore';
import {
    Warehouse as WarehouseIcon,
    MapPin,
    Grid3X3,
    Layers,
    Package,
    Search,
    Loader2,
    ChevronRight,
    AlertCircle,
    Box,
    RefreshCw,
} from 'lucide-react';

import { db } from '@/lib/firebase';
import { useBusinessContext } from '../../layout';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import type { UPC, Warehouse, Zone, Rack, Shelf } from '@/types/warehouse';

type EntityMap<T> = Record<string, T>;

type LocatedUpc = UPC & {
    id: string;
    warehouseId: string;
    zoneId: string;
    rackId: string;
    shelfId: string;
};

type TreeData = Record<
    string,
    {
        zones: Record<
            string,
            {
                racks: Record<
                    string,
                    {
                        shelves: Record<
                            string,
                            {
                                upcs: LocatedUpc[];
                            }
                        >;
                    }
                >;
            }
        >;
    }
>;

type ExpandedState = {
    warehouses: Set<string>;
    zones: Set<string>;
    racks: Set<string>;
    shelves: Set<string>;
};

function isLocatedUpc(upc: any): upc is LocatedUpc {
    return Boolean(
        upc &&
        typeof upc.warehouseId === 'string' &&
        upc.warehouseId.trim() &&
        typeof upc.zoneId === 'string' &&
        upc.zoneId.trim() &&
        typeof upc.rackId === 'string' &&
        upc.rackId.trim() &&
        typeof upc.shelfId === 'string' &&
        upc.shelfId.trim()
    );
}

function getEntityName<T extends { name?: string; code?: string }>(
    map: EntityMap<T>,
    id: string,
    fallback: string
) {
    const entity = map[id];

    if (!entity) return fallback;

    return entity.name || entity.code || fallback;
}

function toggleSetValue(prev: Set<string>, value: string) {
    const next = new Set(prev);

    if (next.has(value)) {
        next.delete(value);
    } else {
        next.add(value);
    }

    return next;
}

function timestampToText(value: any) {
    if (!value) return null;

    try {
        if (typeof value.toDate === 'function') {
            return value.toDate().toLocaleString('en-IN');
        }

        if (value instanceof Date) {
            return value.toLocaleString('en-IN');
        }

        return new Date(value).toLocaleString('en-IN');
    } catch {
        return null;
    }
}

interface TreeNodeProps {
    level: number;
    icon: React.ElementType;
    iconClassName: string;
    iconBgClassName: string;
    label: string;
    isExpanded: boolean;
    hasChildren: boolean;
    onToggle: () => void;
    children?: React.ReactNode;
}

function TreeNode({
    level,
    icon: Icon,
    iconClassName,
    iconBgClassName,
    label,
    isExpanded,
    hasChildren,
    onToggle,
    children,
}: TreeNodeProps) {
    return (
        <div className="select-none">
            <div
                className={cn(
                    'group flex items-center gap-2 rounded-lg px-3 py-2 transition-all',
                    hasChildren ? 'cursor-pointer hover:bg-muted/60' : 'cursor-default',
                    isExpanded && 'bg-muted/40'
                )}
                style={{ paddingLeft: `${level * 22 + 12}px` }}
                onClick={() => {
                    if (hasChildren) onToggle();
                }}
            >
                <div className="flex h-5 w-5 items-center justify-center">
                    {hasChildren ? (
                        <motion.div
                            animate={{ rotate: isExpanded ? 90 : 0 }}
                            transition={{ duration: 0.18 }}
                        >
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </motion.div>
                    ) : (
                        <div className="h-4 w-4" />
                    )}
                </div>

                <div className={cn('rounded-md p-1.5', iconBgClassName)}>
                    <Icon className={cn('h-4 w-4', iconClassName)} />
                </div>

                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {label}
                </span>
            </div>

            <AnimatePresence initial={false}>
                {isExpanded && children && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.18 }}
                    >
                        {children}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

function UpcRow({ upc, level }: { upc: LocatedUpc; level: number }) {
    const updatedAt = timestampToText((upc as any).updatedAt);

    return (
        <div
            className="flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-muted/40"
            style={{ paddingLeft: `${level * 22 + 12}px` }}
        >
            <div className="h-5 w-5" />

            <div className="rounded-md bg-blue-500/10 p-1.5">
                <Package className="h-4 w-4 text-blue-600" />
            </div>

            <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-sm font-medium">{upc.id}</p>
                {updatedAt && (
                    <p className="text-xs text-muted-foreground">
                        Last updated: {updatedAt}
                    </p>
                )}
            </div>

            <Badge variant="secondary" className="shrink-0 text-xs">
                {upc.putAway || 'unknown'}
            </Badge>
        </div>
    );
}

export default function ItemFinderPage() {
    const {
        isAuthorized,
        loading: authLoading,
        businessId,
    } = useBusinessContext();

    const [productIdInput, setProductIdInput] = useState('');
    const [activeProductId, setActiveProductId] = useState('');

    const [upcs, setUpcs] = useState<UPC[]>([]);
    const [isListening, setIsListening] = useState(false);
    const [isLoadingUpcs, setIsLoadingUpcs] = useState(false);
    const [isLoadingNames, setIsLoadingNames] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [warehouses, setWarehouses] = useState<EntityMap<Warehouse>>({});
    const [zones, setZones] = useState<EntityMap<Zone>>({});
    const [racks, setRacks] = useState<EntityMap<Rack>>({});
    const [shelves, setShelves] = useState<EntityMap<Shelf>>({});

    const [expanded, setExpanded] = useState<ExpandedState>({
        warehouses: new Set(),
        zones: new Set(),
        racks: new Set(),
        shelves: new Set(),
    });

    const unsubscribeRef = useRef<Unsubscribe | null>(null);

    const cleanupListener = () => {
        if (unsubscribeRef.current) {
            unsubscribeRef.current();
            unsubscribeRef.current = null;
        }

        setIsListening(false);
    };

    const trimmedProductId = productIdInput.trim();

    const locatedUpcs = useMemo(() => {
        return upcs.filter(isLocatedUpc);
    }, [upcs]);

    const unlocatedUpcs = useMemo(() => {
        return upcs.filter((upc: any) => !isLocatedUpc(upc));
    }, [upcs]);

    const treeData = useMemo<TreeData>(() => {
        const tree: TreeData = {};

        for (const upc of locatedUpcs) {
            if (!tree[upc.warehouseId]) {
                tree[upc.warehouseId] = { zones: {} };
            }

            if (!tree[upc.warehouseId].zones[upc.zoneId]) {
                tree[upc.warehouseId].zones[upc.zoneId] = { racks: {} };
            }

            if (!tree[upc.warehouseId].zones[upc.zoneId].racks[upc.rackId]) {
                tree[upc.warehouseId].zones[upc.zoneId].racks[upc.rackId] = {
                    shelves: {},
                };
            }

            if (
                !tree[upc.warehouseId].zones[upc.zoneId].racks[upc.rackId]
                    .shelves[upc.shelfId]
            ) {
                tree[upc.warehouseId].zones[upc.zoneId].racks[
                    upc.rackId
                ].shelves[upc.shelfId] = {
                    upcs: [],
                };
            }

            tree[upc.warehouseId].zones[upc.zoneId].racks[
                upc.rackId
            ].shelves[upc.shelfId].upcs.push(upc);
        }

        return tree;
    }, [locatedUpcs]);

    const resetResultState = () => {
        setUpcs([]);
        setWarehouses({});
        setZones({});
        setRacks({});
        setShelves({});
        setExpanded({
            warehouses: new Set(),
            zones: new Set(),
            racks: new Set(),
            shelves: new Set(),
        });
    };

    const fetchEntityNames = async (currentBusinessId: string, currentUpcs: UPC[]) => {
        const located = currentUpcs.filter(isLocatedUpc);

        const warehouseIds = [...new Set(located.map((upc) => upc.warehouseId))];
        const zoneIds = [...new Set(located.map((upc) => upc.zoneId))];
        const rackIds = [...new Set(located.map((upc) => upc.rackId))];
        const shelfIds = [...new Set(located.map((upc) => upc.shelfId))];

        setIsLoadingNames(true);

        try {
            const fetchDocs = async <T,>(
                collectionName: string,
                ids: string[]
            ): Promise<EntityMap<T>> => {
                const entries = await Promise.all(
                    ids.map(async (id) => {
                        const snap = await getDoc(
                            firestoreDoc(
                                db,
                                'users',
                                currentBusinessId,
                                collectionName,
                                id
                            )
                        );

                        if (!snap.exists()) {
                            return null;
                        }

                        return [id, { id: snap.id, ...snap.data() } as T] as const;
                    })
                );

                return Object.fromEntries(
                    entries.filter((entry): entry is readonly [string, T] => entry !== null)
                );
            };

            const [warehouseMap, zoneMap, rackMap, shelfMap] = await Promise.all([
                fetchDocs<Warehouse>('warehouses', warehouseIds),
                fetchDocs<Zone>('zones', zoneIds),
                fetchDocs<Rack>('racks', rackIds),
                fetchDocs<Shelf>('shelves', shelfIds),
            ]);

            setWarehouses(warehouseMap);
            setZones(zoneMap);
            setRacks(rackMap);
            setShelves(shelfMap);
        } catch (err) {
            console.error('Failed to fetch warehouse entity names:', err);
            setError(
                err instanceof Error
                    ? err.message
                    : 'Failed to fetch warehouse location names.'
            );
        } finally {
            setIsLoadingNames(false);
        }
    };

    const startListener = (productId: string) => {
        if (!businessId || !productId) return;

        cleanupListener();

        setError(null);
        setIsLoadingUpcs(true);
        setIsListening(true);

        const upcsQuery = query(
            collection(db, 'users', businessId, 'upcs'),
            where('productId', '==', productId.toUpperCase()),
            where('putAway', '==', 'none'),
        );

        const unsubscribe = onSnapshot(
            upcsQuery,
            async (snapshot) => {
                const nextUpcs = snapshot.docs.map((snap) => ({
                    id: snap.id,
                    ...snap.data(),
                })) as UPC[];

                setUpcs(nextUpcs);
                setIsLoadingUpcs(false);
                setIsListening(true);

                await fetchEntityNames(businessId, nextUpcs);
            },
            (err) => {
                console.error('UPC listener failed:', err);
                setError(err.message || 'Failed to listen for UPCs.');
                setIsLoadingUpcs(false);
                setIsListening(false);
            }
        );

        unsubscribeRef.current = unsubscribe;
    };

    const handleSearch = (e?: React.FormEvent) => {
        e?.preventDefault();

        if (!businessId) return;

        if (!trimmedProductId) {
            cleanupListener();
            resetResultState();
            setActiveProductId('');
            return;
        }

        setActiveProductId(trimmedProductId);
    };

    useEffect(() => {
        document.title = 'Item Finder - Warehouse';
    }, []);

    useEffect(() => {
        if (!businessId || !activeProductId) {
            return;
        }

        resetResultState();

        if (document.visibilityState === 'visible') {
            startListener(activeProductId);
        }

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'hidden') {
                cleanupListener();
                return;
            }

            if (document.visibilityState === 'visible' && activeProductId) {
                startListener(activeProductId);
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            cleanupListener();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [businessId, activeProductId]);

    useEffect(() => {
        if (!trimmedProductId) {
            cleanupListener();
            resetResultState();
            setActiveProductId('');
            setError(null);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [trimmedProductId]);

    const toggleWarehouse = (warehouseId: string) => {
        setExpanded((prev) => ({
            ...prev,
            warehouses: toggleSetValue(prev.warehouses, warehouseId),
        }));
    };

    const toggleZone = (zoneId: string) => {
        setExpanded((prev) => ({
            ...prev,
            zones: toggleSetValue(prev.zones, zoneId),
        }));
    };

    const toggleRack = (rackId: string) => {
        setExpanded((prev) => ({
            ...prev,
            racks: toggleSetValue(prev.racks, rackId),
        }));
    };

    const toggleShelf = (shelfId: string) => {
        setExpanded((prev) => ({
            ...prev,
            shelves: toggleSetValue(prev.shelves, shelfId),
        }));
    };

    if (authLoading) {
        return (
            <div className="flex h-screen items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    if (!isAuthorized || !businessId) {
        return (
            <div className="flex h-screen flex-col items-center justify-center gap-3">
                <AlertCircle className="h-12 w-12 text-destructive" />
                <h1 className="text-xl font-semibold">Unauthorized</h1>
                <p className="text-sm text-muted-foreground">
                    You do not have access to this business.
                </p>
            </div>
        );
    }

    const hasSearched = Boolean(activeProductId);
    const hasResults = locatedUpcs.length > 0;
    const hasAnyUpcs = upcs.length > 0;

    return (
        <div className="min-h-screen bg-gradient-to-b from-muted/30 to-background p-4 md:p-6">
            <div className="mx-auto flex max-w-6xl flex-col gap-4">
                <div className="flex flex-col gap-1">
                    <h1 className="text-2xl font-bold tracking-tight">Item Finder</h1>
                    <p className="text-sm text-muted-foreground">
                        Search a product ID / SKU to find its UPCs across warehouse locations.
                    </p>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Search className="h-5 w-5" />
                            Find Product UPCs
                        </CardTitle>
                        <CardDescription>
                            Enter the product id stored on UPCs as <code>productId</code>.
                        </CardDescription>
                    </CardHeader>

                    <CardContent>
                        <form
                            onSubmit={handleSearch}
                            className="flex flex-col gap-3 sm:flex-row"
                        >
                            <Input
                                value={productIdInput}
                                onChange={(e) => setProductIdInput(e.target.value)}
                                placeholder="Example: SKU-001"
                                className="font-mono"
                            />

                            <Button
                                type="submit"
                                disabled={!trimmedProductId || isLoadingUpcs}
                                className="sm:w-36"
                            >
                                {isLoadingUpcs ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Searching
                                    </>
                                ) : (
                                    <>
                                        <Search className="mr-2 h-4 w-4" />
                                        Search
                                    </>
                                )}
                            </Button>
                        </form>

                        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            {isListening ? (
                                <Badge variant="secondary" className="gap-1">
                                    <RefreshCw className="h-3 w-3 animate-spin" />
                                    Live
                                </Badge>
                            ) : (
                                <Badge variant="outline">Not listening</Badge>
                            )}

                            {hasSearched && (
                                <span>
                                    Active product:{' '}
                                    <code className="rounded bg-muted px-1 py-0.5">
                                        {activeProductId}
                                    </code>
                                </span>
                            )}
                        </div>
                    </CardContent>
                </Card>

                {error && (
                    <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle>Error</AlertTitle>
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                )}

                {hasSearched && (
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <FolderTreeIcon />
                                Locations
                            </CardTitle>
                            <CardDescription>
                                Expand the warehouse tree to see where the UPCs are placed.
                            </CardDescription>
                        </CardHeader>

                        <CardContent>
                            {(isLoadingUpcs || isLoadingNames) && !hasAnyUpcs ? (
                                <div className="space-y-3">
                                    {[1, 2, 3].map((item) => (
                                        <div key={item} className="flex items-center gap-2">
                                            <Skeleton className="h-5 w-5" />
                                            <Skeleton className="h-8 w-8 rounded-md" />
                                            <Skeleton className="h-4 w-48" />
                                        </div>
                                    ))}
                                </div>
                            ) : !hasAnyUpcs ? (
                                <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center">
                                    <Box className="mb-3 h-10 w-10 text-muted-foreground/60" />
                                    <h3 className="font-semibold">No UPCs found</h3>
                                    <p className="mt-1 max-w-md text-sm text-muted-foreground">
                                        No UPC document currently has this productId.
                                    </p>
                                </div>
                            ) : !hasResults ? (
                                <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center">
                                    <Package className="mb-3 h-10 w-10 text-muted-foreground/60" />
                                    <h3 className="font-semibold">No placed UPCs found</h3>
                                    <p className="mt-1 max-w-md text-sm text-muted-foreground">
                                        UPCs exist for this product, but none have a complete warehouse, zone, rack, and shelf location.
                                    </p>
                                </div>
                            ) : (
                                <div className="overflow-hidden rounded-lg border">
                                    <div className="py-1">
                                        {Object.entries(treeData).map(([warehouseId, warehouseNode]) => {
                                            const zoneEntries = Object.entries(warehouseNode.zones);
                                            const warehouseExpanded =
                                                expanded.warehouses.has(warehouseId);

                                            return (
                                                <TreeNode
                                                    key={warehouseId}
                                                    level={0}
                                                    icon={WarehouseIcon}
                                                    iconClassName="text-blue-600"
                                                    iconBgClassName="bg-blue-500/10"
                                                    label={getEntityName(
                                                        warehouses,
                                                        warehouseId,
                                                        'Unknown warehouse'
                                                    )}
                                                    isExpanded={warehouseExpanded}
                                                    hasChildren={zoneEntries.length > 0}
                                                    onToggle={() => toggleWarehouse(warehouseId)}
                                                >
                                                    {zoneEntries.map(([zoneId, zoneNode]) => {
                                                        const rackEntries = Object.entries(zoneNode.racks);
                                                        const zoneExpanded =
                                                            expanded.zones.has(zoneId);

                                                        return (
                                                            <TreeNode
                                                                key={zoneId}
                                                                level={1}
                                                                icon={MapPin}
                                                                iconClassName="text-emerald-600"
                                                                iconBgClassName="bg-emerald-500/10"
                                                                label={getEntityName(
                                                                    zones,
                                                                    zoneId,
                                                                    'Unknown zone'
                                                                )}
                                                                isExpanded={zoneExpanded}
                                                                hasChildren={rackEntries.length > 0}
                                                                onToggle={() => toggleZone(zoneId)}
                                                            >
                                                                {rackEntries.map(([rackId, rackNode]) => {
                                                                    const shelfEntries = Object.entries(
                                                                        rackNode.shelves
                                                                    );
                                                                    const rackExpanded =
                                                                        expanded.racks.has(rackId);

                                                                    return (
                                                                        <TreeNode
                                                                            key={rackId}
                                                                            level={2}
                                                                            icon={Grid3X3}
                                                                            iconClassName="text-amber-600"
                                                                            iconBgClassName="bg-amber-500/10"
                                                                            label={getEntityName(
                                                                                racks,
                                                                                rackId,
                                                                                'Unknown rack'
                                                                            )}
                                                                            isExpanded={rackExpanded}
                                                                            hasChildren={shelfEntries.length > 0}
                                                                            onToggle={() => toggleRack(rackId)}
                                                                        >
                                                                            {shelfEntries.map(([shelfId, shelfNode]) => {
                                                                                const shelfExpanded =
                                                                                    expanded.shelves.has(shelfId);

                                                                                return (
                                                                                    <TreeNode
                                                                                        key={shelfId}
                                                                                        level={3}
                                                                                        icon={Layers}
                                                                                        iconClassName="text-purple-600"
                                                                                        iconBgClassName="bg-purple-500/10"
                                                                                        label={getEntityName(
                                                                                            shelves,
                                                                                            shelfId,
                                                                                            'Unknown shelf'
                                                                                        )}
                                                                                        isExpanded={shelfExpanded}
                                                                                        hasChildren={shelfNode.upcs.length > 0}
                                                                                        onToggle={() => toggleShelf(shelfId)}
                                                                                    >
                                                                                        {shelfNode.upcs.map((upc) => (
                                                                                            <UpcRow
                                                                                                key={upc.id}
                                                                                                upc={upc}
                                                                                                level={4}
                                                                                            />
                                                                                        ))}
                                                                                    </TreeNode>
                                                                                );
                                                                            })}
                                                                        </TreeNode>
                                                                    );
                                                                })}
                                                            </TreeNode>
                                                        );
                                                    })}
                                                </TreeNode>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {unlocatedUpcs.length > 0 && (
                                <div className="mt-4 rounded-lg border bg-muted/30 p-4">
                                    <div className="flex items-start gap-2">
                                        <AlertCircle className="mt-0.5 h-4 w-4 text-muted-foreground" />
                                        <div>
                                            <h3 className="text-sm font-semibold">
                                                Some UPCs are not placed on shelves
                                            </h3>
                                            <p className="mt-1 text-sm text-muted-foreground">
                                                These UPCs matched the productId but do not have a complete warehouse location, so they are not shown inside the tree.
                                            </p>

                                            <div className="mt-3 flex flex-wrap gap-2">
                                                {unlocatedUpcs.slice(0, 20).map((upc: any) => (
                                                    <Badge
                                                        key={upc.id}
                                                        variant="outline"
                                                        className="font-mono"
                                                    >
                                                        {upc.id}
                                                    </Badge>
                                                ))}

                                                {unlocatedUpcs.length > 20 && (
                                                    <Badge variant="secondary">
                                                        +{unlocatedUpcs.length - 20} more
                                                    </Badge>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                )}
            </div>
        </div>
    );
}

function FolderTreeIcon() {
    return (
        <div className="rounded-md bg-primary/10 p-1.5">
            <Package className="h-4 w-4 text-primary" />
        </div>
    );
}