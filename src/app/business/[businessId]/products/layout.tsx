// /business/[businessId]/products/layout.tsx
'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import {
    Package,
    Store,
    ArrowLeft,
    Sparkles,
    Box,
    ChevronRight,
} from 'lucide-react';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip';

interface NavItem {
    label: string;
    href: string;
    icon: React.ElementType;
    description: string;
    badge?: string;
}

export default function ProductsLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const pathname = usePathname();
    const params = useParams();
    const businessId = params.businessId as string;

    const navItems: NavItem[] = [
        {
            label: 'Business Products',
            href: `/business/${businessId}/products`,
            icon: Package,
            description: 'Your product catalog',
        },
        {
            label: 'Store Products',
            href: `/business/${businessId}/products/from-store`,
            icon: Store,
            description: 'Synced from Shopify',
        },
    ];

    const isActive = (href: string) => {
        if (href === `/business/${businessId}/products`) {
            return pathname === href;
        }
        return pathname.startsWith(href);
    };

    return (
        <div className="flex h-full">
            {/* Side Menu */}
            <aside className="hidden lg:flex flex-col w-[280px] border-r bg-gradient-to-b from-background via-background to-muted/20">
                {/* Header */}
                <div className="p-6 border-b">
                    <div className="flex items-center gap-3">
                        <div className="relative">
                            <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full" />
                            <div className="relative p-2.5 rounded-xl bg-gradient-to-br from-primary to-primary/80 shadow-lg shadow-primary/25">
                                <Box className="h-5 w-5 text-primary-foreground" />
                            </div>
                        </div>
                        <div>
                            <h2 className="font-semibold text-lg tracking-tight">Products</h2>
                            <p className="text-xs text-muted-foreground">Manage your inventory</p>
                        </div>
                    </div>
                </div>

                {/* Navigation */}
                <nav className="flex-1 p-4 space-y-2">
                    {/* Back to Dashboard */}
                    <Link
                        href={`/business/${businessId}/dashboard/orders`}
                        className="group flex items-center gap-3 px-3 py-2.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all duration-200"
                    >
                        <div className="p-1.5 rounded-md bg-muted group-hover:bg-background transition-colors">
                            <ArrowLeft className="h-4 w-4" />
                        </div>
                        <span className="text-sm font-medium">Back to Dashboard</span>
                    </Link>

                    {/* Divider */}
                    <div className="relative py-4">
                        <div className="absolute inset-0 flex items-center px-3">
                            <div className="w-full border-t border-dashed" />
                        </div>
                        <div className="relative flex justify-center">
                            <span className="px-2 bg-background text-[10px] uppercase tracking-widest text-muted-foreground font-medium">
                                Sections
                            </span>
                        </div>
                    </div>

                    {/* Nav Items */}
                    <div className="space-y-1.5">
                        {navItems.map((item) => {
                            const active = isActive(item.href);
                            const Icon = item.icon;

                            return (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    className={cn(
                                        'group relative flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200',
                                        active
                                            ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/25'
                                            : 'hover:bg-muted/80 text-muted-foreground hover:text-foreground'
                                    )}
                                >
                                    {/* Active indicator glow */}
                                    {active && (
                                        <motion.div
                                            layoutId="activeNavGlow"
                                            className="absolute inset-0 bg-gradient-to-r from-primary via-primary to-primary/80 rounded-xl -z-10"
                                            transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                                        />
                                    )}

                                    {/* Icon */}
                                    <div
                                        className={cn(
                                            'p-2 rounded-lg transition-all duration-200',
                                            active
                                                ? 'bg-primary-foreground/20'
                                                : 'bg-muted group-hover:bg-background'
                                        )}
                                    >
                                        <Icon className="h-4 w-4" />
                                    </div>

                                    {/* Text */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-medium">{item.label}</span>
                                            {item.badge && (
                                                <span
                                                    className={cn(
                                                        'px-1.5 py-0.5 text-[10px] font-semibold rounded-full',
                                                        active
                                                            ? 'bg-primary-foreground/20 text-primary-foreground'
                                                            : 'bg-primary/10 text-primary'
                                                    )}
                                                >
                                                    {item.badge}
                                                </span>
                                            )}
                                        </div>
                                        <p
                                            className={cn(
                                                'text-xs truncate',
                                                active ? 'text-primary-foreground/70' : 'text-muted-foreground'
                                            )}
                                        >
                                            {item.description}
                                        </p>
                                    </div>

                                    {/* Arrow */}
                                    <ChevronRight
                                        className={cn(
                                            'h-4 w-4 opacity-0 -translate-x-2 transition-all duration-200',
                                            active
                                                ? 'opacity-100 translate-x-0'
                                                : 'group-hover:opacity-50 group-hover:translate-x-0'
                                        )}
                                    />
                                </Link>
                            );
                        })}
                    </div>
                </nav>

                {/* Footer */}
                <div className="p-4 border-t">
                    <div className="p-4 rounded-xl bg-gradient-to-br from-primary/5 via-primary/10 to-primary/5 border border-primary/10">
                        <div className="flex items-start gap-3">
                            <div className="p-2 rounded-lg bg-primary/10 shrink-0">
                                <Sparkles className="h-4 w-4 text-primary" />
                            </div>
                            <div>
                                <p className="text-sm font-medium">Pro Tip</p>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                    Map your business products to store variants for seamless order fulfillment.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </aside>

            {/* Mobile Top Navigation */}
            <div className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-xl border-b">
                <div className="flex items-center gap-2 p-3 overflow-x-auto scrollbar-hide">
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Link
                                    href={`/business/${businessId}/dashboard/orders`}
                                    className="shrink-0 p-2.5 rounded-lg bg-muted hover:bg-muted/80 transition-colors"
                                >
                                    <ArrowLeft className="h-4 w-4" />
                                </Link>
                            </TooltipTrigger>
                            <TooltipContent side="bottom">Back to Dashboard</TooltipContent>
                        </Tooltip>
                    </TooltipProvider>

                    <div className="h-6 w-px bg-border shrink-0" />

                    {navItems.map((item) => {
                        const active = isActive(item.href);
                        const Icon = item.icon;

                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={cn(
                                    'shrink-0 flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all duration-200',
                                    active
                                        ? 'bg-primary text-primary-foreground shadow-md shadow-primary/25'
                                        : 'bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80'
                                )}
                            >
                                <Icon className="h-4 w-4" />
                                <span className="whitespace-nowrap">{item.label}</span>
                            </Link>
                        );
                    })}
                </div>
            </div>

            {/* Main Content */}
            <main className="flex-1 overflow-auto lg:pt-0 pt-[60px]">
                {children}
            </main>
        </div>
    );
}