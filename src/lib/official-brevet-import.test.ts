import test from "node:test";
import assert from "node:assert/strict";

import {
  getMissingOfficialBrevetHeaders,
  getMissingOfficialBrevetRowValues,
  readOfficialBrevetField,
} from "./official-brevet-import";
import { studentDataSchema } from "./excel-types";

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
