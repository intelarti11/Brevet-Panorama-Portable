import test from "node:test";
import assert from "node:assert/strict";

import {
  getMissingOfficialBrevetHeaders,
  getMissingOfficialBrevetRowValues,
  readOfficialBrevetField,
  parseOfficialBrevetRow,
} from "./official-brevet-import";
import { studentDataSchema } from "./excel-types";
import * as XLSX from "./spreadsheet";
import { createStudentImportWorkbook } from "./student-import-template";

const modernRow = {
  INE: "000000001AA", Nom: "DUPONT", "Prénom(s)": "Éloïse", Décision: "Admis",
  "Note finale /20": "12,5", "Contrôle continu /20": 13, "Épreuves terminales /20": 12,
  "Français /20": "10/20", "Mathématiques /20": 10, "Histoire-géographie /20": 10,
  "EMC /20": 10, "Sciences /20": 10, "Oral /20": 10,
};

test("un classeur ordinaire DNB rejette le texte invalide et les notes hors barème", () => {
  for (const [field, value] of [
    ["Note finale /20", "abc"], ["Note finale /20", 25], ["Note finale /20", -1],
    ["Français /20", "10foo"], ["Français /20", 21], ["Contrôle continu /20", 21],
    ["Épreuves terminales /20", -1], ["Dictée /10", 11], ["Rédaction /40", 41],
    ["Grammaire et compréhension /50", "abc"], ["SVT (sciences) /10", -1],
    ["Sciences /20", Infinity], ["Mathématiques /20", "10/0"], ["Oral /20", true],
  ] as const) {
    const row = { ...modernRow, [field]: value };
    assert.deepEqual(getMissingOfficialBrevetRowValues(row, "2026"), []);
    const result = parseOfficialBrevetRow(row, "2026");
    assert.equal(result.success, false, `${field}: ${value}`);
  }
});

test("l’import DNB conserve les décimales, zéro, les barèmes historiques et les mentions d’absence", () => {
  const modern = parseOfficialBrevetRow({ ...modernRow, "Mathématiques /20": 0, "Sciences /20": "ABS", "Dictée /10": "Absent /10", "Rédaction /40": "32/40", "Technologie (sciences) /10": "Dispensé" }, "2026");
  assert.ok(modern.success);
  assert.equal(modern.data["Moyenne sur 20"], 12.5);
  assert.equal(modern.data.scoreFrancais, 10);
  assert.equal(modern.data.scoreMaths, 0);
  assert.equal(modern.data.scoreSciences, null);
  assert.equal(modern.data.scoreFrancaisDictee, "Absent");
  assert.equal(modern.data.scoreFrancaisRedaction, 32);
  assert.equal(modern.data.scoreSciencesTechnologie, "Dispensé");

  const historicalRow = { INE: "000000001AA", "Moyenne sur 20": 20,
    "001 - 1 - Français - Ponctuel": "100/100",
    "002 - 1 - Mathématiques - Ponctuel": 100,
    "003 - 1 - Histoire, géographie, enseignement moral et civique - Ponctuel": 50,
    "004 - 1 - Sciences - Ponctuel": 50,
    "005 - 1 - Soutenance orale de projet - Evaluation en cours d'année": 100,
  };
  const historical = parseOfficialBrevetRow(historicalRow, "2025");
  assert.ok(historical.success);
  assert.equal(historical.data.scoreFrancais, 100);
  assert.equal(historical.data.scoreHistoireGeo, 50);
  assert.equal(parseOfficialBrevetRow({ ...historicalRow, "001 - 1 - Français - Ponctuel": 101 }, "2025").success, false);
});

test("le sexe du modèle DNB survit à l’écriture Excel, à la relecture et à la validation", () => {
  const workbook = createStudentImportWorkbook([{ INE: modernRow.INE, NOM: modernRow.Nom, PRENOM: modernRow["Prénom(s)"], SEXE: "f" }], { year: "2026", kind: "dnb" });
  const sheet = workbook.Sheets["Données"];
  const templateRow = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" })[0];
  const row = { ...templateRow, ...modernRow };
  const filled = XLSX.utils.json_to_sheet([row]);
  workbook.Sheets["Données"] = filled;
  const restored = XLSX.read(XLSX.write(workbook, { type: "array", bookType: "xlsx" }), { type: "array" });
  const result = parseOfficialBrevetRow(XLSX.utils.sheet_to_json<Record<string, unknown>>(restored.Sheets["Données"])[0], "2026");
  assert.ok(result.success);
  assert.equal(result.data.SEXE, "f");
  for (const [input, expected] of [[" Féminin ", "f"], ["M", "g"], ["Garçon", "g"], ["", null], [undefined, null]] as const) {
    const parsed = parseOfficialBrevetRow({ ...modernRow, SEXE: input }, "2026");
    assert.ok(parsed.success);
    assert.equal(parsed.data.SEXE, expected);
  }
});

test("lit les six sous-notes DNB 2026 avec leurs en-têtes et barèmes", () => {
  const row = {
    "Grammaire et compréhension /50": "29.0",
    "Dictée /10": "1.5",
    "Rédaction /40": "32",
    "SVT (sciences) /10": "7.5",
    "Physique-chimie (sciences) /10": "8",
    "Technologie (sciences) /10": "6",
  };

  assert.equal(readOfficialBrevetField(row, "scoreFrancaisGrammaireComprehension"), "29.0");
  assert.equal(readOfficialBrevetField(row, "scoreFrancaisDictee"), "1.5");
  assert.equal(readOfficialBrevetField(row, "scoreFrancaisRedaction"), "32");
  assert.equal(readOfficialBrevetField(row, "scoreSciencesSvt"), "7.5");
  assert.equal(readOfficialBrevetField(row, "scoreSciencesPhysiqueChimie"), "8");
  assert.equal(readOfficialBrevetField(row, "scoreSciencesTechnologie"), "6");
});

test("ne confond pas les sous-notes sciences avec les anciennes notes de contrôle continu /50", () => {
  const row = {
    "Phy Chi01A /50": "34",
    "Sci Vie01A /50": "38",
  };

  assert.equal(readOfficialBrevetField(row, "scorePhysiqueChimie"), "34");
  assert.equal(readOfficialBrevetField(row, "scoreSciencesVie"), "38");
  assert.equal(readOfficialBrevetField(row, "scoreSciencesPhysiqueChimie"), undefined);
  assert.equal(readOfficialBrevetField(row, "scoreSciencesSvt"), undefined);
});

test("les sous-notes restent facultatives pour les années ou séries sans détail", () => {
  const requiredHeaders = [
    "INE",
    "Nom candidat",
    "Prénom candidat",
    "Résultat",
    "Moyenne sur 20",
    "Contrôle continu /20",
    "Épreuves terminales /20",
    "Français /20",
    "Mathématiques /20",
    "Histoire-géographie /20",
    "EMC /20",
    "Sciences /20",
    "Oral /20",
  ];
  assert.deepEqual(getMissingOfficialBrevetHeaders(requiredHeaders, "2026"), []);

  const row = {
    INE: "ABC123",
    "Nom candidat": "DUPONT",
    "Prénom candidat": "Ada",
    Résultat: "Admis",
    "Moyenne sur 20": "14.25",
    "Contrôle continu /20": "15",
    "Épreuves terminales /20": "13",
    "Français /20": "14",
    "Mathématiques /20": "12",
    "Histoire-géographie /20": "13",
    "EMC /20": "15",
    "Sciences /20": "14",
    "Oral /20": "16",
  };
  assert.deepEqual(getMissingOfficialBrevetRowValues(row, "2026"), []);
});

test("conserve la mention Absent dans les sous-notes au lieu de la traiter comme une valeur manquante", () => {
  const result = studentDataSchema.safeParse({
    anneeScolaireImportee: "2026",
    INE: "ABC123",
    "Nom candidat": "DUPONT",
    "Prénom candidat": "Ada",
    scoreFrancaisGrammaireComprehension: "Absent",
    scoreFrancaisDictee: "1.5",
    scoreFrancaisRedaction: "32/40",
    scoreSciencesSvt: "Absent /10",
    scoreSciencesPhysiqueChimie: "8",
    scoreSciencesTechnologie: "Dispensé",
  });

  assert.equal(result.success, true);
  if (!result.success) return;
  assert.equal(result.data.scoreFrancaisGrammaireComprehension, "Absent");
  assert.equal(result.data.scoreFrancaisDictee, 1.5);
  assert.equal(result.data.scoreFrancaisRedaction, 32);
  assert.equal(result.data.scoreSciencesSvt, "Absent");
  assert.equal(result.data.scoreSciencesPhysiqueChimie, 8);
  assert.equal(result.data.scoreSciencesTechnologie, "Dispensé");
});
