// /business/[businessId]/inventory/layout.tsx
'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useParams, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Package,
    ArrowLeft,
    Sparkles,
    Warehouse,
    ChevronRight,
    Building2,
    Check,
    ChevronDown,
} from 'lucide-react';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import { useBusinessContext } from '../layout';

// ============================================================
// BUSINESS SWITCHER COMPONENT
// ============================================================

function BusinessSwitcher({
    businesses,
    currentBusinessId
}: {
    businesses: Array<{ id: string; name: string; currentlySelected: boolean }>;
    currentBusinessId: string;
}) {
    const [isOpen, setIsOpen] = useState(false);
    const pathname = usePathname();
    const dropdownRef = useRef<HTMLDivElement>(null);
    const router = useRouter();

    const currentBusiness = businesses.find(b => b.currentlySelected);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
            return () => document.removeEventListener('mousedown', handleClickOutside);
        }
    }, [isOpen]);

    const handleBusinessSwitch = (businessId: string) => {
        setIsOpen(false);
        const newPath = pathname.replace(/\/business\/[^\/]+/, `/business/${businessId}`);
        router.push(newPath);
    };

    if (!currentBusiness) return null;

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={cn(
                    "flex items-center gap-3 px-3 py-2.5 w-full rounded-xl transition-all duration-200",
                    "bg-gradient-to-r from-muted/80 to-muted/60",
                    "hover:from-muted hover:to-muted/80",
                    "border border-border/50 hover:border-border",
                    "group shadow-sm"
                )}
            >
                <div className="p-1.5 rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors">
                    <Building2 className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1 text-left min-w-0">
                    <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Business</p>
                    <p className="text-sm font-semibold text-foreground truncate">
                        {currentBusiness.name}
                    </p>
                </div>
                <ChevronDown
                    className={cn(
                        "w-4 h-4 text-muted-foreground/50 transition-transform duration-200",
                        isOpen && "rotate-180"
                    )}
                />
            </button>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: 8, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 8, scale: 0.96 }}
                        transition={{ duration: 0.15, ease: "easeOut" }}
                        className="absolute z-50 bottom-full mb-2 left-0 right-0 bg-popover/95 backdrop-blur-xl border border-border/50 rounded-xl shadow-xl shadow-black/10 overflow-hidden"
                    >
                        <div className="p-1.5">
                            <p className="px-2.5 py-2 text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
                                Switch Business
                            </p>
                            {businesses.map((business, index) => (
                                <motion.button
                                    key={business.id}
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: index * 0.03 }}
                                    onClick={() => handleBusinessSwitch(business.id)}
                                    disabled={business.currentlySelected}
                                    className={cn(
                                        "w-full px-2.5 py-2.5 flex items-center gap-3 rounded-lg transition-all duration-150 text-left",
                                        business.currentlySelected
                                            ? "bg-primary/10 cursor-default"
                                            : "hover:bg-accent cursor-pointer"
                                    )}
                                >
                                    <div className={cn(
                                        "p-1.5 rounded-md transition-colors",
                                        business.currentlySelected ? "bg-primary/20" : "bg-muted"
                                    )}>
                                        <Building2
                                            className={cn(
                                                "w-3.5 h-3.5",
                                                business.currentlySelected ? "text-primary" : "text-muted-foreground"
                                            )}
                                        />
                                    </div>
                                    <span className={cn(
                                        "flex-1 truncate text-sm font-medium",
                                        business.currentlySelected ? "text-primary" : "text-foreground"
                                    )}>
                                        {business.name}
                                    </span>
                                    {business.currentlySelected && (
                                        <div className="p-1 rounded-full bg-primary/20">
                                            <Check className="w-3 h-3 text-primary" />
                                        </div>
                                    )}
                                </motion.button>
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

// ============================================================
// NAV ITEM TYPE
// ============================================================

interface NavItem {
    label: string;
    href: string;
    icon: React.ElementType;
    description: string;
    badge?: string;
}

// ============================================================
// MAIN LAYOUT
// ============================================================

export default function InventoryLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const pathname = usePathname();
    const params = useParams();
    const businessId = params.businessId as string;
    const { joinedBusinesses } = useBusinessContext();

    const navItems: NavItem[] = [
        {
            label: 'Inventory',
            href: `/business/${businessId}/inventory`,
            icon: Package,
            description: 'Manage stock levels',
        },
    ];

    const isActive = (href: string) => {
        if (href === `/business/${businessId}/inventory`) {
            return pathname === href;
        }
        return pathname.startsWith(href);
    };

    return (
        <div className="flex h-[100vh]">
            {/* Side Menu */}
            <aside className="hidden lg:flex flex-col w-[280px] border-r bg-gradient-to-b from-background via-background to-muted/20">
                {/* Header */}
                <div className="p-6 border-b">
                    <div className="flex items-center gap-3">
                        <div className="relative">
                            <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full" />
                            <div className="relative p-2.5 rounded-xl bg-gradient-to-br from-primary to-primary/80 shadow-lg shadow-primary/25">
                                <Warehouse className="h-5 w-5 text-primary-foreground" />
                            </div>
                        </div>
                        <div>
                            <h2 className="font-semibold text-lg tracking-tight">Inventory</h2>
                            <p className="text-xs text-muted-foreground">Manage your stock</p>
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
                <div className="p-4 space-y-3 border-t">
                    {/* Business Switcher */}
                    {joinedBusinesses && joinedBusinesses.length > 1 && (
                        <BusinessSwitcher
                            businesses={joinedBusinesses}
                            currentBusinessId={businessId}
                        />
                    )}

                    {/* Pro Tip */}
                    <div className="p-4 rounded-xl bg-gradient-to-br from-primary/5 via-primary/10 to-primary/5 border border-primary/10">
                        <div className="flex items-start gap-3">
                            <div className="p-2 rounded-lg bg-primary/10 shrink-0">
                                <Sparkles className="h-4 w-4 text-primary" />
                            </div>
                            <div>
                                <p className="text-sm font-medium">Pro Tip</p>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                    Keep track of your stock levels to avoid overselling and ensure timely fulfillment.
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