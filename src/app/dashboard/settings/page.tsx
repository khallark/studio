'use client';

import DashboardPage from '@/app/dashboard/page';
import { Modal } from '@/components/ui/modal';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

function SettingsContent() {
  return (
    <div className="flex justify-center items-start h-full p-4 md:p-6">
      <Card className="w-full max-w-4xl">
         <CardHeader>
            <CardTitle className="text-2xl font-headline">Settings</CardTitle>
            <CardDescription>Manage your account and application settings.</CardDescription>
         </CardHeader>
         <CardContent>
            <div className="space-y-8 max-w-2xl mx-auto py-6">
                  
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
         </CardContent>
      </Card>
    </div>
  )
}


export default function SettingsPage() {
  return (
    <>
      <DashboardPage />
      <Modal>
        <SettingsContent />
      </Modal>
    </>
  );
}
