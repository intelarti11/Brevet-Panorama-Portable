
import { z } from 'zod';
import { normalizeBrevetSex } from './brevet-sex';

// Helper to convert various inputs to string or null
const preprocessToStringOptional = (val: unknown): string | null => {
  if (val === undefined || val === null) return null;
  const strVal = String(val).trim();
  return strVal === '' ? null : strVal;
};

// Only complete numeric values are accepted. Returning invalid input unchanged
// lets Zod reject it, instead of silently turning it into a missing grade.
const DECIMAL = '[+-]?(?:\\d+(?:[.,]\\d+)?|[.,]\\d+)';
const SCORE_PATTERN = new RegExp(`^(${DECIMAL})(?:\\s*/\\s*(${DECIMAL}))?$`);
const MARK_PATTERN = /^(ab|abs|absent|di|disp|dispense|ne|ea)(?:\s*\/\s*\d+(?:[.,]\d+)?)?$/;

const parseScoreValue = (value: unknown, preserveMarks = false): unknown => {
  if (value === undefined || value === null) return null;
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return value;
  const raw = value.trim();
  if (raw === '') return null;
  const mark = MARK_PATTERN.exec(raw.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''))?.[1];
  if (mark) {
    if (preserveMarks && ['ab', 'abs', 'absent'].includes(mark)) return 'Absent';
    if (preserveMarks && ['di', 'disp', 'dispense'].includes(mark)) return 'Dispensé';
    return null;
  }
  const match = SCORE_PATTERN.exec(raw);
  if (!match || (match[2] !== undefined && Number(match[2].replace(',', '.')) <= 0)) return value;
  return Number(match[1].replace(',', '.'));
};

const optionalScoreSchema = (maximum?: number) => z.preprocess(
  (value) => parseScoreValue(value),
  (maximum === undefined
    ? z.number({ error: 'Saisissez une note numérique valide.' }).min(0, 'La note doit être positive ou nulle.')
    : z.number({ error: 'Saisissez une note numérique valide.' }).min(0, `Saisissez une note de 0 à ${maximum}.`).max(maximum, `Saisissez une note de 0 à ${maximum}.`))
    .nullable().optional(),
);

/**
 * Les sous-notes du relevé DNB peuvent contenir la mention « Absent » (et,
 * selon la session, « Dispensé »). Contrairement aux scores agrégés, cette
 * information doit rester visible dans la base locale pour distinguer une absence
 * d'une valeur non fournie.
 */
const rawDnbSubscoreSchema = (maximum: number) => z.preprocess(
  (value) => parseScoreValue(value, true),
  z.union([z.number().min(0).max(maximum), z.literal('Absent'), z.literal('Dispensé')], {
    error: `Saisissez une note de 0 à ${maximum}, Absent ou Dispensé.`,
  }).nullable().optional(),
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
  SEXE: z.preprocess((value) => {
    const raw = preprocessToStringOptional(value);
    return raw === null ? null : normalizeBrevetSex(raw) ?? raw;
  }, z.enum(['f', 'g'], { error: 'Sexe invalide : saisissez F, G, M, féminin ou masculin.' }).nullable().optional()),
  'Résultat': z.preprocess(preprocessToStringOptional, z.string().nullable().optional()),
  'TOTAL GENERAL': optionalScoreSchema(),
  'Moyenne sur 20': optionalScoreSchema(20),
  noteControleContinu: optionalScoreSchema(20),
  noteEpreuvesTerminales: optionalScoreSchema(20),
  baremeEpreuves: z.enum(['legacy', 'sur20']).optional(),

  // Score fields retain camelCase names from original complex headers
  scoreFrancais: optionalScoreSchema(),
  scoreMaths: optionalScoreSchema(),
  scoreHistoireGeo: optionalScoreSchema(),
  scoreEMC: optionalScoreSchema(),
  scoreSciences: optionalScoreSchema(),
  // Sous-notes brutes du nouveau format DNB 2026 (barèmes conservés).
  scoreFrancaisGrammaireComprehension: rawDnbSubscoreSchema(50),
  scoreFrancaisDictee: rawDnbSubscoreSchema(10),
  scoreFrancaisRedaction: rawDnbSubscoreSchema(40),
  scoreSciencesSvt: rawDnbSubscoreSchema(10),
  scoreSciencesPhysiqueChimie: rawDnbSubscoreSchema(10),
  scoreSciencesTechnologie: rawDnbSubscoreSchema(10),
  scoreOralDNB: optionalScoreSchema(),
  scoreLVE: optionalScoreSchema(),
  scoreArtsPlastiques: optionalScoreSchema(),
  scoreEducationMusicale: optionalScoreSchema(),
  scoreEPS: optionalScoreSchema(),
  scorePhysiqueChimie: optionalScoreSchema(),
  scoreSciencesVie: optionalScoreSchema(),

  options: z.record(z.string(), z.unknown()).optional(), // This stores any other columns
  rawRowData: z.any().optional(), // Store the original raw row for debugging or future use
}).superRefine((student, ctx) => {
  const outOf20 = student.baremeEpreuves === 'sur20'
    || (student.baremeEpreuves !== 'legacy' && Number(student.anneeScolaireImportee) >= 2026);
  // Match the scales used when FilterContext converts historical grades to /20.
  const legacyMaxima = {
    scoreFrancais: 100, scoreMaths: 100, scoreHistoireGeo: 50, scoreEMC: 10,
    scoreSciences: 50, scoreOralDNB: 100, scoreLVE: 50, scoreArtsPlastiques: 50,
    scoreEducationMusicale: 50, scoreEPS: 100, scorePhysiqueChimie: 50, scoreSciencesVie: 50,
  } as const;
  for (const [field, legacyMaximum] of Object.entries(legacyMaxima)) {
    const value = student[field as keyof typeof legacyMaxima];
    const maximum = outOf20 ? 20 : legacyMaximum;
    if (typeof value === 'number' && value > maximum) {
      ctx.addIssue({ code: 'custom', path: [field], message: `Saisissez une note de 0 à ${maximum}.` });
    }
  }
});

export type StudentData = z.infer<typeof studentDataSchema>;
