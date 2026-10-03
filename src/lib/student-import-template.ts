import * as XLSX from "xlsx-js-style";
import { getBrevetConfigForYear } from "./brevet-config";
import type { BrevetExam } from "./brevet-blanc-lock";
import type { StudentIdentity } from "./student-roster-types";

export type StudentTemplateKind = "bb" | "dnb";
export interface StudentTemplateMetadata {
  year: string;
  kind: StudentTemplateKind;
  exam?: BrevetExam;
}

const INFO_SHEET = "Mode d'emploi";
const BB_IDENTITY_HEADERS = ["INE", "NOM", "PRENOM", "Classe", "Sexe", "Date de naissance"];
const DNB_IDENTITY_HEADERS = ["Session", "INE", "Nom", "Prénom(s)", "Date de naissance", "Division", "Sexe"];
const DNB_REQUIRED_NOTES_2026 = [
  "Décision", "Note finale /20", "Contrôle continu /20", "Épreuves terminales /20",
  "Français /20", "Mathématiques /20", "Histoire-géographie /20", "EMC /20", "Sciences /20", "Oral /20",
];
const DNB_LEGACY_NOTES = [
  "Décision", "Note finale /20", "001 - 1 - Français - Ponctuel",
  "002 - 1 - Mathématiques - Ponctuel",
  "003 - 1 - Histoire, géographie, enseignement moral et civique - Ponctuel",
  "004 - 1 - Sciences - Ponctuel",
  "005 - 1 - Soutenance orale de projet - Evaluation en cours d'année",
];
const DNB_OPTIONAL_NOTES_2026 = [
  "Grammaire et compréhension /50", "Dictée /10", "Rédaction /40",
  "SVT (sciences) /10", "Physique-chimie (sciences) /10", "Technologie (sciences) /10",
];

export function getBrevetBlancTemplateColumns(year: string) {
  const config = getBrevetConfigForYear(year);
  return config.subjects.map((subject) => ({ subject, header: `${subject} /${config.maxScores[subject]}`, maxScore: config.maxScores[subject] }));
}

export function readStudentTemplateMetadata(workbook: XLSX.WorkBook): StudentTemplateMetadata | null {
  const sheet = workbook.Sheets[INFO_SHEET];
  if (!sheet || sheet.A1?.v !== "Brevet Panorama") return null;
  const year = String(sheet.B2?.v ?? "").trim();
  const kindLabel = String(sheet.B3?.v ?? "");
  const examLabel = String(sheet.B4?.v ?? "").toLowerCase();
  if (!/^\d{4}$/.test(year) || sheet.B5?.v !== 1 || !["Brevet blanc", "DNB"].includes(kindLabel)) {
    throw new Error("Les informations du modèle sont invalides. Téléchargez un nouveau modèle.");
  }
  const kind: StudentTemplateKind = kindLabel === "DNB" ? "dnb" : "bb";
  if (kind === "bb" && examLabel !== "bb1" && examLabel !== "bb2") {
    throw new Error("L’examen du modèle est invalide. Téléchargez un nouveau modèle.");
  }
  return { year, kind, ...(kind === "bb" ? { exam: examLabel as BrevetExam } : {}) };
}

export function getStudentTemplateFileName(options: StudentTemplateMetadata): string {
  return `Modele_${options.kind === "bb" ? options.exam!.toUpperCase() : "DNB"}_${options.year}.xlsx`;
}

/** Vérifie les cellules saisies dans un modèle DNB avant toute écriture. */
export function validateDnbTemplateRow(row: Record<string, unknown>, rowNumber: number) {
  const ine = String(row.INE ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9]+$/.test(ine)) throw new Error(`Ligne ${rowNumber} : l’INE doit être du texte alphanumérique.`);
  for (const [header, input] of Object.entries(row)) {
    const maximum = /\/(\d+)\s*$/.exec(header)?.[1];
    if (!maximum || input === undefined || input === null || String(input).trim() === "") continue;
    const raw = String(input).trim();
    if (/^(?:abs|ab|absent|disp|dispens[eé])$/i.test(raw)) continue;
    const normalized = raw.replace(/\s/g, "").replace(",", ".");
    if (!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(normalized) || Number(normalized) > Number(maximum)) {
      throw new Error(`Ligne ${rowNumber}, colonne « ${header} » : saisissez une note de 0 à ${maximum}, Absent ou Dispensé.`);
    }
  }
}

/** Fichier de données uniquement : les identifiants restent du texte, les notes restent vides. */
export function createStudentImportWorkbook(students: readonly StudentIdentity[], options: StudentTemplateMetadata): XLSX.WorkBook {
  if (!/^\d{4}$/.test(options.year) || (options.kind === "bb" && !options.exam)) throw new Error("Année ou examen du modèle manquant.");
  if (students.length === 0) throw new Error("Aucun élève disponible pour créer le modèle.");
  const isNewDnb = Number(options.year) >= 2026;
  const identityHeaders = options.kind === "bb" ? BB_IDENTITY_HEADERS : DNB_IDENTITY_HEADERS;
  const noteHeaders = options.kind === "bb" ? getBrevetBlancTemplateColumns(options.year).map((column) => column.header) :
    [...(isNewDnb ? DNB_REQUIRED_NOTES_2026 : DNB_LEGACY_NOTES), ...(isNewDnb ? DNB_OPTIONAL_NOTES_2026 : [])];
  const headers = [...identityHeaders, ...noteHeaders];
  const rows = students.map((student) => [
    ...(options.kind === "dnb" ? [options.year] : []),
    student.INE, student.NOM, student.PRENOM,
    ...(options.kind === "dnb" ? [student.dateNaissance ?? "", student.CLASSE ?? "", student.SEXE ?? ""] :
      [student.CLASSE ?? "", student.SEXE ?? "", student.dateNaissance ?? ""]),
    ...noteHeaders.map(() => ""),
  ]);
  const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const border = { bottom: { style: "hair", color: { rgb: "D8DEE8" } } };
  for (let column = 0; column < headers.length; column++) {
    const address = XLSX.utils.encode_cell({ r: 0, c: column });
    sheet[address].s = { font: { bold: true, color: { rgb: "FFFFFF" } }, fill: { fgColor: { rgb: "183B56" } }, alignment: { wrapText: true, vertical: "center" } };
    for (let row = 1; row <= rows.length; row++) {
      const cellAddress = XLSX.utils.encode_cell({ r: row, c: column });
      const cell = sheet[cellAddress];
      cell.s = { font: { color: { rgb: "243447" } }, fill: { fgColor: { rgb: column < identityHeaders.length ? "EEF2F6" : "FFFFFF" } }, border };
      if (column < identityHeaders.length) { cell.t = "s"; cell.z = "@"; }
    }
  }
  sheet["!cols"] = headers.map((header, index) => ({ wch: index < identityHeaders.length ? (header.toLowerCase().includes("nom") ? 24 : 18) : 22 }));
  sheet["!rows"] = [{ hpt: 66 }];
  sheet["!autofilter"] = { ref: sheet["!ref"]! };

  const infoRows: (string | number)[][] = [
    ["Brevet Panorama"], ["Année", options.year], ["Import", options.kind === "bb" ? "Brevet blanc" : "DNB"],
    ["Examen", options.exam?.toUpperCase() ?? ""], ["Version", 1], [],
    ["Remplir le modèle"], ["Identités", "Les cellules grises contiennent les identités officielles. Conservez les INE, noms et prénoms."],
    ["Notes", "Saisissez les notes dans les colonnes blanches, en respectant le barème indiqué dans chaque en-tête."],
    ["Valeurs attendues", options.kind === "bb" ? "Une case vide conserve la note déjà enregistrée. ABS efface la note de cet examen." :
      "Renseignez la décision, la note finale et toutes les notes obligatoires. Les sous-notes de français et de sciences sont facultatives."],
    ["Enregistrement", "Enregistrez le fichier au format Excel .xlsx, puis importez-le dans le parcours correspondant à son type."],
    ["Où importer", options.kind === "bb" ? "Administration > Import manuel des résultats du brevet blanc." : "Importer des données > Résultats Brevet Officiels."],
  ];
  const info = XLSX.utils.aoa_to_sheet(infoRows);
  info["!cols"] = [{ wch: 24 }, { wch: 100 }];
  info["!rows"] = infoRows.map((_, index) => ({ hpt: index >= 7 ? 32 : 24 }));
  for (const [address, cell] of Object.entries(info)) {
    if (address.startsWith("!")) continue;
    cell.s = { font: { color: { rgb: "243447" }, bold: address === "A1" || address === "A7" }, alignment: { wrapText: true, vertical: "center" } };
  }
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Données");
  XLSX.utils.book_append_sheet(workbook, info, INFO_SHEET);
  return workbook;
}

export function downloadStudentImportWorkbook(students: readonly StudentIdentity[], options: StudentTemplateMetadata) {
  XLSX.writeFile(createStudentImportWorkbook(students, options), getStudentTemplateFileName(options), { bookType: "xlsx" });
}
