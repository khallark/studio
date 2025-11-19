// /business/[businessId]/dashboard/layout.tsx
'use client';

import Link from 'next/link';
import { Home, Package, Settings, Users, ChevronDown, History, MoveRight, Building2, Check } from 'lucide-react';
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

function BusinessSwitcher({
  businesses,
  currentBusinessId
}: {
  businesses: Array<{ id: string; name: string; currentlySelected: boolean }>;
  currentBusinessId: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const currentBusiness = businesses.find(b => b.currentlySelected);

  // Close dropdown when clicking outside
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
    router.push(`/business/${businessId}/dashboard/orders`);
  };

  if (!currentBusiness || businesses.length <= 1) return null;

  return (
    <div className="relative px-2 py-2" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 bg-sidebar-accent/50 hover:bg-sidebar-accent rounded-md transition-colors w-full group"
      >
        <Building2 className="w-4 h-4 text-sidebar-foreground/70 flex-shrink-0" />
        <span className="font-medium text-sm text-sidebar-foreground truncate flex-1 text-left">
          {currentBusiness.name}
        </span>
        <ChevronDown
          className={cn(
            "w-4 h-4 text-sidebar-foreground/70 flex-shrink-0 transition-transform",
            isOpen && "rotate-180"
          )}
        />
      </button>

      {isOpen && (
        <div className="absolute z-50 mt-1 left-2 right-2 bg-popover border border-border rounded-md shadow-lg max-h-[280px] overflow-y-auto">
          <div className="py-1">
            {businesses.map((business) => (
              <button
                key={business.id}
                onClick={() => handleBusinessSwitch(business.id)}
                disabled={business.currentlySelected}
                className={cn(
                  "w-full px-3 py-2 flex items-center gap-2 transition-colors text-left text-sm",
                  business.currentlySelected
                    ? "bg-accent/50 cursor-default text-muted-foreground"
                    : "hover:bg-accent cursor-pointer text-foreground"
                )}
              >
                <Building2
                  className={cn(
                    "w-4 h-4 flex-shrink-0",
                    business.currentlySelected ? "text-muted-foreground" : "text-foreground/70"
                  )}
                />
                <span
                  className={cn(
                    "flex-1 truncate",
                    business.currentlySelected && "font-semibold"
                  )}
                >
                  {business.name}
                </span>
                {business.currentlySelected && (
                  <Check className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

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
      return name.split(' ').map((n) => n[0]).join('');
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
      <div className="flex items-center justify-center h-screen">
        <div className="text-lg">Loading business...</div>
      </div>
    );
  }

  // Not authorized - show 404
  if (!isAuthorized) {
    return (
      <div className="flex flex-col items-center justify-center h-screen">
        <div className="text-center space-y-4">
          <h1 className="text-6xl font-bold text-gray-300">404</h1>
          <h2 className="text-2xl font-semibold text-gray-700">Business Not Found</h2>
          <p className="text-gray-500">You don't have access to this business.</p>
          <Button onClick={() => router.push('/')}>Go Home</Button>
        </div>
      </div>
    );
  }

  return (
    <>
      <ProcessingQueueProvider
        businessId={businessId}
        processAwbAssignments={processAwbAssignments}
      >
        <SidebarProvider>
          <Sidebar>
            <SidebarContent>
              <SidebarHeader>
                <Logo />
              </SidebarHeader>

              {/* Business Switcher */}
              {joinedBusinesses && joinedBusinesses.length > 1 && (
                <BusinessSwitcher
                  businesses={joinedBusinesses}
                  currentBusinessId={businessId}
                />
              )}

              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === `/business/${businessId}/dashboard`}
                  >
                    <Link href={`/business/${businessId}/dashboard`}>
                      <Home />
                      Dashboard
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <Collapsible>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton className="w-full justify-between pr-2" isActive={pathname.startsWith(`/business/${businessId}/dashboard/orders`)}>
                        <div className="flex items-center gap-2">
                          <Package />
                          Orders
                        </div>
                        <ChevronDown className="h-4 w-4 shrink-0 transition-transform duration-200" />
                      </SidebarMenuButton>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <SidebarMenuSub>
                        <SidebarMenuSubButton
                          asChild
                          isActive={pathname === `/business/${businessId}/dashboard/orders`}
                          className={cn(pathname === '/dashboard/orders/awb-processing' && 'text-muted-foreground')}
                        >
                          <Link href={`/business/${businessId}/dashboard/orders`}>All Orders</Link>
                        </SidebarMenuSubButton>
                        <SidebarMenuSubButton
                          asChild
                          isActive={pathname === `/business/${businessId}/dashboard/orders/awb-processing`}>
                          <Link href={`/business/${businessId}/dashboard/orders/awb-processing`}>AWB Processing</Link>
                        </SidebarMenuSubButton>
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  </Collapsible>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarContent>

            <SidebarFooter>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname.startsWith(`/business/${businessId}/settings`)}
                  >
                    <Link href={`/business/${businessId}/settings`}>
                      <Settings />
                      Settings
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
              {user && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="justify-start gap-3 w-full px-2 h-12">
                      <Avatar className="h-8 w-8">
                        <AvatarImage
                          src={user.photoURL ?? "https://picsum.photos/seed/user/32/32"}
                          alt={user.displayName ?? "User"}
                        />
                        <AvatarFallback>{getInitials(user.displayName, user.email)}</AvatarFallback>
                      </Avatar>
                      <div className="text-left">
                        <p className="text-sm font-medium leading-none">
                          {user.displayName || 'User Name'}
                        </p>
                        <p className="text-xs leading-none text-muted-foreground">
                          {user.email}
                        </p>
                      </div>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-56" align="end" forceMount>
                    <DropdownMenuLabel className="font-normal">
                      <div className="flex flex-col space-y-1">
                        <p className="text-sm font-medium leading-none">
                          {user.displayName || 'User Name'}
                        </p>
                        <p className="text-xs leading-none text-muted-foreground">
                          {user.email}
                        </p>
                      </div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem>Profile</DropdownMenuItem>
                    <DropdownMenuItem>Settings</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleLogout} className="cursor-pointer">
                      Log out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </SidebarFooter>
          </Sidebar>

          <div className="flex flex-col flex-1 w-full h-screen overflow-hidden">
            <main className="flex-1 overflow-y-auto">
              {children}
            </main>
          </div>
        </SidebarProvider>
      </ProcessingQueueProvider>
    </>
  );
}