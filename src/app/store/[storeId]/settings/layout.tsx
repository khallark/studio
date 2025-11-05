// /store/[storeId]/settings/layout.tsx

'use client';

import Link from 'next/link';
import { Home, User, Smartphone, MapPin, FileText } from 'lucide-react';
import {
  SidebarProvider,
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
import { auth } from '@/lib/firebase';
import { signOut } from 'firebase/auth';
import { usePathname, useRouter, useParams } from 'next/navigation';
import { useEffect } from 'react';
import { cn } from '@/lib/utils';
import { useStoreAuthorization } from '@/hooks/use-store-authorization';

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const params = useParams();
  const storeId = params?.storeId as string;

  const { isAuthorized, loading: authLoading, user } = useStoreAuthorization(storeId);

  useEffect(() => {
    document.title = "Settings";
  })

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
  
  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  if (!isAuthorized) {
    return null;
  }

  const navItems = [
    { href: `/store/${storeId}/dashboard`, label: 'Back to Dashboard', icon: Home },
    { href: `/store/${storeId}/settings`, label: 'Store Details', icon: User },
    { href: `/store/${storeId}/settings/apps`, label: 'Apps & Integrations', icon: Smartphone },
    { href: `/store/${storeId}/settings/pickup-locations`, label: 'Pickup Locations', icon: MapPin },
    { href: `/store/${storeId}/settings/slip-designer`, label: 'Slip Designer', icon: FileText },
  ];

  return (
     <SidebarProvider>
        <div className="flex flex-col flex-1 w-full h-screen overflow-hidden">   
            <main className="flex-1 overflow-hidden">
              <div className="grid md:grid-cols-[220px_1fr] lg:grid-cols-[280px_1fr] h-full">
                <div className="hidden border-r bg-muted/40 md:block">
                  <div className="flex h-full max-h-screen flex-col gap-2">
                    <div className="flex-1">
                        <header className="flex h-14 items-center gap-4 px-6 shrink-0 lg:h-[60px] lg:px-6">
                          <h1 className="font-headline font-semibold text-lg md:text-2xl">Settings</h1>
                        </header>
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