import { collection, doc, getDocs, query, serverTimestamp, where, withLocalTransaction } from "@/lib/local/store";
import { db } from "./firebase";
import { BREVET_DATA_UPDATED_EVENT } from "./brevet-data-events";
import { planStudentIdentityImport } from "./student-roster-plan";
import type { StudentIdentity } from "./student-roster-types";
import { isThirdYearClass } from "./student-roster-types";
import { loadDivisionAliases, resolveDivisionName } from "./division-names";

export async function loadStudentRoster(year: string): Promise<StudentIdentity[]> {
  const [snapshot, aliases] = await Promise.all([
    getDocs(query(collection(db, "BrevetBlanc"), where("anneeScolaire", "==", year))),
    loadDivisionAliases(year),
  ]);
  const students = snapshot.docs.map((record) => {
    const data = record.data();
    const identity: StudentIdentity = {
      INE: typeof data.INE === "string" ? data.INE.trim() : "",
      NOM: typeof data.NOM === "string" ? data.NOM.trim() : "",
      PRENOM: typeof data.PRENOM === "string" ? data.PRENOM.trim() : "",
    };
    if (typeof data.CLASSE === "string") identity.CLASSE = resolveDivisionName(data.CLASSE, aliases);
    if (data.SEXE === "f" || data.SEXE === "g") identity.SEXE = data.SEXE;
    if (typeof data.dateNaissance === "string") identity.dateNaissance = data.dateNaissance;
    return identity;
  }).filter((student) => isThirdYearClass(student.CLASSE ?? ""));
  if (students.length === 0) throw new Error("Aucun élève de troisième pour cette année. Importez d’abord leurs classes depuis la base officielle de l’établissement.");
  if (students.some((student) => !student.INE || !student.NOM || !student.PRENOM)) {
    throw new Error("Certaines fiches n’ont pas d’INE, de nom ou de prénom. Complétez les identités avant de télécharger le modèle.");
  }
  const seen = new Set<string>();
  for (const student of students) {
    const ine = student.INE.toUpperCase();
    if (seen.has(ine)) throw new Error("Plusieurs fiches portent le même INE. Corrigez les doublons avant de télécharger le modèle.");
    seen.add(ine);
  }
  return students.sort((a, b) => (a.CLASSE ?? "").localeCompare(b.CLASSE ?? "", "fr") ||
    a.NOM.localeCompare(b.NOM, "fr") || a.PRENOM.localeCompare(b.PRENOM, "fr"));
}

/** Fusionne uniquement les identités. Les notes et les autres informations sont conservées. */
export async function saveOfficialStudentRoster(students: readonly StudentIdentity[], year: string) {
  if (students.length === 0 || students.some((student) => !isThirdYearClass(student.CLASSE ?? ""))) {
    throw new Error("L’import officiel est limité aux élèves de troisième avec une classe renseignée.");
  }
  const result = await withLocalTransaction(async (tx) => {
    const snapshot = await tx.getDocs(query(collection(db, "BrevetBlanc"), where("anneeScolaire", "==", year)));
    const aliasesSnapshot = await tx.getDoc(doc(db, "appSettings", `divisions-${year}`));
    const aliases = aliasesSnapshot.exists() ? aliasesSnapshot.data().aliases ?? {} : {};
    const normalizedStudents = students.map((student) => ({
      ...student, CLASSE: resolveDivisionName(student.CLASSE ?? "", aliases),
    }));
    const plan = planStudentIdentityImport(normalizedStudents, snapshot.docs.map((record) => ({ id: record.id, identity: record.data() })), year);
    for (const entry of plan) {
      tx.set(doc(db, "BrevetBlanc", entry.id), {
        ...entry.identity,
        anneeScolaire: year,
        lastModified: serverTimestamp(),
        ...(entry.isNew ? { importedAt: serverTimestamp() } : {}),
      }, { merge: true });
    }
    return { created: plan.filter((entry) => entry.isNew).length, updated: plan.filter((entry) => !entry.isNew).length };
  });
  if (typeof window !== "undefined") window.dispatchEvent(new Event(BREVET_DATA_UPDATED_EVENT));
  return result;
}
