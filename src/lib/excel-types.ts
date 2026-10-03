
import { z } from 'zod';

// Helper to convert various inputs to string or null
const preprocessToStringOptional = (val: unknown): string | null => {
  if (val === undefined || val === null) return null;
  const strVal = String(val).trim();
  return strVal === '' ? null : strVal;
};

// Helper to parse score-like values (e.g., "X/Y" or just "X") to number or undefined
const parseScoreValue = (valueWithMax: string | number | undefined): number | undefined => {
  if (valueWithMax === undefined || valueWithMax === null || String(valueWithMax).trim() === '') return undefined;
  const s = String(valueWithMax).split('/')[0].replace(',', '.').trim();
  // Handle common non-numeric grade abbreviations
  if (['AB', 'DI', 'NE', 'EA', 'DISP', 'ABS'].includes(s.toUpperCase())) return undefined;
  const num = parseFloat(s);
  return isNaN(num) ? undefined : num;
};

// Helper to convert optional string/number input from Excel to a number or null
const preprocessOptionalStringToNumber = (val: unknown): number | null => {
  if (val === undefined || val === null) {
    return null;
  }
  const strVal = String(val).trim();
  if (strVal === '') {
    return null;
  }
  const parsedNum = parseScoreValue(strVal);
  return parsedNum === undefined ? null : parsedNum;
};

/**
 * Les sous-notes du relevé DNB peuvent contenir la mention « Absent » (et,
 * selon la session, « Dispensé »). Contrairement aux scores agrégés, cette
 * information doit rester visible dans Firestore pour distinguer une absence
 * d'une valeur non fournie.
 */
const preprocessRawDnbSubscore = (val: unknown): number | 'Absent' | 'Dispensé' | null => {
  if (val === undefined || val === null) return null;
  const raw = String(val).trim();
  if (raw === '') return null;

  const mark = raw.split('/')[0].trim().toLocaleLowerCase('fr-FR');
  if (mark === 'abs' || mark === 'absent') return 'Absent';
  if (mark === 'disp' || mark === 'dispense' || mark === 'dispensé') return 'Dispensé';

  const parsed = parseScoreValue(raw);
  return parsed === undefined ? null : parsed;
};

const rawDnbSubscoreSchema = z.preprocess(
  preprocessRawDnbSubscore,
  z.union([z.number(), z.literal('Absent'), z.literal('Dispensé')]).nullable().optional(),
);


export const studentDataSchema = z.object({
  'anneeScolaireImportee': z.string().regex(/^\d{4}$/, "L'année d'importation doit être au format AAAA (ex: 2023)").min(1, "Année scolaire d'importation requise"),

  // Fields matching Excel headers exactly
  'Série': z.preprocess(preprocessToStringOptional, z.string().nullable().optional()),
  'Code Etablissement': z.preprocess(preprocessToStringOptional, z.string().nullable().optional()),
  'Libellé Etablissement': z.preprocess(preprocessToStringOptional, z.string().nullable().optional()),
  'Commune Etablissement': z.preprocess(preprocessToStringOptional, z.string().nullable().optional()),
  'Division de classe': z.preprocess(preprocessToStringOptional, z.string().nullable().optional()),
  'Catégorie candidat': z.preprocess(preprocessToStringOptional, z.string().nullable().optional()),
  'Numéro Candidat': z.preprocess(preprocessToStringOptional, z.string().min(1, "Numéro candidat ne peut pas être vide si fourni").nullable().optional()),
  'INE': z.preprocess(preprocessToStringOptional, z.string().min(1, "INE requis")),
  'Nom candidat': z.preprocess(preprocessToStringOptional, z.string().nullable().optional()),
  'Prénom candidat': z.preprocess(preprocessToStringOptional, z.string().nullable().optional()),
  'Date de naissance': z.preprocess(preprocessToStringOptional, z.string().nullable().optional()),
  'Résultat': z.preprocess(preprocessToStringOptional, z.string().nullable().optional()),
  'TOTAL GENERAL': z.preprocess(preprocessOptionalStringToNumber, z.number().nullable().optional()),
  'Moyenne sur 20': z.preprocess(preprocessOptionalStringToNumber, z.number().nullable().optional()),
  noteControleContinu: z.preprocess(preprocessOptionalStringToNumber, z.number().nullable().optional()),
  noteEpreuvesTerminales: z.preprocess(preprocessOptionalStringToNumber, z.number().nullable().optional()),
  baremeEpreuves: z.enum(['legacy', 'sur20']).optional(),

  // Score fields retain camelCase names from original complex headers
  scoreFrancais: z.preprocess(preprocessOptionalStringToNumber, z.number().nullable().optional()),
  scoreMaths: z.preprocess(preprocessOptionalStringToNumber, z.number().nullable().optional()),
  scoreHistoireGeo: z.preprocess(preprocessOptionalStringToNumber, z.number().nullable().optional()),
  scoreEMC: z.preprocess(preprocessOptionalStringToNumber, z.number().nullable().optional()),
  scoreSciences: z.preprocess(preprocessOptionalStringToNumber, z.number().nullable().optional()),
  // Sous-notes brutes du nouveau format DNB 2026 (barèmes conservés).
  scoreFrancaisGrammaireComprehension: rawDnbSubscoreSchema,
  scoreFrancaisDictee: rawDnbSubscoreSchema,
  scoreFrancaisRedaction: rawDnbSubscoreSchema,
  scoreSciencesSvt: rawDnbSubscoreSchema,
  scoreSciencesPhysiqueChimie: rawDnbSubscoreSchema,
  scoreSciencesTechnologie: rawDnbSubscoreSchema,
  scoreOralDNB: z.preprocess(preprocessOptionalStringToNumber, z.number().nullable().optional()),
  scoreLVE: z.preprocess(preprocessOptionalStringToNumber, z.number().nullable().optional()),
  scoreArtsPlastiques: z.preprocess(preprocessOptionalStringToNumber, z.number().nullable().optional()),
  scoreEducationMusicale: z.preprocess(preprocessOptionalStringToNumber, z.number().nullable().optional()),
  scoreEPS: z.preprocess(preprocessOptionalStringToNumber, z.number().nullable().optional()),
  scorePhysiqueChimie: z.preprocess(preprocessOptionalStringToNumber, z.number().nullable().optional()),
  scoreSciencesVie: z.preprocess(preprocessOptionalStringToNumber, z.number().nullable().optional()),

  options: z.record(z.string(), z.unknown()).optional(), // This stores any other columns
  rawRowData: z.any().optional(), // Store the original raw row for debugging or future use
});

export type StudentData = z.infer<typeof studentDataSchema>;
