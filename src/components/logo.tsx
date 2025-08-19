import Link from 'next/link';
import { ShoppingBag } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Logo({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn("flex items-center gap-2 text-xl font-semibold", className)}>
      <ShoppingBag className="h-6 w-6 text-primary" />
      <span className="font-headline">OrderFlow</span>
    </Link>
  );
}
