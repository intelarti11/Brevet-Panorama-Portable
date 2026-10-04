import test from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "./spreadsheet";
import {readBrevetBlancTemplateImport} from "./brevet-blanc-template-import";
import {createStudentImportWorkbook} from "./student-import-template";

function toBuffer(workbook: XLSX.WorkBook) {
  return XLSX.write(workbook, {bookType: "xlsx", type: "array"}) as ArrayBuffer;
}

test("lit et valide une fois un modèle BB prérempli avec son examen et ses élèves", () => {
  const workbook = createStudentImportWorkbook(
    [{INE: "INE001", NOM: "DUPONT", PRENOM: "Zoé", CLASSE: "3e 2", SEXE: "f", dateNaissance: "2012-01-02"}],
    {year: "2026", kind: "bb", exam: "bb2"},
  );
  const sheet = workbook.Sheets.Données;
  const rows = XLSX.utils.sheet_to_json(sheet, {header: 1, defval: "", raw: true, blankrows: false}) as unknown[][];
  const noteIndex = (rows[0] as string[]).findIndex((header) => String(header).startsWith("Français /"));
  assert.ok(noteIndex >= 0);
  const noteAddress = XLSX.utils.encode_cell({r: 1, c: noteIndex});
  sheet[noteAddress] = {t: "s", v: "ABS"};

  const imported = readBrevetBlancTemplateImport(toBuffer(workbook));

  assert.deepEqual(imported.metadata, {year: "2026", kind: "bb", exam: "bb2"});
  assert.equal(imported.rowCount, 1);
  assert.ok(imported.rows.length > 1);
  assert.deepEqual(imported.students[0], {
    INE: "INE001",
    NOM: "DUPONT",
    PRENOM: "Zoé",
    CLASSE: "3e 2",
    SEXE: "f",
    dateNaissance: "2012-01-02",
    notes: {Français: {bb2: null}},
  });
});

test("refuse un modèle DNB dans l'import du brevet blanc", () => {
  const workbook = createStudentImportWorkbook(
    [{INE: "INE001", NOM: "DUPONT", PRENOM: "Zoé"}],
    {year: "2026", kind: "dnb"},
  );
  assert.throws(() => readBrevetBlancTemplateImport(toBuffer(workbook)), /résultats officiels du DNB/i);
});

test("refuse un modèle BB dont l'INE prérempli a été effacé", () => {
  const workbook = createStudentImportWorkbook(
    [{INE: "INE001", NOM: "DUPONT", PRENOM: "Zoé"}],
    {year: "2026", kind: "bb", exam: "bb1"},
  );
  const sheet = workbook.Sheets.Données;
  sheet.A2 = {t: "s", v: ""};
  assert.throws(() => readBrevetBlancTemplateImport(toBuffer(workbook)), /INE manquant/i);
});
