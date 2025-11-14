// app/business/[businessId]/layout.tsx
'use client';

import React from 'react';

interface BusinessLayoutProps {
  children: React.ReactNode;
  params: { businessId: string };
}

export default function BusinessLayout({ children }: BusinessLayoutProps) {
  return (
    <div className="min-h-screen bg-background">
      {children}
    </div>
  );
}