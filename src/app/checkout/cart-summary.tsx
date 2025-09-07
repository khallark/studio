// app/checkout/cart-summary.tsx
"use client";

import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';

interface Props {
    sessionId: string;
}

// Sample data
const sampleCart = {
    items: [
        { id: 1, name: 'Classic Indigo Shirt', quantity: 1, price: 49.99, image: 'https://picsum.photos/100/100?random=1' },
        { id: 2, name: 'Violet Accent Scarf', quantity: 2, price: 19.99, image: 'https://picsum.photos/100/100?random=2' },
        { id: 3, name: 'Lavender Bliss T-Shirt', quantity: 1, price: 29.99, image: 'https://picsum.photos/100/100?random=3' },
    ],
    currency: 'USD'
};
const subtotal = sampleCart.items.reduce((acc, item) => acc + item.price * item.quantity, 0);
const shipping = 5.00;
const total = subtotal + shipping;


export default function CartSummary({ sessionId }: Props) {
    const [isOpen, setIsOpen] = useState(false);

    useEffect(() => {
        const resp = (async() => {
            const resp = await fetch("/apps/checkout/products-details", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ sessionId }), // just the session id
            })
            return await resp.json();
        })();
        console.log("cart details response", resp);
    })
    
    return (
        <div className="space-y-4">
            <h3 className="text-lg font-semibold">Order Summary</h3>
            <Sheet open={isOpen} onOpenChange={setIsOpen}>
                <div className="rounded-md border p-4 space-y-4">
                    <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Total</span>
                        <span className="font-semibold text-xl">
                             {new Intl.NumberFormat('en-US', { style: 'currency', currency: sampleCart.currency }).format(total)}
                        </span>
                    </div>
                    <SheetTrigger asChild>
                         <Button variant="link" className="p-0 h-auto">View cart details</Button>
                    </SheetTrigger>
                </div>

                <SheetContent className="flex flex-col">
                    <SheetHeader>
                        <SheetTitle>Your Cart</SheetTitle>
                    </SheetHeader>
                    <ScrollArea className="flex-1 -mx-6 px-6">
                        <div className="space-y-4">
                            {sampleCart.items.map(item => (
                                <div key={item.id} className="flex items-center gap-4">
                                    <Image src={item.image} alt={item.name} width={64} height={64} className="rounded-md border" data-ai-hint="product image" />
                                    <div className="flex-1">
                                        <p className="font-semibold">{item.name}</p>
                                        <p className="text-sm text-muted-foreground">Qty: {item.quantity}</p>
                                    </div>
                                    <p className="text-sm font-medium">
                                        {new Intl.NumberFormat('en-US', { style: 'currency', currency: sampleCart.currency }).format(item.price * item.quantity)}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </ScrollArea>
                    <Separator />
                    <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                            <span>Subtotal</span>
                            <span>{new Intl.NumberFormat('en-US', { style: 'currency', currency: sampleCart.currency }).format(subtotal)}</span>
                        </div>
                        <div className="flex justify-between">
                            <span>Shipping</span>
                             <span>{new Intl.NumberFormat('en-US', { style: 'currency', currency: sampleCart.currency }).format(shipping)}</span>
                        </div>
                         <Separator />
                        <div className="flex justify-between font-bold text-base">
                            <span>Total</span>
                            <span>{new Intl.NumberFormat('en-US', { style: 'currency', currency: sampleCart.currency }).format(total)}</span>
                        </div>
                    </div>
                </SheetContent>
            </Sheet>
        </div>
    )
}
