'use client';

import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export default function SettingsPage() {
  return (
    <div className="flex justify-center items-center h-full p-4 md:p-6">
      <Card className="w-full max-w-4xl">
         <CardHeader>
            <CardTitle className="text-2xl font-headline">Settings</CardTitle>
            <CardDescription>Manage your account and application settings.</CardDescription>
         </CardHeader>
         <CardContent>
            <ScrollArea className="flex-1 overflow-y-auto p-6">
              <div className="space-y-8 max-w-2xl mx-auto">
                  
                  <section>
                      <h2 className="text-xl font-semibold mb-4">Profile</h2>
                      <p>Profile settings will go here.</p>
                  </section>
                  
                  <section>
                      <h2 className="text-xl font-semibold mb-4">Notifications</h2>
                      <p>Notification settings will go here.</p>
                  </section>

                  <section>
                      <h2 className="text-xl font-semibold mb-4">Store Connections</h2>
                      <p>Store connection management will go here.</p>
                  </section>

              </div>
            </ScrollArea>
         </CardContent>
      </Card>
    </div>
  )
}
