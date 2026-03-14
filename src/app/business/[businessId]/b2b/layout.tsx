'use client';

// /business/[businessId]/b2b/layout.tsx

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useBusinessContext } from '../layout';
import { cn } from '@/lib/utils';
import { Loader2, Factory } from 'lucide-react';
import {
    LayoutGrid,
    Package,
    Boxes,
    Truck,
    Users,
    Layers,
    Settings2,
    ClipboardList,
} from 'lucide-react';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';

const NAV_ITEMS = [
    { href: 'orders', label: 'Orders', icon: ClipboardList },
    { href: 'kanban', label: 'Kanban', icon: LayoutGrid },
    { href: 'lots', label: 'Lots', icon: Layers },
    { href: 'stock', label: 'Stock', icon: Boxes },
    { href: 'dispatch', label: 'Dispatch Queue', icon: Truck },
    { href: 'buyers', label: 'Buyers', icon: Users },
    { href: 'products', label: 'Products', icon: Package },
    { href: 'bom', label: 'BOM', icon: Layers },
    { href: 'stages', label: 'Stages', icon: Settings2 },
];

export default function B2BLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const { isAuthorized, loading, businessId } = useBusinessContext();

    if (loading) {
        return (
            <div className="flex items-center justify-center h-screen">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
        );
    }

    if (!isAuthorized) return null;

    const base = `/business/${businessId}/b2b`;

    return (
        <div className="flex flex-col h-full">
            {/* B2B Header */}
            <div className="shrink-0 border-b bg-card sticky top-0 z-20">
                <div className="flex items-center gap-3 px-4 pt-4 pb-0">
                    <div className="p-1.5 rounded-lg bg-primary/10">
                        <Factory className="h-4 w-4 text-primary" />
                    </div>
                    <h2 className="text-sm font-semibold text-primary">B2B Manufacturing</h2>
                </div>

                {/* Nav Tabs */}
                <ScrollArea className="w-full">
                    <div className="flex px-4 pt-3 gap-0.5">
                        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
                            const fullHref = `${base}/${href}`;
                            const isActive = pathname === fullHref || pathname.startsWith(`${fullHref}/`);
                            return (
                                <Link
                                    key={href}
                                    href={fullHref}
                                    className={cn(
                                        'flex items-center gap-2 px-3 py-2 text-sm font-medium border-b-2 transition-all whitespace-nowrap',
                                        isActive
                                            ? 'border-primary text-primary'
                                            : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
                                    )}
                                >
                                    <Icon className="h-3.5 w-3.5" />
                                    {label}
                                </Link>
                            );
                        })}
                    </div>
                    <ScrollBar orientation="horizontal" className="h-1" />
                </ScrollArea>
            </div>

            {/* Page Content */}
            <div className="flex-1 overflow-y-auto">
                {children}
            </div>
        </div>
    );
}