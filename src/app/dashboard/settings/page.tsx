'use client';

import { HardDrive } from 'lucide-react';

import { LocalStoragePanel } from '@/components/local-storage-panel';

export default function SettingsPage() {
  return (
    <div className="space-y-6 p-4 md:p-6 lg:p-8">
      <header className="flex items-start gap-3">
        <HardDrive className="mt-1 size-8 text-primary" aria-hidden="true" />
        <div>
          <h1 className="text-3xl font-bold">Paramètres locaux</h1>
          <p className="text-muted-foreground">Consultez l’emplacement de vos données et gérez les sauvegardes.</p>
        </div>
      </header>
      <LocalStoragePanel />
    </div>
  );
}
