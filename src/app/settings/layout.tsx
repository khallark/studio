'use client';

import Link from 'next/link';
import { Home, Package, Settings, History, User, Smartphone, MapPin } from 'lucide-react';
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
import { auth } from '@/lib/firebase';
import { signOut } from 'firebase/auth';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { cn } from '@/lib/utils';

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user, loading] = useAuthState(auth);
  const router = useRouter();
  const pathname = usePathname();

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
  
  if (loading || !user) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  const navItems = [
    { href: '/settings', label: 'General', icon: User },
    { href: '/settings/apps', label: 'Apps', icon: Smartphone },
    { href: '/settings/pickup-locations', label: 'Pickup Locations', icon: MapPin },
  ];

  return (
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
                <SidebarMenuButton asChild isActive={pathname.startsWith('/dashboard/orders')}>
                  <Link href="/dashboard/orders">
                    <Package />
                    Orders
                  </Link>
                </SidebarMenuButton>
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
              <h1 className="font-headline font-semibold text-lg md:text-2xl">Settings</h1>
            </header>
            <main className="flex-1 overflow-hidden">
              <div className="grid md:grid-cols-[220px_1fr] lg:grid-cols-[280px_1fr] h-full">
                <div className="hidden border-r bg-muted/40 md:block">
                  <div className="flex h-full max-h-screen flex-col gap-2">
                    <div className="flex-1">
                      <nav className="grid items-start px-2 py-4 text-sm font-medium lg:px-4">
                        {navItems.map((item) => (
                           <Link
                            key={item.label}
                            href={item.href}
                            className={cn(
                                'flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-all hover:text-primary',
                                pathname === item.href && 'bg-muted text-primary'
                            )}
                            >
                            <item.icon className="h-4 w-4" />
                            {item.label}
                          </Link>
                        ))}
                      </nav>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col overflow-auto">
                    {children}
                </div>
              </div>
            </main>
        </div>
    </SidebarProvider>
  );
}
