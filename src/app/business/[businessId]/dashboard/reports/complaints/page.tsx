// apps/web/src/app/business/[businessId]/complaints/page.tsx
'use client';

/**
 * Complaints
 * Path: /business/[businessId]/complaints
 *
 * Reads the list live via the client Firestore SDK (onSnapshot), and mutates
 * through the four /api/business/complaints/* routes with a Bearer token.
 *
 * IMPORTS TO VERIFY against your repo (paths only — logic is stable):
 *   - useBusinessAuthorization  → wherever your hook lives
 *   - db, auth (client firebase) → '@/lib/firebase'
 *   - useToast                   → your shadcn toast hook
 *   - the '@/components/ui/*'     → standard shadcn locations
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  collection,
  onSnapshot,
  orderBy,
  query,
} from 'firebase/firestore';
import {
  Plus,
  Upload,
  Search,
  CheckCircle2,
  Trash2,
  Loader2,
  Inbox,
} from 'lucide-react';

import { db } from '@/lib/firebase';
import { useToast } from '@/hooks/use-toast';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
} from '@/components/ui/dialog';

import type { Complaint } from '@/types/complaint';
import { useBusinessContext } from '../../../layout';

// ── helpers ────────────────────────────────────────────────────────────────

type StatusFilter = 'all' | 'open' | 'closed';

function fmtDate(ts: unknown): string {
  if (!ts) return '—';
  const anyTs = ts as { toDate?: () => Date; _seconds?: number; seconds?: number };
  const date =
    typeof anyTs.toDate === 'function'
      ? anyTs.toDate()
      : anyTs._seconds
        ? new Date(anyTs._seconds * 1000)
        : anyTs.seconds
          ? new Date(anyTs.seconds * 1000)
          : null;
  return date
    ? date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—';
}

// ── component ────────────────────────────────────────────────────────────────

export default function ComplaintsPage() {
  const params = useParams();
  const businessId = params?.businessId as string;

  const { isAuthorized, loading: authLoading, user } = useBusinessContext();
  const { toast } = useToast();

  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  // dialog state
  const [createOpen, setCreateOpen] = useState(false);
  const [closeTarget, setCloseTarget] = useState<Complaint | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Complaint | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);

  // ── live list ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!businessId || !isAuthorized) return;
    const q = query(
      collection(db, 'users', businessId, 'complaints'),
      orderBy('createdAt', 'desc'),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setComplaints(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Complaint, 'id'>) })),
        );
        setLoading(false);
      },
      (err) => {
        console.error('complaints snapshot error:', err);
        setLoading(false);
      },
    );
    return () => unsub();
  }, [businessId, isAuthorized]);

  // ── auth header for API calls ────────────────────────────────────────────
  async function authHeaders(): Promise<Record<string, string>> {
    const token = await user?.getIdToken();
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token ?? ''}`,
    };
  }

  // ── filtered view ────────────────────────────────────────────────────────
  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return complaints.filter((c) => {
      if (statusFilter !== 'all' && c.status !== statusFilter) return false;
      if (!term) return true;
      return (
        c.complaintNumber?.toLowerCase().includes(term) ||
        c.subject.toLowerCase().includes(term) ||
        (c.awb ?? '').toLowerCase().includes(term) ||
        (c.orderNumber ?? '').toLowerCase().includes(term)
      );
    });
  }, [complaints, search, statusFilter]);

  // ── bulk upload ──────────────────────────────────────────────────────────
  async function onBulkFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file later
    if (!file) return;

    setBusy(true);
    try {
      const token = await user?.getIdToken();
      const fd = new FormData();
      fd.append('businessId', businessId);
      fd.append('file', file);

      const res = await fetch('/api/business/complaints/bulk-create', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token ?? ''}` },
        body: fd,
      });

      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || 'Bulk upload failed.');
      }

      const created = res.headers.get('X-Bulk-Created') ?? '?';
      const failed = res.headers.get('X-Bulk-Failed') ?? '?';

      // Download the per-row result workbook.
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'complaints-bulk-result.xlsx';
      a.click();
      URL.revokeObjectURL(url);

      toast({
        title: 'Bulk upload finished',
        description: `${created} created, ${failed} failed. Result sheet downloaded.`,
      });
    } catch (err) {
      toast({
        title: 'Upload failed',
        description: err instanceof Error ? err.message : 'Unknown error.',
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  }

  // ── render ───────────────────────────────────────────────────────────────
  if (authLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!isAuthorized) {
    return <div className="p-6 text-sm text-muted-foreground">Not authorized for this business.</div>;
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Complaints</h1>
          <p className="text-sm text-muted-foreground">
            Open, track, and close customer complaints against orders and shipments.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.csv"
            className="hidden"
            onChange={onBulkFile}
          />
          {/* <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={busy}
          >
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            Bulk upload
          </Button> */}
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            New complaint
          </Button>
        </div>
      </div>

      {/* Controls */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search number, subject, AWB…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <div className="flex rounded-md border p-0.5">
          {(['all', 'open', 'closed'] as StatusFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={`rounded px-3 py-1 text-sm capitalize transition ${statusFilter === f
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
                }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[120px]">Number</TableHead>
              <TableHead>Subject</TableHead>
              <TableHead>AWB</TableHead>
              <TableHead>Order</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Opened</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={7}>
                    <div className="h-6 w-full animate-pulse rounded bg-muted" />
                  </TableCell>
                </TableRow>
              ))
            ) : visible.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7}>
                  <div className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
                    <Inbox className="h-8 w-8" />
                    <p className="text-sm">
                      {complaints.length === 0
                        ? 'No complaints yet. Open one to get started.'
                        : 'No complaints match your filters.'}
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              visible.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-mono text-xs">{c.complaintNumber ?? '—'}</TableCell>
                  <TableCell className="max-w-[280px] truncate font-medium">{c.subject}</TableCell>
                  <TableCell className="font-mono text-xs">{c.awb ?? '—'}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{c.orderNumber ?? '—'}</TableCell>
                  <TableCell>
                    <Badge variant={c.status === 'open' ? 'default' : 'secondary'} className="capitalize">
                      {c.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{fmtDate(c.createdAt)}</TableCell>
                  <TableCell className="text-right">
                    {c.status === 'open' ? (
                      <Button variant="ghost" size="sm" onClick={() => setCloseTarget(c)}>
                        <CheckCircle2 className="mr-1.5 h-4 w-4" />
                        Close
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setDeleteTarget(c)}
                      >
                        <Trash2 className="mr-1.5 h-4 w-4" />
                        Delete
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Dialogs */}
      {createOpen && (
        <CreateComplaintDialog
          onClose={() => setCreateOpen(false)}
          authHeaders={authHeaders}
          businessId={businessId}
          toast={toast}
        />
      )}
      {closeTarget && (
        <CloseComplaintDialog
          complaint={closeTarget}
          onClose={() => setCloseTarget(null)}
          authHeaders={authHeaders}
          businessId={businessId}
          toast={toast}
        />
      )}
      {deleteTarget && (
        <DeleteComplaintDialog
          complaint={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          authHeaders={authHeaders}
          businessId={businessId}
          toast={toast}
        />
      )}
    </div>
  );
}

// ── dialogs ──────────────────────────────────────────────────────────────────
// Using DialogContent only; a plain footer div is used instead of DialogFooter
// to avoid import-name issues. Swap in your DialogFooter if you prefer.

type ToastFn = ReturnType<typeof useToast>['toast'];
interface DialogBaseProps {
  onClose: () => void;
  authHeaders: () => Promise<Record<string, string>>;
  businessId: string;
  toast: ToastFn;
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium">
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </span>
      {children}
    </label>
  );
}

function CreateComplaintDialog({ onClose, authHeaders, businessId, toast }: DialogBaseProps) {
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [orderNumber, setOrderNumber] = useState('');
  const [awb, setAwb] = useState('');
  const [saving, setSaving] = useState(false);

  const canSubmit = subject.trim() && description.trim();

  async function submit() {
    if (!canSubmit) return;
    setSaving(true);
    try {
      const res = await fetch('/api/business/complaints/create', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({
          businessId,
          subject: subject.trim(),
          description: description.trim(),
          orderNumber: orderNumber.trim() || null,
          awb: awb.trim() || null,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Failed to open complaint.');
      toast({ title: 'Complaint opened', description: j.complaintNumber });
      onClose();
    } catch (err) {
      toast({
        title: 'Could not open complaint',
        description: err instanceof Error ? err.message : 'Unknown error.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">New complaint</h2>
          <DialogDescription>Open a complaint against an order or shipment.</DialogDescription>
        </div>
        <div className="space-y-4 py-2">
          <Field label="Subject" required>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Short summary" />
          </Field>
          <Field label="Description" required>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What went wrong?"
              rows={4}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="AWB">
              <Input value={awb} onChange={(e) => setAwb(e.target.value)} placeholder="Optional" />
            </Field>
            <Field label="Order number">
              <Input value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} placeholder="Optional" />
            </Field>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!canSubmit || saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Open complaint
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CloseComplaintDialog({
  complaint,
  onClose,
  authHeaders,
  businessId,
  toast,
}: DialogBaseProps & { complaint: Complaint }) {
  const [description1, setDescription1] = useState('');
  const [description2, setDescription2] = useState('');
  const [saving, setSaving] = useState(false);

  const canSubmit = description1.trim();

  async function submit() {
    if (!canSubmit) return;
    setSaving(true);
    try {
      const res = await fetch('/api/business/complaints/close', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({
          businessId,
          complaintId: complaint.id,
          description1: description1.trim(),
          description2: description2.trim() || null,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Failed to close complaint.');
      toast({ title: 'Complaint closed', description: complaint.complaintNumber ?? undefined });
      onClose();
    } catch (err) {
      toast({
        title: 'Could not close complaint',
        description: err instanceof Error ? err.message : 'Unknown error.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Close complaint</h2>
          <DialogDescription>
            {complaint.complaintNumber ?? 'Complaint'} — {complaint.subject}
          </DialogDescription>
        </div>
        <div className="space-y-4 py-2">
          <Field label="Resolution" required>
            <Textarea
              value={description1}
              onChange={(e) => setDescription1(e.target.value)}
              placeholder="How was it resolved?"
              rows={4}
            />
          </Field>
          <Field label="Additional notes">
            <Textarea
              value={description2}
              onChange={(e) => setDescription2(e.target.value)}
              placeholder="Optional"
              rows={3}
            />
          </Field>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!canSubmit || saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Close complaint
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DeleteComplaintDialog({
  complaint,
  onClose,
  authHeaders,
  businessId,
  toast,
}: DialogBaseProps & { complaint: Complaint }) {
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    try {
      const res = await fetch('/api/business/complaints/delete', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ businessId, complaintId: complaint.id }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Failed to delete complaint.');
      toast({ title: 'Complaint deleted' });
      onClose();
    } catch (err) {
      toast({
        title: 'Could not delete complaint',
        description: err instanceof Error ? err.message : 'Unknown error.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Delete complaint</h2>
          <DialogDescription>
            Permanently delete {complaint.complaintNumber ?? 'this complaint'}? This can't be undone.
          </DialogDescription>
        </div>
        <div className="flex justify-end gap-2 pt-4">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={submit} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Delete
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}