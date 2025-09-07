// app/checkout/cart-summary.tsx
"use client";

import React, { useMemo, useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ProductVariantNormalized {
  id: string;
  title?: string | null; // variant title (e.g., "Default", "Red / XL")
  price?: string | null; // admin Money scalar in shop currency, e.g. "19.99"
  compareAtPrice?: string | null;
  unitPrice?: { amount?: string | null; currencyCode?: string | null } | null;
  options?: Array<{ name: string; value: string }>;
  image?: { url: string; alt?: string | null } | null;
  product?: {
    title?: string | null;
    handle?: string | null;
    featuredImage?: { url: string; alt?: string | null } | null;
  } | null;
  // If you later persist quantity alongside variants in session, we will use it:
  quantity?: number;
}

interface Props {
  products: ProductVariantNormalized[];
}

export default function CartSummary({ products }: Props) {
  const [isOpen, setIsOpen] = useState(false);

  // Helpers
  const parseMoney = (s?: string | null) => (s ? Number.parseFloat(s) : 0);
  const currency =
    products.find((p) => p.unitPrice?.currencyCode)?.unitPrice?.currencyCode ??
    "INR"; // fallback; adjust if your shop currency differs

  const items = useMemo(() => {
    return (products || []).map((p) => {
      const name =
        `${p.product?.title ?? "Product"}` +
        (p.title && p.title.toLowerCase() !== "default"
          ? ` — ${p.title}`
          : "");

      const quantity = p.quantity && p.quantity > 0 ? p.quantity : 1;
      const unit =
        p.price != null && p.price !== ""
          ? parseMoney(p.price)
          : parseMoney(p.unitPrice?.amount ?? null);

      const lineTotal = unit * quantity;

      return {
        id: p.id,
        name,
        quantity,
        unitPrice: unit,
        lineTotal,
        currency,
        image: p.image?.url ?? p.product?.featuredImage?.url ?? "",
        imageAlt: p.image?.alt ?? p.product?.featuredImage?.alt ?? name,
        options: p.options ?? [],
      };
    });
  }, [products, currency]);

  const subtotal = useMemo(
    () => items.reduce((acc, it) => acc + it.lineTotal, 0),
    [items]
  );

  // If you have shipping/tax estimates, replace these:
  const shipping = 0;
  const total = subtotal + shipping;

  // Currency formatter (uses shop currency if available)
  const fmt = (amount: number) =>
    new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(
      Number.isFinite(amount) ? amount : 0
    );

  if (!products || products.length === 0) {
    return (
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Order Summary</h3>
        <div className="rounded-md border p-4">
          <p className="text-muted-foreground">Your cart is empty.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Order Summary</h3>

      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <div className="space-y-4 rounded-md border p-4">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Total</span>
            <span className="text-xl font-semibold">{fmt(total)}</span>
          </div>
          <SheetTrigger asChild>
            <Button variant="link" className="h-auto p-0">
              View cart details
            </Button>
          </SheetTrigger>
        </div>

        <SheetContent className="flex flex-col">
          <SheetHeader>
            <SheetTitle>Your Cart</SheetTitle>
          </SheetHeader>

          <ScrollArea className="flex-1 -mx-6 px-6">
            <div className="space-y-4">
              {items.map((item) => (
                <div key={item.id} className="flex items-center gap-4">
                  {item.image ? (
                    <Image
                      src={item.image}
                      alt={item.imageAlt}
                      width={64}
                      height={64}
                      className="rounded-md border"
                      data-ai-hint="product image"
                    />
                  ) : (
                    <div className="h-16 w-16 rounded-md border bg-muted/40" />
                  )}
                  <div className="flex-1">
                    <p className="font-semibold">{item.name}</p>
                    {!!item.options.length && (
                      <p className="text-xs text-muted-foreground">
                        {item.options.map((o) => `${o.name}: ${o.value}`).join(" · ")}
                      </p>
                    )}
                    <p className="text-sm text-muted-foreground">Qty: {item.quantity}</p>
                  </div>
                  <p className="text-sm font-medium">{fmt(item.lineTotal)}</p>
                </div>
              ))}
            </div>
          </ScrollArea>

          <Separator />

          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span>{fmt(subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span>Shipping</span>
              <span>{fmt(shipping)}</span>
            </div>
            <Separator />
            <div className="flex justify-between text-base font-bold">
              <span>Total</span>
              <span>{fmt(total)}</span>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
