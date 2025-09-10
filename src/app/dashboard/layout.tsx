
'use client';

import Link from 'next/link';
import { Home, Package, Settings, History, ChevronDown, MoveRight } from 'lucide-react';
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
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '@/lib/firebase';
import { signOut } from 'firebase/auth';
import { usePathname, useRouter } from 'next/navigation';
import React, { useEffect, useState, useCallback, ReactNode } from 'react';
import { useToast } from '@/hooks/use-toast';
import { ProcessingQueueProvider } from '@/contexts/processing-queue-context';
import { collection, doc, getDoc, getCountFromServer } from 'firebase/firestore';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

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
  const [user, loading] = useAuthState(auth);
  const router = useRouter();
  const pathname = usePathname();
  const { toast } = useToast();

  const [processingQueue, setProcessingQueue] = useState<ProcessingOrder[]>([]);

  const processAwbAssignments = useCallback(async (ordersToProcess: {id: string, name: string}[], pickupLocationId: string) => {
    if (!user) {
        toast({ title: "Authentication Error", description: "You must be logged in.", variant: "destructive" });
        return;
    }
    
    const userRef = doc(db, 'users', user.uid);
    const userDoc = await getDoc(userRef);
    if (!userDoc.exists() || !userDoc.data()?.activeAccountId) {
        toast({ title: "No Active Store", description: "Could not find an active store to process orders for.", variant: "destructive" });
        return;
    }
    const shopId = userDoc.data()?.activeAccountId;

    const queue: ProcessingOrder[] = ordersToProcess.map(o => ({ id: o.id, name: o.name, status: 'pending' }));
    setProcessingQueue(queue);

    toast({
        title: `AWB Assignment Started`,
        description: `Processing ${queue.length} order(s) in the background.`,
        action: (
            <Button variant="outline" size="sm" asChild>
                <Link href="/dashboard/orders/awb-processing">
                    View Progress
                    <MoveRight className="ml-2 h-4 w-4" />
                </Link>
            </Button>
        )
    });
    
    let processedCount = 0;
    for (let i = 0; i < queue.length; i++) {
        const orderId = queue[i].id;
        try {
            setProcessingQueue(prev => prev.map((item, index) => index === i ? { ...item, status: 'processing' } : item));
            
            const idToken = await user.getIdToken();
            const response = await fetch('/api/shopify/courier/assign-awb', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`
                },
                body: JSON.stringify({ 
                    shop: shopId,
                    orderId: orderId,
                    pickupLocationId,
                }),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.details || 'Failed to assign AWB');

            setProcessingQueue(prev => prev.map((item, index) => index === i ? { ...item, status: 'done' } : item));
            processedCount++;
        } catch (error) {
            console.error(`Failed to process order ${orderId}:`, error);
            const message = error instanceof Error ? error.message : 'Unknown error';
            setProcessingQueue(prev => prev.map((item, index) => index === i ? { ...item, status: 'error', message } : item));
        }
    }
    
    const awbsRef = collection(db, 'accounts', shopId, 'unused_awbs');
    const snapshot = await getCountFromServer(awbsRef);
    const unusedAwbsCount = snapshot.data().count;

    if (unusedAwbsCount < 100) {
       toast({
          title: "Low AWB Stock",
          description: `You have ${unusedAwbsCount} AWBs remaining. Automatically fetching more...`,
        });
        try {
            const idToken = await user.getIdToken();
            const response = await fetch('/api/shopify/courier/fetch-awbs', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`
                },
                body: JSON.stringify({ shop: shopId, count: 500 }),
            });
            const result = await response.json();
             if (!response.ok) throw new Error(result.details || 'Failed to fetch new AWBs');
             toast({
                title: "AWBs Refilled",
                description: `${result.count} new AWBs have been fetched.`
            });
        } catch (error) {
            console.error("Auto AWB fetch failed:", error);
            toast({
                title: "Auto-Fetch Failed",
                description: error instanceof Error ? error.message : 'Could not automatically fetch more AWBs.',
                variant: 'destructive',
            });
        }
    }

    setTimeout(() => {
        toast({
            title: "AWB Assignment Complete",
            description: `${processedCount} of ${ordersToProcess.length} order(s) are now Ready To Dispatch.`
        })
        // Do not clear the queue here, so the processing page can show the final state
        // setProcessingQueue([]); 
    }, 1000);

  }, [user, toast]);


  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);


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

  const getTitle = () => {
    if (pathname === '/dashboard/orders/awb-processing') return 'AWB Processing';
    if (pathname.startsWith('/dashboard/orders')) return 'Orders';
    if (pathname.startsWith('/dashboard/logs')) return 'Logs';

    switch (pathname) {
      case '/dashboard':
        return 'Dashboard';
      case '/dashboard/connect':
        return 'Connect your store';
      default:
        return 'Dashboard';
    }
  }
  
  if (loading || !user) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-lg">Loading...</div>
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
                    <SidebarMenuButton asChild isActive={pathname === '/dashboard'}>
                    <Link href="/dashboard">
                        <Home />
                        Dashboard
                    </Link>
                    </SidebarMenuButton>
                </SidebarMenuItem>
                 <SidebarMenuItem>
                    <Collapsible>
                        <CollapsibleTrigger asChild>
                            <SidebarMenuButton className="w-full justify-between pr-2" isActive={pathname.startsWith('/dashboard/orders')}>
                                <div className="flex items-center gap-2">
                                <Package />
                                Orders
                                </div>
                                <ChevronDown className="h-4 w-4 shrink-0 transition-transform duration-200" />
                            </SidebarMenuButton>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                            <SidebarMenuSub>
                                <SidebarMenuSubButton asChild isActive={pathname === '/dashboard/orders'} className={cn(pathname === '/dashboard/orders/awb-processing' && 'text-muted-foreground')}>
                                    <Link href="/dashboard/orders">All Orders</Link>
                                </SidebarMenuSubButton>
                                <SidebarMenuSubButton asChild isActive={pathname === '/dashboard/orders/awb-processing'}>
                                    <Link href="/dashboard/orders/awb-processing">AWB Processing</Link>
                                </SidebarMenuSubButton>
                            </SidebarMenuSub>
                        </CollapsibleContent>
                    </Collapsible>
                </SidebarMenuItem>
                <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={pathname.startsWith('/dashboard/logs')}>
                    <Link href="/dashboard/logs">
                        <History />
                        Logs
                    </Link>
                    </SidebarMenuButton>
                </SidebarMenuItem>
                </SidebarMenu>
            </SidebarContent>
            <SidebarFooter>
                <SidebarMenu>
                    <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={pathname.startsWith('/settings')}>
                        <Link href="/settings">
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
                        <AvatarImage src={user.photoURL ?? "https://placehold.co/32x32.png"} alt={user.displayName ?? "User"} data-ai-hint="user avatar" />
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
                <header className="flex h-14 items-center gap-4 border-b bg-muted/40 px-6 shrink-0 lg:h-[60px] lg:px-6">
                <SidebarTrigger />
                <h1 className="font-headline font-semibold text-lg md:text-2xl">{getTitle()}</h1>
                </header>
                <main className="flex-1 overflow-y-auto">
                    {children}
                </main>
            </div>
        </SidebarProvider>
    </ProcessingQueueProvider>
  );
}
