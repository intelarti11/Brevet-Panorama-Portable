
"use client";

import { useState, useMemo, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Import, AlertTriangle, CalendarDays, FileCheck2, FilePenLine } from 'lucide-react';
import { httpsCallable, type HttpsCallable } from '@/lib/local/functions';
import { functions as functionsInstance } from '@/lib/firebase';
import { getCallableErrorMessage } from '@/lib/firebase-callable-error';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { YearPicker } from '@/components/ui/year-picker';
import { Badge } from '@/components/ui/badge';
import { StudentTemplateDownload } from '@/components/student-template-download';
import { ImportFileDropzone } from '@/components/import-file-dropzone';
import { readBrevetBlancTemplateImport, type ValidatedBrevetBlancTemplateImport } from '@/lib/brevet-blanc-template-import';
import { BREVET_DATA_UPDATED_EVENT } from '@/lib/brevet-data-events';
import {
  type BrevetBlancLockStatus,
  type BrevetExam,
  getBrevetExamLocks,
  getCurrentBrevetLockYear,
} from '@/lib/brevet-blanc-lock';

interface ImportResponse {
  success: boolean;
  message: string;
}

export default function ImportManuelPage() {
  const currentYear = useMemo(() => getCurrentBrevetLockYear(), []);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [validatedTemplate, setValidatedTemplate] = useState<ValidatedBrevetBlancTemplateImport | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isTemplateDownloading, setIsTemplateDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importYear, setImportYear] = useState<string>(currentYear);
  const [selectedStartYear, setSelectedStartYear] = useState<number | null>(parseInt(currentYear, 10));
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const templateMetadata = validatedTemplate?.metadata ?? null;
  const detectedExam = templateMetadata?.exam ?? null;
  const templateYearError = templateMetadata && templateMetadata.year !== importYear
    ? `Ce modèle est prévu pour l'année ${templateMetadata.year}, alors que l'année sélectionnée est ${importYear}. Sélectionnez la bonne année ou téléchargez à nouveau le modèle.`
    : null;
  const [lockStatus, setLockStatus] = useState<BrevetBlancLockStatus>({});
  const [isLockStatusLoading, setIsLockStatusLoading] = useState(true);
  const [lockStatusError, setLockStatusError] = useState<string | null>(null);

  const { toast } = useToast();

  const callImportAnciensResultatsBB: HttpsCallable<{ students: ValidatedBrevetBlancTemplateImport['students'], anneeScolaire: string, exam: BrevetExam }, ImportResponse> | null = useMemo(
    () => (functionsInstance ? httpsCallable(functionsInstance, 'importAnciensResultatsBB') : null),
    []
  );

  const callGetBrevetBlancLockStatus = useMemo(
    () => (functionsInstance ? httpsCallable<void, {success: boolean, lockStatus: BrevetBlancLockStatus}>(functionsInstance, 'getBrevetBlancLockStatus') : null),
    []
  );

  const selectedYearLocks = useMemo(() => getBrevetExamLocks(lockStatus, importYear), [lockStatus, importYear]);
  const isSelectedYearExamLocked = detectedExam !== null && selectedYearLocks[detectedExam];
  const shouldBlockImport = detectedExam !== null && (isLockStatusLoading || !!lockStatusError || isSelectedYearExamLocked);

  useEffect(() => {
    const fetchLockStatus = async () => {
      if (!callGetBrevetBlancLockStatus) {
        setIsLockStatusLoading(false);
        setLockStatusError("Service getBrevetBlancLockStatus non disponible.");
        return;
      }

      try {
        const result = await callGetBrevetBlancLockStatus();
        if (!result.data.success) {
          throw new Error("Impossible de récupérer le verrouillage.");
        }
        setLockStatus(result.data.lockStatus);
        setLockStatusError(null);
      } catch (err: any) {
        console.error("Erreur de chargement du verrouillage:", err);
        setLockStatusError(getCallableErrorMessage(err, "Impossible de vérifier le verrouillage.", "getBrevetBlancLockStatus"));
      } finally {
        setIsLockStatusLoading(false);
      }
    };

    fetchLockStatus();
  }, [callGetBrevetBlancLockStatus]);

  const handleFileSelected = async (file: File | null | undefined) => {
    setError(null);
    setSelectedFileName(null);
    setValidatedTemplate(null);

    if (!file) return;
    const lowerName = file.name.toLowerCase();
    if (!lowerName.endsWith('.xlsx')) {
      const errorMsg = "Format invalide. Sélectionnez le modèle de brevet blanc au format Excel .xlsx.";
      setError(errorMsg);
      toast({ variant: "destructive", title: "Erreur de fichier", description: errorMsg });
      return;
    }

    setSelectedFileName(file.name);
    setIsLoading(true);
    try {
      const validated = readBrevetBlancTemplateImport(await file.arrayBuffer());
      setValidatedTemplate(validated);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Impossible de lire le modèle Excel.";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const parseAndImportData = async () => {
    if (!validatedTemplate) { setError("Aucun modèle valide sélectionné."); toast({ variant: "destructive", title: "Erreur", description: "Aucun modèle valide sélectionné." }); return; }
    if (!importYear.trim()) { setError("L'année scolaire est requise."); toast({ variant: "destructive", title: "Erreur", description: "Veuillez spécifier l'année scolaire.", duration: 5000 }); return; }
    setError(null);
    try {
      const {metadata, students} = validatedTemplate;
      if (metadata.kind !== 'bb' || (metadata.exam !== 'bb1' && metadata.exam !== 'bb2')) {
        throw new Error("Le modèle sélectionné ne précise pas un examen de brevet blanc valide. Sélectionnez un nouveau modèle.");
      }
      const exam = metadata.exam;
      if (metadata.year !== importYear) {
        throw new Error(`Ce modèle est prévu pour l'année ${metadata.year}, alors que l'année sélectionnée est ${importYear}. Sélectionnez la bonne année ou téléchargez à nouveau le modèle.`);
      }

      if (isLockStatusLoading) throw new Error("Vérification du verrouillage en cours. Veuillez patienter.");
      if (lockStatusError) throw new Error(lockStatusError);
      if (getBrevetExamLocks(lockStatus, importYear)[exam]) {
        throw new Error(`L'import du ${exam.toUpperCase()} est fermé pour l'année ${importYear}.`);
      }

      if (!callImportAnciensResultatsBB) throw new Error("Service de fonctions non initialisé.");

      setIsImporting(true);
      const result = await callImportAnciensResultatsBB({students, anneeScolaire: importYear, exam});
      if (!result.data.success) throw new Error(result.data.message || "L'importation locale a échoué.");

      window.dispatchEvent(new Event(BREVET_DATA_UPDATED_EVENT));
      toast({title: "Importation réussie", description: result.data.message});
      setSelectedFileName(null);
      setValidatedTemplate(null);
    } catch (e: unknown) {
      console.error("Erreur lors de l'import :", e);
      const errorMessage = getCallableErrorMessage(e, "Impossible d'importer les résultats.", "importAnciensResultatsBB");
      setError(errorMessage);
      toast({variant: "destructive", title: "Erreur d'importation", description: errorMessage, duration: 8000});
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="space-y-8 p-1 md:p-4">
      <header className="mb-6">
        <h1 className="text-3xl font-bold text-foreground tracking-tight">Import Manuel des Notes</h1>
        <p className="text-muted-foreground mt-1">
          Importez les notes du brevet blanc à l’aide du modèle Excel prérempli.
        </p>
      </header>

       <Card className="shadow-lg rounded-lg">
        <CardHeader>
          <CardTitle className="text-xl flex items-center">
            <CalendarDays className="mr-2 h-5 w-5 text-primary" />
            Étape 1 : Choisir l’année du brevet
          </CardTitle>
          <CardDescription>
            Choisissez l’année de la session de juin. Le modèle téléchargé sera préparé pour cette année.
          </CardDescription>
        </CardHeader>
        <CardContent>
           <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  id="importYear-trigger"
                  variant={"outline"}
                  className={`w-full max-w-xs justify-start text-left font-normal ${!selectedStartYear && "text-muted-foreground"}`}
                  disabled={isLoading || isImporting || isTemplateDownloading}
                >
                  <CalendarDays className="mr-2 h-4 w-4" />
                  {selectedStartYear ? `Brevet — juin ${String(selectedStartYear)}` : "Choisissez l’année du brevet"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <YearPicker
                  selectedYear={selectedStartYear}
                  onSelectYear={(year) => {
                    if (isTemplateDownloading) return;
                    setSelectedStartYear(year); setImportYear(String(year)); setIsPopoverOpen(false);
                  }}
                  initialDisplayYear={parseInt(currentYear, 10)}
                />
              </PopoverContent>
            </Popover>
        </CardContent>
      </Card>

      <Card className="shadow-lg rounded-lg">
        <CardHeader>
          <CardTitle className="text-xl flex items-center">
            <FilePenLine className="mr-2 h-5 w-5 text-primary" />
            Étape 2: Importer les notes du brevet blanc
          </CardTitle>
          <CardDescription>
            Téléchargez le modèle BB1 ou BB2 prérempli avec les élèves et leurs INE. L’année et l’examen sont indiqués dans le modèle. Remplissez les notes : une cellule vide conserve la note existante, et « ABS » l’efface.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 pt-2">
          <StudentTemplateDownload
            kind="bb"
            year={importYear}
            disabled={isLoading || isImporting || !importYear.trim()}
            onBusyChange={(busy) => {
              setIsTemplateDownloading(busy);
              if (busy) setIsPopoverOpen(false);
            }}
          />
          <p className="text-sm text-muted-foreground">
            Conservez les identités, les en-têtes et la feuille « Mode d’emploi ». Enregistrez le fichier au format .xlsx, y compris avec LibreOffice.
          </p>
          <ImportFileDropzone
            id="xlsx-file-upload"
            accept=".xlsx, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            prompt={<>Glissez-déposez le modèle Excel rempli (.xlsx), ou <span className="font-semibold text-primary hover:underline">cliquez</span></>}
            onFilesSelected={(files) => void handleFileSelected(files[0])}
            disabled={isLoading || isImporting}
          >
            {selectedFileName && (
              <div className="mt-4 text-sm text-muted-foreground flex items-center gap-2">
                <FileCheck2 className="h-4 w-4" aria-hidden="true" />
                <span>{selectedFileName}</span>
                {detectedExam && (
                  <Badge variant={detectedExam === 'bb1' ? 'secondary' : 'default'}>
                    {detectedExam === 'bb1' ? 'Modèle BB1' : 'Modèle BB2'}
                  </Badge>
                )}
                {templateMetadata && <Badge variant="outline">Année du modèle : {templateMetadata.year}</Badge>}
              </div>
            )}
          </ImportFileDropzone>
          {(templateYearError || error) && ( <div className="flex items-center text-sm text-destructive bg-destructive/10 p-3 rounded-md"> <AlertTriangle className="mr-2 h-4 w-4" /> {templateYearError || error} </div> )}
          {detectedExam && isSelectedYearExamLocked && (
            <div className="flex items-center text-sm text-destructive bg-destructive/10 p-3 rounded-md">
              <AlertTriangle className="mr-2 h-4 w-4" />
              L'import du {detectedExam.toUpperCase()} est ferme pour l'annee {importYear}.
            </div>
          )}
          {detectedExam && !isSelectedYearExamLocked && isLockStatusLoading && (
            <div className="flex items-center text-sm text-muted-foreground bg-muted/40 p-3 rounded-md">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Verification du verrouillage de l'annee {importYear}...
            </div>
          )}
          {lockStatusError && (
            <div className="flex items-center text-sm text-destructive bg-destructive/10 p-3 rounded-md">
              <AlertTriangle className="mr-2 h-4 w-4" />
              {lockStatusError}
            </div>
          )}
        </CardContent>
        <CardFooter>
            <Button onClick={parseAndImportData} disabled={!validatedTemplate || isLoading || isImporting || !importYear.trim() || !detectedExam || templateMetadata?.year !== importYear || shouldBlockImport} className="w-full sm:w-auto ml-auto" >
              {(isLoading || isImporting) ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Import className="mr-2 h-4 w-4" />}
              {isLoading ? "Analyse du fichier..." : (isImporting ? "Importation en cours..." : "Importer les notes")}
            </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
