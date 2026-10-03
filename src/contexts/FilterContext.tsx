
"use client";

import type { ReactNode } from 'react';
import { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { collection, getDocs, type DocumentData } from '@/lib/local/store';
import { db } from '@/lib/firebase';
import { calculateBrevetBlancAverage, getBrevetConfigForYear } from '@/lib/brevet-config';
import { scholarshipFromMatchedBrevetBlanc } from '@/lib/brevet-blanc-scholarship';
import { normalizeBrevetSex, resolveBrevetSex } from '@/lib/brevet-sex';
import { BREVET_DATA_UPDATED_EVENT } from '@/lib/brevet-data-events';
import { normalizeClassName } from '@/lib/student-class';
import { resolveFilterSelection } from '@/lib/filter-selection';

export interface ProcessedStudentData {
  id: string; // Firestore document ID, unique per session for recent imports
  ine: string;
  nom: string;
  prenom: string;
  etablissement: string;
  anneeOriginale?: string; // The raw data['Série'] or other original year/serie field from Firestore
  academicYear?: string; // Parsed or directly imported e.g., "2023"
  serieType?: string; // Parsed e.g., "GÉNÉRALE"
  resultat?: string;
  moyenne?: number;
  totalGeneral?: number;
  noteControleContinu?: number;
  noteEpreuvesTerminales?: number;
  scoreFrancais?: number;
  scoreMaths?: number;
  scoreHistoireGeo?: number;
  scoreHistoireGeoSeul?: number;
  scoreEMC?: number;
  scoreSciences?: number;
  /** Sous-notes DNB 2026, conservées dans leur barème brut (respectivement /50, /10, /40, /10, /10, /10). */
  scoreFrancaisGrammaireComprehension?: number | 'Absent' | 'Dispensé';
  scoreFrancaisDictee?: number | 'Absent' | 'Dispensé';
  scoreFrancaisRedaction?: number | 'Absent' | 'Dispensé';
  scoreSciencesSvt?: number | 'Absent' | 'Dispensé';
  scoreSciencesPhysiqueChimie?: number | 'Absent' | 'Dispensé';
  scoreSciencesTechnologie?: number | 'Absent' | 'Dispensé';
  scoreOralDNB?: number;
  scoreLVE?: number;
  scoreArtsPlastiques?: number;
  scoreEducationMusicale?: number;
  scoreEPS?: number;
  scorePhysiqueChimie?: number;
  scoreSciencesVie?: number;
  scoreSocleCommun?: number;
  formerClass?: string;
  formerClassSource?: 'official' | 'brevetBlanc';
  brevetBlancBb1Average?: number;
  brevetBlancBb2Average?: number;
  sexe?: string;
  isBoursier?: boolean;
}

interface FilterContextType {
  isLoading: boolean;
  error: string | null;

  allStudents: ProcessedStudentData[]; // All students from the DB
  students: ProcessedStudentData[]; // Filtered students based on all filters

  availableAcademicYears: string[];
  selectedAcademicYear: string;
  setSelectedAcademicYear: (year: string) => void;

  availableSerieTypes: string[];
  selectedSerieType: string;
  setSelectedSerieType: (serie: string) => void;

  availableEstablishments: string[];
  selectedEstablishment: string;
  setSelectedEstablishment: (establishment: string) => void;

  ALL_ACADEMIC_YEARS_VALUE: string;
  ALL_SERIE_TYPES_VALUE: string;
  ALL_ESTABLISHMENTS_VALUE: string;

  parseStudentDoc: (doc: DocumentData) => ProcessedStudentData;
}

const FilterContext = createContext<FilterContextType | undefined>(undefined);

export const ALL_ACADEMIC_YEARS_VALUE = "__ALL_ACADEMIC_YEARS__";
export const ALL_SERIE_TYPES_VALUE = "__ALL_SERIE_TYPES__";
export const ALL_ESTABLISHMENTS_VALUE = "__ALL_ESTABLISHMENTS__";

const normalizeTextForComparison = (text: string | undefined): string => {
  if (text === null || text === undefined) return "";
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
};

const getAcademicYearSortKey = (value: string): number => {
  const match = value.match(/\b(19|20)\d{2}\b/);
  return match ? Number(match[0]) : Number.NEGATIVE_INFINITY;
};

const sortAcademicYearsDesc = (years: string[]): string[] =>
  [...years].sort((a, b) => {
    const yearDelta = getAcademicYearSortKey(b) - getAcademicYearSortKey(a);
    if (yearDelta !== 0) return yearDelta;
    return b.localeCompare(a);
  });

const getAcademicYearMatchKey = (value: unknown): string | undefined => {
  const matches = String(value ?? '').match(/\b(?:19|20)\d{2}\b/g);
  return matches?.[matches.length - 1];
};

const normalizeIne = (value: unknown): string =>
  String(value ?? '').trim().replace(/\s+/g, '').toUpperCase();

const parseOptionalNumber = (value: unknown): number | undefined => {
  if (value === undefined || value === null || String(value).trim() === "") return undefined;
  const parsed = Number(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : undefined;
};

type RawDnbSubscore = number | 'Absent' | 'Dispensé';

const parseOptionalRawDnbSubscore = (value: unknown): RawDnbSubscore | undefined => {
  if (value === undefined || value === null || String(value).trim() === '') return undefined;
  const raw = String(value).trim();
  const mark = raw.split('/')[0].trim().toLocaleLowerCase('fr-FR');
  if (mark === 'abs' || mark === 'absent') return 'Absent';
  if (mark === 'disp' || mark === 'dispense' || mark === 'dispensé') return 'Dispensé';
  const parsed = Number(mark.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : undefined;
};

const isPost2026Result = (academicYear: string | undefined, baremeEpreuves: unknown): boolean => {
  if (baremeEpreuves === 'sur20') return true;
  const yearMatch = academicYear?.match(/\b(19|20)\d{2}\b/);
  return yearMatch ? Number(yearMatch[0]) >= 2026 : false;
};

const normalizeScoreOutOf20 = (
  value: unknown,
  legacyMaximum: number,
  post2026: boolean,
): number | undefined => {
  const parsed = parseOptionalNumber(value);
  if (parsed === undefined) return undefined;
  return post2026 ? parsed : (parsed / legacyMaximum) * 20;
};

const parseOriginalSerieField = (rawSerieOriginale: string | undefined): { academicYearFallback?: string; serieType?: string } => {
  if (!rawSerieOriginale || String(rawSerieOriginale).trim() === "") return { academicYearFallback: undefined, serieType: undefined };

  const serieStr = String(rawSerieOriginale);
  const yearRegex = /(\d{4}[-\/]\d{4}|\b\d{4}\b)/;
  const yearMatch = serieStr.match(yearRegex);
  let academicYearFallback: string | undefined = undefined;
  let serieTypePart = serieStr;

  if (yearMatch && yearMatch[0]) {
    academicYearFallback = yearMatch[0];
    serieTypePart = serieStr.replace(yearMatch[0], '').trim();
  }

  const serieKeywords = ["GÉNÉRALE", "GENERALE", "PROFESSIONNELLE", "PRO", "BEPC", "TECHNIQUE", "TECHNOLOGIQUE", "MODERNE LONG", "MODERNE COURT"];
  let foundSerieKeyword: string | undefined = undefined;

  if (serieTypePart) {
    for (const keyword of serieKeywords) {
      if (normalizeTextForComparison(serieTypePart).includes(normalizeTextForComparison(keyword))) {
        const originalKeywordRegex = new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        const originalKeywordMatch = serieTypePart.match(originalKeywordRegex);
        foundSerieKeyword = originalKeywordMatch ? originalKeywordMatch[0] : keyword;
        break;
      }
    }
    if (!foundSerieKeyword && serieTypePart.trim() !== "" && serieTypePart.trim().toUpperCase() !== academicYearFallback?.toUpperCase()) {
        foundSerieKeyword = serieTypePart.trim();
    }
  }

  return { academicYearFallback, serieType: foundSerieKeyword };
};

const parseStudentDoc = (doc: DocumentData): ProcessedStudentData => {
    const data = doc.data();
    const anneeOriginaleField = data['Série'];
    const importedYear: string | undefined = data['anneeScolaireImportee'] || data.anneeScolaireImportee;
    const { academicYearFallback, serieType: parsedSerieType } = parseOriginalSerieField(anneeOriginaleField);
    const finalAcademicYear = importedYear || academicYearFallback;
    const finalSerieType = parsedSerieType;
    const post2026 = isPost2026Result(finalAcademicYear, data.baremeEpreuves);

    const socleCommunKey = '007 - 1 - Socle commun de connaissances, compétences, culture - Contrôle continu';
    const socleCommunValue = data.options?.[socleCommunKey];
    const socleCommunNum = socleCommunValue ? Number(String(socleCommunValue).replace(',', '.')) : NaN;
    const histoireGeoOutOf20 = normalizeScoreOutOf20(data.scoreHistoireGeo, 50, post2026);
    const emcOutOf20 = post2026 ? normalizeScoreOutOf20(data.scoreEMC, 20, true) : undefined;
    const histoireGeoEmcOutOf20 =
      post2026 && histoireGeoOutOf20 !== undefined && emcOutOf20 !== undefined
        ? ((histoireGeoOutOf20 * 1.5) + (emcOutOf20 * 0.5)) / 2
        : histoireGeoOutOf20;


    return {
        id: doc.id,
        ine: data.INE || doc.id,
        nom: data['Nom candidat'] || 'N/A',
        prenom: data['Prénom candidat'] || 'N/A',
        etablissement: data['Libellé Etablissement'] || 'N/A',
        anneeOriginale: anneeOriginaleField,
        academicYear: finalAcademicYear,
        serieType: finalSerieType,
        resultat: data['Résultat'],
        moyenne: data['Moyenne sur 20'] !== undefined && data['Moyenne sur 20'] !== null ? Number(data['Moyenne sur 20']) : undefined,
        totalGeneral: data['TOTAL GENERAL'] !== undefined && data['TOTAL GENERAL'] !== null ? Number(data['TOTAL GENERAL']) : undefined,
        noteControleContinu: parseOptionalNumber(data.noteControleContinu),
        noteEpreuvesTerminales: parseOptionalNumber(data.noteEpreuvesTerminales),
        scoreFrancais: normalizeScoreOutOf20(data.scoreFrancais, 100, post2026),
        scoreMaths: normalizeScoreOutOf20(data.scoreMaths, 100, post2026),
        scoreHistoireGeo: histoireGeoEmcOutOf20,
        scoreHistoireGeoSeul: post2026 ? histoireGeoOutOf20 : undefined,
        scoreEMC: emcOutOf20,
        scoreSciences: normalizeScoreOutOf20(data.scoreSciences, 50, post2026),
        // Ces six valeurs sont informatives : elles restent dans leur barème
        // d'origine et ne sont pas converties sur 20 comme les épreuves.
        scoreFrancaisGrammaireComprehension: parseOptionalRawDnbSubscore(data.scoreFrancaisGrammaireComprehension),
        scoreFrancaisDictee: parseOptionalRawDnbSubscore(data.scoreFrancaisDictee),
        scoreFrancaisRedaction: parseOptionalRawDnbSubscore(data.scoreFrancaisRedaction),
        scoreSciencesSvt: parseOptionalRawDnbSubscore(data.scoreSciencesSvt),
        scoreSciencesPhysiqueChimie: parseOptionalRawDnbSubscore(data.scoreSciencesPhysiqueChimie),
        scoreSciencesTechnologie: parseOptionalRawDnbSubscore(data.scoreSciencesTechnologie),
        scoreOralDNB: normalizeScoreOutOf20(data.scoreOralDNB, 100, post2026),
        scoreLVE: normalizeScoreOutOf20(data.scoreLVE, 50, post2026),
        scoreArtsPlastiques: normalizeScoreOutOf20(data.scoreArtsPlastiques, 50, post2026),
        scoreEducationMusicale: normalizeScoreOutOf20(data.scoreEducationMusicale, 50, post2026),
        scoreEPS: normalizeScoreOutOf20(data.scoreEPS, 100, post2026),
        scorePhysiqueChimie: normalizeScoreOutOf20(data.scorePhysiqueChimie, 50, post2026),
        scoreSciencesVie: normalizeScoreOutOf20(data.scoreSciencesVie, 50, post2026),
        scoreSocleCommun: !post2026 && !isNaN(socleCommunNum) ? (socleCommunNum / 400) * 20 : undefined,
        formerClass: normalizeClassName(data['Division de classe']),
        formerClassSource: normalizeClassName(data['Division de classe']) ? 'official' : undefined,
        sexe: normalizeBrevetSex(data.SEXE),
    };
};

interface BrevetBlancMatchData {
  className?: string;
  bb1Average?: number;
  bb2Average?: number;
  sexe?: string;
  isBoursier?: boolean;
}

const buildBrevetBlancLookup = (documents: DocumentData[]): Map<string, BrevetBlancMatchData> => {
  const lookup = new Map<string, BrevetBlancMatchData>();
  const ambiguousKeys = new Set<string>();

  documents.forEach((document) => {
    const data = document.data();
    const ine = normalizeIne(data.INE);
    const academicYear = getAcademicYearMatchKey(data.anneeScolaire);
    if (!ine || !academicYear) return;

    const key = `${academicYear}::${ine}`;
    if (lookup.has(key)) {
      lookup.delete(key);
      ambiguousKeys.add(key);
      return;
    }
    if (ambiguousKeys.has(key)) return;

    const config = getBrevetConfigForYear(academicYear);
    lookup.set(key, {
      className: normalizeClassName(data.CLASSE),
      bb1Average: calculateBrevetBlancAverage(data, config, 'bb1'),
      bb2Average: calculateBrevetBlancAverage(data, config, 'bb2'),
      sexe: typeof data.SEXE === 'string' ? data.SEXE.trim() || undefined : undefined,
      // Une fiche appariée sans marque est non-boursière ; sans fiche, le statut reste inconnu.
      isBoursier: scholarshipFromMatchedBrevetBlanc(data.isBoursier),
    });
  });

  return lookup;
};

const enrichWithBrevetBlancData = (
  student: ProcessedStudentData,
  lookup: Map<string, BrevetBlancMatchData>,
): ProcessedStudentData => {
  const academicYear = getAcademicYearMatchKey(student.academicYear);
  const ine = normalizeIne(student.ine);
  const match = academicYear && ine ? lookup.get(`${academicYear}::${ine}`) : undefined;
  if (!match) return student;

  return {
    ...student,
    formerClass: student.formerClass ?? match.className,
    formerClassSource: student.formerClass
      ? student.formerClassSource
      : match.className
        ? 'brevetBlanc'
        : undefined,
    brevetBlancBb1Average: match.bb1Average,
    brevetBlancBb2Average: match.bb2Average,
    sexe: resolveBrevetSex(student.sexe, match.sexe),
    isBoursier: match.isBoursier,
  };
};

export function FilterProvider({ children }: { children: ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [allStudents, setAllStudents] = useState<ProcessedStudentData[]>([]);

  const [availableAcademicYears, setAvailableAcademicYears] = useState<string[]>([]);
  const [selectedAcademicYear, setSelectedAcademicYear] = useState<string>('');

  const [availableSerieTypes, setAvailableSerieTypes] = useState<string[]>([]);
  const [selectedSerieType, setSelectedSerieType] = useState<string>('');

  const [availableEstablishments, setAvailableEstablishments] = useState<string[]>([]);
  const [selectedEstablishment, setSelectedEstablishment] = useState<string>('');

  useEffect(() => {
    let active = true;
    let latestRequest = 0;

    const fetchAllData = async () => {
      const request = ++latestRequest;
      const isCurrentRequest = () => active && request === latestRequest;
      setIsLoading(true);
      setError(null);

      if (!db) {
        const dbErrorMsg = "La base de données Firestore n'est pas initialisée.";
        setError(dbErrorMsg);
        setIsLoading(false);
        return;
      }

      try {
        const studentCollectionRef = collection(db, 'brevetResults');
        const brevetBlancCollectionRef = collection(db, 'BrevetBlanc');
        const [querySnapshot, brevetBlancSnapshot] = await Promise.all([
          getDocs(studentCollectionRef),
          getDocs(brevetBlancCollectionRef).catch((brevetBlancError) => {
            console.warn(
              "Impossible de rattacher les anciennes classes depuis BrevetBlanc:",
              brevetBlancError,
            );
            return null;
          }),
        ]);
        if (!isCurrentRequest()) return;

        const brevetBlancLookup = buildBrevetBlancLookup(brevetBlancSnapshot?.docs ?? []);
        const fetchedStudents = querySnapshot.docs
          .map(parseStudentDoc)
          .map((student) => enrichWithBrevetBlancData(student, brevetBlancLookup));
        setAllStudents(fetchedStudents);

        const academicYearsSet = new Set<string>();
        const serieTypesSet = new Set<string>();
        const establishmentsSet = new Set<string>();

        fetchedStudents.forEach((student) => {
          if (student.academicYear) academicYearsSet.add(student.academicYear);
          if (student.serieType) serieTypesSet.add(student.serieType);
          if (student.etablissement) establishmentsSet.add(student.etablissement);
        });

        const sortedAcademicYears = sortAcademicYearsDesc(Array.from(academicYearsSet));
        setAvailableAcademicYears(sortedAcademicYears);
        setSelectedAcademicYear(current => resolveFilterSelection(
          current, sortedAcademicYears, ALL_ACADEMIC_YEARS_VALUE,
        ));

        const sortedSerieTypes = Array.from(serieTypesSet).sort();
        setAvailableSerieTypes(sortedSerieTypes);
        const generaleEquivalent = sortedSerieTypes.find(s => normalizeTextForComparison(s) === "generale");
        setSelectedSerieType(current => resolveFilterSelection(
          current, sortedSerieTypes, ALL_SERIE_TYPES_VALUE, generaleEquivalent,
        ));

        const sortedEstablishments = Array.from(establishmentsSet).sort();
        setAvailableEstablishments(sortedEstablishments);
        setSelectedEstablishment(current => resolveFilterSelection(
          current, sortedEstablishments, ALL_ESTABLISHMENTS_VALUE, ALL_ESTABLISHMENTS_VALUE,
        ));
      } catch (err: any) {
        if (!isCurrentRequest()) return;
        console.error("Erreur de récupération des données et filtres:", err);
        let userMessage = `Impossible de charger les données: ${err.message}`;
        if (err.code === 'permission-denied' || (err.message && err.message.toLowerCase().includes('permission'))) {
            userMessage = "Votre session a peut-être expiré, ou vos permissions sont insuffisantes. Veuillez rafraîchir la page pour vous reconnecter.";
        }
        setError(userMessage);
      } finally {
        if (isCurrentRequest()) setIsLoading(false);
      }
    };
    const handleBrevetDataUpdated = () => {
      void fetchAllData();
    };

    void fetchAllData();
    window.addEventListener(BREVET_DATA_UPDATED_EVENT, handleBrevetDataUpdated);
    return () => {
      active = false;
      window.removeEventListener(BREVET_DATA_UPDATED_EVENT, handleBrevetDataUpdated);
    };
  }, []);

  const students = useMemo(() => allStudents.filter(student => (
    (!selectedAcademicYear || selectedAcademicYear === ALL_ACADEMIC_YEARS_VALUE || student.academicYear === selectedAcademicYear)
    && (!selectedSerieType || selectedSerieType === ALL_SERIE_TYPES_VALUE || student.serieType === selectedSerieType)
    && (!selectedEstablishment || selectedEstablishment === ALL_ESTABLISHMENTS_VALUE || student.etablissement === selectedEstablishment)
  )), [allStudents, selectedAcademicYear, selectedSerieType, selectedEstablishment]);

  const contextValue = useMemo<FilterContextType>(() => ({
    isLoading,
    error,
    allStudents,
    students,
    availableAcademicYears,
    selectedAcademicYear,
    setSelectedAcademicYear,
    availableSerieTypes,
    selectedSerieType,
    setSelectedSerieType,
    availableEstablishments,
    selectedEstablishment,
    setSelectedEstablishment,
    ALL_ACADEMIC_YEARS_VALUE,
    ALL_SERIE_TYPES_VALUE,
    ALL_ESTABLISHMENTS_VALUE,
    parseStudentDoc,
  }), [
    isLoading, error, allStudents, students,
    availableAcademicYears, selectedAcademicYear,
    availableSerieTypes, selectedSerieType,
    availableEstablishments, selectedEstablishment,
  ]);

  return <FilterContext.Provider value={contextValue}>{children}</FilterContext.Provider>;
}

export function useFilters(): FilterContextType {
  const context = useContext(FilterContext);
  if (context === undefined) {
    throw new Error('useFilters must be used within a FilterProvider');
  }
  return context;
}
