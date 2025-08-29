'use client';

import SettingsPage from '@/app/dashboard/settings/page';
import { Modal } from '@/components/ui/modal';

export default function SettingsModal() {
  return (
    <Modal>
      <SettingsPage />
    </Modal>
  );
}
