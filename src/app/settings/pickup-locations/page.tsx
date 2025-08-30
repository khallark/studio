'use client';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export default function PickupLocationsPage() {
  return (
    <div className="flex justify-center items-start h-full p-4 md:p-6">
      <Card className="w-full max-w-4xl">
         <CardHeader>
            <CardTitle className="text-2xl font-headline">Pickup Locations</CardTitle>
            <CardDescription>Manage where customers can pick up their orders.</CardDescription>
         </CardHeader>
         <CardContent>
             <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm min-h-[400px]">
                <div className="flex flex-col items-center gap-1 text-center">
                    <h3 className="text-2xl font-bold tracking-tight">
                    No pickup locations
                    </h3>
                    <p className="text-sm text-muted-foreground">
                    Add pickup locations to allow customers to pick up their orders.
                    </p>
                </div>
            </div>
         </CardContent>
      </Card>
    </div>
  )
}
