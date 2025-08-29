'use client';

import { useCallback, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

export function Modal({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  const onDismiss = useCallback(() => {
    router.back();
  }, [router]);

  return (
    <Sheet open={true} onOpenChange={(open) => !open && onDismiss()}>
      <SheetContent
        side="bottom"
        className="h-[95vh] flex flex-col p-0"
        onInteractOutside={onDismiss}
        >
        <SheetHeader className="p-6 border-b">
          <SheetTitle className="text-2xl font-headline">Settings</SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </SheetContent>
    </Sheet>
  );
}
