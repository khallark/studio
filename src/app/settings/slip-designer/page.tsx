
'use client';

import React, { useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FileText, Palette } from 'lucide-react';

export default function SlipDesignerPage() {
  useEffect(() => {
    document.title = "Settings - Slip Designer";
  })
  return (
    <div className="flex justify-center items-start h-full p-4 md:p-6">
      <Card className="w-full max-w-4xl">
        <CardHeader>
          <CardTitle className="text-2xl font-headline">Slip Designer</CardTitle>
          <CardDescription>Customize the layout and content of your shipping and AWB slips.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center h-96 border-2 border-dashed rounded-lg bg-muted/50">
            <div className="flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
              <Palette className="h-10 w-10 text-primary" />
            </div>
            <h3 className="text-2xl font-bold tracking-tight">Visual Slip Editor</h3>
            <p className="text-muted-foreground">Coming Soon!</p>
             <p className="text-sm text-muted-foreground max-w-sm text-center mt-2">
                A drag-and-drop interface to design your printable slips will be available here.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
