import test from "node:test";
import assert from "node:assert/strict";
import { planStudentIdentityImport } from "./student-roster-plan";

const student = { INE: "000000001AA", NOM: "DUPONT", PRENOM: "Éloïse", CLASSE: "3A" };

test("réutilise la fiche de même INE malgré une correction de nom et préserve son ID", () => {
  const [write] = planStudentIdentityImport([student], [{ id: "historical-id", identity: { ...student, NOM: "DUPONT-MARTIN" } }], "2026");
  assert.equal(write.id, "historical-id");
  assert.equal(write.isNew, false);
  assert.equal(write.identity.NOM, "DUPONT");
  assert.equal("notes" in write.identity, false);
});

test("enrichit une ancienne fiche unique sans INE au lieu de créer un doublon", () => {
  const [write] = planStudentIdentityImport([student], [{ id: "legacy", identity: { NOM: "dupont", PRENOM: "Eloise" } }], "2026");
  assert.equal(write.id, "legacy");
  assert.equal(write.identity.INE, student.INE);
});

test("deux homonymes avec INE distincts produisent deux fiches distinctes", () => {
  const result = planStudentIdentityImport([student, { ...student, INE: "000000002BB" }], [], "2026");
  assert.deepEqual(result.map((entry) => entry.id), ["000000001AA_2026", "000000002BB_2026"]);
});

test("refuse de rapprocher un homonyme avec une ancienne identité sans INE", () => {
  assert.throws(() => planStudentIdentityImport([student, { ...student, INE: "000000002BB" }], [{ id: "legacy", identity: { NOM: student.NOM, PRENOM: student.PRENOM } }], "2026"), /homonyme/);
});

test("refuse un ancien dossier sans INE lorsqu’une autre fiche du même nom a déjà un INE", () => {
  assert.throws(() => planStudentIdentityImport([student], [
    { id: "legacy", identity: { NOM: student.NOM, PRENOM: student.PRENOM } },
    { id: "known", identity: { ...student, INE: "000000002BB" } },
  ], "2026"), /homonyme/);
});

test("refuse les INE répétés dans la source ou la base avant les écritures", () => {
  assert.throws(() => planStudentIdentityImport([student, student], [], "2026"), /plusieurs fois/);
  assert.throws(() => planStudentIdentityImport([student], [{ id: "one", identity: student }, { id: "two", identity: student }], "2026"), /Plusieurs fiches/);
});

test("une réimportation reprend la même clé annuelle et ne contient aucun champ de notes", () => {
  const [created] = planStudentIdentityImport([student], [], "2026");
  const [updated] = planStudentIdentityImport([student], [{ id: created.id, identity: created.identity }], "2026");
  assert.equal(created.id, updated.id);
  assert.equal(updated.isNew, false);
  assert.deepEqual(Object.keys(updated.identity).sort(), ["CLASSE", "INE", "NOM", "PRENOM"]);
});
