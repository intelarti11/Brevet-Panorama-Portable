'use client';

import { useCallback, useEffect, useState } from 'react';
import { Archive, Database, FolderOpen, HardDrive, Loader2, RotateCcw } from 'lucide-react';

import { useToast } from '@/hooks/use-toast';
import { BREVET_DATA_UPDATED_EVENT } from '@/lib/brevet-data-events';
import { localInvoke } from '@/lib/local/transport';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface LocalInfo {
  dataDirectory: string;
  databasePath: string;
  backupDirectory: string;
  revision: number;
}

interface LocalBackup {
  name: string;
  path: string;
  size: number;
  createdAt: number;
}

type BusyAction = 'loading' | 'backup' | 'restore' | null;

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Une erreur inattendue est survenue.';
}

function formatSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes < 0) return 'Taille inconnue';
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Ko`;
  return `${(bytes / (1024 * 1024)).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Mo`;
}

function formatDate(value: number) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Date inconnue' : date.toLocaleString('fr-FR');
}

export function LocalStoragePanel() {
  const { toast } = useToast();
  const [info, setInfo] = useState<LocalInfo | null>(null);
  const [backups, setBackups] = useState<LocalBackup[]>([]);
  const [selectedBackup, setSelectedBackup] = useState('');
  const [busy, setBusy] = useState<BusyAction>('loading');
  const [error, setError] = useState<string | null>(null);
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);

  const refresh = useCallback(async () => {
    setBusy('loading');
    setError(null);
    try {
      const [nextInfo, nextBackups] = await Promise.all([
        localInvoke<LocalInfo>('local_info'),
        localInvoke<LocalBackup[]>('local_backups'),
      ]);
      setInfo(nextInfo);
      setBackups(nextBackups);
      setSelectedBackup((current) => nextBackups.some((backup) => backup.name === current)
        ? current
        : nextBackups[0]?.name ?? '');
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setBusy(null);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const createBackup = async () => {
    setBusy('backup');
    setError(null);
    try {
      const result = await localInvoke<{ path: string }>('local_backup');
      toast({ title: 'Sauvegarde créée', description: result.path });
      await refresh();
    } catch (backupError) {
      const description = errorMessage(backupError);
      setError(description);
      toast({ variant: 'destructive', title: 'Sauvegarde impossible', description });
      setBusy(null);
    }
  };

  const restoreBackup = async () => {
    if (!selectedBackup || busy) return;
    const backup = backups.find((candidate) => candidate.name === selectedBackup);
    if (!backup) return;

    setBusy('restore');
    setError(null);
    try {
      const result = await localInvoke<{ revision: number }>('local_restore', { name: backup.name });
      window.dispatchEvent(new CustomEvent(BREVET_DATA_UPDATED_EVENT, { detail: { revision: result.revision } }));
      setRestoreDialogOpen(false);
      toast({ title: 'Données restaurées', description: 'L’application va se recharger avec les données restaurées.' });
      window.setTimeout(() => window.location.reload(), 700);
    } catch (restoreError) {
      const description = errorMessage(restoreError);
      setError(description);
      toast({ variant: 'destructive', title: 'Restauration impossible', description });
    } finally {
      setBusy(null);
    }
  };

  const selectedBackupInfo = backups.find((backup) => backup.name === selectedBackup);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <HardDrive className="size-7 text-primary" aria-hidden="true" />
            <div>
              <CardTitle>Données locales</CardTitle>
              <CardDescription>Édition portable • Données locales, sans compte ni connexion réseau.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {error ? (
            <Alert variant="destructive">
              <AlertTitle>Accès au stockage local indisponible</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          {info ? (
            <dl className="grid gap-4 rounded-lg border bg-muted/30 p-4 text-sm md:grid-cols-2">
              <div className="space-y-1">
                <dt className="flex items-center gap-2 font-medium"><FolderOpen className="size-4" /> Dossier des données</dt>
                <dd className="break-all font-mono text-xs text-muted-foreground">{info.dataDirectory}</dd>
              </div>
              <div className="space-y-1">
                <dt className="flex items-center gap-2 font-medium"><Database className="size-4" /> Base de données</dt>
                <dd className="break-all font-mono text-xs text-muted-foreground">{info.databasePath}</dd>
              </div>
              <div className="space-y-1 md:col-span-2">
                <dt className="flex items-center gap-2 font-medium"><Archive className="size-4" /> Dossier des sauvegardes</dt>
                <dd className="break-all font-mono text-xs text-muted-foreground">{info.backupDirectory}</dd>
              </div>
            </dl>
          ) : busy === 'loading' ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Lecture des dossiers locaux…</p>
          ) : null}

          <Button onClick={createBackup} disabled={busy !== null}>
            {busy === 'backup' ? <Loader2 className="size-4 animate-spin" /> : <Archive className="size-4" />}
            Créer une sauvegarde
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Restaurer une sauvegarde</CardTitle>
          <CardDescription>La restauration remplace les données actuelles par celles de la sauvegarde sélectionnée.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="local-backup-select">Sauvegarde disponible</Label>
            <Select value={selectedBackup} onValueChange={setSelectedBackup} disabled={busy !== null || backups.length === 0}>
              <SelectTrigger id="local-backup-select">
                <SelectValue placeholder={busy === 'loading' ? 'Chargement…' : 'Aucune sauvegarde disponible'} />
              </SelectTrigger>
              <SelectContent>
                {backups.map((backup) => (
                  <SelectItem key={backup.name} value={backup.name}>
                    {formatDate(backup.createdAt)} — {formatSize(backup.size)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedBackupInfo ? (
              <p className="break-all text-xs text-muted-foreground">{selectedBackupInfo.path}</p>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => void refresh()} disabled={busy !== null}>
              {busy === 'loading' ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
              Actualiser la liste
            </Button>
            <Button onClick={() => setRestoreDialogOpen(true)} disabled={busy !== null || !selectedBackup}>
              Restaurer cette sauvegarde
            </Button>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={restoreDialogOpen} onOpenChange={setRestoreDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remplacer les données locales ?</AlertDialogTitle>
            <AlertDialogDescription>
              La sauvegarde « {selectedBackupInfo?.name ?? selectedBackup} » va remplacer les données actuelles. Cette action est immédiate.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy === 'restore'}>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={(event) => { event.preventDefault(); void restoreBackup(); }} disabled={busy !== null}>
              {busy === 'restore' ? <Loader2 className="size-4 animate-spin" /> : null}
              Confirmer la restauration
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
