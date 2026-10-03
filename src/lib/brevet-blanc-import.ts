import { getBrevetConfigForYear } from "./brevet-config";
import type { BrevetExam } from "./brevet-blanc-lock";
import { getBrevetBlancTemplateColumns } from "./student-import-template";

export interface BrevetBlancStudentImport {
  INE: string;
  NOM: string;
  PRENOM: string;
  CLASSE?: string;
  SEXE?: "f" | "g";
  dateNaissance?: string;
  isBoursier?: boolean;
  notes: Record<string, Partial<Record<BrevetExam, number | null>>>;
}

export interface ParseBrevetBlancRowsOptions {
  year: string;
  exam: BrevetExam;
}

export interface ParsedBrevetBlancRows {
  students: BrevetBlancStudentImport[];
  rowCount: number;
}

const normalizeHeader = (value: unknown): string =>
  String(value ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

const normalizeIdentity = (value: string): string =>
  value
    .trim()
    .toLocaleUpperCase("fr-FR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");

const HEADER_ALIASES: Record<string, readonly string[]> = {
  INE: ["INE", "Identifiant national élève"],
  NOM: ["NOM", "Nom", "Nom de famille", "Nom élève"],
  PRENOM: ["PRENOM", "Prénom", "Prénom(s)", "Prénom usuel", "Prenom usuel"],
  CLASSE: ["Classe", "Division", "Classe d'origine"],
  SEXE: ["Sexe", "Sexe de l'élève"],
  dateNaissance: ["Date de naissance", "Date naissance", "Naissance"],
  isBoursier: ["Boursier", "Élève boursier", "Eleve boursier"],
};

type ColumnTarget =
  | { kind: "identity"; key: keyof Omit<BrevetBlancStudentImport, "notes"> }
  | { kind: "note"; subject: string; maxScore: number };

function buildColumnTargets(year: string): Map<string, ColumnTarget> {
  const targets = new Map<string, ColumnTarget>();
  const add = (alias: string, target: ColumnTarget) => {
    const normalized = normalizeHeader(alias);
    if (!normalized) return;

    const previous = targets.get(normalized);
    if (previous && (previous.kind !== target.kind ||
      (previous.kind === "note" && target.kind === "note" && previous.subject !== target.subject) ||
      (previous.kind === "identity" && target.kind === "identity" && previous.key !== target.key))) {
      throw new Error(`L'en-tête « ${alias} » correspond à plusieurs colonnes possibles pour l'année ${year}.`);
    }
    targets.set(normalized, target);
  };

  for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
    const target: ColumnTarget = {kind: "identity", key: key as keyof Omit<BrevetBlancStudentImport, "notes">};
    for (const alias of aliases) add(alias, target);
  }

  const config = getBrevetConfigForYear(year);
  for (const column of getBrevetBlancTemplateColumns(year)) {
    const target: ColumnTarget = {
      kind: "note",
      subject: column.subject,
      maxScore: column.maxScore,
    };
    add(column.header, target);
    add(column.subject, target);
    const abbreviation = config.abbreviations[column.subject];
    if (abbreviation) add(abbreviation, target);
  }

  return targets;
}

const asTrimmedString = (value: unknown): string => {
  if (value === undefined || value === null) return "";
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  return String(value).trim();
};

function normalizeSexe(value: string): "f" | "g" | undefined {
  const normalized = normalizeHeader(value);
  if (["f", "fille", "feminin", "feminine"].includes(normalized)) return "f";
  if (["g", "garcon", "masculin", "masculine", "m"].includes(normalized)) return "g";
  return undefined;
}

function parseNote(value: unknown, maxScore: number, rowNumber: number, header: string): number | null | undefined {
  const raw = asTrimmedString(value);
  if (raw === "") return undefined;
  if (raw.toLocaleUpperCase("fr-FR") === "ABS") return null;

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`Ligne ${rowNumber}, colonne « ${header} » : la note doit être un nombre fini.`);
    }
    if (value < 0 || value > maxScore) {
      throw new Error(`Ligne ${rowNumber}, colonne « ${header} » : ${value} est hors barème (0 à ${maxScore}).`);
    }
    return value;
  }

  const normalized = raw.replace(/\s/g, "");
  if (!/^(?:\d+(?:[.,]\d+)?|[.,]\d+)$/.test(normalized)) {
    throw new Error(`Ligne ${rowNumber}, colonne « ${header} » : « ${raw} » n'est pas une note valide.`);
  }
  const valueAsNumber = Number(normalized.replace(",", "."));
  if (!Number.isFinite(valueAsNumber)) {
    throw new Error(`Ligne ${rowNumber}, colonne « ${header} » : la note doit être un nombre fini.`);
  }
  if (valueAsNumber < 0 || valueAsNumber > maxScore) {
    throw new Error(`Ligne ${rowNumber}, colonne « ${header} » : ${raw} est hors barème (0 à ${maxScore}).`);
  }
  return valueAsNumber;
}

/**
 * Validates and maps workbook rows to the callable payload before any write.
 */
export function parseBrevetBlancImportRows(
  rows: readonly (readonly unknown[])[],
  options: ParseBrevetBlancRowsOptions,
): ParsedBrevetBlancRows {
  const {year, exam} = options;
  if (!/^\d{4}$/.test(year) || !Number.isFinite(Number(year))) {
    throw new Error("L'année du brevet doit être une année valide sur quatre chiffres.");
  }
  if (exam !== "bb1" && exam !== "bb2") throw new Error("Le type d'examen doit être BB1 ou BB2.");

  const nonEmptyRows = rows.filter((row) => row.some((cell) => asTrimmedString(cell) !== ""));
  if (nonEmptyRows.length < 2) {
    throw new Error("Le fichier doit contenir une ligne d'en-têtes et au moins un élève.");
  }

  const headers = nonEmptyRows[0].map((header) => asTrimmedString(header));
  const normalizedHeaders = headers.map(normalizeHeader);
  const seenHeaders = new Set<string>();
  for (let index = 0; index < normalizedHeaders.length; index += 1) {
    const normalized = normalizedHeaders[index];
    if (!normalized) throw new Error(`L'en-tête de la colonne ${index + 1} est vide.`);
    if (seenHeaders.has(normalized)) throw new Error(`L'en-tête « ${headers[index]} » est présent plusieurs fois.`);
    seenHeaders.add(normalized);
  }

  const knownColumns = buildColumnTargets(year);
  const columns: Array<{index: number; header: string; target: ColumnTarget}> = [];
  const seenTargets = new Map<string, string>();
  for (let index = 0; index < normalizedHeaders.length; index += 1) {
    const target = knownColumns.get(normalizedHeaders[index]);
    if (!target) continue;
    const targetKey = target.kind === "identity" ? `identity:${target.key}` : `note:${target.subject}`;
    const previousHeader = seenTargets.get(targetKey);
    if (previousHeader) {
      throw new Error(`Les colonnes « ${previousHeader} » et « ${headers[index]} » désignent la même donnée.`);
    }
    seenTargets.set(targetKey, headers[index]);
    columns.push({index, header: headers[index], target});
  }

  const identityColumns = new Set(columns.filter((column) => column.target.kind === "identity").map((column) => column.target.kind === "identity" ? column.target.key : ""));
  if (!identityColumns.has("NOM") || !identityColumns.has("PRENOM")) {
    throw new Error("Les colonnes NOM et PRENOM sont obligatoires.");
  }
  if (!identityColumns.has("INE")) {
    throw new Error("La colonne INE est obligatoire dans le modèle Excel prérempli.");
  }
  if (!columns.some((column) => column.target.kind === "note")) {
    throw new Error("Aucune colonne de note reconnue. Téléchargez un nouveau modèle de brevet blanc.");
  }

  const students: BrevetBlancStudentImport[] = [];
  const seenIne = new Set<string>();
  const errors: string[] = [];

  for (let dataIndex = 1; dataIndex < nonEmptyRows.length; dataIndex += 1) {
    const row = nonEmptyRows[dataIndex];
    const rowNumber = dataIndex + 1;
    if (row.length !== headers.length) {
      errors.push(`Ligne ${rowNumber} : ${row.length} cellules au lieu de ${headers.length}; vérifiez les colonnes du modèle.`);
      continue;
    }

    const student: BrevetBlancStudentImport = {INE: "", NOM: "", PRENOM: "", notes: {}};
    let rowError: string | undefined;

    for (const column of columns) {
      const rawValue = row[column.index];
      if (column.target.kind === "identity") {
        const value = asTrimmedString(rawValue);
        switch (column.target.key) {
          case "INE":
            if (value) student.INE = value;
            break;
          case "NOM":
            student.NOM = value;
            break;
          case "PRENOM":
            student.PRENOM = value;
            break;
          case "CLASSE":
            if (value) student.CLASSE = value;
            break;
          case "SEXE":
            if (value) {
              const sex = normalizeSexe(value);
              if (!sex) rowError = `Ligne ${rowNumber}, colonne « ${column.header} » : valeur de sexe inconnue « ${value} ».`;
              else student.SEXE = sex;
            }
            break;
          case "dateNaissance":
            if (value) student.dateNaissance = value;
            break;
          case "isBoursier":
            if (value) {
              const normalized = normalizeHeader(value);
              if (["x", "oui", "true", "1", "boursier"].includes(normalized)) student.isBoursier = true;
              else if (["non", "false", "0"].includes(normalized)) student.isBoursier = false;
              else rowError = `Ligne ${rowNumber}, colonne « ${column.header} » : indiquez X/Oui ou Non pour le statut boursier.`;
            }
            break;
        }
      } else {
        try {
          const parsed = parseNote(rawValue, column.target.maxScore, rowNumber, column.header);
          if (parsed !== undefined) {
            student.notes[column.target.subject] ??= {};
            student.notes[column.target.subject][exam] = parsed;
          }
        } catch (error) {
          rowError = error instanceof Error ? error.message : String(error);
        }
      }
    }

    if (rowError) {
      errors.push(rowError);
      continue;
    }
    if (!student.NOM || !student.PRENOM) {
      errors.push(`Ligne ${rowNumber} : NOM et PRENOM doivent être remplis.`);
      continue;
    }
    if (!student.INE) {
      errors.push(`Ligne ${rowNumber} : INE manquant dans le modèle Excel.`);
      continue;
    }

    if (student.INE) {
      const ineKey = normalizeIdentity(student.INE);
      if (seenIne.has(ineKey)) {
        errors.push(`Ligne ${rowNumber} : l'INE « ${student.INE} » est présent plusieurs fois dans le fichier.`);
        continue;
      }
      seenIne.add(ineKey);
    }

    students.push(student);
  }

  if (errors.length > 0) {
    const visibleErrors = errors.slice(0, 10);
    const moreCount = errors.length - visibleErrors.length;
    throw new Error(`Import annulé avant enregistrement :\n${visibleErrors.join("\n")}${moreCount > 0 ? `\n… et ${moreCount} autre(s) erreur(s).` : ""}`);
  }
  if (students.length === 0) throw new Error("Aucun élève à importer.");

  return {students, rowCount: students.length};
}
