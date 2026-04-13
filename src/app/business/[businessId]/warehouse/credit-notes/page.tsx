'use client';

import { useEffect, useState } from 'react';
import { collection, getDocs, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Party, Warehouse, Zone, Rack, Shelf, UPC } from '@/types/warehouse';
import { CreditNote, CreditNoteItem } from '@/types/warehouse';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronRight, Loader2, X, Download } from 'lucide-react';
import { cn as CN } from '@/lib/utils';
import { Timestamp } from 'firebase-admin/firestore';
import { useBusinessContext } from '../../layout';
import { User } from 'firebase/auth';
import { useToast } from '@/hooks/use-toast';

// ─── Types ────────────────────────────────────────────────────────────────────

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

interface DraftItem extends CreditNoteItem {
    selectedUpcs: string[];
}

type Step = 'party' | 'items' | 'confirm';

const STEPS: Step[] = ['party', 'items', 'confirm'];

const REASONS = [
    'Damaged',
    'Quality Rejection',
    'Excess Stock',
    'Expired',
    'Wrong Item Received',
    'Other',
];

const STATUS_COLOR: Record<CreditNote['status'], string> = {
    completed: 'bg-green-100 text-green-800',
};

// ─── Main page ────────────────────────────────────────────────────────────────

export default function CreditNotesPage() {
    const { toast, dismiss } = useToast();
    const { businessId, user } = useBusinessContext();

    // ── List state ───────────────────────────────────────────────────────────
    const [creditNotes, setCreditNotes] = useState<CreditNote[]>([]);
    const [loadingList, setLoadingList] = useState(true);

    // ── Dialog state ─────────────────────────────────────────────────────────
    const [dialogOpen, setDialogOpen] = useState(false);

    // ── Download state ───────────────────────────────────────────────────────
    const [downloadingCnId, setDownloadingCnId] = useState<string | null>(null);

    useEffect(() => {
        const q = query(
            collection(db, `users/${businessId}/credit_notes`),
            orderBy('createdAt', 'desc'),
        );
        const unsub = onSnapshot(q, (snap) => {
            setCreditNotes(snap.docs.map((d) => d.data() as CreditNote));
            setLoadingList(false);
        });
        return () => unsub();
    }, [businessId]);

    const openDialog = () => setDialogOpen(true);
    const closeDialog = () => setDialogOpen(false);

    const handleDownloadBill = async (cn: CreditNote) => {
        if (!user || downloadingCnId) return;
        setDownloadingCnId(cn.id);

        const { id: loadingToastId } = toast({
            title: 'Generating PDF…',
            description: `Building credit note for ${cn.creditNoteNumber}`,
            duration: 60_000,
        });

        try {
            const idToken = await user.getIdToken();
            const res = await fetch('/api/business/warehouse/credit-notes/download-bill', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${idToken}`,
                },
                body: JSON.stringify({ businessId, creditNoteId: cn.id }),
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error ?? `Server error ${res.status}`);
            }

            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${cn.creditNoteNumber}.pdf`;
            a.click();
            URL.revokeObjectURL(url);

            dismiss(loadingToastId);
            toast({
                title: 'PDF Downloaded',
                description: `${cn.creditNoteNumber}.pdf saved successfully.`,
            });
        } catch (err: any) {
            dismiss(loadingToastId);
            toast({
                title: 'Download Failed',
                description: err?.message ?? 'Could not generate the credit note PDF.',
                variant: 'destructive',
            });
        } finally {
            setDownloadingCnId(null);
        }
    };

    return (
        <div className="p-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-semibold">Credit Notes</h1>
                    <p className="text-sm text-gray-500 mt-1">
                        Record goods returned to suppliers or written off from warehouse inventory.
                    </p>
                </div>
                <button
                    onClick={openDialog}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
                >
                    + New Credit Note
                </button>
            </div>

            {/* List */}
            {loadingList ? (
                <div className="text-sm text-gray-400">Loading...</div>
            ) : creditNotes.length === 0 ? (
                <div className="text-sm text-gray-400 mt-10 text-center">
                    No credit notes yet. Create one to write off or return stock.
                </div>
            ) : (
                <div className="overflow-x-auto rounded-lg border border-gray-200">
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 text-gray-600 uppercase text-xs">
                            <tr>
                                <th className="px-4 py-3 text-left">CN Number</th>
                                <th className="px-4 py-3 text-left">Party</th>
                                <th className="px-4 py-3 text-left">Reason</th>
                                <th className="px-4 py-3 text-right">Items</th>
                                <th className="px-4 py-3 text-right">Total Value</th>
                                <th className="px-4 py-3 text-left">Status</th>
                                <th className="px-4 py-3 text-left">Date</th>
                                <th className="px-4 py-3 w-10"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {creditNotes.map((cn) => (
                                <tr key={cn.id} className="hover:bg-gray-50">
                                    <td className="px-4 py-3 font-medium">{cn.creditNoteNumber}</td>
                                    <td className="px-4 py-3 text-gray-700">{cn.partyName}</td>
                                    <td className="px-4 py-3 text-gray-600">{cn.reason}</td>
                                    <td className="px-4 py-3 text-right">{cn.totalItems}</td>
                                    <td className="px-4 py-3 text-right">
                                        ₹{cn.totalValue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className={CN(`inline-block px-2 py-0.5 rounded text-xs font-medium capitalize ${STATUS_COLOR[cn.status]}`)}>
                                            {cn.status}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-gray-500">{formatDate(cn.createdAt)}</td>
                                    <td className="px-4 py-3">
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleDownloadBill(cn); }}
                                            disabled={downloadingCnId === cn.id}
                                            className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-40"
                                            title="Download Credit Note PDF"
                                        >
                                            {downloadingCnId === cn.id
                                                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                : <Download className="h-3.5 w-3.5" />}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Creation dialog */}
            {dialogOpen && (
                <CreateCreditNoteDialog
                    businessId={businessId}
                    user={user}
                    onClose={closeDialog}
                    onCreated={closeDialog}
                />
            )}
        </div>
    );
}

// ─── Creation dialog ──────────────────────────────────────────────────────────

function CreateCreditNoteDialog({
    businessId,
    user,
    onClose,
    onCreated,
}: {
    businessId: string;
    user: User | null | undefined;
    onClose: () => void;
    onCreated: () => void;
}) {
    const [step, setStep] = useState<Step>('party');

    // ── Party step ───────────────────────────────────────────────────────────
    const [parties, setParties] = useState<Party[]>([]);
    const [selectedParty, setSelectedParty] = useState<Party | null>(null);
    const [reason, setReason] = useState('');
    const [notes, setNotes] = useState('');

    // ── Items step — warehouse tree ──────────────────────────────────────────
    const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
    const [zones, setZones] = useState<Record<string, Zone[]>>({});
    const [racks, setRacks] = useState<Record<string, Rack[]>>({});
    const [shelves, setShelves] = useState<Record<string, Shelf[]>>({});

    const [expandedWarehouses, setExpandedWarehouses] = useState<Set<string>>(new Set());
    const [expandedZones, setExpandedZones] = useState<Set<string>>(new Set());
    const [expandedRacks, setExpandedRacks] = useState<Set<string>>(new Set());

    const [isLoadingWarehouses, setIsLoadingWarehouses] = useState(false);
    const [loadingZones, setLoadingZones] = useState<Set<string>>(new Set());
    const [loadingRacks, setLoadingRacks] = useState<Set<string>>(new Set());
    const [loadingShelves, setLoadingShelves] = useState<Set<string>>(new Set());

    const [selectedShelf, setSelectedShelf] = useState<Shelf | null>(null);
    const [shelfUpcs, setShelfUpcs] = useState<UPC[]>([]);
    const [loadingShelfUpcs, setLoadingShelfUpcs] = useState(false);

    const [draftItems, setDraftItems] = useState<DraftItem[]>([]);

    // ── Submit ───────────────────────────────────────────────────────────────
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // ── Init ─────────────────────────────────────────────────────────────────
    useEffect(() => {
        getDocs(
            query(
                collection(db, `users/${businessId}/parties`),
                where('isActive', '==', true),
                where('type', 'in', ['supplier', 'both']),
            ),
        ).then((snap) => setParties(snap.docs.map((d) => d.data() as Party)));
    }, [businessId]);

    useEffect(() => {
        if (step !== 'items' || warehouses.length > 0) return;
        fetchWarehouses();
    }, [step]);

    useEffect(() => {
        if (!selectedShelf) return;
        setLoadingShelfUpcs(true);
        getDocs(
            query(
                collection(db, `users/${businessId}/upcs`),
                where('putAway', '==', 'none'),
                where('shelfId', '==', selectedShelf.id),
            ),
        ).then((snap) => {
            setShelfUpcs(
                snap.docs.map((d) => {
                    const data = d.data() as UPC;
                    return data;
                }).sort((a, b) => a.createdAt.toMillis() - b.createdAt.toMillis()),
            );
            setLoadingShelfUpcs(false);
        });
    }, [selectedShelf]);

    // ── Tree fetchers ─────────────────────────────────────────────────────────
    const fetchWarehouses = async () => {
        setIsLoadingWarehouses(true);
        try {
            const idToken = await user?.getIdToken();
            const res = await fetch(
                `/api/business/warehouse/list-warehouses?businessId=${businessId}`,
                { headers: { Authorization: `Bearer ${idToken}` } },
            );
            if (res.ok) setWarehouses((await res.json()).warehouses ?? []);
        } finally {
            setIsLoadingWarehouses(false);
        }
    };

    const fetchZones = async (warehouseId: string) => {
        setLoadingZones((p) => new Set(p).add(warehouseId));
        try {
            const idToken = await user?.getIdToken();
            const res = await fetch(
                `/api/business/warehouse/list-zones?businessId=${businessId}&warehouseId=${warehouseId}`,
                { headers: { Authorization: `Bearer ${idToken}` } },
            );
            const json = await res.json();
            if (res.ok) setZones((p) => ({ ...p, [warehouseId]: json.zones ?? [] }));
        } finally {
            setLoadingZones((p) => { const n = new Set(p); n.delete(warehouseId); return n; });
        }
    };

    const fetchRacks = async (zoneId: string) => {
        setLoadingRacks((p) => new Set(p).add(zoneId));
        try {
            const idToken = await user?.getIdToken();
            const res = await fetch(
                `/api/business/warehouse/list-racks?businessId=${businessId}&zoneId=${zoneId}`,
                { headers: { Authorization: `Bearer ${idToken}` } },
            );
            const json = await res.json();
            if (res.ok) setRacks((p) => ({ ...p, [zoneId]: json.racks ?? [] }));
        } finally {
            setLoadingRacks((p) => { const n = new Set(p); n.delete(zoneId); return n; });
        }
    };

    const fetchShelves = async (rackId: string) => {
        setLoadingShelves((p) => new Set(p).add(rackId));
        try {
            const idToken = await user?.getIdToken();
            const res = await fetch(
                `/api/business/warehouse/list-shelves?businessId=${businessId}&rackId=${rackId}`,
                { headers: { Authorization: `Bearer ${idToken}` } },
            );
            const json = await res.json();
            if (res.ok) setShelves((p) => ({ ...p, [rackId]: json.shelves ?? [] }));
        } finally {
            setLoadingShelves((p) => { const n = new Set(p); n.delete(rackId); return n; });
        }
    };

    // ── Tree toggles ─────────────────────────────────────────────────────────
    const toggleWarehouse = (id: string) => {
        const expanding = !expandedWarehouses.has(id);
        setExpandedWarehouses((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
        if (expanding && !zones[id]) fetchZones(id);
    };

    const toggleZone = (id: string) => {
        const expanding = !expandedZones.has(id);
        setExpandedZones((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
        if (expanding && !racks[id]) fetchRacks(id);
    };

    const toggleRack = (id: string) => {
        const expanding = !expandedRacks.has(id);
        setExpandedRacks((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
        if (expanding && !shelves[id]) fetchShelves(id);
    };

    const handleShelfClick = (shelf: Shelf) => {
        setSelectedShelf(shelf);
        setShelfUpcs([]);
    };

    // ── UPC toggle ───────────────────────────────────────────────────────────
    const toggleUpc = (upc: UPC) => {
        setDraftItems((prev) => {
            const idx = prev.findIndex((i) => i.productId === upc.productId);
            if (idx >= 0) {
                const item = prev[idx];
                const already = item.selectedUpcs.includes(upc.id);
                const updatedUpcs = already
                    ? item.selectedUpcs.filter((u) => u !== upc.id)
                    : [...item.selectedUpcs, upc.id];
                if (updatedUpcs.length === 0) return prev.filter((_, i) => i !== idx);
                return prev.map((item, i) =>
                    i === idx
                        ? { ...item, selectedUpcs: updatedUpcs, upcs: updatedUpcs, quantity: updatedUpcs.length }
                        : item,
                );
            }
            return [
                ...prev,
                {
                    productId: upc.productId,
                    sku: upc.productId,
                    hsn: '',
                    taxRate: 5,
                    unitPrice: 0,
                    quantity: 1,
                    upcs: [upc.id],
                    selectedUpcs: [upc.id],
                },
            ];
        });
    };

    const isUpcSelected = (id: string) => draftItems.some((i) => i.selectedUpcs.includes(id));

    const updateItemPrice = (productId: string, price: number) =>
        setDraftItems((prev) =>
            prev.map((i) => (i.productId === productId ? { ...i, unitPrice: price } : i)),
        );

    const totalItems = draftItems.reduce((a, i) => a + i.quantity, 0);
    const totalValue = draftItems.reduce((a, i) => a + i.quantity * i.unitPrice, 0);

    // ── Submit ───────────────────────────────────────────────────────────────
    const handleSubmit = async () => {
        if (!selectedParty) return;
        setSubmitting(true);
        setError(null);

        try {
            const firstShelfUpc = shelfUpcs.find((u) =>
                draftItems[0]?.selectedUpcs.includes(u.id)
            );

            const idToken = await user?.getIdToken();
            const res = await fetch('/api/business/warehouse/credit-notes/complete', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${idToken}`
                },
                body: JSON.stringify({
                    businessId,
                    partyId: selectedParty.id,
                    partyName: selectedParty.name,
                    warehouseId: firstShelfUpc?.warehouseId ?? '',
                    reason,
                    notes: notes || null,
                    items: draftItems.map(({ selectedUpcs: _s, ...rest }) => rest),
                    totalItems,
                    totalValue,
                }),
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed');
            onCreated();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setSubmitting(false);
        }
    };

    // ─────────────────────────────────────────────────────────────────────────

    return (
        // Backdrop
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            {/* Dialog */}
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col mx-4">

                {/* Dialog header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                    <div>
                        <h2 className="text-lg font-semibold">New Credit Note</h2>
                        <p className="text-xs text-gray-400 mt-0.5">
                            Step {STEPS.indexOf(step) + 1} of {STEPS.length} —{' '}
                            <span className="capitalize">{step}</span>
                        </p>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Step pills */}
                <div className="flex gap-1 px-6 pt-4">
                    {STEPS.map((s, i) => (
                        <div key={s} className="flex items-center gap-1">
                            <div
                                className={CN(
                                    'flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors',
                                    step === s
                                        ? 'bg-blue-600 text-white'
                                        : STEPS.indexOf(step) > i
                                            ? 'bg-green-100 text-green-700'
                                            : 'bg-gray-100 text-gray-400',
                                )}
                            >
                                <span>{i + 1}</span>
                                <span className="capitalize">{s}</span>
                            </div>
                            {i < STEPS.length - 1 && <span className="text-gray-300 text-xs">›</span>}
                        </div>
                    ))}
                </div>

                {/* Dialog body */}
                <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

                    {/* ── Step 1: Party ──────────────────────────────────────────────── */}
                    {step === 'party' && (
                        <>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Party (Supplier)</label>
                                <select
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                                    value={selectedParty?.id ?? ''}
                                    onChange={(e) => setSelectedParty(parties.find((p) => p.id === e.target.value) ?? null)}
                                >
                                    <option value="">Select a party</option>
                                    {parties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
                                <select
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                                    value={reason}
                                    onChange={(e) => setReason(e.target.value)}
                                >
                                    <option value="">Select a reason</option>
                                    {REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Notes <span className="text-gray-400">(optional)</span>
                                </label>
                                <textarea
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                                    rows={3}
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    placeholder="Any additional remarks..."
                                />
                            </div>
                        </>
                    )}

                    {/* ── Step 2: Items ──────────────────────────────────────────────── */}
                    {step === 'items' && (
                        <>
                            <p className="text-sm text-gray-500">
                                Navigate to a shelf to view and select shelved UPCs.
                            </p>

                            <div className="grid grid-cols-2 gap-3">
                                {/* Warehouse tree */}
                                <div className="border border-gray-200 rounded-lg overflow-auto max-h-72">
                                    {isLoadingWarehouses ? (
                                        <div className="p-4 text-sm text-gray-400 flex items-center gap-2">
                                            <Loader2 className="h-3 w-3 animate-spin" /> Loading...
                                        </div>
                                    ) : warehouses.length === 0 ? (
                                        <div className="p-4 text-sm text-gray-400">No warehouses.</div>
                                    ) : (
                                        <div className="py-1">
                                            {warehouses.map((w) => (
                                                <div key={w.id}>
                                                    <div
                                                        className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-gray-50 text-sm font-medium text-gray-800"
                                                        onClick={() => toggleWarehouse(w.id)}
                                                    >
                                                        <TreeChevron loading={loadingZones.has(w.id)} expanded={expandedWarehouses.has(w.id)} />
                                                        {w.name}
                                                    </div>
                                                    <AnimatePresence>
                                                        {expandedWarehouses.has(w.id) && (
                                                            <TreeSlide>
                                                                {zones[w.id]?.map((z) => (
                                                                    <div key={z.id}>
                                                                        <div
                                                                            className="flex items-center gap-2 py-2 px-3 cursor-pointer hover:bg-gray-50 text-sm text-gray-700"
                                                                            style={{ paddingLeft: '28px' }}
                                                                            onClick={() => toggleZone(z.id)}
                                                                        >
                                                                            <TreeChevron loading={loadingRacks.has(z.id)} expanded={expandedZones.has(z.id)} />
                                                                            {z.name}
                                                                        </div>
                                                                        <AnimatePresence>
                                                                            {expandedZones.has(z.id) && (
                                                                                <TreeSlide>
                                                                                    {racks[z.id]?.map((r) => (
                                                                                        <div key={r.id}>
                                                                                            <div
                                                                                                className="flex items-center gap-2 py-2 px-3 cursor-pointer hover:bg-gray-50 text-sm text-gray-700"
                                                                                                style={{ paddingLeft: '48px' }}
                                                                                                onClick={() => toggleRack(r.id)}
                                                                                            >
                                                                                                <TreeChevron loading={loadingShelves.has(r.id)} expanded={expandedRacks.has(r.id)} />
                                                                                                {r.name}
                                                                                            </div>
                                                                                            <AnimatePresence>
                                                                                                {expandedRacks.has(r.id) && (
                                                                                                    <TreeSlide>
                                                                                                        {shelves[r.id]?.map((s) => (
                                                                                                            <div
                                                                                                                key={s.id}
                                                                                                                className={CN(
                                                                                                                    'py-2 px-3 cursor-pointer text-sm transition-colors',
                                                                                                                    selectedShelf?.id === s.id
                                                                                                                        ? 'bg-blue-50 border-l-2 border-blue-500 text-blue-700 font-medium'
                                                                                                                        : 'hover:bg-gray-50 text-gray-600',
                                                                                                                )}
                                                                                                                style={{ paddingLeft: '68px' }}
                                                                                                                onClick={() => handleShelfClick(s)}
                                                                                                            >
                                                                                                                {s.name}
                                                                                                                {s.code && (
                                                                                                                    <code className="ml-1.5 text-xs text-gray-400 bg-gray-100 px-1 rounded">
                                                                                                                        {s.code}
                                                                                                                    </code>
                                                                                                                )}
                                                                                                            </div>
                                                                                                        ))}
                                                                                                        {shelves[r.id]?.length === 0 && (
                                                                                                            <div className="text-xs text-gray-400 italic py-1 px-3" style={{ paddingLeft: '68px' }}>No shelves</div>
                                                                                                        )}
                                                                                                    </TreeSlide>
                                                                                                )}
                                                                                            </AnimatePresence>
                                                                                        </div>
                                                                                    ))}
                                                                                    {racks[z.id]?.length === 0 && (
                                                                                        <div className="text-xs text-gray-400 italic py-1 px-3" style={{ paddingLeft: '48px' }}>No racks</div>
                                                                                    )}
                                                                                </TreeSlide>
                                                                            )}
                                                                        </AnimatePresence>
                                                                    </div>
                                                                ))}
                                                                {zones[w.id]?.length === 0 && (
                                                                    <div className="text-xs text-gray-400 italic py-1 px-3" style={{ paddingLeft: '28px' }}>No zones</div>
                                                                )}
                                                            </TreeSlide>
                                                        )}
                                                    </AnimatePresence>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Shelf UPCs */}
                                <div className="border border-gray-200 rounded-lg overflow-auto max-h-72">
                                    {!selectedShelf ? (
                                        <div className="p-6 text-sm text-gray-400 text-center mt-6">
                                            Select a shelf
                                        </div>
                                    ) : loadingShelfUpcs ? (
                                        <div className="p-4 text-sm text-gray-400 flex items-center gap-2">
                                            <Loader2 className="h-3 w-3 animate-spin" /> Loading UPCs...
                                        </div>
                                    ) : shelfUpcs.length === 0 ? (
                                        <div className="p-6 text-sm text-gray-400 text-center mt-6">
                                            No shelved UPCs on {selectedShelf.name}
                                        </div>
                                    ) : (
                                        <div>
                                            <div className="px-3 py-2 bg-gray-50 border-b border-gray-100 text-xs font-medium text-gray-500 uppercase sticky top-0">
                                                {selectedShelf.name} · {shelfUpcs.length} UPC{shelfUpcs.length !== 1 ? 's' : ''}
                                            </div>
                                            {Object.entries(
                                                shelfUpcs.reduce<Record<string, UPC[]>>((acc, upc) => {
                                                    (acc[upc.productId] ??= []).push(upc);
                                                    return acc;
                                                }, {}),
                                            ).map(([productId, upcs]) => (
                                                <div key={productId}>
                                                    <div className="px-3 py-1.5 bg-gray-50 border-y border-gray-100 text-xs font-semibold text-gray-600">
                                                        {upcs[0].productId}
                                                    </div>
                                                    {upcs.map((upc) => {
                                                        const selected = isUpcSelected(upc.id);
                                                        return (
                                                            <div
                                                                key={upc.id}
                                                                onClick={() => toggleUpc(upc)}
                                                                className={CN(
                                                                    'flex items-center justify-between px-4 py-2.5 cursor-pointer hover:bg-gray-50 transition-colors',
                                                                    selected && 'bg-blue-50',
                                                                )}
                                                            >
                                                                <code className="text-xs text-gray-600">{upc.id}</code>
                                                                <Checkbox checked={selected} />
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {draftItems.length > 0 && (
                                <div className="bg-blue-50 rounded-lg px-4 py-2.5 text-sm text-blue-800">
                                    {totalItems} UPC{totalItems !== 1 ? 's' : ''} selected across{' '}
                                    {draftItems.length} product{draftItems.length !== 1 ? 's' : ''}
                                </div>
                            )}
                        </>
                    )}

                    {/* ── Step 3: Confirm ────────────────────────────────────────────── */}
                    {step === 'confirm' && (
                        <>
                            <div className="bg-gray-50 rounded-lg px-4 py-3 text-sm space-y-1">
                                <div><span className="text-gray-500">Party:</span> <span className="font-medium">{selectedParty?.name}</span></div>
                                <div><span className="text-gray-500">Reason:</span> <span className="font-medium">{reason}</span></div>
                                {notes && <div><span className="text-gray-500">Notes:</span> {notes}</div>}
                            </div>

                            <div>
                                <p className="text-sm font-medium text-gray-700 mb-2">Set unit price (ex-tax) per product:</p>
                                <div className="border border-gray-200 rounded-lg divide-y">
                                    {draftItems.map((item) => (
                                        <div key={item.productId} className="px-4 py-3 flex items-center justify-between gap-4">
                                            <div className="flex-1 min-w-0">
                                                <div className="text-sm font-medium truncate">{item.productId}</div>
                                                <div className="text-xs text-gray-400 mt-0.5 truncate">
                                                    {item.quantity} UPC{item.quantity !== 1 ? 's' : ''} · {item.upcs.join(', ')}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2 flex-shrink-0">
                                                <span className="text-sm text-gray-500">₹</span>
                                                <input
                                                    type="number"
                                                    min={0}
                                                    step={0.01}
                                                    className="w-24 border border-gray-300 rounded px-2 py-1 text-sm text-right"
                                                    value={item.unitPrice || ''}
                                                    onChange={(e) => updateItemPrice(item.productId, Number(e.target.value))}
                                                    placeholder="0.00"
                                                />
                                                <span className="text-xs text-gray-400">/ unit</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="border-t pt-3 flex justify-between text-sm font-semibold">
                                <span>Total ({totalItems} UPCs)</span>
                                <span>₹{totalValue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                            </div>

                            {error && (
                                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                                    {error}
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* Dialog footer */}
                <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
                    <button
                        onClick={step === 'party' ? onClose : () => setStep(STEPS[STEPS.indexOf(step) - 1])}
                        className="px-4 py-2 rounded-lg border border-gray-300 text-sm hover:bg-gray-50 transition-colors"
                    >
                        {step === 'party' ? 'Cancel' : '← Back'}
                    </button>

                    {step !== 'confirm' ? (
                        <button
                            disabled={
                                step === 'party' ? (!selectedParty || !reason) : draftItems.length === 0
                            }
                            onClick={() => setStep(STEPS[STEPS.indexOf(step) + 1])}
                            className="bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-medium disabled:opacity-40 hover:bg-blue-700 transition-colors"
                        >
                            Next →
                        </button>
                    ) : (
                        <button
                            disabled={submitting || draftItems.some((i) => i.unitPrice <= 0)}
                            onClick={handleSubmit}
                            className="bg-green-600 text-white px-5 py-2 rounded-lg text-sm font-medium disabled:opacity-40 hover:bg-green-700 transition-colors"
                        >
                            {submitting ? (
                                <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Processing...</span>
                            ) : (
                                'Confirm & Complete'
                            )}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

// ─── Small helpers ────────────────────────────────────────────────────────────

function TreeChevron({ loading, expanded }: { loading: boolean; expanded: boolean }) {
    if (loading) return <Loader2 className="h-3 w-3 animate-spin text-gray-400 flex-shrink-0" />;
    return (
        <motion.div animate={{ rotate: expanded ? 90 : 0 }} transition={{ duration: 0.15 }} className="flex-shrink-0">
            <ChevronRight className="h-3 w-3 text-gray-400" />
        </motion.div>
    );
}

function TreeSlide({ children }: { children: React.ReactNode }) {
    return (
        <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            style={{ overflow: 'hidden' }}
        >
            {children}
        </motion.div>
    );
}

function Checkbox({ checked }: { checked: boolean }) {
    return (
        <div className={CN(
            'w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0',
            checked ? 'bg-blue-600 border-blue-600' : 'border-gray-300',
        )}>
            {checked && (
                <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
            )}
        </div>
    );
}