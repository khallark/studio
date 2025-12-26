// app/layout.tsx
import type { Metadata } from 'next';
import './globals.css';
import { Toaster } from "@/components/ui/toaster";
import { Providers } from './providers';
import dynamic from 'next/dynamic';

const BodyPointerFixProvider = dynamic(
  () => import('@/components/body-pointer-fix-provider').then(mod => mod.BodyPointerFixProvider),
  { ssr: false }
);

export const metadata: Metadata = {
  title: 'Majime',
  description: 'Manage your Shopify orders in a single dashboard.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=PT+Sans:wght@400;700&display=swap" rel="stylesheet" />
      </head>
      <body className="font-body antialiased">
        <Providers>
          <BodyPointerFixProvider>
            {children}
          </BodyPointerFixProvider>
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}