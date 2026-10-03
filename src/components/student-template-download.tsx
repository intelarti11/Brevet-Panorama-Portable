"use client";

import { useRef, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { StudentTemplateKind } from "@/lib/student-import-template";

interface Props {
  year: string;
  kind: StudentTemplateKind;
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
}

export function StudentTemplateDownload({ year, kind, disabled = false, onBusyChange }: Props) {
  const [loadingExam, setLoadingExam] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isDownloading = useRef(false);

  async function download(exam?: "bb1" | "bb2") {
    if (disabled || !year || isDownloading.current) return;
    isDownloading.current = true;
    setLoadingExam(exam ?? "dnb");
    setError(null);
    onBusyChange?.(true);
    try {
      const [{ loadStudentRoster }, { downloadStudentImportWorkbook }] = await Promise.all([
        import("@/lib/student-roster"), import("@/lib/student-import-template"),
      ]);
      const students = await loadStudentRoster(year);
      downloadStudentImportWorkbook(students, { year, kind, ...(exam ? { exam } : {}) });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Impossible de créer le modèle prérempli.");
    } finally {
      isDownloading.current = false;
      setLoadingExam(null);
      onBusyChange?.(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">Modèle Excel prérempli avec les élèves de troisième enregistrés pour {year}. Remplissez les colonnes de notes, puis importez le fichier ci-dessous.</p>
      <div className="flex flex-wrap gap-2">
        {kind === "bb" ? (["bb1", "bb2"] as const).map((exam) => (
          <Button key={exam} type="button" variant="outline" disabled={disabled || !year || loadingExam !== null} onClick={() => download(exam)}>
            {loadingExam === exam ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Download className="size-4" aria-hidden="true" />}
            Télécharger le modèle {exam.toUpperCase()}
          </Button>
        )) : (
          <Button type="button" variant="outline" disabled={disabled || !year || loadingExam !== null} onClick={() => download()}>
            {loadingExam ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Download className="size-4" aria-hidden="true" />}
            Télécharger le modèle DNB prérempli
          </Button>
        )}
      </div>
      {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
    </div>
  );
}
