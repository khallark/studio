// /store/[storeId]/dashboard/layout.tsx

'use client';

import Link from 'next/link';
import { Home, Package, Settings, History, ChevronDown, MoveRight, UserPlus } from 'lucide-react';
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
  SidebarTrigger,
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
import { auth, db } from '@/lib/firebase';
import { signOut } from 'firebase/auth';
import { usePathname, useRouter, useParams } from 'next/navigation';
import React, { useEffect, useState, useCallback, ReactNode } from 'react';
import { useToast } from '@/hooks/use-toast';
import { ProcessingQueueProvider } from '@/contexts/processing-queue-context';
import { doc, getDoc } from 'firebase/firestore';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { useStoreAuthorization } from '@/hooks/use-store-authorization';

export interface ProcessingOrder {
    id: string;
    name: string;
    status: 'pending' | 'processing' | 'done' | 'error';
    message?: string;
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams();
  const { toast } = useToast();
  const nonPrefixedStoreId = params?.storeId as string;

  const { isAuthorized, memberRole, loading, user, storeId } = useStoreAuthorization(nonPrefixedStoreId);

  const [processingQueue, setProcessingQueue] = useState<ProcessingOrder[]>([]);

  const processAwbAssignments = useCallback(async (
    ordersToProcess: {id: string, name: string}[], 
    courier: string,
    pickupName: string,
    shippingMode: string
  ) => {
    if (!user) {
        toast({ title: "Authentication Error", description: "You must be logged in.", variant: "destructive" });
        return;
    }
    
    if (!storeId) {
        toast({ title: "No Store Selected", description: "Could not determine the store.", variant: "destructive" });
        return;
    }

    try {
        const idToken = await user.getIdToken();
        const response = await fetch('/api/shopify/courier/assign-awb', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${idToken}`
            },
            body: JSON.stringify({ 
                shop: storeId,
                orders: ordersToProcess.map(o => ({ orderId: o.id, name: o.name })),
                courier,
                pickupName,
                shippingMode
            }),
        });

        const result = await response.json();
        if (!response.ok) throw new Error(result.details || 'Failed to start AWB assignment');

        toast({
            title: `AWB Assignment Started`,
            description: `Processing ${ordersToProcess.length} order(s) in the background.`,
            action: (
                <Button variant="outline" size="sm" asChild>
                    <Link href={`/store/${storeId}/dashboard/orders/awb-processing`}>
                        View Progress
                        <MoveRight className="ml-2 h-4 w-4" />
                    </Link>
                </Button>
            )
        });

    } catch (error) {
        console.error('Failed to start processing batch:', error);
        const message = error instanceof Error ? error.message : 'Unknown error';
        toast({
            title: 'Assignment Failed',
            description: message,
            variant: 'destructive',
        });
    }

  }, [user, toast, storeId]);

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
  }
  
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  if (!isAuthorized) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
          <p className="text-muted-foreground mb-4">You do not have access to this store.</p>
          <Button onClick={() => router.push('/dashboard')}>Go to Dashboard</Button>
        </div>
      </div>
    );
  }

  return (
     <ProcessingQueueProvider 
        processAwbAssignments={processAwbAssignments}
        processingQueue={processingQueue}
     >
        <SidebarProvider>
            <Sidebar>
            <SidebarContent>
                <SidebarHeader>
                <Logo />
                </SidebarHeader>
                <SidebarMenu>
                <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={pathname === `/store/${storeId}/dashboard`}>
                    <Link href={`/store/${storeId}/dashboard`}>
                        <Home />
                        Dashboard
                    </Link>
                    </SidebarMenuButton>
                </SidebarMenuItem>
                 <SidebarMenuItem>
                    <Collapsible>
                        <CollapsibleTrigger asChild>
                            <SidebarMenuButton className="w-full justify-between pr-2" isActive={pathname.startsWith(`/store/${storeId}/dashboard/orders`)}>
                                <div className="flex items-center gap-2">
                                <Package />
                                Orders
                                </div>
                                <ChevronDown className="h-4 w-4 shrink-0 transition-transform duration-200" />
                            </SidebarMenuButton>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                            <SidebarMenuSub>
                                <SidebarMenuSubButton asChild isActive={pathname === `/store/${storeId}/dashboard/orders`} className={cn(pathname === `/store/${storeId}/dashboard/orders/awb-processing` && 'text-muted-foreground')}>
                                    <Link href={`/store/${storeId}/dashboard/orders`}>All Orders</Link>
                                </SidebarMenuSubButton>
                                <SidebarMenuSubButton asChild isActive={pathname === `/store/${storeId}/dashboard/orders/awb-processing`}>
                                    <Link href={`/store/${storeId}/dashboard/orders/awb-processing`}>AWB Processing</Link>
                                </SidebarMenuSubButton>
                            </SidebarMenuSub>
                        </CollapsibleContent>
                    </Collapsible>
                </SidebarMenuItem>
                <SidebarMenuItem>
                    <Collapsible>
                        <CollapsibleTrigger asChild>
                            <SidebarMenuButton className="w-full justify-between pr-2" isActive={pathname.startsWith(`/store/${storeId}/dashboard/members`)}>
                                <div className="flex items-center gap-2">
                                <UserPlus />
                                Members
                                </div>
                                <ChevronDown className="h-4 w-4 shrink-0 transition-transform duration-200" />
                            </SidebarMenuButton>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                            <SidebarMenuSub>
                                <SidebarMenuSubButton asChild isActive={pathname === `/store/${storeId}/dashboard/members/invite`}>
                                    <Link href={`/store/${storeId}/dashboard/members/invite`}>Invite Member</Link>
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
                    <SidebarMenuButton asChild isActive={pathname.startsWith(`/store/${storeId}/settings`)}>
                        <Link href={`/store/${storeId}/settings`}>
                        <Settings />
                        Settings
                        </Link>
                    </SidebarMenuButton>
                    </SidebarMenuItem>
                </SidebarMenu>

                {user && !loading && (
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="justify-start gap-3 w-full px-2 h-12">
                        <Avatar className="h-8 w-8">
                        <AvatarImage src={user.photoURL ?? "https://picsum.photos/seed/user/32/32"} alt={user.displayName ?? "User"} data-ai-hint="user avatar" />
                        <AvatarFallback>{getInitials(user.displayName, user.email)}</AvatarFallback>
                        </Avatar>
                        <div className="text-left">
                        <p className="text-sm font-medium leading-none">{user.displayName || 'User Name'}</p>
                        <p className="text-xs leading-none text-muted-foreground">
                            {user.email}
                        </p>
                        </div>
                    </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-56" align="end" forceMount>
                    <DropdownMenuLabel className="font-normal">
                        <div className="flex flex-col space-y-1">
                        <p className="text-sm font-medium leading-none">{user.displayName || 'User Name'}</p>
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
  );
}