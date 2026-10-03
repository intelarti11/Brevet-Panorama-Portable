import test from "node:test";
import assert from "node:assert/strict";
import {parseBrevetBlancImportRows} from "./brevet-blanc-import";
import {getBrevetBlancTemplateColumns} from "./student-import-template";

const identityHeaders = ["INE", "NOM", "PRENOM", "Classe", "Sexe", "Date de naissance"];

test("mappe le modèle, conserve les cases de notes vides et normalise les identités", () => {
  const noteHeaders = getBrevetBlancTemplateColumns("2025").map((column) => column.header);
  const parsed = parseBrevetBlancImportRows(
    [
      [...identityHeaders, ...noteHeaders],
      ["INE001", "DUPONT", "Zoé", "3e 2", "Féminin", "2012-01-02", "15,5", ...noteHeaders.slice(1).map(() => "")],
    ],
    {year: "2025", exam: "bb1"},
  );

  assert.equal(parsed.rowCount, 1);
  assert.equal(parsed.students[0].INE, "INE001");
  assert.equal(parsed.students[0].notes.Français.bb1, 15.5);
  assert.equal(parsed.students[0].notes.Mathématiques, undefined);
  assert.equal(parsed.students[0].SEXE, "f");
  assert.equal(parsed.students[0].CLASSE, "3e 2");
  assert.equal(parsed.students[0].dateNaissance, "2012-01-02");
});

test("applique le barème de 2026 et interprète ABS comme une suppression de note", () => {
  const columns = getBrevetBlancTemplateColumns("2026");
  const parsed = parseBrevetBlancImportRows(
    [
      [...identityHeaders, ...columns.map((column) => column.header)],
      ["INE001", "DUPONT", "Zoé", "3e 2", "f", "", "12.5", "ABS", ...columns.slice(2).map(() => "")],
    ],
    {year: "2026", exam: "bb2"},
  );

  assert.equal(parsed.students[0].notes[columns[0].subject].bb2, 12.5);
  assert.equal(parsed.students[0].notes[columns[1].subject].bb2, null);
});

test("exige les colonnes d'identité et un INE pour chaque ligne", () => {
  assert.throws(
    () => parseBrevetBlancImportRows(
      [["NOM", "PRENOM", "Français /20"], ["DUPONT", "Zoé", "14"]],
      {year: "2026", exam: "bb1"},
    ),
    /colonne INE est obligatoire/i,
  );

  assert.throws(
    () => parseBrevetBlancImportRows(
      [[...identityHeaders, "Français /20"], ["", "DUPONT", "Zoé", "", "", "", "14"]],
      {year: "2026", exam: "bb1"},
    ),
    /INE manquant/i,
  );

  assert.throws(
    () => parseBrevetBlancImportRows(
      [["INE", "NOM", "Français /20"], ["INE001", "DUPONT", "14"]],
      {year: "2026", exam: "bb1"},
    ),
    /NOM et PRENOM sont obligatoires/i,
  );
});

test("refuse les notes hors barème, un sexe inconnu et des lignes décalées", () => {
  const headers = [...identityHeaders, "Français /20"];
  assert.throws(
    () => parseBrevetBlancImportRows(
      [headers, ["INE001", "DUPONT", "Zoé", "", "", "", "21"]],
      {year: "2026", exam: "bb1"},
    ),
    /hors barème/i,
  );
  assert.throws(
    () => parseBrevetBlancImportRows(
      [headers, ["INE001", "DUPONT", "Zoé", "", "incertain", "", "14"]],
      {year: "2026", exam: "bb1"},
    ),
    /valeur de sexe inconnue/i,
  );
  assert.throws(
    () => parseBrevetBlancImportRows(
      [headers, ["INE001", "DUPONT", "Zoé", "", "", "14"]],
      {year: "2026", exam: "bb1"},
    ),
    /cellules au lieu de/i,
  );
});

test("refuse les en-têtes et INE dupliqués, mais accepte les homonymes distincts", () => {
  assert.throws(
    () => parseBrevetBlancImportRows(
      [[...identityHeaders, "Nom", "Français /20"], ["INE001", "DUPONT", "Zoé", "", "", "", "DUPONT", "14"]],
      {year: "2026", exam: "bb1"},
    ),
    /présent plusieurs fois/i,
  );

  assert.throws(
    () => parseBrevetBlancImportRows(
      [[...identityHeaders, "Français /20"], ["INE001", "DUPONT", "Zoé", "", "", "", "14"], ["INE001", "MARTIN", "Léo", "", "", "", "15"]],
      {year: "2026", exam: "bb1"},
    ),
    /INE .* présent plusieurs fois/i,
  );

  const parsed = parseBrevetBlancImportRows(
    [[...identityHeaders, "Français /20"], ["INE001", "DUPONT", "Zoé", "", "", "", "14"], ["INE002", "DUPONT", "Zoé", "", "", "", "15"]],
    {year: "2026", exam: "bb1"},
  );
  assert.equal(parsed.rowCount, 2);
});

test("valide l'année et l'examen avant de lire des résultats", () => {
  const rows = [[...identityHeaders, "Français /20"], ["INE001", "DUPONT", "Zoé", "", "", "", "14"]];
  assert.throws(() => parseBrevetBlancImportRows(rows, {year: "2026-27", exam: "bb1"}), /année valide/i);
  assert.throws(() => parseBrevetBlancImportRows(rows, {year: "2026", exam: "dnb" as "bb1"}), /BB1 ou BB2/i);
});

test("laisse toutes les notes vides intactes pour ne pas modifier les résultats", () => {
  const noteHeaders = getBrevetBlancTemplateColumns("2026").map((column) => column.header);
  const parsed = parseBrevetBlancImportRows(
    [[...identityHeaders, ...noteHeaders], ["INE001", "DUPONT", "Zoé", "", "", "", ...noteHeaders.map(() => "")]],
    {year: "2026", exam: "bb1"},
  );
  assert.deepEqual(parsed.students[0].notes, {});
});
