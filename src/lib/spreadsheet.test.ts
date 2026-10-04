import test from "node:test";
import assert from "node:assert/strict";
import { strFromU8, unzipSync } from "fflate";
import { read as secureRead } from "xlsx";
import * as XLSX from "./spreadsheet";

test("les fichiers importés passent exclusivement par le lecteur SheetJS corrigé", () => {
  assert.equal(XLSX.version, "0.20.3");
  assert.equal(XLSX.read, secureRead);
  assert.equal("readFile" in XLSX, false);
});

test("les exports conservent leurs styles et sont relus par le nouveau lecteur", () => {
  const sheet = XLSX.utils.aoa_to_sheet([["Éloïse", "000000001AA", 0]]);
  sheet.A1.s = { font: { bold: true }, fill: { fgColor: { rgb: "123456" } } };
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Données");
  const buffer = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
  const restored = XLSX.read(buffer, { type: "array" });
  assert.deepEqual(XLSX.utils.sheet_to_json(restored.Sheets["Données"], { header: 1 }), [["Éloïse", "000000001AA", 0]]);
  const files = unzipSync(new Uint8Array(buffer));
  assert.match(strFromU8(files["xl/styles.xml"]), /123456/);
  assert.match(strFromU8(files["xl/worksheets/sheet1.xml"]), /r="A1"[^>]*s="[1-9]\d*"/);
});

test("le lecteur conserve les accents des anciens fichiers Excel Windows-1252", () => {
  // Minimal SYLK workbook: 0xC9 is É in codepage 1252, not valid UTF-8.
  const sylk = 'ID;P\nC;X1;Y1;K"\xC9l\xE8ve"\nE\n';
  const workbook = XLSX.read(Uint8Array.from(sylk, (char) => char.charCodeAt(0)), { type: "array", codepage: 1252 });
  assert.equal(workbook.Sheets[workbook.SheetNames[0]].A1.v, "Élève");
});
