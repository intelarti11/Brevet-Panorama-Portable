
"use client";

import type { FormEvent } from 'react';
import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import type { StudentData } from '@/lib/excel-types';
import { Loader2, Import, AlertTriangle, CalendarDays, FileText, Trash2, CheckCircle, Database, Shapes } from 'lucide-react';
import * as XLSX from '@/lib/spreadsheet';

import { getFirestore, collection, doc, withLocalTransaction } from '@/lib/local/store';
import { httpsCallable } from '@/lib/local/functions';
import { app, functions as functionsInstance } from '@/lib/firebase';
import { getCallableErrorMessage } from '@/lib/firebase-callable-error';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { YearPicker } from '@/components/ui/year-picker';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { PixStudentData } from '@/lib/pix-types';
import type { BrevetBlancLockStatus } from '@/lib/brevet-blanc-lock';
import { getBrevetExamLocks, getCurrentBrevetLockYear } from '@/lib/brevet-blanc-lock';
import type { DataLockStatus } from '@/lib/data-lock';
import { isDataYearLocked, normalizeDataLockStatus } from '@/lib/data-lock';
import {
  getMissingOfficialBrevetHeaders,
  getMissingOfficialBrevetRowValues,
  parseOfficialBrevetRow,
  readOfficialBrevetField,
} from '@/lib/official-brevet-import';
import { BREVET_DATA_UPDATED_EVENT } from '@/lib/brevet-data-events';
import { OfficialStudentImport } from '@/components/official-student-import';
import { StudentTemplateDownload } from '@/components/student-template-download';
import { ImportFileDropzone } from '@/components/import-file-dropzone';
import { resolveDivisionName } from '@/lib/division-names';
import { readStudentTemplateMetadata, validateDnbTemplateRow } from '@/lib/student-import-template';

type FlattenedFieldErrors = Record<string, string[] | undefined>;
type ParsedRowValidationError = {
  row: number;
  fieldErrors: FlattenedFieldErrors;
};
type PixDetailScoreKey = Extract<keyof PixStudentData, `${number}.${number}`>;

const PIX_CANONICAL_HEADER_ALIASES: Record<string, readonly string[]> = {
  "Nombre de Pix": ["Nombre de Pix", "Score en Pix"],
};

const normalizePixHeader = (header: string) => header.trim().toLowerCase();

const formatFieldErrors = (fieldErrors: FlattenedFieldErrors) =>
  Object.entries(fieldErrors)
    .map(([field, messages]) =>
      messages && messages.length > 0 ? `${field}: ${messages[0]}` : `${field}: Erreur`
    )
    .join('; ');


export default function ImportPage() {
  // States for Excel Import (Official Brevet Results)
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [isExcelLoading, setIsExcelLoading] = useState(false);
  const [isExcelImporting, setIsExcelImporting] = useState(false);
  const [excelError, setExcelError] = useState<string | null>(null);
  const [excelFileName, setExcelFileName] = useState<string | null>(null);

  const [importYear, setImportYear] = useState<string>('');
  const [selectedStartYear, setSelectedStartYear] = useState<number | null>(null);
  const [initialPickerYear, setInitialPickerYear] = useState<number>(new Date().getFullYear());
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [isOfficialStudentBusy, setIsOfficialStudentBusy] = useState(false);
  const [isTemplateDownloading, setIsTemplateDownloading] = useState(false);

  // States for PIX Import
  const [pixFiles, setPixFiles] = useState<File[]>([]);
  const [isPixProcessing, setIsPixProcessing] = useState(false);
  const [pixError, setPixError] = useState<string | null>(null);
  const [brevetBlancLockStatus, setBrevetBlancLockStatus] = useState<BrevetBlancLockStatus>({});
  const [dataLockStatus, setDataLockStatus] = useState<DataLockStatus>({ brevet: {}, pix: {} });
  const [isLockStatusLoading, setIsLockStatusLoading] = useState(true);
  const [lockStatusError, setLockStatusError] = useState<string | null>(null);


  const { toast } = useToast();

  const callImportPixResults = useMemo(() =>
    functionsInstance ? httpsCallable<{ students: PixStudentData[]; expectedYear: string }, { success: boolean; message: string; }>(functionsInstance, 'importPixResults') : null,
  []);

  const callGetBrevetBlancLockStatus = useMemo(() =>
    functionsInstance ? httpsCallable<void, {success: boolean, lockStatus: BrevetBlancLockStatus}>(functionsInstance, 'getBrevetBlancLockStatus') : null,
  []);

  const callGetDataLockStatus = useMemo(() =>
    functionsInstance ? httpsCallable<void, {success: boolean, lockStatus: DataLockStatus}>(functionsInstance, 'getDataLockStatus') : null,
  []);

  useEffect(() => {
    const brevetYear = getCurrentBrevetLockYear();
    setInitialPickerYear(Number(brevetYear));
    setSelectedStartYear(Number(brevetYear));
    setImportYear(brevetYear);
  }, []);

  useEffect(() => {
    const fetchLockStatus = async () => {
      if (!callGetBrevetBlancLockStatus || !callGetDataLockStatus) {
        setLockStatusError("Services de verrouillage non disponibles.");
        setIsLockStatusLoading(false);
        return;
      }

      setIsLockStatusLoading(true);
      setLockStatusError(null);

      try {
        const [brevetBlancResult, dataLockResult] = await Promise.all([
          callGetBrevetBlancLockStatus(),
          callGetDataLockStatus(),
        ]);

        if (!brevetBlancResult.data.success || !dataLockResult.data.success) {
          throw new Error("Impossible de recuperer les verrouillages.");
        }

        setBrevetBlancLockStatus(brevetBlancResult.data.lockStatus ?? {});
        setDataLockStatus(normalizeDataLockStatus(dataLockResult.data.lockStatus));
      } catch (error: any) {
        const errorMessage = getCallableErrorMessage(
          error,
          "Impossible de recuperer les verrouillages.",
          "getDataLockStatus"
        );
        setLockStatusError(errorMessage);
      } finally {
        setIsLockStatusLoading(false);
      }
    };

    fetchLockStatus();
  }, [callGetBrevetBlancLockStatus, callGetDataLockStatus]);

  const selectedBrevetBlancYearLocks = useMemo(
    () => getBrevetExamLocks(brevetBlancLockStatus, importYear),
    [brevetBlancLockStatus, importYear]
  );
  const isBrevetBlancImportLocked =
    selectedBrevetBlancYearLocks.bb1 && selectedBrevetBlancYearLocks.bb2;
  const isBrevetImportLocked = isDataYearLocked(dataLockStatus, "brevet", importYear);
  const isPixImportLocked = isDataYearLocked(dataLockStatus, "pix", importYear);

  const normalizeHeader = (header: string): string => {
    if (header === null || header === undefined) return "";
    return header
      .trim()
      .replace(/^"|"$/g, '') // Remove leading/trailing quotes
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\s+/g, '');
  };

  // --- Excel File Handling (Official Brevet Results) ---
  const processExcelFile = (selectedFile: File | null | undefined) => {
    if (selectedFile) {
      const fileType = selectedFile.type;
      const validTypes = ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel'];
      if (validTypes.includes(fileType) || selectedFile.name.endsWith('.xlsx') || selectedFile.name.endsWith('.xls')) {
        setExcelFile(selectedFile);
        setExcelFileName(selectedFile.name);
        setExcelError(null);
      } else {
        const errorMsg = "Format de fichier invalide pour Excel. Veuillez sélectionner un fichier .xlsx ou .xls.";
        setExcelError(errorMsg);
        setExcelFile(null);
        setExcelFileName(null);
        toast({ variant: "destructive", title: "Erreur de Fichier Excel", description: errorMsg });
      }
    } else {
      setExcelFile(null);
      setExcelFileName(null);
    }
  };

  const handleExcelFilesSelected = (files: File[]) => processExcelFile(files[0]);

  const handleExcelImportLocally = async (dataToImport: StudentData[], yearToImportForToast: string) => {
    if (dataToImport.length === 0) {
      toast({ variant: "destructive", title: "Excel: Aucune Donnée", description: "Aucune donnée Excel valide à importer." });
      return;
    }
    setIsExcelImporting(true); setExcelError(null);
    const db = getFirestore(app);
    const collectionRef = collection(db, 'brevetResults');
    const validStudents = dataToImport.filter(student => student.INE);
    const documentsAddedToBatch = validStudents.length;

    if (documentsAddedToBatch === 0) {
      setExcelError("Excel: Aucun élève avec un INE valide trouvé. Vérifiez le fichier.");
      toast({ variant: "destructive", title: "Importation Excel Annulée", description: "Aucun élève avec INE valide.", duration: 7000 });
      setIsExcelImporting(false); return;
    }

    try {
      await withLocalTransaction(async (tx) => {
        const locks = (await tx.getDoc(doc(db, 'appSettings', 'dataLocks'))).data();
        if (locks.brevet?.[yearToImportForToast] === true) throw new Error(`L'import DNB est ferme pour ${yearToImportForToast}.`);
        const aliasesRecord = (await tx.getDoc(doc(db, 'appSettings', `divisions-${yearToImportForToast}`))).data();
        const divisionAliases = aliasesRecord.aliases ?? {};
        for (const student of validStudents) {
          const studentRef = doc(collectionRef, `${student.anneeScolaireImportee}_${student.INE}`);
          tx.set(studentRef, {
            ...student,
            'Division de classe': resolveDivisionName(student['Division de classe'] ?? '', divisionAliases),
          });
        }
      });
      window.dispatchEvent(new Event(BREVET_DATA_UPDATED_EVENT));
      toast({
        title: "Importation Excel Réussie",
        description: `${documentsAddedToBatch} résultats officiels importés pour ${yearToImportForToast}.`,
      });
      setExcelFile(null); setExcelFileName(null);
    } catch (importError: any) {
      console.error("Erreur d'importation Excel locale:", importError);
      const userMessage = `Échec de l'importation Excel: ${importError.message}. Aucun resultat de ce fichier n'a ete enregistre.`;
      setExcelError(userMessage);
      toast({ variant: "destructive", title: "Erreur d'importation Excel locale", description: userMessage, duration: 10000 });
    } finally {
      setIsExcelImporting(false);
    }
  };

  const parseAndImportExcelData = async () => {
    if (!excelFile) { setExcelError("Aucun fichier Excel sélectionné."); toast({ variant: "destructive", title: "Erreur Excel", description: "Aucun fichier Excel." }); return; }
    if (!importYear.trim()) { setExcelError("L'année d'importation est requise pour Excel."); toast({ variant: "destructive", title: "Erreur Excel", description: "Veuillez spécifier l'année d'importation.", duration: 5000 }); return; }
    if (isLockStatusLoading) { setExcelError("Verification du verrouillage en cours."); toast({ variant: "destructive", title: "Verrouillage en cours de chargement", description: "Veuillez patienter avant de lancer l'import Excel.", duration: 7000 }); return; }
    if (lockStatusError) { setExcelError(lockStatusError); toast({ variant: "destructive", title: "Verification du verrouillage impossible", description: lockStatusError, duration: 7000 }); return; }
    if (isBrevetImportLocked) { const errorMsg = `L'import des resultats officiels est verrouille pour l'annee ${importYear}.`; setExcelError(errorMsg); toast({ variant: "destructive", title: "Import verrouille", description: errorMsg, duration: 7000 }); return; }
    setIsExcelLoading(true); setExcelError(null);

    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const arrayBuffer = event.target?.result;
          if (!arrayBuffer) throw new Error("Fichier Excel vide ou illisible.");
          const data = new Uint8Array(arrayBuffer as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array', cellDates: true });
          const templateMetadata = readStudentTemplateMetadata(workbook);
          if (templateMetadata && templateMetadata.kind !== 'dnb') {
            throw new Error("Ce modèle concerne le brevet blanc. Utilisez l’import des notes du brevet blanc.");
          }
          if (templateMetadata && templateMetadata.year !== importYear) {
            throw new Error(`Ce modèle concerne ${templateMetadata.year}. Sélectionnez cette année avant de l’importer.`);
          }
          if (!workbook.SheetNames.length) throw new Error("Classeur Excel sans feuilles.");

          const firstSheetName = templateMetadata ? 'Données' : workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          if (!worksheet) throw new Error("La feuille de données du modèle est absente.");
          const headerRows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
            header: 1,
            raw: false,
            blankrows: false,
          });
          const headers = (headerRows[0] ?? []).map((header) => String(header ?? ''));
          if (templateMetadata) {
            const normalizedHeaders = headers.map(normalizeHeader);
            if (new Set(normalizedHeaders).size !== normalizedHeaders.length) {
              throw new Error("Le modèle contient des en-têtes en double. Téléchargez un nouveau modèle.");
            }
          }
          const missingHeaders = getMissingOfficialBrevetHeaders(headers, importYear);
          if (missingHeaders.length > 0) {
            throw new Error(`Colonnes obligatoires absentes : ${missingHeaders.join(', ')}.`);
          }

          const rawDataObjects = XLSX.utils.sheet_to_json<any>(worksheet, { raw: false, defval: undefined });
          if (rawDataObjects.length === 0) throw new Error("Aucune donnée dans la première feuille Excel.");

          const transformedData: StudentData[] = [];
          const validationErrors: ParsedRowValidationError[] = [];

          const seenIne = new Set<string>();
          rawDataObjects.forEach((rawRow, index) => {
             // Ignore rows that don't have a name AND a surname
            const nom = readOfficialBrevetField(rawRow, 'nom');
            const prenom = readOfficialBrevetField(rawRow, 'prenom');
            if (!nom && !prenom && !templateMetadata) {
              return;
            }
            if (templateMetadata && String(rawRow.Session ?? '').trim() !== importYear) {
              throw new Error(`Ligne ${index + 2} : la session ne correspond pas à l’année sélectionnée.`);
            }
            if (templateMetadata) validateDnbTemplateRow(rawRow, index + 2);

            const missingRowValues = getMissingOfficialBrevetRowValues(rawRow, importYear);
            if (missingRowValues.length > 0) {
              validationErrors.push({
                row: index + 2,
                fieldErrors: {
                  donnees: [`Valeurs obligatoires absentes : ${missingRowValues.join(', ')}`],
                },
              });
              return;
            }

            const validationResult = parseOfficialBrevetRow(rawRow, importYear);
            if (validationResult.success) {
                if (validationResult.data.INE && validationResult.data['Nom candidat']) {
                    if (seenIne.has(validationResult.data.INE)) {
                      throw new Error(`Ligne ${index + 2} : cet INE apparaît plusieurs fois dans le fichier.`);
                    }
                    seenIne.add(validationResult.data.INE);
                    transformedData.push(validationResult.data);
                }
            } else {
                validationErrors.push({
                  row: index + 2,
                  fieldErrors: validationResult.error.flatten().fieldErrors as FlattenedFieldErrors,
                });
            }
          });

          if (validationErrors.length > 0) {
            const firstError = validationErrors[0];
            const errorMessages = formatFieldErrors(firstError.fieldErrors);
            throw new Error(`Excel: Validation échouée. Ex: Ligne ${firstError.row}: ${errorMessages}`);
          }
          if (transformedData.length > 0) await handleExcelImportLocally(transformedData, importYear);
          else if (excelError) {}
          else if (rawDataObjects.length > 0 && transformedData.length === 0 && validationErrors.length === 0) throw new Error("Excel: Aucune ligne traitable. Vérifiez que les colonnes INE, Nom, et Prénom sont présentes et remplies.");
          else throw new Error("Excel: Aucune donnée valide. Vérifiez format et contenu.");
        } catch (parseOrImportError: any) { console.error("Erreur parsing/import Excel:", parseOrImportError); setExcelError(`Erreur Excel: ${parseOrImportError.message}`); toast({ variant: "destructive", title: "Erreur Fichier Excel", description: parseOrImportError.message, duration: 7000 });
        } finally { setIsExcelLoading(false); }
      };
      reader.onerror = () => { console.error("Erreur FileReader Excel:", reader.error); setExcelError("Impossible de lire le fichier Excel."); toast({ variant: "destructive", title: "Erreur Excel", description: "Impossible de lire." }); setIsExcelLoading(false); };
      reader.readAsArrayBuffer(excelFile);
    } catch (e: any) { console.error("Erreur générale import Excel:", e); setExcelError(e.message); toast({ variant: "destructive", title: "Erreur Excel Inconnue", description: e.message }); setIsExcelLoading(false); }
  };

  // --- PIX File Handling ---
  const handlePixFilesSelected = (newFiles: File[]) => {
    if (newFiles.length > 0) {
      const csvFiles = newFiles.filter(file => file.type === 'text/csv' || file.name.endsWith('.csv'));

      if (csvFiles.length !== newFiles.length) {
        toast({
          variant: 'destructive',
          title: 'Type de Fichier Invalide',
          description: 'Seuls les fichiers CSV sont autorisés pour PIX. Les autres ont été ignorés.',
        });
      }
      setPixFiles(prevFiles => [...prevFiles, ...csvFiles]);
    }
  };

  const handleRemovePixFile = (fileName: string) => {
    setPixFiles(prevFiles => prevFiles.filter(file => file.name !== fileName));
  };

  const readFileAsText = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => event.target?.result ? resolve(event.target.result as string) : reject(new Error("Erreur de lecture du fichier."));
      reader.onerror = () => reject(new Error("Erreur de lecture du fichier."));
      reader.readAsText(file, 'UTF-8');
    });
  };

  const parsePixCSV = (csvText: string): { headers: string[]; rowsData: string[][] } => {
    const lines = csvText.trim().split(/\r\n|\n/);
    if (lines.length === 0) return { headers: [], rowsData: [] };
    let firstLineContent = lines[0].startsWith('\uFEFF') ? lines[0].substring(1) : lines[0];
    const delimiter = firstLineContent.includes(';') ? ';' : ',';
    const headers = firstLineContent.split(delimiter).map(h => h.replace(/"/g, '').replace(/\s+/g, ' ').trim());
    const rowsData = lines.slice(1).map(line => line.split(delimiter).map(cell => cell.replace(/"/g, '').trim()));
    return { headers, rowsData };
  };

  const extractClasseFromFileName = (fileName: string): string => {
    const prefix = "resultats_";
    const suffix = ".csv";
    const startIndex = fileName.indexOf(prefix);
    const endIndex = fileName.lastIndexOf(suffix);
    if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex + prefix.length) {
      return fileName.substring(startIndex + prefix.length, endIndex).replace(/_/g, ' ');
    }
    if (endIndex !== -1) {
      const nameWithoutSuffix = fileName.substring(0, endIndex);
      const lastUnderscore = nameWithoutSuffix.lastIndexOf('_');
      if (lastUnderscore !== -1 && lastUnderscore < nameWithoutSuffix.length -1) return nameWithoutSuffix.substring(lastUnderscore + 1).replace(/_/g, ' ');
      return nameWithoutSuffix.replace(/_/g, ' ');
    }
    return "N/A";
  };

  const handlePixSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pixFiles.length === 0) {
      toast({ variant: 'destructive', title: 'Aucun Fichier PIX Sélectionné', description: 'Veuillez sélectionner au moins un fichier CSV PIX.' });
      return;
    }
    if (isLockStatusLoading) {
      const errorMsg = "Verification du verrouillage en cours.";
      setPixError(errorMsg);
      toast({ variant: 'destructive', title: 'Verrouillage en cours de chargement', description: errorMsg, duration: 7000 });
      return;
    }
    if (lockStatusError) {
      setPixError(lockStatusError);
      toast({ variant: 'destructive', title: 'Verification du verrouillage impossible', description: lockStatusError, duration: 7000 });
      return;
    }
    if (isPixImportLocked) {
      const errorMsg = `L'import PIX est verrouille pour l'annee ${importYear}.`;
      setPixError(errorMsg);
      toast({ variant: 'destructive', title: 'Import verrouille', description: errorMsg, duration: 7000 });
      return;
    }
    setIsPixProcessing(true);
    setPixError(null);
    const allStudentsFromFiles: PixStudentData[] = [];

    let filesParsedSuccessfully = 0;
    const fileProcessingErrors: { fileName: string; message: string }[] = [];

    for (const file of pixFiles) {
      const classeFromFile = extractClasseFromFileName(file.name);
      try {
        const fileContent = await readFileAsText(file);
        const { headers: rawCsvHeaders, rowsData } = parsePixCSV(fileContent);
        if (rawCsvHeaders.length === 0 || rowsData.length === 0) {
            continue;
        }

        const lowerCaseCsvHeaderToIndexMap = Object.fromEntries(rawCsvHeaders.map((h, i) => [normalizePixHeader(h), i]));
        const baseRequiredCanonicalHeaders = ["Numéro de certification", "Prénom", "Nom", "Date de naissance", "Statut", "Nombre de Pix", "Session", "Date de passage de la certification"];
        const detailScoreHeaders = ["1.1", "1.2", "1.3", "2.1", "2.2", "2.3", "2.4", "3.1", "3.2", "3.3", "3.4", "4.1", "4.2", "4.3", "5.1", "5.2"] as const satisfies ReadonlyArray<PixDetailScoreKey>;
        const requiredCanonicalHeaders = [...baseRequiredCanonicalHeaders, ...detailScoreHeaders];
        const finalHeaderIndexes: Record<string, number> = {};

        for (const canonicalHeader of requiredCanonicalHeaders) {
          const acceptedHeaders = PIX_CANONICAL_HEADER_ALIASES[canonicalHeader] ?? [canonicalHeader];
          const columnIndex = acceptedHeaders
            .map((header) => lowerCaseCsvHeaderToIndexMap[normalizePixHeader(header)])
            .find((index): index is number => index !== undefined);
          if (columnIndex === undefined && baseRequiredCanonicalHeaders.includes(canonicalHeader)) {
            throw new Error(`Colonne obligatoire manquante: "${acceptedHeaders.join('" ou "')}"`);
          }
          if (columnIndex !== undefined) finalHeaderIndexes[canonicalHeader] = columnIndex;
        }

        for (const row of rowsData) {
          const numeroCertification = row[finalHeaderIndexes["Numéro de certification"]];
          const nombrePixStr = row[finalHeaderIndexes["Nombre de Pix"]];
          const datePassageCertification = row[finalHeaderIndexes["Date de passage de la certification"]];
          if (!numeroCertification || !datePassageCertification || !nombrePixStr || isNaN(parseInt(nombrePixStr, 10))) continue;

          const dateParts = datePassageCertification.split('/');
          const anneeCertification = dateParts.length === 3 && dateParts[2].length >= 2 ? (dateParts[2].length === 4 ? dateParts[2] : `20${dateParts[2]}`) : 'N/A';
          if (anneeCertification === 'N/A') continue;

          const studentData: PixStudentData = {
            numeroCertification,
            prenom: row[finalHeaderIndexes["Prénom"]],
            nom: row[finalHeaderIndexes["Nom"]],
            dateNaissance: row[finalHeaderIndexes["Date de naissance"]],
            statut: row[finalHeaderIndexes["Statut"]],
            nombrePix: parseInt(nombrePixStr, 10),
            session: row[finalHeaderIndexes["Session"]],
            datePassageCertification, anneeCertification, classe: classeFromFile,
            "1.1": "0", "1.2": "0", "1.3": "0", "2.1": "0", "2.2": "0", "2.3": "0", "2.4": "0", "3.1": "0", "3.2": "0", "3.3": "0", "3.4": "0", "4.1": "0", "4.2": "0", "4.3": "0", "5.1": "0", "5.2": "0"
          };
          detailScoreHeaders.forEach(header => {
             if (finalHeaderIndexes[header] !== undefined) {
                const rawValue = row[finalHeaderIndexes[header]];
                const detailScores = studentData as Record<PixDetailScoreKey, string>;
                detailScores[header] = (rawValue === "-" || rawValue === "" || rawValue === undefined) ? "0" : rawValue;
             }
          });
          allStudentsFromFiles.push(studentData);
        }
        filesParsedSuccessfully++;
      } catch (error: any) {
        console.error(`Erreur traitement fichier PIX ${file.name}:`, error);
        fileProcessingErrors.push({ fileName: file.name, message: error.message });
      }
    }

    if (fileProcessingErrors.length > 0) {
      const errorSummary = fileProcessingErrors.map(e => `${e.fileName}: ${e.message}`).join('; ');
      setPixError(`Erreurs lors de l'analyse: ${errorSummary}`);
      toast({
        variant: 'destructive',
        title: `Erreur dans ${fileProcessingErrors.length} fichier(s)`,
        description: `Certains fichiers n'ont pas pu être analysés. ${fileProcessingErrors[0].fileName}: ${fileProcessingErrors[0].message}`,
        duration: 8000
      });
    }

    if (allStudentsFromFiles.length > 0) {
      if (!callImportPixResults) {
        toast({ variant: 'destructive', title: 'Erreur de configuration', description: 'La fonction d\'import PIX n\'est pas disponible.' });
        setIsPixProcessing(false);
        return;
      }

      const successMessage = `${filesParsedSuccessfully} fichier(s) analysé(s) avec succès. Envoi de ${allStudentsFromFiles.length} fiches.`;
      toast({ title: 'Analyse terminée', description: successMessage });

      try {
        const result = await callImportPixResults({ students: allStudentsFromFiles, expectedYear: importYear });
        if (result.data.success) {
            toast({ title: 'Sauvegarde PIX Réussie!', description: result.data.message as string, action: <CheckCircle className="text-green-500" /> });
            setPixFiles([]);
        } else {
            throw new Error((result.data as any).message || "Une erreur inconnue est survenue lors de l'enregistrement local.");
        }
      } catch (error: any) {
        console.error("Erreur d'appel de la fonction importPixResults:", error);
        const errorMessage = getCallableErrorMessage(error, "Impossible de sauvegarder les donnees PIX.", "importPixResults");
        setPixError(`Erreur de sauvegarde PIX : ${errorMessage}`);
        toast({ variant: 'destructive', title: 'Erreur de sauvegarde PIX locale', description: errorMessage });
      }
    } else if (pixFiles.length > 0 && filesParsedSuccessfully === 0) {
        toast({ variant: 'destructive', title: 'Aucune Donnée PIX Valide', description: 'Aucune donnée élève n\'a pu être extraite des fichiers PIX.' });
    }

    setIsPixProcessing(false);
  };


  return (
    <div className="space-y-8 p-1 md:p-4">
      <header className="mb-6">
        <h1 className="text-3xl font-bold text-foreground tracking-tight">Importer des Données</h1>
        <p className="text-muted-foreground mt-1">
          Importez les élèves depuis SIECLE / BEE, les résultats officiels du brevet ou les certifications PIX.
        </p>
      </header>

       <Card className="shadow-lg rounded-lg">
        <CardHeader>
          <CardTitle className="text-xl flex items-center">
            <CalendarDays className="mr-2 h-5 w-5 text-primary" />
            Étape 1 : Choisir l’année du brevet
          </CardTitle>
          <CardDescription>
            Choisissez l’année de la session de juin : la rentrée de septembre 2026 prépare le brevet 2027. À partir de septembre, l’année suivante est proposée ; vous pouvez choisir une autre session non verrouillée.
          </CardDescription>
        </CardHeader>
        <CardContent>
           <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  id="importYear-trigger"
                  variant={"outline"}
                  className={`w-full max-w-xs justify-start text-left font-normal ${!selectedStartYear && "text-muted-foreground"}`}
                  disabled={isExcelLoading || isExcelImporting || isPixProcessing || isOfficialStudentBusy || isTemplateDownloading}
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
                  initialDisplayYear={initialPickerYear}
                />
              </PopoverContent>
            </Popover>
            {lockStatusError && (
              <div className="mt-4 flex items-center text-sm text-destructive bg-destructive/10 p-3 rounded-md">
                <AlertTriangle className="mr-2 h-4 w-4" />
                {lockStatusError}
              </div>
            )}
        </CardContent>
      </Card>


      <OfficialStudentImport
        year={importYear}
        onBusyChange={setIsOfficialStudentBusy}
        disabled={isLockStatusLoading || !!lockStatusError || isBrevetBlancImportLocked || isExcelImporting || isPixProcessing}
        disabledReason={isLockStatusLoading ? "Vérification du verrouillage en cours." : lockStatusError || (isBrevetBlancImportLocked ? `L’import des élèves est verrouillé pour ${importYear}.` : undefined)}
      />

      {/* Excel Import Card (Official Brevet Results) */}
      <Card className="shadow-lg rounded-lg">
        <CardHeader>
          <CardTitle className="text-xl flex items-center">
            <FileText className="mr-2 h-5 w-5 text-primary" />
            Importer Résultats Brevet Officiels (Excel)
            </CardTitle>
          <CardDescription>
            Remplissez puis importez le modèle prérempli (.xlsx), ou téléversez le fichier officiel Cyclades (.xlsx, .xls). Pour la session 2026 et les suivantes,
            les notes attendues sont sur 20 et les variantes usuelles d&apos;en-têtes sont acceptées.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <StudentTemplateDownload
            kind="dnb"
            year={importYear}
            disabled={isExcelLoading || isExcelImporting || isOfficialStudentBusy}
            onBusyChange={(busy) => {
              setIsTemplateDownloading(busy);
              if (busy) setIsPopoverOpen(false);
            }}
          />
          <ImportFileDropzone
            id="excel-file-upload-input"
            accept=".xlsx, .xls, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
            prompt={<>Glissez-déposez (.xlsx, .xls) ou <span className="font-semibold text-primary hover:underline">cliquez</span></>}
            onFilesSelected={handleExcelFilesSelected}
            disabled={isExcelLoading || isExcelImporting || isPixProcessing}
          >
            {excelFileName && <p className="mt-3 text-sm text-muted-foreground">Fichier Excel : {excelFileName}</p>}
          </ImportFileDropzone>
          <div className="flex justify-end mt-4">
            <Button onClick={parseAndImportExcelData} disabled={!excelFile || isExcelLoading || isExcelImporting || !importYear.trim() || isPixProcessing || isLockStatusLoading || !!lockStatusError || isBrevetImportLocked || isOfficialStudentBusy} className="w-full sm:w-auto" >
              {(isExcelLoading || isExcelImporting) ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Import className="mr-2 h-4 w-4" />}
              {isExcelLoading ? "Lecture Excel..." : (isExcelImporting ? "Import Excel..." : "Importer Résultats Officiels (Excel)")}
            </Button>
          </div>
          {isBrevetImportLocked && !excelError && (
            <div className="flex items-center text-sm text-destructive bg-destructive/10 p-3 rounded-md">
              <AlertTriangle className="mr-2 h-4 w-4" />
              {`L'import des resultats officiels est verrouille pour l'annee ${importYear}.`}
            </div>
          )}
          {excelError && ( <div className="flex items-center text-sm text-destructive bg-destructive/10 p-3 rounded-md"> <AlertTriangle className="mr-2 h-4 w-4" /> {excelError} </div> )}
        </CardContent>
      </Card>

      <Separator className="my-8" />

      {/* PIX Import Card */}
      <Card className="shadow-lg rounded-lg">
        <CardHeader>
          <CardTitle className="text-xl flex items-center">
            <Shapes className="mr-2 h-5 w-5 text-primary" />
            Importer Certifications PIX (CSV)
          </CardTitle>
          <CardDescription>
            Téléversez un ou plusieurs fichiers CSV de résultats PIX. La classe est déduite du nom du fichier.
          </CardDescription>
        </CardHeader>
        <form onSubmit={handlePixSubmit}>
          <CardContent className="space-y-6">
            <ImportFileDropzone
              id="pix-csv-files"
              accept=".csv,text/csv"
              multiple
              prompt={<>Glissez-déposez vos fichiers CSV PIX ou <span className="font-semibold text-primary hover:underline">cliquez</span></>}
              onFilesSelected={handlePixFilesSelected}
              disabled={isPixProcessing || isExcelImporting}
            />

            {pixFiles.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-md font-medium">Fichiers PIX Sélectionnés:</h3>
                <ScrollArea className="h-40 w-full rounded-md border p-3">
                  <ul className="space-y-2">
                    {pixFiles.map(file => (
                      <li key={file.name} className="flex items-center justify-between text-sm p-2 bg-secondary/50 rounded-md">
                        <div className="flex items-center space-x-2 truncate">
                          <FileText className="h-4 w-4 text-primary flex-shrink-0" />
                          <span className="truncate" title={file.name}>{file.name} (Classe: {extractClasseFromFileName(file.name)})</span>
                        </div>
                        <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => handleRemovePixFile(file.name)} aria-label={`Retirer ${file.name}`}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                </ScrollArea>
              </div>
            )}
             {isPixImportLocked && !pixError && (
               <div className="flex items-center text-sm text-destructive bg-destructive/10 p-3 rounded-md">
                 <AlertTriangle className="mr-2 h-4 w-4" />
                 {`L'import PIX est verrouille pour l'annee ${importYear}.`}
               </div>
             )}
             {pixError && ( <div className="flex items-center text-sm text-destructive bg-destructive/10 p-3 rounded-md"> <AlertTriangle className="mr-2 h-4 w-4" /> {pixError} </div> )}
          </CardContent>
          <CardFooter>
            <Button type="submit" className="w-full sm:w-auto" disabled={isPixProcessing || pixFiles.length === 0 || isExcelImporting || isLockStatusLoading || !!lockStatusError || isPixImportLocked}>
              {isPixProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Database className="mr-2 h-4 w-4" />}
              {isPixProcessing ? 'Traitement PIX...' : `Importer ${pixFiles.length} Fichier(s) PIX`}
            </Button>
          </CardFooter>
        </form>
      </Card>

    </div>
  );
}
