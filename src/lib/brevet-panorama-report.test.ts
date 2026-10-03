import assert from "node:assert/strict";
import test from "node:test";

import type { ProcessedStudentData } from "@/contexts/FilterContext";
import type { BrevetPanoramaPdfStats } from "@/lib/brevet-panorama-export";
import { buildBrevetPanoramaReportData } from "@/lib/brevet-panorama-report";

const stats: BrevetPanoramaPdfStats = {
  totalStudents: 5,
  admis: 2,
  refuse: 2,
  successRate: 50,
  mentions: { tresBien: 0, bien: 0, assezBien: 0, sansMention: 2 },
  mentionPercentages: { tresBien: 0, bien: 0, assezBien: 0, sansMention: 100 },
  scoreDistribution: {
    francais: { gte15: 0, gte10lt15: 0, gte8lt10: 0, lt8: 0, count: 0 },
    maths: { gte15: 0, gte10lt15: 0, gte8lt10: 0, lt8: 0, count: 0 },
    histoireGeo: { gte15: 0, gte10lt15: 0, gte8lt10: 0, lt8: 0, count: 0 },
    sciences: { gte15: 0, gte10lt15: 0, gte8lt10: 0, lt8: 0, count: 0 },
  },
};

const students: ProcessedStudentData[] = [
  { id: "1", ine: "1", nom: "Martin", prenom: "Zoé", etablissement: "", formerClass: "3e 1", formerClassSource: "brevetBlanc", sexe: "F", isBoursier: true, moyenne: 15, resultat: "ADMIS", scoreFrancais: 14, brevetBlancBb2Average: 14 },
  { id: "2", ine: "2", nom: "Bernard", prenom: "Luc", etablissement: "", formerClass: "3e 1", formerClassSource: "brevetBlanc", sexe: "G", isBoursier: false, moyenne: 11, resultat: "ADMIS", scoreFrancais: 10, brevetBlancBb2Average: 12 },
  { id: "3", ine: "3", nom: "Durand", prenom: "Alice", etablissement: "", formerClass: "3e 2", formerClassSource: "official", sexe: "Fille", moyenne: 7, resultat: "REFUSÉ", scoreFrancais: 8 },
  { id: "4", ine: "4", nom: "Petit", prenom: "Yanis", etablissement: "", formerClass: "3e 2", formerClassSource: "official", moyenne: 9, resultat: "REFUSÉ" },
  { id: "5", ine: "5", nom: "Roux", prenom: "Eva", etablissement: "" },
];

test("classements complets et profils sans assimiler les inconnus aux non-boursiers", () => {
  const report = buildBrevetPanoramaReportData(students, "2026", stats);

  assert.deepEqual(report.alphabeticalRows.map((row) => row.lastName), [
    "Bernard", "Durand", "Martin", "Petit", "Roux",
  ]);
  assert.deepEqual(report.rankedRows.map((row) => [row.lastName, row.rank]), [
    ["Martin", 1], ["Bernard", 2], ["Petit", 3], ["Durand", 4], ["Roux", undefined],
  ]);
  assert.equal(report.classDetails.length, 2);
  assert.deepEqual(report.classDetails[0].alphabeticalRows.map((row) => row.lastName), ["Bernard", "Martin"]);
  assert.deepEqual(report.classDetails[0].rankedRows.map((row) => row.rank), [1, 2]);

  assert.equal(report.genderBreakdown.specifiedCount, 3);
  assert.equal(report.genderBreakdown.unspecifiedCount, 2);
  assert.equal(report.genderBreakdown.groupA.totalStudents, 2);
  assert.equal(report.genderBreakdown.groupB.totalStudents, 1);
  assert.equal(report.genderBreakdown.groupA.successRate, 50);
  assert.equal(report.genderBreakdown.groupB.successRate, 100);
  assert.equal(
    report.genderBreakdown.subjectRows.find((row) => row.subject === "Français")?.gap,
    1,
  );

  assert.equal(report.scholarshipBreakdown.specifiedCount, 2);
  assert.equal(report.scholarshipBreakdown.unspecifiedCount, 3);
  assert.equal(report.scholarshipBreakdown.groupA.totalStudents, 1);
  assert.equal(report.scholarshipBreakdown.groupB.totalStudents, 1);
  assert.equal(report.scholarshipBreakdown.groupA.averageDnb, 15);
  assert.equal(report.scholarshipBreakdown.groupB.averageDnb, 11);
  assert.equal(
    report.scholarshipBreakdown.subjectRows.find((row) => row.subject === "Français")?.gap,
    4,
  );
  assert.equal(report.classRows[0].scholarshipKnown, 2);
  assert.equal(report.classRows[1].scholarshipKnown, 0);
});

test("aucune statistique de profil n'est inventée sans métadonnée", () => {
  const report = buildBrevetPanoramaReportData(
    [{ id: "6", ine: "6", nom: "Sans", prenom: "Profil", etablissement: "", moyenne: 12, resultat: "ADMIS" }],
    "2026",
    stats,
  );

  assert.equal(report.genderBreakdown.specifiedCount, 0);
  assert.equal(report.genderBreakdown.unspecifiedCount, 1);
  assert.equal(report.genderBreakdown.groupA.averageDnb, undefined);
  assert.equal(report.scholarshipBreakdown.specifiedCount, 0);
  assert.equal(report.scholarshipBreakdown.groupB.totalStudents, 0);
  assert.deepEqual(report.scholarshipBreakdown.subjectRows, []);
});

test("les ex aequo partagent leur rang et les notes manquantes restent non classées", () => {
  const tieStudents = [
    { id: "1", ine: "1", nom: "Alpha", prenom: "A", etablissement: "", moyenne: 12 },
    { id: "2", ine: "2", nom: "Bravo", prenom: "B", etablissement: "", moyenne: 12 },
    { id: "3", ine: "3", nom: "Charlie", prenom: "C", etablissement: "", moyenne: 11 },
    { id: "4", ine: "4", nom: "Delta", prenom: "D", etablissement: "" },
  ] satisfies ProcessedStudentData[];
  const report = buildBrevetPanoramaReportData(tieStudents, "2026", stats);
  assert.deepEqual(report.rankedRows.map((row) => row.rank), [1, 1, 3, undefined]);
});

test("sous-notes françaises et deux sciences gardent leurs barèmes et excluent les absences des moyennes", () => {
  const report = buildBrevetPanoramaReportData([
    { id: "1", ine: "1", nom: "Alpha", prenom: "A", etablissement: "", formerClass: "3e 1", scoreFrancais: 12, scoreSciences: 14, scoreFrancaisGrammaireComprehension: 29, scoreFrancaisDictee: 1.5, scoreFrancaisRedaction: 28, scoreSciencesSvt: 9, scoreSciencesPhysiqueChimie: 5 },
    { id: "2", ine: "2", nom: "Bravo", prenom: "B", etablissement: "", formerClass: "3e 1", scoreFrancaisGrammaireComprehension: "Absent", scoreFrancaisDictee: "Absent", scoreFrancaisRedaction: "Absent", scoreSciencesSvt: "Absent", scoreSciencesPhysiqueChimie: "Absent" },
  ], "2026", stats);

  assert.deepEqual(report.subsubjects.map((subject) => `${subject.label}/${subject.maxScore}`), [
    "Grammaire et compréhension/50", "Dictée/10", "Rédaction/40", "SVT/10", "Physique-chimie/10",
  ]);
  assert.equal(report.studentRows[1].sciencesSvt, "Absent");
  assert.equal(report.classRows[0].averageGrammaireComprehension, 29);
  assert.equal(report.classRows[0].averageSciencesSvt, 9);
  assert.equal(report.subjectRows.find((row) => row.subject === "SVT (sciences) /10")?.count, 1);
  assert.equal(report.subjectRows.find((row) => row.subject === "Dictée /10")?.average, 1.5);
});

test("la technologie remplace la physique-chimie dans les colonnes si elle seule est présente", () => {
  const report = buildBrevetPanoramaReportData([
    { id: "1", ine: "1", nom: "Alpha", prenom: "A", etablissement: "", scoreSciencesSvt: 6, scoreSciencesTechnologie: 8 },
  ], "2027", stats);
  assert.deepEqual(report.subsubjects.map((subject) => subject.label), ["SVT", "Technologie"]);
});
