import type { StudentIdentity } from "./student-roster-types";

export interface ExistingStudentIdentity {
  id: string;
  identity: Partial<StudentIdentity>;
}

export interface StudentIdentityWrite {
  id: string;
  identity: StudentIdentity;
  isNew: boolean;
}

export function normalizeStudentName(value: string): string {
  return value.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toUpperCase().replace(/\s+/g, " ");
}

const identityName = (identity: Partial<StudentIdentity>) =>
  `${normalizeStudentName(identity.NOM ?? "")}\u0000${normalizeStudentName(identity.PRENOM ?? "")}`;

const normalizeIne = (value: unknown): string =>
  typeof value === "string" ? value.trim().toUpperCase() : "";

/** Prépare toutes les écritures avant de modifier la base et conserve les IDs existants. */
export function planStudentIdentityImport(
  students: readonly StudentIdentity[],
  existing: readonly ExistingStudentIdentity[],
  year: string,
): StudentIdentityWrite[] {
  if (!/^\d{4}$/.test(year)) throw new Error("Choisissez une année d’import valide.");
  const byIne = new Map<string, ExistingStudentIdentity[]>();
  const withoutIneByName = new Map<string, ExistingStudentIdentity[]>();
  const existingNameCounts = new Map<string, number>();
  const incomingNames = new Map<string, number>();
  const seenIne = new Set<string>();
  const byId = new Map(existing.map((record) => [record.id, record]));

  for (const student of students) {
    const name = identityName(student);
    incomingNames.set(name, (incomingNames.get(name) ?? 0) + 1);
  }
  for (const record of existing) {
    const name = identityName(record.identity);
    existingNameCounts.set(name, (existingNameCounts.get(name) ?? 0) + 1);
    const ine = normalizeIne(record.identity.INE);
    const map = ine ? byIne : withoutIneByName;
    const key = ine || identityName(record.identity);
    const records = map.get(key) ?? [];
    records.push(record);
    map.set(key, records);
  }

  return students.map((student) => {
    const ine = normalizeIne(student.INE);
    if (!/^[A-Z0-9]+$/.test(ine) || !student.NOM.trim() || !student.PRENOM.trim()) {
      throw new Error("Chaque élève doit avoir un INE, un nom et un prénom valides.");
    }
    if (seenIne.has(ine)) throw new Error("Un INE apparaît plusieurs fois dans la sélection.");
    seenIne.add(ine);

    const matches = byIne.get(ine) ?? [];
    if (matches.length > 1) {
      throw new Error("Plusieurs fiches de cette année ont le même INE. Corrigez les doublons avant l’import.");
    }
    let match = matches[0];
    if (!match) {
      const name = identityName(student);
      const legacyMatches = withoutIneByName.get(name) ?? [];
      if (legacyMatches.length > 0 && ((existingNameCounts.get(name) ?? 0) > 1 || (incomingNames.get(name) ?? 0) > 1)) {
        throw new Error("Une ancienne fiche sans INE présente un homonyme. Renseignez son INE avant l’import.");
      }
      match = legacyMatches[0];
    }
    const canonicalId = `${ine}_${year}`;
    const collision = byId.get(canonicalId);
    if (!match && collision && normalizeIne(collision.identity.INE) !== ine) {
      throw new Error("Une fiche existante est incompatible avec l’INE importé.");
    }
    const identity: StudentIdentity = { INE: ine, NOM: student.NOM.trim(), PRENOM: student.PRENOM.trim() };
    if (student.CLASSE?.trim()) identity.CLASSE = student.CLASSE.trim();
    if (student.SEXE) identity.SEXE = student.SEXE;
    if (student.dateNaissance?.trim()) identity.dateNaissance = student.dateNaissance.trim();
    return { id: match?.id ?? canonicalId, identity, isNew: !match };
  });
}
