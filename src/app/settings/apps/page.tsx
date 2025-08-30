'use client';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export default function AppsSettingsPage() {
  return (
    <div className="flex justify-center items-start h-full p-4 md:p-6">
      <Card className="w-full max-w-4xl">
         <CardHeader>
            <CardTitle className="text-2xl font-headline">Apps</CardTitle>
            <CardDescription>Manage your connected applications and integrations.</CardDescription>
         </CardHeader>
         <CardContent>
            <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm min-h-[400px]">
                <div className="flex flex-col items-center gap-1 text-center">
                    <h3 className="text-2xl font-bold tracking-tight">
                    No apps connected
                    </h3>
                    <p className="text-sm text-muted-foreground">
                    Connect apps to extend the functionality of your store.
                    </p>
                </div>
            </div>
         </CardContent>
      </Card>
    </div>
  )
}
