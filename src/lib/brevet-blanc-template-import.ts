import * as XLSX from "xlsx-js-style";
import type { BrevetExam } from "./brevet-blanc-lock";
import { parseBrevetBlancImportRows, type BrevetBlancStudentImport } from "./brevet-blanc-import";
import { readStudentTemplateMetadata, type StudentTemplateMetadata } from "./student-import-template";

export interface ValidatedBrevetBlancTemplateImport {
  metadata: StudentTemplateMetadata & { kind: "bb"; exam: BrevetExam };
  rows: unknown[][];
  students: BrevetBlancStudentImport[];
  rowCount: number;
}

/** Reads the generated XLSX template and validates its metadata and every student row once. */
export function readBrevetBlancTemplateImport(
  buffer: ArrayBuffer | Uint8Array,
): ValidatedBrevetBlancTemplateImport {
  const workbook = XLSX.read(buffer, {type: "array", cellDates: true});
  const metadata = readStudentTemplateMetadata(workbook);
  if (!metadata) {
    throw new Error("Ce fichier ne contient pas les informations du modèle Brevet Panorama. Téléchargez le modèle proposé ci-dessus.");
  }
  if (metadata.kind !== "bb") {
    throw new Error("Ce modèle est destiné aux résultats officiels du DNB. Utilisez le modèle Brevet blanc dans cette page.");
  }
  if (metadata.exam !== "bb1" && metadata.exam !== "bb2") {
    throw new Error("Le modèle ne précise pas s'il s'agit du BB1 ou du BB2. Téléchargez le bon modèle de nouveau.");
  }

  const dataSheet = workbook.Sheets["Données"];
  if (!dataSheet) throw new Error("La feuille « Données » est absente du modèle Excel.");

  const rows = XLSX.utils.sheet_to_json(dataSheet, {
    header: 1,
    defval: "",
    raw: true,
    blankrows: false,
  }) as unknown[][];
  const parsed = parseBrevetBlancImportRows(rows, {year: metadata.year, exam: metadata.exam});

  return {
    metadata: {year: metadata.year, kind: "bb", exam: metadata.exam},
    rows,
    students: parsed.students,
    rowCount: parsed.rowCount,
  };
}
