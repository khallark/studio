// /business/[businessId]/dashboard/layout.tsx
'use client';

import Link from 'next/link';
import {
  Home,
  Package,
  Settings,
  Users,
  ChevronDown,
  MoveRight,
  Building2,
  Check,
  Menu,
  X,
  UserPlus,
  Inbox,
  Shirt,
  BriefcaseBusiness,
  StoreIcon,
  LogOut,
  User,
  Sparkles,
  ChevronRight,
  Zap,
  Warehouse,
} from 'lucide-react';
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Logo } from '@/components/logo';
import { auth } from '@/lib/firebase';
import { signOut } from 'firebase/auth';
import { usePathname, useRouter } from 'next/navigation';
import React, { useCallback, useState, useRef, useEffect } from 'react';
import { ProcessingQueueProvider } from '@/contexts/processing-queue-context';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { useBusinessContext } from '../layout';
import { motion, AnimatePresence } from 'framer-motion';

const SUPER_ADMIN_ID = process.env.NEXT_PUBLIC_SUPER_ADMIN_ID!;

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
    <div className="relative px-3 pb-3" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex items-center gap-3 px-3 py-2.5 w-full rounded-xl transition-all duration-200",
          "bg-gradient-to-r from-sidebar-accent/60 to-sidebar-accent/40",
          "hover:from-sidebar-accent hover:to-sidebar-accent/60",
          "border border-sidebar-border/50 hover:border-sidebar-border",
          "group shadow-sm"
        )}
      >
        <div className="p-1.5 rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors">
          <Building2 className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1 text-left min-w-0">
          <p className="text-xs text-sidebar-foreground/60 font-medium">Current Business</p>
          <p className="text-sm font-semibold text-sidebar-foreground truncate">
            {currentBusiness.name}
          </p>
        </div>
        <ChevronDown
          className={cn(
            "w-4 h-4 text-sidebar-foreground/50 transition-transform duration-200",
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
            className="absolute z-50 bottom-full mb-2 left-3 right-3 bg-popover/95 backdrop-blur-xl border border-border/50 rounded-xl shadow-xl shadow-black/10 overflow-hidden"
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
// SIDEBAR CLOSE BUTTON
// ============================================================

function SidebarCloseButton() {
  const { toggleSidebar } = useSidebar();

  return (
    <Button
      variant="ghost"
      size="icon"
      className="md:hidden absolute top-4 right-4 h-8 w-8 rounded-lg hover:bg-sidebar-accent"
      onClick={toggleSidebar}
    >
      <X className="h-4 w-4" />
    </Button>
  );
}

// ============================================================
// NAV SECTION COMPONENT
// ============================================================

interface NavSectionProps {
  icon: React.ElementType;
  label: string;
  isActive: boolean;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

function NavSection({ icon: Icon, label, isActive, children, defaultOpen = false }: NavSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen || isActive);

  useEffect(() => {
    if (isActive) setIsOpen(true);
  }, [isActive]);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <SidebarMenuButton
          className={cn(
            "w-full justify-between pr-2 group/nav transition-all duration-200",
            isActive && "bg-sidebar-accent/50"
          )}
        >
          <div className="flex items-center gap-3">
            <div className={cn(
              "p-1.5 rounded-lg transition-all duration-200",
              isActive
                ? "bg-primary/15 text-primary"
                : "bg-sidebar-accent/50 text-sidebar-foreground/70 group-hover/nav:bg-sidebar-accent group-hover/nav:text-sidebar-foreground"
            )}>
              <Icon className="h-4 w-4" />
            </div>
            <span className={cn(
              "font-medium",
              isActive && "text-primary"
            )}>
              {label}
            </span>
          </div>
          <ChevronDown className={cn(
            "h-4 w-4 text-sidebar-foreground/50 transition-transform duration-200",
            isOpen && "rotate-180"
          )} />
        </SidebarMenuButton>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-1">
        <SidebarMenuSub className="border-l-2 border-sidebar-accent ml-[22px] pl-3 space-y-0.5">
          {children}
        </SidebarMenuSub>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ============================================================
// NAV ITEM COMPONENT
// ============================================================

interface NavItemProps {
  href: string;
  icon?: React.ElementType;
  label: string;
  isActive: boolean;
  badge?: string;
}

function NavItem({ href, icon: Icon, label, isActive, badge }: NavItemProps) {
  return (
    <SidebarMenuSubButton
      asChild
      className={cn(
        "relative transition-all duration-200 py-2",
        isActive
          ? "bg-primary/10 text-primary font-medium"
          : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
      )}
    >
      <Link href={href} className="flex items-center gap-2">
        {Icon && <Icon className="h-3.5 w-3.5" />}
        <span>{label}</span>
        {badge && (
          <span className={cn(
            "ml-auto px-1.5 py-0.5 text-[10px] font-semibold rounded-full",
            isActive ? "bg-primary/20 text-primary" : "bg-sidebar-accent text-sidebar-foreground/60"
          )}>
            {badge}
          </span>
        )}
        {isActive && (
          <motion.div
            layoutId="activeIndicator"
            className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 bg-primary rounded-full"
            transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
          />
        )}
      </Link>
    </SidebarMenuSubButton>
  );
}

// ============================================================
// MAIN LAYOUT
// ============================================================

export default function BusinessLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const businessAuth = useBusinessContext();
  const { isAuthorized, loading, user, stores, businessId, joinedBusinesses } = businessAuth;

  const handleLogout = async () => {
    await signOut(auth);
    router.push('/');
  };

  const getInitials = (name?: string | null, email?: string | null) => {
    if (name) {
      return name.split(' ').map((n) => n[0]).join('').slice(0, 2);
    }
    if (email) {
      return email.charAt(0).toUpperCase();
    }
    return 'U';
  };

  const processAwbAssignments = useCallback(async (
    ordersToProcess: { id: string, name: string, storeId: string }[],
    courier: string,
    pickupName: string,
    shippingMode: string
  ) => {
    if (!user) {
      toast({
        title: "Authentication Error",
        description: "You must be logged in.",
        variant: "destructive"
      });
      return;
    }

    if (!businessId) {
      toast({
        title: "Business Error",
        description: "Could not find business ID.",
        variant: "destructive"
      });
      return;
    }

    const ordersByStore = ordersToProcess.reduce((acc, order) => {
      const storeId = order.storeId;
      if (!storeId) {
        console.warn('Order missing storeId:', order);
        return acc;
      }
      if (!acc[storeId]) {
        acc[storeId] = [];
      }
      acc[storeId].push(order);
      return acc;
    }, {} as Record<string, typeof ordersToProcess>);

    const storeIds = Object.keys(ordersByStore);

    if (storeIds.length === 0) {
      toast({
        title: "No Valid Orders",
        description: "No orders with valid store IDs found.",
        variant: "destructive"
      });
      return;
    }

    const invalidStores = storeIds.filter(storeId => !stores.includes(storeId));
    if (invalidStores.length > 0) {
      toast({
        title: "Store Access Error",
        description: `Some orders are from stores not in this business.`,
        variant: "destructive"
      });
      return;
    }

    console.log(`Processing ${ordersToProcess.length} orders across ${storeIds.length} store(s)`);

    try {
      const idToken = await user.getIdToken();

      const apiCalls = storeIds.map(async (shopId) => {
        const storeOrders = ordersByStore[shopId];

        console.log(`Calling API for ${shopId} with ${storeOrders.length} orders`);

        const response = await fetch('/api/shopify/courier/assign-awb', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}`
          },
          body: JSON.stringify({
            businessId,
            shop: shopId,
            orders: storeOrders.map(o => ({ orderId: o.id, name: o.name })),
            courier,
            pickupName,
            shippingMode
          }),
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(`Store ${shopId}: ${result.details || result.error || 'Failed'}`);
        }

        return {
          shopId,
          count: storeOrders.length,
          success: true
        };
      });

      const results = await Promise.allSettled(apiCalls);

      const successful = results.filter(r => r.status === 'fulfilled');
      const failed = results.filter(r => r.status === 'rejected');

      console.log(`Results: ${successful.length} successful, ${failed.length} failed`);

      if (successful.length > 0) {
        const totalOrders = successful.reduce((sum, r) =>
          sum + (r.status === 'fulfilled' ? r.value.count : 0), 0
        );

        toast({
          title: `AWB Assignment Started`,
          description: `Processing ${totalOrders} order(s) from ${successful.length} store(s) in the background.`,
          action: (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/business/${businessId}/dashboard/orders/awb-processing`}>
                View Progress
                <MoveRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          )
        });
      }

      if (failed.length > 0) {
        const errorMessages = failed
          .map(r => r.status === 'rejected' ? r.reason.message : '')
          .join('\n');

        console.error('Failed stores:', errorMessages);

        toast({
          title: `${failed.length} Store(s) Failed`,
          description: successful.length > 0
            ? 'Some stores processed successfully. Check console for failed stores.'
            : 'All stores failed to process. Please try again.',
          variant: 'destructive',
        });
      }

    } catch (error) {
      console.error('Unexpected error in processAwbAssignments:', error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      toast({
        title: 'Assignment Failed',
        description: message,
        variant: 'destructive',
      });
    }

  }, [user, businessId, stores]);

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gradient-to-br from-background via-background to-muted/30">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-4"
        >
          <div className="relative">
            <div className="absolute inset-0 bg-primary/20 blur-2xl rounded-full animate-pulse" />
            <div className="relative p-4 rounded-2xl bg-gradient-to-br from-primary to-primary/80 shadow-xl shadow-primary/25">
              <Zap className="h-8 w-8 text-primary-foreground animate-pulse" />
            </div>
          </div>
          <p className="text-muted-foreground font-medium">Loading business...</p>
        </motion.div>
      </div>
    );
  }

  // Not authorized - show 404
  if (!isAuthorized) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-gradient-to-br from-background via-background to-muted/30">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center space-y-6"
        >
          <div className="relative inline-block">
            <div className="absolute inset-0 bg-destructive/10 blur-3xl rounded-full" />
            <h1 className="relative text-8xl font-bold bg-gradient-to-b from-muted-foreground/30 to-muted-foreground/10 bg-clip-text text-transparent">
              404
            </h1>
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-semibold">Business Not Found</h2>
            <p className="text-muted-foreground max-w-sm mx-auto">
              You don't have access to this business or it doesn't exist.
            </p>
          </div>
          <Button
            onClick={() => router.push('/')}
            className="gap-2 shadow-lg shadow-primary/20"
          >
            <Home className="h-4 w-4" />
            Go Home
          </Button>
        </motion.div>
      </div>
    );
  }

  const isSuperAdmin = businessId === SUPER_ADMIN_ID;

  return (
    <ProcessingQueueProvider
      businessId={businessId}
      processAwbAssignments={processAwbAssignments}
    >
      <SidebarProvider>
        <Sidebar className="border-r border-sidebar-border/50">
          <SidebarContent className="relative bg-gradient-to-b from-sidebar via-sidebar to-sidebar-accent/20">
            <SidebarCloseButton />

            {/* Header */}
            <SidebarHeader className="p-4 pb-6">
              <div className="flex items-center gap-3">
                <Logo />
              </div>
            </SidebarHeader>

            {/* Main Navigation */}
            <SidebarMenu className="px-3 space-y-1">
              {/* Dashboard */}
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  className={cn(
                    "group/item transition-all duration-200",
                    pathname === `/business/${businessId}/dashboard` && "bg-primary text-primary-foreground shadow-md shadow-primary/25"
                  )}
                >
                  <Link href={`/business/${businessId}/dashboard`} className="flex items-center gap-3">
                    <div className={cn(
                      "p-1.5 rounded-lg transition-all duration-200",
                      pathname === `/business/${businessId}/dashboard`
                        ? "bg-primary-foreground/20"
                        : "bg-sidebar-accent/50 group-hover/item:bg-sidebar-accent"
                    )}>
                      <Home className="h-4 w-4" />
                    </div>
                    <span className="font-medium">Dashboard</span>
                    {pathname === `/business/${businessId}/dashboard` && (
                      <ChevronRight className="h-4 w-4 ml-auto opacity-70" />
                    )}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>

              {/* Orders Section */}
              <SidebarMenuItem>
                <NavSection
                  icon={Package}
                  label="Orders"
                  isActive={pathname.startsWith(`/business/${businessId}/dashboard/orders`)}
                >
                  <NavItem
                    href={`/business/${businessId}/dashboard/orders`}
                    label="All Orders"
                    isActive={pathname === `/business/${businessId}/dashboard/orders`}
                  />
                  <NavItem
                    href={`/business/${businessId}/dashboard/orders/awb-processing`}
                    label="AWB Processing"
                    isActive={pathname === `/business/${businessId}/dashboard/orders/awb-processing`}
                  />
                </NavSection>
              </SidebarMenuItem>

              {/* Members Section */}
              <SidebarMenuItem>
                <NavSection
                  icon={Users}
                  label="Members"
                  isActive={pathname.startsWith(`/business/${businessId}/dashboard/members`)}
                >
                  {isSuperAdmin && (
                    <NavItem
                      href={`/business/${businessId}/dashboard/members/requests`}
                      icon={Inbox}
                      label="Requests"
                      isActive={pathname === `/business/${businessId}/dashboard/members/requests`}
                    />
                  )}
                  <NavItem
                    href={`/business/${businessId}/dashboard/members/invite`}
                    icon={UserPlus}
                    label="Invite"
                    isActive={pathname === `/business/${businessId}/dashboard/members/invite`}
                  />
                </NavSection>
              </SidebarMenuItem>

              {/* Products Section */}
              <SidebarMenuItem>
                <NavSection
                  icon={Shirt}
                  label="Products"
                  isActive={pathname.startsWith(`/business/${businessId}/products`)}
                >
                  <NavItem
                    href={`/business/${businessId}/products`}
                    icon={BriefcaseBusiness}
                    label="Business Products"
                    isActive={pathname === `/business/${businessId}/products`}
                  />
                  <NavItem
                    href={`/business/${businessId}/inventory`}
                    icon={Warehouse}
                    label="Inventory"
                    isActive={pathname === `/business/${businessId}/inventory`}
                  />
                </NavSection>
              </SidebarMenuItem>
            </SidebarMenu>

            {/* Spacer */}
            <div className="flex-1" />

            {/* Pro Tip Card */}
            <div className="px-3 pb-3">
              <div className="p-3 rounded-xl bg-gradient-to-br from-primary/5 via-primary/10 to-primary/5 border border-primary/10">
                <div className="flex items-start gap-2.5">
                  <div className="p-1.5 rounded-lg bg-primary/15 shrink-0">
                    <Sparkles className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-foreground">Quick Tip</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                      Use product mappings to auto-fill weights during fulfillment.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </SidebarContent>

          <SidebarFooter className="border-t border-sidebar-border/50 bg-sidebar-accent/30">
            {/* Business Switcher */}
            {joinedBusinesses && joinedBusinesses.length > 1 && (
              <BusinessSwitcher
                businesses={joinedBusinesses}
                currentBusinessId={businessId}
              />
            )}

            {/* Settings */}
            <SidebarMenu className="px-3">
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  className={cn(
                    "group/item transition-all duration-200",
                    pathname.startsWith(`/business/${businessId}/settings`) && "bg-sidebar-accent"
                  )}
                >
                  <Link href={`/business/${businessId}/settings`} className="flex items-center gap-3">
                    <div className={cn(
                      "p-1.5 rounded-lg transition-all duration-200",
                      pathname.startsWith(`/business/${businessId}/settings`)
                        ? "bg-primary/15 text-primary"
                        : "bg-sidebar-accent/50 group-hover/item:bg-sidebar-accent"
                    )}>
                      <Settings className="h-4 w-4" />
                    </div>
                    <span className="font-medium">Settings</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>

            {/* User Profile */}
            {user && (
              <div className="p-3 pt-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      className={cn(
                        "w-full justify-start gap-3 h-auto p-2.5 rounded-xl",
                        "bg-sidebar-accent/50 hover:bg-sidebar-accent",
                        "border border-transparent hover:border-sidebar-border/50",
                        "transition-all duration-200"
                      )}
                    >
                      <div className="relative">
                        <Avatar className="h-9 w-9 ring-2 ring-background shadow-sm">
                          <AvatarImage
                            src={user.photoURL ?? undefined}
                            alt={user.displayName ?? "User"}
                          />
                          <AvatarFallback className="bg-gradient-to-br from-primary to-primary/80 text-primary-foreground text-sm font-semibold">
                            {getInitials(user.displayName, user.email)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 rounded-full border-2 border-sidebar" />
                      </div>
                      <div className="text-left flex-1 min-w-0">
                        <p className="text-sm font-semibold leading-none truncate">
                          {user.displayName || 'User'}
                        </p>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          {user.email}
                        </p>
                      </div>
                      <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    className="w-64 p-2"
                    align="end"
                    side="top"
                    sideOffset={8}
                  >
                    <DropdownMenuLabel className="px-2 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={user.photoURL ?? undefined} />
                          <AvatarFallback className="bg-gradient-to-br from-primary to-primary/80 text-primary-foreground">
                            {getInitials(user.displayName, user.email)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold truncate">
                            {user.displayName || 'User'}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {user.email}
                          </p>
                        </div>
                      </div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="gap-2 py-2 cursor-pointer">
                      <User className="h-4 w-4" />
                      Profile
                    </DropdownMenuItem>
                    <DropdownMenuItem className="gap-2 py-2 cursor-pointer">
                      <Settings className="h-4 w-4" />
                      Preferences
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={handleLogout}
                      className="gap-2 py-2 cursor-pointer text-destructive focus:text-destructive focus:bg-destructive/10"
                    >
                      <LogOut className="h-4 w-4" />
                      Log out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
          </SidebarFooter>
        </Sidebar>

        <div className="flex flex-col flex-1 w-full h-screen overflow-hidden">
          {/* Mobile header */}
          <header className="md:hidden sticky top-0 z-50 flex items-center gap-3 border-b bg-background/80 backdrop-blur-xl px-4 py-3">
            <SidebarTrigger>
              <Button variant="ghost" size="icon" className="h-9 w-9">
                <Menu className="h-5 w-5" />
              </Button>
            </SidebarTrigger>
            <Logo />
          </header>

          <main className="flex-1 overflow-y-auto bg-gradient-to-br from-background via-background to-muted/20">
            {children}
          </main>
        </div>
      </SidebarProvider>
    </ProcessingQueueProvider>
  );
}