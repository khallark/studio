import Link from 'next/link';
import { ShoppingBag } from 'lucide-react';
import { cn } from '@/lib/utils';
import Image from 'next/image';

export function Logo({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn("flex items-center gap-2 text-xl font-semibold", className)}>
      <Image src="/favicon.ico" alt="Majime" width={32} height={32} />
      <span className="font-headline">Majime</span>
    </Link>
  );
}
