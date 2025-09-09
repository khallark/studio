
'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { FileText, PackagePlus } from 'lucide-react';
import { GenerateAwbDialog } from '@/components/generate-awb-dialog';

export default function AwbProcessingPage() {
  const [isGenerateAwbOpen, setIsGenerateAwbOpen] = useState(false); 

  return (
    <>
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-6">
        <div className="flex items-center justify-between">
          <h1 className="font-headline font-semibold text-2xl md:text-3xl">AWB Processing</h1>
          <Button onClick={() => setIsGenerateAwbOpen(true)}>
            <PackagePlus className="mr-2 h-4 w-4" />
            Generate AWBs
          </Button>
        </div>
        <Separator />
        
        <div className="grid gap-8 lg:grid-cols-2">
            {/* Section 1: Bulk AWB Assignments */}
            <Card>
                <CardHeader>
                    <CardTitle>Bulk AWB Assignments</CardTitle>
                    <CardDescription>View and manage the status of ongoing bulk AWB assignment sessions.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-col items-center justify-center h-48 border-2 border-dashed rounded-lg">
                        <p className="text-muted-foreground">No active sessions.</p>
                        <p className="text-sm text-muted-foreground">Start an assignment from the Orders page.</p>
                    </div>
                </CardContent>
            </Card>

            {/* Section 2: AWB Slip Generation */}
            <Card>
                <CardHeader>
                    <CardTitle>AWB Slip Generation</CardTitle>
                    <CardDescription>Generate and download printable PDF slips for orders that are ready to dispatch.</CardDescription>
                </CardHeader>
                <CardContent>
                     <div className="flex flex-col items-center justify-center h-48 border-2 border-dashed rounded-lg">
                        <p className="text-muted-foreground">Coming Soon</p>
                        <p className="text-sm text-muted-foreground">Functionality to generate slips will be here.</p>
                    </div>
                </CardContent>
            </Card>
        </div>
      </main>

      <GenerateAwbDialog 
        isOpen={isGenerateAwbOpen}
        onClose={() => setIsGenerateAwbOpen(false)}
      />
    </>
  );
}
