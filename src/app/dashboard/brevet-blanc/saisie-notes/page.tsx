'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { getAuth, type User, onAuthStateChanged } from '@/lib/local/session';
import { collection, query, where, getDocs } from '@/lib/local/store';
import { httpsCallable } from '@/lib/local/functions';
import { app, db, functions as functionsInstance } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Save, Frown, PenSquare, Lock, RefreshCw } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { FullScreenLoader } from '@/components/ui/full-screen-loader';
import { ErrorDisplay } from '@/components/ui/error-display';
import { getBrevetConfigForYear } from '@/lib/brevet-config';
import { normalizeClassName } from '@/lib/student-class';
import {
  type BrevetBlancLockStatus,
  type BrevetExam,
  type BrevetExamLocks,
  formatBrevetExamLabel,
  getBrevetExamLocks,
  getCurrentBrevetLockYear,
} from '@/lib/brevet-blanc-lock';

interface Student {
  id: string;
  NOM: string;
  PRENOM: string;
  CLASSE?: string;
  notes?: { [subject: string]: { bb1?: number; bb2?: number; } };
}

interface EditedNotes {
  [studentId: string]: {
    [subject: string]: { bb1: string; bb2: string; }
  };
}

interface PendingNoteUpdate {
  studentId: string;
  subject: string;
  noteBB1?: number | null;
  noteBB2?: number | null;
}

const ADMIN_EMAIL = "local-user@localhost";
const AUTO_SAVE_THRESHOLD = 10;
const HG_EMC_ROLE = "Histoire-Géographie-Enseignement moral et civique";
const MATIERES_HG_EMC = ["Histoire-Géographie", "Enseignement moral et civique"];
const ALL_SUBJECTS_VALUE = '__all_subjects__';
const ALL_BREVET_EXAMS: BrevetExam[] = ["bb1", "bb2"];
const EMPTY_EXAM_LOCKS: BrevetExamLocks = { bb1: false, bb2: false };

const useUserSubjectAndAdmin = () => {
  const [subject, setSubject] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const auth = getAuth(app);
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        setIsAdmin(currentUser.email === ADMIN_EMAIL);
        const idTokenResult = await currentUser.getIdTokenResult();
        const userSubject = idTokenResult.claims.subject as string | undefined;
        setSubject(userSubject ?? null);
      } else {
        setSubject(null);
        setUser(null);
        setIsAdmin(false);
      }
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, []);

  return { subject, isLoading, user, isAdmin };
};

export default function SaisieNotesPage() {
  const currentYear = useMemo(() => getCurrentBrevetLockYear(), []);
  const { subject, isLoading: isAuthLoading, user, isAdmin } = useUserSubjectAndAdmin();
  const [selectedYear, setSelectedYear] = useState<string>('');
  const [selectedAdminSubject, setSelectedAdminSubject] = useState(ALL_SUBJECTS_VALUE);
  const [availableYears, setAvailableYears] = useState<string[]>([]);
  const [isYearsLoading, setIsYearsLoading] = useState(true);
  const [students, setStudents] = useState<Student[]>([]);
  const [editedNotes, setEditedNotes] = useState<EditedNotes>({});
  const [validationErrors, setValidationErrors] = useState<Record<string, string | null>>({});
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [examLocks, setExamLocks] = useState<BrevetExamLocks>(EMPTY_EXAM_LOCKS);
  const { toast } = useToast();

  const [dirtyChanges, setDirtyChanges] = useState<Set<string>>(new Set());
  const [lastSaveTime, setLastSaveTime] = useState<Date | null>(null);

  const brevetConfig = useMemo(
    () => getBrevetConfigForYear(selectedYear || currentYear),
    [selectedYear, currentYear]
  );

  const activeSubject = subject ?? (isAdmin ? selectedAdminSubject : null);

  const subjectsToDisplay = useMemo(() => {
    if (!activeSubject) return [];
    if (activeSubject === ALL_SUBJECTS_VALUE) return [...brevetConfig.subjects];
    if (activeSubject === HG_EMC_ROLE) return MATIERES_HG_EMC;
    if (brevetConfig.subjects.includes(activeSubject)) return [activeSubject];
    return [];
  }, [activeSubject, brevetConfig]);

  const hasValidationErrors = useMemo(
    () => Object.values(validationErrors).some(v => v !== null),
    [validationErrors]
  );

  const lockedExamLabels = useMemo(
    () => ALL_BREVET_EXAMS.filter((exam) => examLocks[exam]).map(formatBrevetExamLabel),
    [examLocks]
  );

  useEffect(() => {
    const fetchYears = async () => {
      if (!user) return;
      setIsYearsLoading(true);
      try {
        if (isAdmin) {
          const bbRef = collection(db, 'BrevetBlanc');
          const querySnapshot = await getDocs(bbRef);
          const yearsFromDb = new Set<string>();
          querySnapshot.forEach((doc) => {
            const data = doc.data();
            if (data.anneeScolaire) yearsFromDb.add(data.anneeScolaire);
          });
          yearsFromDb.add(currentYear);
          const sortedYears = Array.from(yearsFromDb).sort((a, b) => b.localeCompare(a));
          setAvailableYears(sortedYears);
          if (sortedYears.length > 0 && !selectedYear) {
            setSelectedYear(sortedYears[0]);
          }
        } else {
          setAvailableYears([currentYear]);
          setSelectedYear(currentYear);
        }
      } catch (err: any) {
        console.error("Error fetching years:", err);
        toast({ variant: 'destructive', title: 'Erreur', description: "Impossible de charger les années scolaires." });
      } finally {
        setIsYearsLoading(false);
      }
    };
    fetchYears();
  }, [toast, user, isAdmin, selectedYear, currentYear]);

  const callGetBrevetBlancLockStatus = useMemo(() =>
    functionsInstance ? httpsCallable<void, {success: boolean, lockStatus: BrevetBlancLockStatus}>(functionsInstance, 'getBrevetBlancLockStatus') : null,
  []);

  const fetchStudentsAndStatus = useCallback(async () => {
    if (subjectsToDisplay.length === 0) {
      setStudents([]);
      setEditedNotes({});
      setExamLocks(EMPTY_EXAM_LOCKS);
      if (!activeSubject && !isAuthLoading) setError(null);
      else if (!selectedYear && !isYearsLoading) setError("Veuillez sélectionner une année scolaire.");
      setIsLoadingData(false);
      return;
    }

    setIsLoadingData(true);
    setError(null);
    setValidationErrors({});
    setDirtyChanges(new Set());

    try {
      const [studentsSnapshot, lockStatusResult] = await Promise.all([
        getDocs(query(collection(db, 'BrevetBlanc'), where("anneeScolaire", "==", selectedYear))),
        callGetBrevetBlancLockStatus ? callGetBrevetBlancLockStatus() : Promise.resolve(null)
      ]);

      const allLocks = lockStatusResult?.data.lockStatus || {};
      setExamLocks(getBrevetExamLocks(allLocks, selectedYear));

      const fetchedStudents: Student[] = [];
      const initialNotes: EditedNotes = {};
      studentsSnapshot.forEach(docSnap => {
        const data = docSnap.data();
        const studentData: Student = {
          id: docSnap.id,
          NOM: data.NOM,
          PRENOM: data.PRENOM,
          CLASSE: normalizeClassName(data.CLASSE),
          notes: data.notes,
        };
        fetchedStudents.push(studentData);
        initialNotes[docSnap.id] = {};
        subjectsToDisplay.forEach(subj => {
          const subjectNotes = data.notes?.[subj];
          initialNotes[docSnap.id][subj] = {
            bb1: subjectNotes?.bb1?.toString() ?? '',
            bb2: subjectNotes?.bb2?.toString() ?? '',
          };
        });
      });
      fetchedStudents.sort((a, b) => (a.CLASSE ?? '').localeCompare(b.CLASSE ?? '') || a.NOM.localeCompare(b.NOM));
      setStudents(fetchedStudents);
      setEditedNotes(initialNotes);
    } catch (err: any) {
      console.error("Erreur de récupération des élèves/statut:", err);
      const msg = "Impossible de charger les données. " + err.message;
      setError(msg);
      toast({ variant: 'destructive', title: 'Erreur', description: msg });
    } finally {
      setIsLoadingData(false);
    }
  }, [subjectsToDisplay, selectedYear, toast, isAuthLoading, isYearsLoading, callGetBrevetBlancLockStatus, activeSubject]);

  useEffect(() => {
    fetchStudentsAndStatus();
  }, [fetchStudentsAndStatus]);

  const handleSaveChanges = useCallback(async (isAutoSave = false) => {
    if (subjectsToDisplay.length === 0 || !functionsInstance) {
      toast({ variant: 'destructive', title: 'Erreur', description: "Impossible de sauvegarder, fonction non disponible." });
      return;
    }
    if (hasValidationErrors) {
      toast({ variant: 'destructive', title: 'Erreurs de validation', description: "Veuillez corriger les notes invalides avant de sauvegarder." });
      return;
    }
    if (dirtyChanges.size === 0) {
      if (!isAutoSave) {
        toast({ title: 'Information', description: "Aucune modification à enregistrer." });
      }
      return;
    }

    const payloadByStudentAndSubject = new Map<string, PendingNoteUpdate>();
    dirtyChanges.forEach((dirtyKey) => {
      const [studentId, subjectKey, exam] = dirtyKey.split('|') as [string, string, BrevetExam];
      const studentNotes = editedNotes[studentId]?.[subjectKey];
      if (!studentNotes) {
        return;
      }

      const payloadKey = `${studentId}|${subjectKey}`;
      const payloadEntry = payloadByStudentAndSubject.get(payloadKey) ?? {
        studentId,
        subject: subjectKey,
      };
      const noteValue = studentNotes[exam] === '' ? null : parseFloat(studentNotes[exam]);

      if (exam === 'bb1') {
        payloadEntry.noteBB1 = noteValue;
      } else {
        payloadEntry.noteBB2 = noteValue;
      }

      payloadByStudentAndSubject.set(payloadKey, payloadEntry);
    });

    const payload = Array.from(payloadByStudentAndSubject.values());
    if (payload.length === 0) {
      if (!isAutoSave) {
        toast({ title: 'Information', description: "Aucune modification à enregistrer." });
      }
      return;
    }

    if (examLocks.bb1 && payload.some((update) => Object.prototype.hasOwnProperty.call(update, 'noteBB1'))) {
      toast({ variant: 'destructive', title: 'BB1 fermé', description: `La saisie du ${formatBrevetExamLabel('bb1')} est fermée pour l'année ${selectedYear}.` });
      return;
    }

    if (examLocks.bb2 && payload.some((update) => Object.prototype.hasOwnProperty.call(update, 'noteBB2'))) {
      toast({ variant: 'destructive', title: 'BB2 fermé', description: `La saisie du ${formatBrevetExamLabel('bb2')} est fermée pour l'année ${selectedYear}.` });
      return;
    }

    setIsSaving(true);

    try {
      const callUpdateBrevetBlancNotes = httpsCallable(functionsInstance, 'updateBrevetBlancNotes');
      await callUpdateBrevetBlancNotes({ updates: payload });
      toast({ title: 'Succès', description: `${payload.length} entrée(s) de note(s) enregistrée(s).` });
      setDirtyChanges(new Set());
      setLastSaveTime(new Date());
    } catch (err: any) {
      const isPermissionError = err?.code === 'functions/permission-denied' || (err?.message && err.message.includes("permission"));

      if (isPermissionError) {
        console.warn("Permission denied error detected. Forcing token refresh and retrying...");
        try {
          const auth = getAuth(app);
          if (auth.currentUser) {
            await auth.currentUser.getIdToken(true);
          }

          const callUpdateBrevetBlancNotes = httpsCallable(functionsInstance, 'updateBrevetBlancNotes');
          await callUpdateBrevetBlancNotes({ updates: payload });

          toast({ title: 'Succès', description: `Vos droits ont été mis à jour et ${payload.length} entrée(s) de note(s) ont été enregistrée(s).` });
          setDirtyChanges(new Set());
          setLastSaveTime(new Date());
        } catch (retryErr: any) {
          console.error("Erreur lors de la nouvelle tentative de sauvegarde :", retryErr);
          toast({ variant: 'destructive', title: 'Erreur de sauvegarde persistante', description: retryErr.message || "Une erreur est survenue lors de la nouvelle tentative." });
        }
      } else {
        console.error("Erreur lors de la sauvegarde :", err);
        toast({ variant: 'destructive', title: 'Erreur de sauvegarde', description: err.message });
      }
    } finally {
      setIsSaving(false);
    }
  }, [subjectsToDisplay, hasValidationErrors, toast, dirtyChanges, editedNotes, examLocks, selectedYear]);

  useEffect(() => {
    if (dirtyChanges.size >= AUTO_SAVE_THRESHOLD && !isSaving) {
      handleSaveChanges(true);
    }
  }, [dirtyChanges, isSaving, handleSaveChanges]);

  const handleNoteChange = (studentId: string, subjectKey: string, exam: BrevetExam, value: string) => {
    const sanitizedValue = value.replace(/[^0-9,.]/g, '').replace(',', '.');
    const noteAsFloat = parseFloat(sanitizedValue);
    const errorKey = `${studentId}-${subjectKey}-${exam}`;
    const maxScore = brevetConfig.maxScores[subjectKey] ?? null;

    setDirtyChanges(prev => new Set(prev).add(`${studentId}|${subjectKey}|${exam}`));

    if (sanitizedValue === '') {
      setValidationErrors(prev => ({ ...prev, [errorKey]: null }));
    } else if (maxScore !== null && !isNaN(noteAsFloat) && (noteAsFloat < 0 || noteAsFloat > maxScore)) {
      setValidationErrors(prev => ({ ...prev, [errorKey]: `Note entre 0 et ${maxScore}` }));
    } else {
      setValidationErrors(prev => ({ ...prev, [errorKey]: null }));
    }

    setEditedNotes(prev => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        [subjectKey]: {
          ...prev[studentId]?.[subjectKey],
          [exam]: sanitizedValue,
        }
      },
    }));
  };

  const renderContent = () => {
    if (isAuthLoading || (selectedYear && isLoadingData) || (!activeSubject && !isAdmin)) {
      return <FullScreenLoader text="Vérification des autorisations..." />;
    }

    if (error) {
      return <ErrorDisplay asCard message={error} onRetry={fetchStudentsAndStatus} />;
    }

    if (students.length === 0) {
      return (
        <Card className="text-center">
          <CardHeader>
            <CardTitle className="flex justify-center items-center">
              <Frown className="mr-2 h-6 w-6"/>
              Aucun élève trouvé
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <p className="text-muted-foreground">Aucun élève trouvé pour l'année scolaire {selectedYear}. Veuillez importer une liste d'élèves.</p>
          </CardContent>
        </Card>
      );
    }

    const displaySubjectName = activeSubject === ALL_SUBJECTS_VALUE
      ? 'Toutes les matières'
      : activeSubject === HG_EMC_ROLE
        ? 'Histoire-Géo & EMC'
        : activeSubject;

    return (
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
            <div className="flex-1">
              <CardTitle className="text-2xl flex items-center">
                <PenSquare className="mr-3 h-6 w-6 text-primary"/>
                Saisie des notes pour : {displaySubjectName || '...'}
              </CardTitle>
              <CardDescription>Année scolaire : {selectedYear}. Les notes BB1 et BB2 sont enregistrées localement, avec une sauvegarde automatique toutes les {AUTO_SAVE_THRESHOLD} modifications.</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => void fetchStudentsAndStatus()} disabled={isLoadingData || isSaving}>
              <RefreshCw className={`mr-2 h-4 w-4 ${isLoadingData ? 'animate-spin' : ''}`} />
              Actualiser les notes
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {lockedExamLabels.length > 0 && (
            <div role="alert" className="mb-4 flex items-center gap-3 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              <Lock className="h-5 w-5 flex-shrink-0" />
              <p className="font-bold">
                Saisie fermée pour {lockedExamLabels.join(' et ')} sur l'année {selectedYear}.
              </p>
            </div>
          )}
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nom</TableHead>
                  <TableHead>Prénom</TableHead>
                  <TableHead>Classe</TableHead>
                  {subjectsToDisplay.map(subj => {
                    const maxScore = brevetConfig.maxScores[subj] ?? '';
                    return (
                      <React.Fragment key={subj}>
                        <TableHead className="w-[200px]">{subj} BB1 (/ {maxScore})</TableHead>
                        <TableHead className="w-[200px]">{subj} BB2 (/ {maxScore})</TableHead>
                      </React.Fragment>
                    );
                  })}
                </TableRow>
              </TableHeader>
              <TableBody>
                {students.map(student => (
                  <TableRow key={student.id}>
                    <TableCell className="font-medium">{student.NOM}</TableCell>
                    <TableCell>{student.PRENOM}</TableCell>
                    <TableCell>{student.CLASSE ?? ''}</TableCell>
                    {subjectsToDisplay.map(subj => {
                      const errorKeyBb1 = `${student.id}-${subj}-bb1`;
                      const errorKeyBb2 = `${student.id}-${subj}-bb2`;
                      return (
                        <React.Fragment key={subj}>
                          <TableCell>
                            <Input
                              type="text"
                              placeholder="Note"
                              value={editedNotes[student.id]?.[subj]?.bb1 ?? ''}
                              onChange={e => handleNoteChange(student.id, subj, 'bb1', e.target.value)}
                              className={`w-full ${validationErrors[errorKeyBb1] ? 'border-destructive' : ''}`}
                              disabled={isSaving || examLocks.bb1}
                            />
                            {validationErrors[errorKeyBb1] && <p className="text-xs text-destructive mt-1">{validationErrors[errorKeyBb1]}</p>}
                          </TableCell>
                          <TableCell>
                            <Input
                              type="text"
                              placeholder="Note"
                              value={editedNotes[student.id]?.[subj]?.bb2 ?? ''}
                              onChange={e => handleNoteChange(student.id, subj, 'bb2', e.target.value)}
                              className={`w-full ${validationErrors[errorKeyBb2] ? 'border-destructive' : ''}`}
                              disabled={isSaving || examLocks.bb2}
                            />
                            {validationErrors[errorKeyBb2] && <p className="text-xs text-destructive mt-1">{validationErrors[errorKeyBb2]}</p>}
                          </TableCell>
                        </React.Fragment>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex justify-end items-center gap-4 mt-6">
            <div className="text-sm text-muted-foreground">
              {isSaving ? (
                <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Sauvegarde...</span>
              ) : dirtyChanges.size > 0 ? (
                <span>{dirtyChanges.size} modification(s) en attente.</span>
              ) : lastSaveTime ? (
                <span>Dernière sauvegarde à {lastSaveTime.toLocaleTimeString()}.</span>
              ) : (
                <span>Aucune modification en attente.</span>
              )}
            </div>
            <Button onClick={() => handleSaveChanges(false)} disabled={isSaving || hasValidationErrors || dirtyChanges.size === 0}>
              {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Enregistrer
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6 p-1 md:p-4">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground tracking-tight">Saisie des Notes du Brevet Blanc</h1>
          <p className="text-muted-foreground mt-1">Saisissez et corrigez les notes BB1 et BB2 par matière.</p>
        </div>
        <div className="flex items-end gap-4">
          {isAdmin && !subject && (
            <div className="w-full sm:w-64">
              <Label htmlFor="subject-select">Matière</Label>
              <Select value={selectedAdminSubject} onValueChange={setSelectedAdminSubject} disabled={isSaving || isLoadingData}>
                <SelectTrigger id="subject-select">
                  <SelectValue placeholder="Choisir une matière" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_SUBJECTS_VALUE}>Toutes les matières</SelectItem>
                  {brevetConfig.subjects.map((candidate) => (
                    <SelectItem key={candidate} value={candidate}>{candidate}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {isAdmin && (
            <div className="w-full sm:w-52">
              <Label htmlFor="year-select">Année Scolaire</Label>
              <Select value={selectedYear} onValueChange={setSelectedYear} disabled={isYearsLoading || availableYears.length === 0 || isSaving}>
                <SelectTrigger id="year-select">
                  <SelectValue placeholder={isYearsLoading ? "Chargement..." : "Choisir..."} />
                </SelectTrigger>
                <SelectContent>
                  {!isYearsLoading && availableYears.map(year => (
                    <SelectItem key={year} value={year}>{year}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <Button onClick={() => handleSaveChanges(false)} disabled={isSaving || hasValidationErrors || dirtyChanges.size === 0}>
            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Enregistrer maintenant
          </Button>
        </div>
      </header>
      {renderContent()}
    </div>
  );
}
