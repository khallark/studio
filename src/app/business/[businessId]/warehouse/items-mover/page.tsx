// /business/[businessId]/warehouse/items-mover/page.tsx

'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import {
    collection,
    doc as firestoreDoc,
    getDoc,
    getDocs,
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
    ArrowRight,
    CheckCircle2,
    Truck,
    X,
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
import { Checkbox } from '@/components/ui/checkbox';
import type { UPC, Warehouse, Zone, Rack, Shelf } from '@/types/warehouse';

// ──────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────

type EntityMap<T> = Record<string, T>;

type LocatedUpc = UPC & {
    id: string;
    warehouseId: string;
    zoneId: string;
    rackId: string;
    shelfId: string;
};

type UpcTree = Record<
    string, // warehouseId
    {
        zones: Record<
            string, // zoneId
            {
                racks: Record<
                    string, // rackId
                    {
                        shelves: Record<
                            string, // shelfId
                            { upcs: LocatedUpc[] }
                        >;
                    }
                >;
            }
        >;
    }
>;

// Destination tree is built from location entities, NOT from UPCs.
type LocationTree = Record<
    string, // warehouseId
    {
        zones: Record<
            string, // zoneId
            {
                racks: Record<
                    string, // rackId
                    { shelves: Shelf[] }
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

type MoveSummary = {
    moveId: string;
    moved: number;
    skipped: number;
    failed: { upcId: string; reason: string }[];
};

// ──────────────────────────────────────────────────────────────────────────
// Helpers (shared with Item Finder pattern)
// ──────────────────────────────────────────────────────────────────────────

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
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
}

function timestampToText(value: any) {
    if (!value) return null;
    try {
        if (typeof value.toDate === 'function') return value.toDate().toLocaleString('en-IN');
        if (value instanceof Date) return value.toLocaleString('en-IN');
        return new Date(value).toLocaleString('en-IN');
    } catch {
        return null;
    }
}

const emptyExpanded = (): ExpandedState => ({
    warehouses: new Set(),
    zones: new Set(),
    racks: new Set(),
    shelves: new Set(),
});

// ──────────────────────────────────────────────────────────────────────────
// Generic expandable tree node (warehouse / zone / rack levels)
// `accessory` renders on the right (e.g. a select-all checkbox) and does NOT
// trigger expand/collapse.
// ──────────────────────────────────────────────────────────────────────────

interface TreeNodeProps {
    level: number;
    icon: React.ElementType;
    iconClassName: string;
    iconBgClassName: string;
    label: string;
    isExpanded: boolean;
    hasChildren: boolean;
    onToggle: () => void;
    accessory?: React.ReactNode;
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
    accessory,
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

                <span className="min-w-0 flex-1 truncate text-sm font-medium">{label}</span>

                {accessory && (
                    <div
                        className="shrink-0"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {accessory}
                    </div>
                )}
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

// ──────────────────────────────────────────────────────────────────────────
// Source: a selectable UPC row (checkbox)
// ──────────────────────────────────────────────────────────────────────────

function SourceUpcRow({
    upc,
    level,
    checked,
    onToggle,
    isOnDestShelf,
}: {
    upc: LocatedUpc;
    level: number;
    checked: boolean;
    onToggle: () => void;
    isOnDestShelf: boolean;
}) {
    const updatedAt = timestampToText((upc as any).updatedAt);

    return (
        <div
            className={cn(
                'flex items-center gap-2 rounded-lg px-3 py-2 transition-colors hover:bg-muted/40',
                checked && 'bg-primary/5'
            )}
            style={{ paddingLeft: `${level * 22 + 12}px` }}
        >
            <div className="flex h-5 w-5 items-center justify-center">
                <Checkbox
                    checked={checked}
                    onCheckedChange={onToggle}
                    disabled={isOnDestShelf}
                    aria-label={`Select UPC ${upc.id}`}
                />
            </div>

            <div className="rounded-md bg-blue-500/10 p-1.5">
                <Package className="h-4 w-4 text-blue-600" />
            </div>

            <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-sm font-medium">{upc.id}</p>
                {updatedAt && (
                    <p className="text-xs text-muted-foreground">Last updated: {updatedAt}</p>
                )}
            </div>

            {isOnDestShelf ? (
                <Badge variant="outline" className="shrink-0 text-xs">
                    already here
                </Badge>
            ) : (
                <Badge variant="secondary" className="shrink-0 text-xs">
                    {upc.putAway || 'unknown'}
                </Badge>
            )}
        </div>
    );
}

// ──────────────────────────────────────────────────────────────────────────
// Destination: a selectable shelf leaf
// ──────────────────────────────────────────────────────────────────────────

function DestShelfRow({
    shelf,
    level,
    selected,
    onSelect,
}: {
    shelf: Shelf;
    level: number;
    selected: boolean;
    onSelect: () => void;
}) {
    return (
        <div
            role="button"
            tabIndex={0}
            onClick={onSelect}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelect();
                }
            }}
            className={cn(
                'flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 transition-all',
                selected
                    ? 'bg-primary/10 ring-1 ring-primary/40'
                    : 'hover:bg-muted/40'
            )}
            style={{ paddingLeft: `${level * 22 + 12}px` }}
        >
            <div className="h-5 w-5" />

            <div
                className={cn(
                    'rounded-md p-1.5',
                    selected ? 'bg-primary/20' : 'bg-purple-500/10'
                )}
            >
                <Layers
                    className={cn(
                        'h-4 w-4',
                        selected ? 'text-primary' : 'text-purple-600'
                    )}
                />
            </div>

            <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {shelf.name || shelf.code || 'Unnamed shelf'}
            </span>

            {selected && <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />}
        </div>
    );
}

// ──────────────────────────────────────────────────────────────────────────
// Page
// ──────────────────────────────────────────────────────────────────────────

export default function ItemsMoverPage() {
    const { isAuthorized, loading: authLoading, businessId, user } = useBusinessContext();

    // ── Source state (productId-driven, live) ──────────────────────────────
    const [productIdInput, setProductIdInput] = useState('');
    const [activeProductId, setActiveProductId] = useState('');

    const [sourceUpcs, setSourceUpcs] = useState<UPC[]>([]);
    const [isListening, setIsListening] = useState(false);
    const [isLoadingUpcs, setIsLoadingUpcs] = useState(false);
    const [isLoadingNames, setIsLoadingNames] = useState(false);

    // Name maps used by the source tree (resolved from the located UPCs)
    const [srcWarehouses, setSrcWarehouses] = useState<EntityMap<Warehouse>>({});
    const [srcZones, setSrcZones] = useState<EntityMap<Zone>>({});
    const [srcRacks, setSrcRacks] = useState<EntityMap<Rack>>({});
    const [srcShelves, setSrcShelves] = useState<EntityMap<Shelf>>({});

    const [srcExpanded, setSrcExpanded] = useState<ExpandedState>(emptyExpanded);

    // Selected UPCs to move
    const [selectedUpcIds, setSelectedUpcIds] = useState<Set<string>>(new Set());

    const unsubscribeRef = useRef<Unsubscribe | null>(null);

    // ── Destination state (location tree, one-shot fetch) ──────────────────
    const [destWarehouses, setDestWarehouses] = useState<EntityMap<Warehouse>>({});
    const [destZones, setDestZones] = useState<EntityMap<Zone>>({});
    const [destRacks, setDestRacks] = useState<EntityMap<Rack>>({});
    const [destShelves, setDestShelves] = useState<EntityMap<Shelf>>({});
    const [isLoadingLocations, setIsLoadingLocations] = useState(false);

    const [destSearch, setDestSearch] = useState('');
    const [destExpanded, setDestExpanded] = useState<ExpandedState>(emptyExpanded);
    const [selectedDestShelfId, setSelectedDestShelfId] = useState<string | null>(null);

    // ── Move state ─────────────────────────────────────────────────────────
    const [isMoving, setIsMoving] = useState(false);
    const [moveResult, setMoveResult] = useState<MoveSummary | null>(null);
    const [error, setError] = useState<string | null>(null);

    const trimmedProductId = productIdInput.trim();

    // ── Source listener lifecycle ──────────────────────────────────────────
    const cleanupListener = () => {
        if (unsubscribeRef.current) {
            unsubscribeRef.current();
            unsubscribeRef.current = null;
        }
        setIsListening(false);
    };

    const fetchSourceEntityNames = async (currentBusinessId: string, currentUpcs: UPC[]) => {
        const located = currentUpcs.filter(isLocatedUpc);

        const warehouseIds = [...new Set(located.map((u) => u.warehouseId))];
        const zoneIds = [...new Set(located.map((u) => u.zoneId))];
        const rackIds = [...new Set(located.map((u) => u.rackId))];
        const shelfIds = [...new Set(located.map((u) => u.shelfId))];

        setIsLoadingNames(true);
        try {
            const fetchDocs = async <T,>(
                collectionName: string,
                ids: string[]
            ): Promise<EntityMap<T>> => {
                const entries = await Promise.all(
                    ids.map(async (id) => {
                        const snap = await getDoc(
                            firestoreDoc(db, 'users', currentBusinessId, collectionName, id)
                        );
                        if (!snap.exists()) return null;
                        return [id, { id: snap.id, ...snap.data() } as T] as const;
                    })
                );
                return Object.fromEntries(
                    entries.filter((e): e is readonly [string, T] => e !== null)
                );
            };

            const [w, z, r, s] = await Promise.all([
                fetchDocs<Warehouse>('warehouses', warehouseIds),
                fetchDocs<Zone>('zones', zoneIds),
                fetchDocs<Rack>('racks', rackIds),
                fetchDocs<Shelf>('shelves', shelfIds),
            ]);
            setSrcWarehouses(w);
            setSrcZones(z);
            setSrcRacks(r);
            setSrcShelves(s);
        } catch (err) {
            console.error('Failed to fetch source location names:', err);
            setError(
                err instanceof Error ? err.message : 'Failed to fetch source location names.'
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
            where('putAway', '==', 'none')
        );

        const unsubscribe = onSnapshot(
            upcsQuery,
            async (snapshot) => {
                const next = snapshot.docs.map((snap) => ({
                    id: snap.id,
                    ...snap.data(),
                })) as UPC[];

                setSourceUpcs(next);
                setIsLoadingUpcs(false);
                setIsListening(true);

                await fetchSourceEntityNames(businessId, next);
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

    const resetSourceState = () => {
        setSourceUpcs([]);
        setSrcWarehouses({});
        setSrcZones({});
        setSrcRacks({});
        setSrcShelves({});
        setSrcExpanded(emptyExpanded());
        setSelectedUpcIds(new Set());
    };

    const handleSearch = (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!businessId) return;
        setMoveResult(null);

        if (!trimmedProductId) {
            cleanupListener();
            resetSourceState();
            setActiveProductId('');
            return;
        }
        setActiveProductId(trimmedProductId);
    };

    // ── Destination: load all active locations once ────────────────────────
    const loadLocations = async (currentBusinessId: string) => {
        setIsLoadingLocations(true);
        try {
            const fetchActive = async <T,>(collectionName: string): Promise<EntityMap<T>> => {
                const snap = await getDocs(
                    query(
                        collection(db, 'users', currentBusinessId, collectionName),
                        where('isDeleted', '==', false)
                    )
                );
                return Object.fromEntries(
                    snap.docs.map((d) => [d.id, { id: d.id, ...d.data() } as T])
                );
            };

            const [w, z, r, s] = await Promise.all([
                fetchActive<Warehouse>('warehouses'),
                fetchActive<Zone>('zones'),
                fetchActive<Rack>('racks'),
                fetchActive<Shelf>('shelves'),
            ]);
            setDestWarehouses(w);
            setDestZones(z);
            setDestRacks(r);
            setDestShelves(s);
        } catch (err) {
            console.error('Failed to load locations:', err);
            setError(err instanceof Error ? err.message : 'Failed to load warehouse locations.');
        } finally {
            setIsLoadingLocations(false);
        }
    };

    // ── Effects ────────────────────────────────────────────────────────────
    useEffect(() => {
        document.title = 'Items Mover - Warehouse';
    }, []);

    // Source listener with visibility handling (mirrors Item Finder)
    useEffect(() => {
        if (!businessId || !activeProductId) return;

        resetSourceState();

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

    // Clear source when input emptied
    useEffect(() => {
        if (!trimmedProductId) {
            cleanupListener();
            resetSourceState();
            setActiveProductId('');
            setError(null);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [trimmedProductId]);

    // Load destination locations once authorized
    useEffect(() => {
        if (!businessId) return;
        loadLocations(businessId);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [businessId]);

    // Prune selected UPCs that are no longer in the live source set
    // (e.g. someone else dispatched/moved them, or they were just moved).
    useEffect(() => {
        setSelectedUpcIds((prev) => {
            if (prev.size === 0) return prev;
            const present = new Set(sourceUpcs.map((u) => u.id));
            const next = new Set([...prev].filter((id) => present.has(id)));
            return next.size === prev.size ? prev : next;
        });
    }, [sourceUpcs]);

    // ── Derived: source tree ───────────────────────────────────────────────
    const locatedSourceUpcs = useMemo(() => sourceUpcs.filter(isLocatedUpc), [sourceUpcs]);
    const unlocatedSourceUpcs = useMemo(
        () => sourceUpcs.filter((u: any) => !isLocatedUpc(u)),
        [sourceUpcs]
    );

    const sourceTree = useMemo<UpcTree>(() => {
        const tree: UpcTree = {};
        for (const upc of locatedSourceUpcs) {
            tree[upc.warehouseId] ??= { zones: {} };
            tree[upc.warehouseId].zones[upc.zoneId] ??= { racks: {} };
            tree[upc.warehouseId].zones[upc.zoneId].racks[upc.rackId] ??= { shelves: {} };
            tree[upc.warehouseId].zones[upc.zoneId].racks[upc.rackId].shelves[upc.shelfId] ??= {
                upcs: [],
            };
            tree[upc.warehouseId].zones[upc.zoneId].racks[upc.rackId].shelves[upc.shelfId].upcs.push(
                upc
            );
        }
        return tree;
    }, [locatedSourceUpcs]);

    // ── Derived: destination tree (filtered by search), built from shelves up
    const filteredDestShelves = useMemo(() => {
        const all = Object.values(destShelves);
        const q = destSearch.trim().toLowerCase();
        if (!q) return all;
        return all.filter(
            (s) =>
                (s.name || '').toLowerCase().includes(q) ||
                (s.code || '').toLowerCase().includes(q)
        );
    }, [destShelves, destSearch]);

    const destTree = useMemo<LocationTree>(() => {
        const tree: LocationTree = {};
        for (const shelf of filteredDestShelves) {
            const { warehouseId, zoneId, rackId } = shelf;
            if (!warehouseId || !zoneId || !rackId) continue;
            tree[warehouseId] ??= { zones: {} };
            tree[warehouseId].zones[zoneId] ??= { racks: {} };
            tree[warehouseId].zones[zoneId].racks[rackId] ??= { shelves: [] };
            tree[warehouseId].zones[zoneId].racks[rackId].shelves.push(shelf);
        }
        // sort shelves by position/name for stable display
        for (const w of Object.values(tree))
            for (const z of Object.values(w.zones))
                for (const r of Object.values(z.racks))
                    r.shelves.sort(
                        (a, b) =>
                            (a.position ?? 0) - (b.position ?? 0) ||
                            (a.name || '').localeCompare(b.name || '')
                    );
        return tree;
    }, [filteredDestShelves]);

    const destSearching = destSearch.trim().length > 0;

    // ── Move math ──────────────────────────────────────────────────────────
    const selectedCount = selectedUpcIds.size;

    // How many of the selected are already on the chosen destination shelf
    // (these would be skipped server-side).
    const alreadyThereCount = useMemo(() => {
        if (!selectedDestShelfId) return 0;
        let n = 0;
        for (const upc of locatedSourceUpcs) {
            if (selectedUpcIds.has(upc.id) && upc.shelfId === selectedDestShelfId) n++;
        }
        return n;
    }, [selectedUpcIds, selectedDestShelfId, locatedSourceUpcs]);

    const movableCount = selectedCount - alreadyThereCount;

    const destShelfLabel = useMemo(() => {
        if (!selectedDestShelfId) return null;
        const shelf = destShelves[selectedDestShelfId];
        if (!shelf) return null;
        const parts = [
            getEntityName(destWarehouses, shelf.warehouseId, 'Warehouse'),
            getEntityName(destZones, shelf.zoneId, 'Zone'),
            getEntityName(destRacks, shelf.rackId, 'Rack'),
            shelf.name || shelf.code || 'Shelf',
        ];
        return parts.join(' › ');
    }, [selectedDestShelfId, destShelves, destWarehouses, destZones, destRacks]);

    const canMove =
        !!businessId && !!selectedDestShelfId && movableCount > 0 && !isMoving;

    // ── Selection helpers ──────────────────────────────────────────────────
    const toggleUpc = (upcId: string) => {
        setSelectedUpcIds((prev) => toggleSetValue(prev, upcId));
        setMoveResult(null);
    };

    const setShelfSelection = (upcsOnShelf: LocatedUpc[], select: boolean) => {
        setSelectedUpcIds((prev) => {
            const next = new Set(prev);
            for (const u of upcsOnShelf) {
                // don't auto-select ones already on the destination shelf
                if (select && u.shelfId === selectedDestShelfId) continue;
                if (select) next.add(u.id);
                else next.delete(u.id);
            }
            return next;
        });
        setMoveResult(null);
    };

    const clearSelection = () => {
        setSelectedUpcIds(new Set());
        setMoveResult(null);
    };

    // ── Move action ────────────────────────────────────────────────────────
    const handleMove = async () => {
        if (!businessId || !selectedDestShelfId || selectedUpcIds.size === 0) return;

        setIsMoving(true);
        setMoveResult(null);
        setError(null);

        try {
            const idToken = await user?.getIdToken();
            if (!idToken) {
                throw new Error('Move failed. User not logged in');
            }
            const res = await fetch('/api/business/warehouse/move-upcs', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${idToken}`,
                },
                credentials: 'include',
                body: JSON.stringify({
                    businessId,
                    upcIds: [...selectedUpcIds],
                    destShelfId: selectedDestShelfId,
                }),
            });

            const data = await res.json();

            // 200 = success (may include skipped/failed); 422 = nothing moved but
            // still a structured summary. Anything else is a hard error.
            if (!res.ok && res.status !== 422) {
                throw new Error(data?.error || `Move failed (${res.status})`);
            }

            setMoveResult(data as MoveSummary);
            // Live source listener will drop the moved UPCs automatically; the
            // prune effect clears them from the selection set.
            setSelectedUpcIds(new Set());
        } catch (err) {
            console.error('Move failed:', err);
            setError(err instanceof Error ? err.message : 'Move failed.');
        } finally {
            setIsMoving(false);
        }
    };

    // ── Expansion toggles ──────────────────────────────────────────────────
    const toggleSrc = (key: keyof ExpandedState, id: string) =>
        setSrcExpanded((prev) => ({ ...prev, [key]: toggleSetValue(prev[key], id) }));
    const toggleDest = (key: keyof ExpandedState, id: string) =>
        setDestExpanded((prev) => ({ ...prev, [key]: toggleSetValue(prev[key], id) }));

    // ── Guards ─────────────────────────────────────────────────────────────
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
    const hasResults = locatedSourceUpcs.length > 0;
    const hasAnyUpcs = sourceUpcs.length > 0;
    const hasDestLocations = Object.keys(destShelves).length > 0;

    // ── Render ─────────────────────────────────────────────────────────────
    return (
        <div className="min-h-screen bg-gradient-to-b from-muted/30 to-background p-4 pb-28 md:p-6 md:pb-28">
            <div className="mx-auto flex max-w-7xl flex-col gap-4">
                {/* Header */}
                <div className="flex flex-col gap-1">
                    <h1 className="text-2xl font-bold tracking-tight">Items Mover</h1>
                    <p className="text-sm text-muted-foreground">
                        Find a product&apos;s UPCs, select the ones to move, pick a destination
                        shelf, and relocate them.
                    </p>
                </div>

                {error && (
                    <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle>Error</AlertTitle>
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                )}

                {moveResult && (
                    <Alert>
                        <CheckCircle2 className="h-4 w-4" />
                        <AlertTitle>Move complete</AlertTitle>
                        <AlertDescription>
                            Moved {moveResult.moved}
                            {moveResult.skipped > 0 && <> · skipped {moveResult.skipped}</>}
                            {moveResult.failed.length > 0 && (
                                <> · failed {moveResult.failed.length}</>
                            )}
                            {moveResult.failed.length > 0 && (
                                <span className="mt-1 block text-xs text-muted-foreground">
                                    {moveResult.failed
                                        .slice(0, 5)
                                        .map((f) => `${f.upcId}: ${f.reason}`)
                                        .join(' · ')}
                                    {moveResult.failed.length > 5 &&
                                        ` · +${moveResult.failed.length - 5} more`}
                                </span>
                            )}
                        </AlertDescription>
                    </Alert>
                )}

                {/* Side-by-side panels → stacks below xl */}
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                    {/* ── SOURCE ──────────────────────────────────────────── */}
                    <Card className="flex flex-col">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Search className="h-5 w-5" />
                                Source — find UPCs
                            </CardTitle>
                            <CardDescription>
                                Search a product ID to list its stored UPCs, then tick the ones to
                                move.
                            </CardDescription>
                        </CardHeader>

                        <CardContent className="flex flex-1 flex-col gap-3">
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
                                    className="sm:w-32"
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

                            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
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
                                        Product:{' '}
                                        <code className="rounded bg-muted px-1 py-0.5">
                                            {activeProductId}
                                        </code>
                                    </span>
                                )}
                                {selectedCount > 0 && (
                                    <Badge className="gap-1">{selectedCount} selected</Badge>
                                )}
                            </div>

                            {/* Source tree */}
                            <div className="flex-1">
                                {!hasSearched ? (
                                    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center">
                                        <Search className="mb-3 h-10 w-10 text-muted-foreground/60" />
                                        <h3 className="font-semibold">Search a product</h3>
                                        <p className="mt-1 max-w-xs text-sm text-muted-foreground">
                                            Enter a product ID to see its stored UPCs.
                                        </p>
                                    </div>
                                ) : (isLoadingUpcs || isLoadingNames) && !hasAnyUpcs ? (
                                    <div className="space-y-3">
                                        {[1, 2, 3].map((i) => (
                                            <div key={i} className="flex items-center gap-2">
                                                <Skeleton className="h-5 w-5" />
                                                <Skeleton className="h-8 w-8 rounded-md" />
                                                <Skeleton className="h-4 w-48" />
                                            </div>
                                        ))}
                                    </div>
                                ) : !hasAnyUpcs ? (
                                    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center">
                                        <Box className="mb-3 h-10 w-10 text-muted-foreground/60" />
                                        <h3 className="font-semibold">No stored UPCs</h3>
                                        <p className="mt-1 max-w-xs text-sm text-muted-foreground">
                                            No UPC with this product ID is currently in storage.
                                        </p>
                                    </div>
                                ) : !hasResults ? (
                                    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center">
                                        <Package className="mb-3 h-10 w-10 text-muted-foreground/60" />
                                        <h3 className="font-semibold">No placed UPCs</h3>
                                        <p className="mt-1 max-w-xs text-sm text-muted-foreground">
                                            UPCs exist but none have a complete location.
                                        </p>
                                    </div>
                                ) : (
                                    <div className="overflow-hidden rounded-lg border">
                                        <div className="py-1">
                                            {Object.entries(sourceTree).map(
                                                ([warehouseId, wNode]) => {
                                                    const zoneEntries = Object.entries(wNode.zones);
                                                    return (
                                                        <TreeNode
                                                            key={warehouseId}
                                                            level={0}
                                                            icon={WarehouseIcon}
                                                            iconClassName="text-blue-600"
                                                            iconBgClassName="bg-blue-500/10"
                                                            label={getEntityName(
                                                                srcWarehouses,
                                                                warehouseId,
                                                                'Unknown warehouse'
                                                            )}
                                                            isExpanded={srcExpanded.warehouses.has(
                                                                warehouseId
                                                            )}
                                                            hasChildren={zoneEntries.length > 0}
                                                            onToggle={() =>
                                                                toggleSrc('warehouses', warehouseId)
                                                            }
                                                        >
                                                            {zoneEntries.map(([zoneId, zNode]) => {
                                                                const rackEntries = Object.entries(
                                                                    zNode.racks
                                                                );
                                                                return (
                                                                    <TreeNode
                                                                        key={zoneId}
                                                                        level={1}
                                                                        icon={MapPin}
                                                                        iconClassName="text-emerald-600"
                                                                        iconBgClassName="bg-emerald-500/10"
                                                                        label={getEntityName(
                                                                            srcZones,
                                                                            zoneId,
                                                                            'Unknown zone'
                                                                        )}
                                                                        isExpanded={srcExpanded.zones.has(
                                                                            zoneId
                                                                        )}
                                                                        hasChildren={
                                                                            rackEntries.length > 0
                                                                        }
                                                                        onToggle={() =>
                                                                            toggleSrc('zones', zoneId)
                                                                        }
                                                                    >
                                                                        {rackEntries.map(
                                                                            ([rackId, rNode]) => {
                                                                                const shelfEntries =
                                                                                    Object.entries(
                                                                                        rNode.shelves
                                                                                    );
                                                                                return (
                                                                                    <TreeNode
                                                                                        key={rackId}
                                                                                        level={2}
                                                                                        icon={Grid3X3}
                                                                                        iconClassName="text-amber-600"
                                                                                        iconBgClassName="bg-amber-500/10"
                                                                                        label={getEntityName(
                                                                                            srcRacks,
                                                                                            rackId,
                                                                                            'Unknown rack'
                                                                                        )}
                                                                                        isExpanded={srcExpanded.racks.has(
                                                                                            rackId
                                                                                        )}
                                                                                        hasChildren={
                                                                                            shelfEntries.length >
                                                                                            0
                                                                                        }
                                                                                        onToggle={() =>
                                                                                            toggleSrc(
                                                                                                'racks',
                                                                                                rackId
                                                                                            )
                                                                                        }
                                                                                    >
                                                                                        {shelfEntries.map(
                                                                                            ([
                                                                                                shelfId,
                                                                                                shelfNode,
                                                                                            ]) => {
                                                                                                const upcsOnShelf =
                                                                                                    shelfNode.upcs;
                                                                                                const selectableOnShelf =
                                                                                                    upcsOnShelf.filter(
                                                                                                        (u) =>
                                                                                                            u.shelfId !==
                                                                                                            selectedDestShelfId
                                                                                                    );
                                                                                                const selectedOnShelf =
                                                                                                    selectableOnShelf.filter(
                                                                                                        (u) =>
                                                                                                            selectedUpcIds.has(
                                                                                                                u.id
                                                                                                            )
                                                                                                    ).length;
                                                                                                const allSelected =
                                                                                                    selectableOnShelf.length >
                                                                                                    0 &&
                                                                                                    selectedOnShelf ===
                                                                                                    selectableOnShelf.length;
                                                                                                return (
                                                                                                    <TreeNode
                                                                                                        key={
                                                                                                            shelfId
                                                                                                        }
                                                                                                        level={
                                                                                                            3
                                                                                                        }
                                                                                                        icon={
                                                                                                            Layers
                                                                                                        }
                                                                                                        iconClassName="text-purple-600"
                                                                                                        iconBgClassName="bg-purple-500/10"
                                                                                                        label={`${getEntityName(
                                                                                                            srcShelves,
                                                                                                            shelfId,
                                                                                                            'Unknown shelf'
                                                                                                        )}  ·  ${upcsOnShelf.length
                                                                                                            } UPCs`}
                                                                                                        isExpanded={srcExpanded.shelves.has(
                                                                                                            shelfId
                                                                                                        )}
                                                                                                        hasChildren={
                                                                                                            upcsOnShelf.length >
                                                                                                            0
                                                                                                        }
                                                                                                        onToggle={() =>
                                                                                                            toggleSrc(
                                                                                                                'shelves',
                                                                                                                shelfId
                                                                                                            )
                                                                                                        }
                                                                                                        accessory={
                                                                                                            selectableOnShelf.length >
                                                                                                                0 ? (
                                                                                                                <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
                                                                                                                    <Checkbox
                                                                                                                        checked={
                                                                                                                            allSelected
                                                                                                                        }
                                                                                                                        onCheckedChange={(
                                                                                                                            v
                                                                                                                        ) =>
                                                                                                                            setShelfSelection(
                                                                                                                                selectableOnShelf,
                                                                                                                                Boolean(
                                                                                                                                    v
                                                                                                                                )
                                                                                                                            )
                                                                                                                        }
                                                                                                                        aria-label="Select all on this shelf"
                                                                                                                    />
                                                                                                                    all
                                                                                                                </label>
                                                                                                            ) : null
                                                                                                        }
                                                                                                    >
                                                                                                        {upcsOnShelf.map(
                                                                                                            (
                                                                                                                upc
                                                                                                            ) => (
                                                                                                                <SourceUpcRow
                                                                                                                    key={
                                                                                                                        upc.id
                                                                                                                    }
                                                                                                                    upc={
                                                                                                                        upc
                                                                                                                    }
                                                                                                                    level={
                                                                                                                        4
                                                                                                                    }
                                                                                                                    checked={selectedUpcIds.has(
                                                                                                                        upc.id
                                                                                                                    )}
                                                                                                                    onToggle={() =>
                                                                                                                        toggleUpc(
                                                                                                                            upc.id
                                                                                                                        )
                                                                                                                    }
                                                                                                                    isOnDestShelf={
                                                                                                                        upc.shelfId ===
                                                                                                                        selectedDestShelfId
                                                                                                                    }
                                                                                                                />
                                                                                                            )
                                                                                                        )}
                                                                                                    </TreeNode>
                                                                                                );
                                                                                            }
                                                                                        )}
                                                                                    </TreeNode>
                                                                                );
                                                                            }
                                                                        )}
                                                                    </TreeNode>
                                                                );
                                                            })}
                                                        </TreeNode>
                                                    );
                                                }
                                            )}
                                        </div>
                                    </div>
                                )}

                                {unlocatedSourceUpcs.length > 0 && (
                                    <div className="mt-4 rounded-lg border bg-muted/30 p-3">
                                        <div className="flex items-start gap-2">
                                            <AlertCircle className="mt-0.5 h-4 w-4 text-muted-foreground" />
                                            <p className="text-xs text-muted-foreground">
                                                {unlocatedSourceUpcs.length} UPC(s) matched but have
                                                no complete location — not shown or movable here.
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    {/* ── DESTINATION ─────────────────────────────────────── */}
                    <Card className="flex flex-col">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <MapPin className="h-5 w-5" />
                                Destination — pick a shelf
                            </CardTitle>
                            <CardDescription>
                                Browse or search by shelf name/code, then tap a shelf to set it as
                                the destination.
                            </CardDescription>
                        </CardHeader>

                        <CardContent className="flex flex-1 flex-col gap-3">
                            <div className="flex gap-2">
                                <Input
                                    value={destSearch}
                                    onChange={(e) => setDestSearch(e.target.value)}
                                    placeholder="Search shelf name or code…"
                                />
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="icon"
                                    onClick={() => businessId && loadLocations(businessId)}
                                    disabled={isLoadingLocations}
                                    aria-label="Refresh locations"
                                >
                                    <RefreshCw
                                        className={cn(
                                            'h-4 w-4',
                                            isLoadingLocations && 'animate-spin'
                                        )}
                                    />
                                </Button>
                            </div>

                            {selectedDestShelfId && destShelfLabel && (
                                <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
                                    <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
                                    <span className="min-w-0 flex-1 truncate text-sm">
                                        {destShelfLabel}
                                    </span>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6"
                                        onClick={() => setSelectedDestShelfId(null)}
                                        aria-label="Clear destination"
                                    >
                                        <X className="h-4 w-4" />
                                    </Button>
                                </div>
                            )}

                            {/* Destination tree */}
                            <div className="flex-1">
                                {isLoadingLocations && !hasDestLocations ? (
                                    <div className="space-y-3">
                                        {[1, 2, 3].map((i) => (
                                            <div key={i} className="flex items-center gap-2">
                                                <Skeleton className="h-5 w-5" />
                                                <Skeleton className="h-8 w-8 rounded-md" />
                                                <Skeleton className="h-4 w-48" />
                                            </div>
                                        ))}
                                    </div>
                                ) : Object.keys(destTree).length === 0 ? (
                                    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center">
                                        <WarehouseIcon className="mb-3 h-10 w-10 text-muted-foreground/60" />
                                        <h3 className="font-semibold">
                                            {destSearching
                                                ? 'No matching shelves'
                                                : 'No shelves found'}
                                        </h3>
                                        <p className="mt-1 max-w-xs text-sm text-muted-foreground">
                                            {destSearching
                                                ? 'Try a different name or code.'
                                                : 'Create shelves first to use them as destinations.'}
                                        </p>
                                    </div>
                                ) : (
                                    <div className="overflow-hidden rounded-lg border">
                                        <div className="py-1">
                                            {Object.entries(destTree).map(([warehouseId, wNode]) => {
                                                const zoneEntries = Object.entries(wNode.zones);
                                                return (
                                                    <TreeNode
                                                        key={warehouseId}
                                                        level={0}
                                                        icon={WarehouseIcon}
                                                        iconClassName="text-blue-600"
                                                        iconBgClassName="bg-blue-500/10"
                                                        label={getEntityName(
                                                            destWarehouses,
                                                            warehouseId,
                                                            'Unknown warehouse'
                                                        )}
                                                        isExpanded={
                                                            destSearching ||
                                                            destExpanded.warehouses.has(warehouseId)
                                                        }
                                                        hasChildren={zoneEntries.length > 0}
                                                        onToggle={() =>
                                                            toggleDest('warehouses', warehouseId)
                                                        }
                                                    >
                                                        {zoneEntries.map(([zoneId, zNode]) => {
                                                            const rackEntries = Object.entries(
                                                                zNode.racks
                                                            );
                                                            return (
                                                                <TreeNode
                                                                    key={zoneId}
                                                                    level={1}
                                                                    icon={MapPin}
                                                                    iconClassName="text-emerald-600"
                                                                    iconBgClassName="bg-emerald-500/10"
                                                                    label={getEntityName(
                                                                        destZones,
                                                                        zoneId,
                                                                        'Unknown zone'
                                                                    )}
                                                                    isExpanded={
                                                                        destSearching ||
                                                                        destExpanded.zones.has(zoneId)
                                                                    }
                                                                    hasChildren={
                                                                        rackEntries.length > 0
                                                                    }
                                                                    onToggle={() =>
                                                                        toggleDest('zones', zoneId)
                                                                    }
                                                                >
                                                                    {rackEntries.map(
                                                                        ([rackId, rNode]) => (
                                                                            <TreeNode
                                                                                key={rackId}
                                                                                level={2}
                                                                                icon={Grid3X3}
                                                                                iconClassName="text-amber-600"
                                                                                iconBgClassName="bg-amber-500/10"
                                                                                label={getEntityName(
                                                                                    destRacks,
                                                                                    rackId,
                                                                                    'Unknown rack'
                                                                                )}
                                                                                isExpanded={
                                                                                    destSearching ||
                                                                                    destExpanded.racks.has(
                                                                                        rackId
                                                                                    )
                                                                                }
                                                                                hasChildren={
                                                                                    rNode.shelves
                                                                                        .length > 0
                                                                                }
                                                                                onToggle={() =>
                                                                                    toggleDest(
                                                                                        'racks',
                                                                                        rackId
                                                                                    )
                                                                                }
                                                                            >
                                                                                {rNode.shelves.map(
                                                                                    (shelf) => (
                                                                                        <DestShelfRow
                                                                                            key={
                                                                                                shelf.id
                                                                                            }
                                                                                            shelf={
                                                                                                shelf
                                                                                            }
                                                                                            level={3}
                                                                                            selected={
                                                                                                selectedDestShelfId ===
                                                                                                shelf.id
                                                                                            }
                                                                                            onSelect={() => {
                                                                                                setSelectedDestShelfId(
                                                                                                    shelf.id
                                                                                                );
                                                                                                setMoveResult(
                                                                                                    null
                                                                                                );
                                                                                            }}
                                                                                        />
                                                                                    )
                                                                                )}
                                                                            </TreeNode>
                                                                        )
                                                                    )}
                                                                </TreeNode>
                                                            );
                                                        })}
                                                    </TreeNode>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>

            {/* ── Sticky move bar ─────────────────────────────────────────── */}
            <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
                <div className="mx-auto flex max-w-7xl flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between md:px-6">
                    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                        <Badge variant={selectedCount > 0 ? 'default' : 'outline'}>
                            {selectedCount} UPC{selectedCount === 1 ? '' : 's'}
                        </Badge>
                        {activeProductId && (
                            <code className="rounded bg-muted px-1 py-0.5 text-xs">
                                {activeProductId}
                            </code>
                        )}
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                        {destShelfLabel ? (
                            <span className="min-w-0 truncate text-muted-foreground">
                                {destShelfLabel}
                            </span>
                        ) : (
                            <span className="text-muted-foreground">no destination</span>
                        )}
                        {alreadyThereCount > 0 && (
                            <Badge variant="outline" className="text-xs">
                                {alreadyThereCount} already there
                            </Badge>
                        )}
                    </div>

                    <div className="flex items-center gap-2">
                        {selectedCount > 0 && (
                            <Button variant="ghost" onClick={clearSelection} disabled={isMoving}>
                                Clear
                            </Button>
                        )}
                        <Button onClick={handleMove} disabled={!canMove} className="min-w-32">
                            {isMoving ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Moving
                                </>
                            ) : (
                                <>
                                    <Truck className="mr-2 h-4 w-4" />
                                    Move{movableCount > 0 ? ` ${movableCount}` : ''}
                                </>
                            )}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}