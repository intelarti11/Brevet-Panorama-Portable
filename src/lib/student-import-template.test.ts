import test from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx-js-style";
import { createStudentImportWorkbook, getBrevetBlancTemplateColumns, readStudentTemplateMetadata, validateDnbTemplateRow } from "./student-import-template";
import { getMissingOfficialBrevetHeaders } from "./official-brevet-import";

const students = [{ INE: "000000001AA", NOM: "DUPONT", PRENOM: "Éloïse", CLASSE: "3EME 1D", SEXE: "f" as const, dateNaissance: "04/05/2011" }];

test("le modèle DNB conserve les INE textuels et les accents après écriture et relecture XLSX", () => {
  const workbook = createStudentImportWorkbook(students, { year: "2026", kind: "dnb" });
  const restored = XLSX.read(XLSX.write(workbook, { type: "array", bookType: "xlsx" }), { type: "array", raw: true });
  const rows = XLSX.utils.sheet_to_json<string[]>(restored.Sheets["Données"], { header: 1, defval: "", raw: true });
  assert.equal(restored.Sheets["Données"].B2.t, "s");
  assert.equal(rows[1][1], "000000001AA");
  assert.equal(rows[1][3], "Éloïse");
  assert.deepEqual(getMissingOfficialBrevetHeaders(rows[0], "2026"), []);
  assert.deepEqual(readStudentTemplateMetadata(restored), { year: "2026", kind: "dnb" });
});

test("les modèles BB1/BB2 portent leurs métadonnées et les barèmes de l’année", () => {
  for (const exam of ["bb1", "bb2"] as const) {
    const workbook = createStudentImportWorkbook(students, { year: "2026", kind: "bb", exam });
    const rows = XLSX.utils.sheet_to_json<string[]>(workbook.Sheets["Données"], { header: 1, defval: "" });
    assert.deepEqual(rows[0].slice(0, 6), ["INE", "NOM", "PRENOM", "Classe", "Sexe", "Date de naissance"]);
    assert.deepEqual(rows[0].slice(6), getBrevetBlancTemplateColumns("2026").map((column) => column.header));
    assert.ok(rows[1].slice(6).every((cell) => cell === ""));
    assert.deepEqual(readStudentTemplateMetadata(workbook), { year: "2026", kind: "bb", exam });
  }
  assert.equal(getBrevetBlancTemplateColumns("2025")[0].maxScore, 100);
});

test("le modèle DNB historique est également reconnu par l’import existant", () => {
  const workbook = createStudentImportWorkbook(students, { year: "2025", kind: "dnb" });
  const rows = XLSX.utils.sheet_to_json<string[]>(workbook.Sheets["Données"], { header: 1 });
  assert.deepEqual(getMissingOfficialBrevetHeaders(rows[0], "2025"), []);
});

test("les métadonnées altérées bloquent l’import et un classeur ordinaire reste accepté", () => {
  const workbook = createStudentImportWorkbook(students, { year: "2026", kind: "bb", exam: "bb1" });
  workbook.Sheets["Mode d'emploi"].B4.v = "BB3";
  assert.throws(() => readStudentTemplateMetadata(workbook), /examen/);
  assert.equal(readStudentTemplateMetadata(XLSX.utils.book_new()), null);
});

test("les notes du modèle DNB sont contrôlées selon chaque barème avant import", () => {
  assert.doesNotThrow(() => validateDnbTemplateRow({ INE: "000000001AA", "Français /20": "12,5", "Dictée /10": "Absent", "Sciences /20": "Dispensé", "Rédaction /40": 40 }, 2));
  for (const value of ["Éloïse", 21, -1, Infinity]) {
    assert.throws(() => validateDnbTemplateRow({ INE: "000000001AA", "Français /20": value }, 2), /note de 0 à 20/);
  }
  assert.throws(() => validateDnbTemplateRow({ INE: "000000001AA", "Dictée /10": 11 }, 2), /note de 0 à 10/);
  assert.throws(() => validateDnbTemplateRow({ INE: "incorrect/ine" }, 2), /alphanumérique/);
});
