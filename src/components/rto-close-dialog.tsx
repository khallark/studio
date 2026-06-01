// components/rto-close-dialog.tsx

'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Order } from '@/types/order';

interface RtoCloseDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    order: Order | null;
    businessId: string | null;
    user: any;
    onSuccess?: () => void;
}

function normalizeVariantId(value: unknown): string | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return String(value);
    }

    if (typeof value === 'string' && value.trim() !== '') {
        return value.trim();
    }

    return null;
}

export function RtoCloseDialog({
    open,
    onOpenChange,
    order,
    businessId,
    user,
    onSuccess,
}: RtoCloseDialogProps) {
    const { toast } = useToast();
    const [selectedVariantIds, setSelectedVariantIds] = useState<Set<string>>(new Set());
    const [isSubmitting, setIsSubmitting] = useState(false);

    const lineItems = useMemo(() => {
        return Array.isArray(order?.raw?.line_items)
            ? order!.raw.line_items
            : [];
    }, [order]);

    useEffect(() => {
        if (!open || !order) {
            setSelectedVariantIds(new Set());
            return;
        }

        const initiallySelected = new Set<string>();

        for (const item of lineItems) {
            const variantId = normalizeVariantId(item?.variant_id);

            if (!variantId) continue;

            if (item?.rtoReceived === true) {
                initiallySelected.add(variantId);
            }
        }

        setSelectedVariantIds(initiallySelected);
    }, [open, order, lineItems]);

    const toggleVariant = (variantId: string, checked: boolean) => {
        setSelectedVariantIds((prev) => {
            const next = new Set(prev);

            if (checked) {
                next.add(variantId);
            } else {
                next.delete(variantId);
            }

            return next;
        });
    };

    const selectAll = () => {
        setSelectedVariantIds(
            new Set(
                lineItems
                    .map((item: any) => normalizeVariantId(item?.variant_id))
                    .filter((id: string | null): id is string => id !== null)
            )
        );
    };

    const clearAll = () => {
        setSelectedVariantIds(new Set());
    };

    const handleSubmit = async () => {
        if (!order || !businessId || !user) return;

        setIsSubmitting(true);

        try {
            const idToken = await user.getIdToken();

            const response = await fetch('/api/shopify/orders/rto-close', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${idToken}`,
                },
                body: JSON.stringify({
                    businessId,
                    shop: order.storeId,
                    orderId: order.id,
                    receivedVariantIds: Array.from(selectedVariantIds),
                }),
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.details || result.error || 'Failed to close RTO order.');
            }

            toast({
                title: 'RTO Order Closed',
                description: result.message || 'The order has been closed successfully.',
            });

            onOpenChange(false);
            onSuccess?.();
        } catch (error) {
            toast({
                title: 'RTO Close Failed',
                description: error instanceof Error ? error.message : 'An unknown error occurred.',
                variant: 'destructive',
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Close RTO Order</DialogTitle>
                    <DialogDescription>
                        Select the items that were actually received back. The order will be marked as RTO Closed.
                    </DialogDescription>
                </DialogHeader>

                {!order ? (
                    <div className="py-8 text-center text-sm text-muted-foreground">
                        No order selected.
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div className="rounded-md border p-3">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <p className="font-semibold">{order.name}</p>
                                    <p className="text-sm text-muted-foreground">{order.storeId}</p>
                                </div>

                                <Badge variant="outline">{order.customStatus}</Badge>
                            </div>
                        </div>

                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="text-sm font-semibold">Received Items</h3>
                                <p className="text-xs text-muted-foreground">
                                    {selectedVariantIds.size} of {lineItems.length} line item variant(s) selected.
                                </p>
                            </div>

                            <div className="flex gap-2">
                                <Button type="button" variant="outline" size="sm" onClick={clearAll} disabled={isSubmitting}>
                                    Clear
                                </Button>
                                <Button type="button" variant="outline" size="sm" onClick={selectAll} disabled={isSubmitting}>
                                    Select All
                                </Button>
                            </div>
                        </div>

                        <div className="max-h-[360px] overflow-y-auto rounded-md border">
                            {lineItems.length === 0 ? (
                                <div className="p-4 text-sm text-muted-foreground">
                                    No line items found for this order.
                                </div>
                            ) : (
                                <div className="divide-y">
                                    {lineItems.map((item: any, index: number) => {
                                        const variantId = normalizeVariantId(item?.variant_id);
                                        const checked = !!variantId && selectedVariantIds.has(variantId);

                                        return (
                                            <label
                                                key={`${variantId || 'missing'}-${index}`}
                                                className="flex cursor-pointer items-start gap-3 p-4 hover:bg-muted/50"
                                            >
                                                <Checkbox
                                                    checked={checked}
                                                    disabled={!variantId || isSubmitting}
                                                    onCheckedChange={(value) => {
                                                        if (!variantId) return;
                                                        toggleVariant(variantId, Boolean(value));
                                                    }}
                                                    className="mt-1"
                                                />

                                                <div className="min-w-0 flex-1">
                                                    <Label className="cursor-pointer font-medium">
                                                        {item?.name || item?.title || 'Unnamed item'}
                                                    </Label>

                                                    <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                                                        <span>Variant: {variantId || 'N/A'}</span>
                                                        <span>Qty: {item?.quantity ?? 1}</span>
                                                        {item?.sku && <span>SKU: {item.sku}</span>}
                                                    </div>
                                                </div>
                                            </label>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                <DialogFooter>
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                        disabled={isSubmitting}
                    >
                        Cancel
                    </Button>

                    <Button
                        type="button"
                        onClick={handleSubmit}
                        disabled={!order || isSubmitting}
                    >
                        {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Close this order
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}