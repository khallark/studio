// /business/[businessId]/settings/layout.tsx

'use client';

import Link from 'next/link';
import { Home, User, Smartphone, MapPin, FileText, Building2, Check, ChevronDown, Menu, X } from 'lucide-react';
import {
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { auth } from '@/lib/firebase';
import { signOut } from 'firebase/auth';
import { usePathname, useRouter } from 'next/navigation';
import React, { useEffect, useState, useRef } from 'react';
import { cn } from '@/lib/utils';
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

  if (!currentBusiness) return null;

  return (
    <div className="relative px-4 pb-2" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 bg-muted hover:bg-muted/80 rounded-md transition-colors w-full group"
      >
        <Building2 className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        <span className="font-medium text-sm truncate flex-1 text-left">
          {currentBusiness.name}
        </span>
        <ChevronDown
          className={cn(
            "w-4 h-4 text-muted-foreground flex-shrink-0 transition-transform",
            isOpen && "rotate-180"
          )}
        />
      </button>

      {isOpen && (
        <div className="absolute z-50 bottom-full mb-1 left-4 right-4 bg-popover border border-border rounded-md shadow-lg max-h-[280px] overflow-y-auto">
          <div className="py-1">
            {businesses.map((business) => (
              <button
                key={business.id}
                onClick={() => handleBusinessSwitch(business.id)}
                disabled={business.currentlySelected}
                className={cn(
                  "w-full px-3 py-2 flex items-center gap-2 transition-colors text-left text-sm",
                  business.currentlySelected
                    ? "bg-accent/20 cursor-default text-muted-foreground"
                    : "hover:bg-accent cursor-pointer text-foreground"
                )}
              >
                <Building2
                  className={cn(
                    "w-4 h-4 flex-shrink-0",
                    business.currentlySelected ? "text-muted-foreground" : "text-foreground/70"
                  )}
                />
                <span className="flex-1 truncate">
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

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const { isAuthorized, loading: authLoading, businessId, joinedBusinesses } = useBusinessContext();

  useEffect(() => {
    document.title = "Settings";
  }, []);

  const handleLogout = async () => {
    await signOut(auth);
    router.push('/');
  };

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
    { href: `/business/${businessId}/dashboard/orders`, label: 'Back to Dashboard', icon: Home },
    { href: `/business/${businessId}/settings`, label: 'Store Details', icon: User },
    { href: `/business/${businessId}/settings/apps`, label: 'Apps & Integrations', icon: Smartphone },
    { href: `/business/${businessId}/settings/pickup-locations`, label: 'Pickup Locations', icon: MapPin },
  ];

  return (
    <SidebarProvider>
      <div className="flex flex-col flex-1 w-full h-screen overflow-hidden">
        {/* Mobile header with hamburger menu */}
        <header className="md:hidden sticky top-0 z-10 flex items-center justify-between border-b bg-background px-4 py-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            <Menu className="h-5 w-5" />
          </Button>
          <h1 className="font-headline font-semibold text-lg">Settings</h1>
          <div className="w-10" /> {/* Spacer for centering */}
        </header>

        <main className="flex-1 overflow-hidden">
          <div className="grid md:grid-cols-[220px_1fr] lg:grid-cols-[280px_1fr] h-full">
            {/* Desktop Sidebar */}
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

                {/* Business Switcher at bottom */}
                <div className="mt-auto border-t pt-4 pb-4">
                  {joinedBusinesses && joinedBusinesses.length > 0 && (
                    <BusinessSwitcher
                      businesses={joinedBusinesses}
                      currentBusinessId={businessId}
                    />
                  )}
                </div>
              </div>
            </div>

            {/* Mobile Sidebar Overlay */}
            {sidebarOpen && (
              <>
                <div
                  className="fixed inset-0 bg-black/50 z-40 md:hidden"
                  onClick={() => setSidebarOpen(false)}
                />
                <div className="fixed inset-y-0 left-0 w-64 bg-background border-r z-50 md:hidden">
                  <div className="flex h-full flex-col">
                    <div className="flex items-center justify-between p-4 border-b">
                      <h1 className="font-headline font-semibold text-lg">Settings</h1>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setSidebarOpen(false)}
                      >
                        <X className="h-5 w-5" />
                      </Button>
                    </div>

                    <nav className="flex-1 grid items-start px-2 py-4 text-sm font-medium">
                      {navItems.map((item) => (
                        <Link
                          key={item.label}
                          href={item.href}
                          onClick={() => setSidebarOpen(false)}
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

                    {/* Business Switcher at bottom */}
                    <div className="mt-auto border-t pt-4 pb-4">
                      {joinedBusinesses && joinedBusinesses.length > 0 && (
                        <BusinessSwitcher
                          businesses={joinedBusinesses}
                          currentBusinessId={businessId}
                        />
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}

            <div className="flex flex-col overflow-auto">
              {children}
            </div>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}