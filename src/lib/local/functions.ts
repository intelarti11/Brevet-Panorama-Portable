import {
  collection, db, doc, query, serverTimestamp, where, withLocalTransaction,
  type DocumentData, type LocalTransaction,
} from "./store";
import {
  getBrevetExamLocks, getCurrentBrevetLockYear, isBrevetExamLocked,
  type BrevetExam, type BrevetBlancLockStatus,
} from "../brevet-blanc-lock";
import {normalizeDataLockStatus} from "../data-lock";
import {getBrevetConfigForYear} from "../brevet-config";
import {normalizeDivisionName, resolveDivisionName, type DivisionAliases} from "../division-names";

export interface HttpsCallableResult<Response> { data: Response }
export type HttpsCallable<Request = unknown, Response = unknown> =
  (data?: Request) => Promise<HttpsCallableResult<Response>>;

type CallableCode = "invalid-argument" | "permission-denied" | "not-found" |
  "already-exists" | "failed-precondition" | "resource-exhausted" | "internal";
export class LocalCallableError extends Error {
  readonly code: string;
  constructor(code: CallableCode, message: string) {
    super(message);
    this.name = "LocalCallableError";
    this.code = "functions/" + code;
  }
}
function fail(code: CallableCode, message: string): never {
  throw new LocalCallableError(code, message);
}
type R = Record<string, any>;
type Exam = BrevetExam;
type StudentImport = {
  INE?: unknown; NOM?: unknown; PRENOM?: unknown; CLASSE?: unknown; SEXE?: unknown;
  dateNaissance?: unknown; isBoursier?: unknown; notes?: unknown;
};
const isRecord = (value: unknown): value is R =>
  !!value && typeof value === "object" && !Array.isArray(value);
const asRecord = (value: unknown): R => isRecord(value) ? value : {};
const snapshotData = (snapshot: {data(): DocumentData}): R => asRecord(snapshot.data());

function sortYearsDescending(years: Iterable<string>): string[] {
  return Array.from(new Set(Array.from(years).filter((year) => !!year.trim())))
    .sort((left, right) => {
      const a = Number.parseInt(left, 10);
      const b = Number.parseInt(right, 10);
      return Number.isFinite(a) && Number.isFinite(b) ? b - a : right.localeCompare(left, "fr");
    });
}
function normalizeText(value: unknown): string {
  return value === null || value === undefined ? "" :
    String(value).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizeAliases(value: unknown): DivisionAliases {
  if (value === undefined) return {};
  if (!isRecord(value)) fail("failed-precondition", "Les correspondances de divisions sont invalides.");
  const direct: DivisionAliases = {};
  const reserved = new Set(["__proto__", "constructor", "prototype"]);
  for (const [source, rawTarget] of Object.entries(value)) {
    if (typeof rawTarget !== "string" || !source.trim() || source.trim().length > 60 ||
      !rawTarget.trim() || rawTarget.trim().length > 60) {
      fail("failed-precondition", "Une correspondance de division est invalide.");
    }
    const key = normalizeDivisionName(source);
    const target = rawTarget.trim();
    if (!key || reserved.has(key) || reserved.has(normalizeDivisionName(target))) {
      fail("failed-precondition", "Une correspondance de division est invalide.");
    }
    if (Object.hasOwn(direct, key) && direct[key] !== target) {
      fail("failed-precondition", "Les correspondances de divisions sont incompatibles.");
    }
    direct[key] = target;
  }
  const result: DivisionAliases = {};
  for (const key of Object.keys(direct)) {
    let current = key;
    const seen = new Set<string>();
    while (Object.hasOwn(direct, normalizeDivisionName(current))) {
      const currentKey = normalizeDivisionName(current);
      const next = direct[currentKey];
      if (normalizeDivisionName(next) === currentKey) { current = next; break; }
      if (seen.has(currentKey)) fail("failed-precondition", "Les correspondances de divisions contiennent une boucle.");
      seen.add(currentKey);
      current = next;
    }
    result[key] = current;
  }
  return result;
}
function readAliases(exists: boolean, data: R, year: string): DivisionAliases {
  if (!exists) return {};
  if (data.year !== year || !Object.hasOwn(data, "aliases")) {
    fail("failed-precondition", "La configuration des divisions est invalide.");
  }
  return normalizeAliases(data.aliases);
}
function aliasesRef(year: string) { return doc(db, "appSettings", "divisions-" + year); }
async function aliasesInTx(tx: LocalTransaction, year: string): Promise<DivisionAliases> {
  const snap = await tx.getDoc(aliasesRef(year));
  return readAliases(snap.exists(), snapshotData(snap), year);
}
function cleanDivisionName(value: unknown, label: string): string {
  if (typeof value !== "string") fail("invalid-argument", "Le nom de " + label + " doit être du texte.");
  const name = value.trim();
  const key = normalizeDivisionName(name);
  if (!name || name.length > 60 || Array.from(name).some((c) => {
    const n = c.charCodeAt(0); return n <= 0x1f || (n >= 0x7f && n <= 0x9f);
  })) fail("invalid-argument", "Le nom de " + label + " doit contenir de 1 à 60 caractères sans caractère de contrôle.");
  if (["__proto__", "constructor", "prototype"].includes(key)) fail("invalid-argument", "Le nom de " + label + " est réservé.");
  return name;
}
function buildRenamedAliases(aliases: DivisionAliases, oldName: string, newName: string): DivisionAliases {
  const oldKey = normalizeDivisionName(oldName);
  const newKey = normalizeDivisionName(newName);
  const next: DivisionAliases = {};
  for (const key of Object.keys(aliases)) {
    const resolved = resolveDivisionName(key, aliases);
    if (normalizeDivisionName(resolved) === oldKey) {
      if (key !== newKey) next[key] = newName;
    } else next[key] = resolved;
  }
  next[oldKey] = newName;
  return normalizeAliases(next);
}
function isThirdYearClass(name: string): boolean {
  const normalized = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toUpperCase().replace(/[^A-Z0-9]/g, "");
  return normalized.startsWith("3") || normalized.startsWith("TROISIEME");
}
function validateDivisionYear(year: unknown): asserts year is string {
  if (typeof year !== "string" || !/^\d{4}$/.test(year)) fail("invalid-argument", "L'année doit contenir quatre chiffres.");
}

function normalizeLocks(value: unknown): BrevetBlancLockStatus {
  return isRecord(value) ? value as BrevetBlancLockStatus : {};
}
function readBrevetClosed(raw: R | undefined, year: string): boolean {
  if (!raw || raw.saisieLock === undefined) return false;
  if (!isRecord(raw.saisieLock)) fail("failed-precondition", "Les paramètres de verrouillage sont invalides; renommage bloqué.");
  if (!Object.hasOwn(raw.saisieLock, year)) return false;
  const lock = raw.saisieLock[year];
  if (typeof lock === "boolean") return lock;
  if (!isRecord(lock) || Object.keys(lock).some((key) => key !== "bb1" && key !== "bb2") ||
      Object.values(lock).some((value) => typeof value !== "boolean")) {
    fail("failed-precondition", "Les paramètres de verrouillage sont invalides; renommage bloqué.");
  }
  return lock.bb1 === true && lock.bb2 === true;
}
function readYearModuleLock(raw: R | undefined, module: "brevet" | "pix", year: string): boolean {
  if (!raw || raw[module] === undefined) return false;
  if (!isRecord(raw[module])) fail("failed-precondition", "Les paramètres de verrouillage sont invalides; renommage bloqué.");
  if (!Object.hasOwn(raw[module], year)) return false;
  if (typeof raw[module][year] !== "boolean") fail("failed-precondition", "Les paramètres de verrouillage sont invalides; renommage bloqué.");
  return raw[module][year] === true;
}
type DivisionModule = "brevetBlanc" | "brevet" | "pix";
type Projection = {module: DivisionModule; collection: string; yearField: string; classField: string};
const PROJECTIONS: Projection[] = [
  {module: "brevetBlanc", collection: "BrevetBlanc", yearField: "anneeScolaire", classField: "CLASSE"},
  {module: "brevet", collection: "brevetResults", yearField: "anneeScolaireImportee", classField: "Division de classe"},
  {module: "pix", collection: "pixResults", yearField: "anneeCertification", classField: "classe"},
];
const MODULE_ORDER: DivisionModule[] = ["brevetBlanc", "brevet", "pix"];
const MODULE_LABELS: Record<DivisionModule, string> = {
  brevetBlanc: "Brevet blanc", brevet: "DNB", pix: "PIX",
};
function readDivisionLocks(year: string, bb: R | undefined, data: R | undefined) {
  return {
    brevetBlanc: readBrevetClosed(bb, year),
    brevet: readYearModuleLock(data, "brevet", year),
    pix: readYearModuleLock(data, "pix", year),
  };
}

function normalizeIneInput(value: unknown, row: number): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") fail("invalid-argument", "L'INE de la ligne " + row + " doit être du texte.");
  const ine = value.trim().toUpperCase().replace(/\s+/g, "");
  if (ine && !/^[A-Z0-9]+$/.test(ine)) fail("invalid-argument", "L'INE de la ligne " + row + " doit être alphanumérique.");
  return ine || undefined;
}
export function normalizeStudentIne(value: string): string | undefined {
  return value.trim().toUpperCase().replace(/\s+/g, "") || undefined;
}
function normalizeName(value: string): string {
  return value.trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");
}
export function buildStudentMatchKey(nom: string, prenom: string): string {
  return normalizeName(nom) + "__" + normalizeName(prenom);
}
type ExistingStudent = {id: string; data: R};
export type PlannedLocalStudentImport = {
  student: StudentImport; documentId: string; existing: boolean; preserveOfficialIdentity: boolean;
};
function getStoredIne(data: R): {hasValue: boolean; normalized?: string} {
  if (data.INE === undefined || data.INE === null || data.INE === "") return {hasValue: false};
  if (typeof data.INE !== "string") return {hasValue: true};
  return {hasValue: true, normalized: normalizeStudentIne(data.INE)};
}
function validateImportNotes(student: StudentImport, exam: Exam, year: string, row: number): void {
  if (student.notes === undefined || student.notes === null) return;
  if (!isRecord(student.notes)) fail("invalid-argument", "Les notes de la ligne " + row + " sont invalides.");
  const maxima = getBrevetConfigForYear(year).maxScores;
  for (const [subject, rawNotes] of Object.entries(student.notes)) {
    if (!isRecord(rawNotes)) fail("invalid-argument", "Les notes de la ligne " + row + " sont invalides.");
    const note = rawNotes[exam];
    if (note === undefined) continue;
    const maximum = maxima[subject];
    if (maximum === undefined) fail("invalid-argument", "Matière inconnue pour " + year + " : " + subject + ".");
    if (note === null) continue;
    if (typeof note !== "number" || !Number.isFinite(note) || note < 0 || note > maximum) {
      fail("invalid-argument", "La note de " + subject + " à la ligne " + row + " doit être comprise entre 0 et " + maximum + ".");
    }
  }
}
function existingNameKey(record: ExistingStudent): string | undefined {
  return typeof record.data.NOM === "string" && typeof record.data.PRENOM === "string" ?
    buildStudentMatchKey(record.data.NOM, record.data.PRENOM) : undefined;
}
export function planLocalStudentImports(
  students: StudentImport[], existingRecords: ExistingStudent[], year: string, exam: Exam,
): PlannedLocalStudentImport[] {
  if (!/^\d{4}$/.test(year)) fail("invalid-argument", "L'année scolaire est invalide.");
  if (exam !== "bb1" && exam !== "bb2") fail("invalid-argument", "Le type d'examen doit être BB1 ou BB2.");
  const inputIne = new Set<string>();
  const inputNames = new Map<string, Array<string | undefined>>();
  const normalized: Array<{student: StudentImport; ine?: string; nameKey: string}> = [];
  students.forEach((row, index) => {
    const line = index + 1;
    if (!isRecord(row)) fail("invalid-argument", "La ligne " + line + " de l'import est invalide.");
    if (typeof row.NOM !== "string" || !row.NOM.trim() || typeof row.PRENOM !== "string" || !row.PRENOM.trim()) {
      fail("invalid-argument", "Nom ou prénom manquant à la ligne " + line + ".");
    }
    const student: StudentImport = {...row, NOM: row.NOM.trim(), PRENOM: row.PRENOM.trim(), notes: row.notes ?? {}};
    const ine = normalizeIneInput(student.INE, line);
    if (ine) student.INE = ine;
    const nameKey = buildStudentMatchKey(student.NOM as string, student.PRENOM as string);
    if (ine && inputIne.has(ine)) fail("invalid-argument", "L'INE " + ine + " apparaît plusieurs fois dans le fichier.");
    if (ine) inputIne.add(ine);
    const sameName = inputNames.get(nameKey) ?? [];
    if (sameName.some((previous) => !previous || !ine)) {
      fail("invalid-argument", "Plusieurs lignes portent le nom " + student.NOM + " " + student.PRENOM + " sans INE distincts.");
    }
    sameName.push(ine);
    inputNames.set(nameKey, sameName);
    validateImportNotes(student, exam, year, line);
    normalized.push({student, ine, nameKey});
  });

  const byId = new Map(existingRecords.map((record) => [record.id, record]));
  const byIne = new Map<string, ExistingStudent[]>();
  const byName = new Map<string, ExistingStudent[]>();
  for (const record of existingRecords) {
    const stored = getStoredIne(record.data);
    if (stored.normalized) byIne.set(stored.normalized, [...(byIne.get(stored.normalized) ?? []), record]);
    const nameKey = existingNameKey(record);
    if (nameKey) byName.set(nameKey, [...(byName.get(nameKey) ?? []), record]);
  }

  const plannedIds = new Set<string>();
  return normalized.map(({student, ine, nameKey}) => {
    const nameMatches = byName.get(nameKey) ?? [];
    let target: ExistingStudent | undefined;
    let newId: string | undefined;
    let preserveOfficialIdentity = false;
    if (ine) {
      const ineMatches = byIne.get(ine) ?? [];
      if (ineMatches.length > 1) fail("invalid-argument", "L'INE " + ine + " correspond à plusieurs dossiers pour " + year + ".");
      if (ineMatches.length === 1) {
        target = ineMatches[0];
        if (existingNameKey(target) !== nameKey) fail("invalid-argument", "L'INE " + ine + " est déjà rattaché à une autre identité pour " + year + ".");
      } else {
        const legacyMatches = nameMatches.filter((record) => !getStoredIne(record.data).hasValue);
        const malformed = nameMatches.some((record) => {
          const stored = getStoredIne(record.data); return stored.hasValue && !stored.normalized;
        });
        if (malformed) fail("invalid-argument", "L'identité de " + student.NOM + " " + student.PRENOM + " est ambiguë pour " + year + ".");
        if (legacyMatches.length) {
          if (nameMatches.length !== 1 || legacyMatches.length !== 1) {
            fail("invalid-argument", "Plusieurs dossiers correspondent à " + student.NOM + " " + student.PRENOM + " pour " + year + ".");
          }
          target = legacyMatches[0];
        } else newId = ine + "_" + year;
      }
    } else {
      if (nameMatches.length > 1) {
        fail("invalid-argument", "Plusieurs dossiers correspondent à " + student.NOM + " " + student.PRENOM + " pour " + year + "; un INE est nécessaire.");
      }
      if (nameMatches.length === 1) {
        target = nameMatches[0];
        preserveOfficialIdentity = !!getStoredIne(target.data).normalized;
      } else {
        newId = (student.NOM as string) + "_" + (student.PRENOM as string) + "_" + year;
        newId = newId.replace(/\s+/g, "_");
      }
    }
    const id = target?.id ?? newId;
    if (!id) fail("invalid-argument", "Impossible de déterminer le dossier de " + student.NOM + " " + student.PRENOM + ".");
    if (plannedIds.has(id)) fail("invalid-argument", "Plusieurs lignes ciblent le même dossier " + id + ".");
    plannedIds.add(id);
    if (!target && byId.has(id)) fail("invalid-argument", "L'identifiant de dossier " + id + " est déjà utilisé par une autre identité.");
    return {student, documentId: id, existing: !!target, preserveOfficialIdentity};
  });
}
export function mergeImportedExamNotes(existingValue: unknown, student: StudentImport, exam: Exam): R {
  const next: R = structuredClone(asRecord(existingValue));
  for (const [subject, raw] of Object.entries(asRecord(student.notes))) {
    const incoming = asRecord(raw);
    if (!Object.hasOwn(incoming, exam) || incoming[exam] === undefined) continue;
    const current = asRecord(next[subject]);
    if (incoming[exam] === null) delete current[exam]; else current[exam] = incoming[exam];
    if (Object.keys(current).length) next[subject] = current; else delete next[subject];
  }
  return next;
}
function applyStudentIdentity(payload: R, student: StudentImport, preserveOfficial: boolean): void {
  if (!preserveOfficial) {
    if (typeof student.INE === "string" && student.INE.trim()) payload.INE = normalizeIneInput(student.INE, 1);
    if (typeof student.NOM === "string") payload.NOM = student.NOM.trim();
    if (typeof student.PRENOM === "string") payload.PRENOM = student.PRENOM.trim();
    if (typeof student.CLASSE === "string" && student.CLASSE.trim()) payload.CLASSE = student.CLASSE.trim();
    if (student.SEXE === "f" || student.SEXE === "g") payload.SEXE = student.SEXE;
    if (typeof student.dateNaissance === "string" && student.dateNaissance.trim()) payload.dateNaissance = student.dateNaissance.trim();
  }
  if (typeof student.isBoursier === "boolean") payload.isBoursier = student.isBoursier;
}

async function importAnciensResultatsBB(data: unknown): Promise<unknown> {
  const request = asRecord(data);
  const students = request.students;
  const year = typeof request.anneeScolaire === "string" ? request.anneeScolaire.trim() : "";
  const exam = request.exam;
  if (!Array.isArray(students) || !students.length || !/^\d{4}$/.test(year) ||
    (exam !== "bb1" && exam !== "bb2")) {
    fail("invalid-argument", "Les données fournies sont invalides ou vides.");
  }

  return withLocalTransaction(async (tx) => {
    const lockSnap = await tx.getDoc(doc(db, "appSettings", "brevetBlanc"));
    const locks = normalizeLocks(snapshotData(lockSnap).saisieLock);
    if (isBrevetExamLocked(locks, year, exam)) {
      fail("permission-denied", "L'import du " + exam.toUpperCase() + " est fermé pour l'année " + year + ".");
    }
    const aliases = await aliasesInTx(tx, year);
    const normalizedRows = students.map((candidate) => {
      if (!isRecord(candidate) || typeof candidate.CLASSE !== "string" || !candidate.CLASSE.trim()) {
        return candidate as StudentImport;
      }
      return {...candidate, CLASSE: resolveDivisionName(candidate.CLASSE, aliases)} as StudentImport;
    });
    const existingSnap = await tx.getDocs(query(
      collection(db, "BrevetBlanc"), where("anneeScolaire", "==", year),
    ));
    const existing = existingSnap.docs.map((snap) => ({id: snap.id, data: snapshotData(snap)}));
    const plan = planLocalStudentImports(normalizedRows, existing, year, exam as Exam);

    // Resolve deterministic-ID collisions before scheduling any writes.
    for (const entry of plan) {
      if (!entry.existing && (await tx.getDoc(doc(db, "BrevetBlanc", entry.documentId))).exists()) {
        fail("invalid-argument", "Un identifiant d'élève est déjà utilisé par un autre dossier.");
      }
    }
    for (const entry of plan) {
      const student = entry.student;
      const old = existing.find((record) => record.id === entry.documentId);
      if (old) {
        const patch: R = {lastModified: serverTimestamp()};
        applyStudentIdentity(patch, student, entry.preserveOfficialIdentity);
        patch.notes = mergeImportedExamNotes(old.data.notes, student, exam as Exam);
        tx.update(doc(db, "BrevetBlanc", entry.documentId), patch);
      } else {
        const record: R = {
          anneeScolaire: year,
          notes: {},
          lastModified: serverTimestamp(),
          importedAt: serverTimestamp(),
        };
        applyStudentIdentity(record, student, false);
        record.notes = mergeImportedExamNotes({}, student, exam as Exam);
        tx.set(doc(db, "BrevetBlanc", entry.documentId), record);
      }
    }
    return {success: true, message: "Anciens résultats importés avec succès."};
  });
}

async function importPixResults(data: unknown): Promise<unknown> {
  const request = asRecord(data);
  const students = request.students;
  const expectedYear = typeof request.expectedYear === "string" ? request.expectedYear.trim() : "";
  if (!Array.isArray(students) || !students.length) {
    fail("invalid-argument", "Les données fournies sont invalides ou vides.");
  }
  if (expectedYear && !/^\d{4}$/.test(expectedYear)) {
    fail("invalid-argument", "L'année PIX attendue doit comporter quatre chiffres.");
  }
  students.forEach((student, index) => {
    if (!isRecord(student) || typeof student.anneeCertification !== "string" ||
      !/^\d{4}$/.test(student.anneeCertification.trim())) {
      fail("invalid-argument", "L'année de certification PIX de la ligne " + (index + 1) + " doit comporter quatre chiffres.");
    }
  });
  return withLocalTransaction(async (tx) => {
    const lockSnap = await tx.getDoc(doc(db, "appSettings", "dataLocks"));
    const lockStatus = normalizeDataLockStatus(snapshotData(lockSnap));
    const lockedYears = Array.from(new Set(students.map((student) =>
      isRecord(student) && typeof student.anneeCertification === "string" ?
        student.anneeCertification.trim() : "",
    ).filter((year) => year && lockStatus.pix[year] === true)))
      .sort((a, b) => b.localeCompare(a, "fr"));
    if (lockedYears.length) {
      fail("permission-denied", "L'import PIX est verrouillé pour " + lockedYears.join(", ") + ".");
    }
    if (expectedYear) {
      const mismatched = Array.from(new Set(students.map((student) =>
        isRecord(student) && typeof student.anneeCertification === "string" ?
          student.anneeCertification.trim() : "",
      ).filter((year) => year && year !== expectedYear)))
        .sort((a, b) => b.localeCompare(a, "fr"));
      if (mismatched.length) {
        fail("invalid-argument", "Les fichiers PIX contiennent " + mismatched.join(", ") + " au lieu de " + expectedYear + ".");
      }
    }
    const years = Array.from(new Set(students.map((student) =>
      isRecord(student) && typeof student.anneeCertification === "string" ?
        student.anneeCertification.trim() : "",
    ).filter((year) => /^\d{4}$/.test(year))));
    const aliases = await Promise.all(years.map(async (year) =>
      [year, await aliasesInTx(tx, year)] as const));
    const aliasesByYear = new Map(aliases);
    const valid: R[] = [];
    for (const candidate of students) {
      if (!isRecord(candidate) || typeof candidate.numeroCertification !== "string" ||
        !candidate.numeroCertification.trim()) continue;
      const student = {...candidate};
      const year = typeof student.anneeCertification === "string" ? student.anneeCertification.trim() : "";
      if (typeof student.classe === "string" && student.classe.trim() && aliasesByYear.has(year)) {
        student.classe = resolveDivisionName(student.classe, aliasesByYear.get(year)!);
      }
      valid.push(student);
    }
    if (!valid.length) fail("invalid-argument", "Aucun enregistrement PIX valide trouvé à importer.");
    for (const student of valid) {
      tx.set(doc(db, "pixResults", String(student.numeroCertification).trim()), student, {merge: true});
    }
    return {success: true, message: "Résultats PIX importés avec succès."};
  });
}

async function getPixAvailableYears(): Promise<unknown> {
  return withLocalTransaction(async (tx) => {
    const snap = await tx.getDocs(collection(db, "pixResults"));
    const years = new Set<string>();
    for (const item of snap.docs) {
      const year = snapshotData(item).anneeCertification;
      if (typeof year === "string" && year.trim()) years.add(year.trim());
    }
    return {success: true, years: sortYearsDescending(years)};
  });
}

async function getPixStudentsByYear(data: unknown): Promise<unknown> {
  const raw = asRecord(data).year;
  if (typeof raw !== "string" || !raw.trim()) fail("invalid-argument", "Une année PIX doit être fournie.");
  const year = raw.trim();
  return withLocalTransaction(async (tx) => {
    const snap = await tx.getDocs(query(
      collection(db, "pixResults"), where("anneeCertification", "==", year),
    ));
    return {success: true, students: snap.docs.map((item) => item.data())};
  });
}

async function getBrevetBlancLockStatus(): Promise<unknown> {
  return withLocalTransaction(async (tx) => {
    const snap = await tx.getDoc(doc(db, "appSettings", "brevetBlanc"));
    return {success: true, lockStatus: normalizeLocks(snapshotData(snap).saisieLock)};
  });
}

async function setBrevetBlancLockStatus(data: unknown): Promise<unknown> {
  const request = asRecord(data);
  const year = typeof request.year === "string" ? request.year.trim() : "";
  const exam = request.exam;
  if (!year || (exam !== "bb1" && exam !== "bb2") || typeof request.locked !== "boolean") {
    fail("invalid-argument", "L'année, l'examen (bb1 ou bb2) et un verrouillage booléen sont requis.");
  }
  const validExam = exam as Exam;
  return withLocalTransaction(async (tx) => {
    const ref = doc(db, "appSettings", "brevetBlanc");
    const snap = await tx.getDoc(ref);
    const allLocks = normalizeLocks(snapshotData(snap).saisieLock);
    const next = getBrevetExamLocks(allLocks, year);
    next[validExam] = request.locked;
    tx.set(ref, {saisieLock: {[year]: next}}, {merge: true});
    return {
      success: true,
      message: "La saisie du " + validExam.toUpperCase() + " pour l'année " + year + " a été " +
        (request.locked ? "fermée" : "ouverte") + ".",
    };
  });
}

async function getDataLockStatus(): Promise<unknown> {
  return withLocalTransaction(async (tx) => {
    const snap = await tx.getDoc(doc(db, "appSettings", "dataLocks"));
    return {success: true, lockStatus: normalizeDataLockStatus(snapshotData(snap))};
  });
}

async function setDataLockStatus(data: unknown): Promise<unknown> {
  const request = asRecord(data);
  const lockModule = request.module;
  const year = typeof request.year === "string" ? request.year.trim() : "";
  if ((lockModule !== "brevet" && lockModule !== "pix") || !year || typeof request.locked !== "boolean") {
    fail("invalid-argument", "Le module, l'année et le verrouillage sont requis.");
  }
  const validModule = lockModule as "brevet" | "pix";
  return withLocalTransaction(async (tx) => {
    tx.set(doc(db, "appSettings", "dataLocks"), {
      [validModule]: {[year]: request.locked},
    }, {merge: true});
    return {
      success: true,
      message: "L'année " + year + " a été " +
        (request.locked ? "verrouillée" : "déverrouillée") + " pour " + validModule.toUpperCase() + ".",
    };
  });
}

async function getLockManagementData(): Promise<unknown> {
  return withLocalTransaction(async (tx) => {
    const [bbDoc, lockDoc, bb, brevet, pix] = await Promise.all([
      tx.getDoc(doc(db, "appSettings", "brevetBlanc")),
      tx.getDoc(doc(db, "appSettings", "dataLocks")),
      tx.getDocs(collection(db, "BrevetBlanc")),
      tx.getDocs(collection(db, "brevetResults")),
      tx.getDocs(collection(db, "pixResults")),
    ]);
    const bbLocks = normalizeLocks(snapshotData(bbDoc).saisieLock);
    const dataLocks = normalizeDataLockStatus(snapshotData(lockDoc));
    const yearsFrom = (snap: {docs: Array<{data(): DocumentData}>}, field: string, locked: R) => {
      const years = new Set<string>([getCurrentBrevetLockYear(), ...Object.keys(locked)]);
      for (const item of snap.docs) {
        const value = item.data()[field];
        if (typeof value === "string" && value.trim()) years.add(value.trim());
      }
      return sortYearsDescending(years);
    };
    return {
      success: true,
      brevetBlancLockStatus: bbLocks,
      dataLockStatus: dataLocks,
      availableYears: {
        brevetBlanc: yearsFrom(bb, "anneeScolaire", bbLocks),
        brevet: yearsFrom(brevet, "anneeScolaireImportee", dataLocks.brevet),
        pix: yearsFrom(pix, "anneeCertification", dataLocks.pix),
      },
    };
  });
}

type DivisionSummary = {
  name: string;
  counts: Record<DivisionModule, number>;
  lockedModules: DivisionModule[];
};
function divisionSummaries(
  snapshots: Array<{docs: Array<{data(): DocumentData}>}>,
  aliases: DivisionAliases,
  locks: Record<DivisionModule, boolean>,
): DivisionSummary[] {
  const divisions = new Map<string, DivisionSummary>();
  snapshots.forEach((snap, index) => {
    const projection = PROJECTIONS[index];
    for (const item of snap.docs) {
      const rawName = item.data()[projection.classField];
      if (typeof rawName !== "string" || !rawName.trim()) continue;
      const name = resolveDivisionName(rawName, aliases).trim();
      const key = normalizeDivisionName(name);
      if (!key) continue;
      let entry = divisions.get(key);
      if (!entry) {
        entry = {name, counts: {brevetBlanc: 0, brevet: 0, pix: 0}, lockedModules: []};
        divisions.set(key, entry);
      }
      entry.counts[projection.module] += 1;
    }
  });
  return Array.from(divisions.values()).map((entry) => ({
    ...entry,
    lockedModules: MODULE_ORDER.filter((module) => entry.counts[module] > 0 && locks[module]),
  })).sort((left, right) =>
    left.name.localeCompare(right.name, "fr", {numeric: true, sensitivity: "base"}),
  );
}

async function getDivisions(data: unknown): Promise<unknown> {
  const year = asRecord(data).year;
  validateDivisionYear(year);
  return withLocalTransaction(async (tx) => {
    const [aliases, bbDoc, lockDoc, ...snapshots] = await Promise.all([
      aliasesInTx(tx, year),
      tx.getDoc(doc(db, "appSettings", "brevetBlanc")),
      tx.getDoc(doc(db, "appSettings", "dataLocks")),
      ...PROJECTIONS.map((projection) => tx.getDocs(query(
        collection(db, projection.collection), where(projection.yearField, "==", year),
      ))),
    ]);
    const locks = readDivisionLocks(year,
      bbDoc.exists() ? snapshotData(bbDoc) : undefined,
      lockDoc.exists() ? snapshotData(lockDoc) : undefined,
    );
    return {success: true, year, divisions: divisionSummaries(snapshots, aliases, locks)};
  });
}

async function renameDivision(data: unknown): Promise<unknown> {
  const request = asRecord(data);
  const year = request.year;
  validateDivisionYear(year);
  const oldName = cleanDivisionName(request.oldName, "division source");
  const requestedNewName = cleanDivisionName(request.newName, "nouveau nom");
  if (oldName === requestedNewName) fail("invalid-argument", "Choisissez deux noms de division différents.");

  return withLocalTransaction(async (tx) => {
    const aliasRef = aliasesRef(year);
    const [aliasSnap, bbDoc, lockDoc, ...snapshots] = await Promise.all([
      tx.getDoc(aliasRef),
      tx.getDoc(doc(db, "appSettings", "brevetBlanc")),
      tx.getDoc(doc(db, "appSettings", "dataLocks")),
      ...PROJECTIONS.map((projection) => tx.getDocs(query(
        collection(db, projection.collection), where(projection.yearField, "==", year),
      ))),
    ]);
    const aliases = readAliases(aliasSnap.exists(), snapshotData(aliasSnap), year);
    const locks = readDivisionLocks(year,
      bbDoc.exists() ? snapshotData(bbDoc) : undefined,
      lockDoc.exists() ? snapshotData(lockDoc) : undefined,
    );
    const divisions = divisionSummaries(snapshots, aliases, locks);
    const oldKey = normalizeDivisionName(resolveDivisionName(oldName, aliases));
    const oldDivision = divisions.find((entry) => normalizeDivisionName(entry.name) === oldKey);
    if (!oldDivision) {
      fail("failed-precondition", "La division sélectionnée est introuvable pour cette année. Actualisez la liste.");
    }
    const requestedKey = normalizeDivisionName(requestedNewName);
    const isInversion =
      normalizeDivisionName(resolveDivisionName(requestedNewName, aliases)) === oldKey &&
      requestedKey !== oldKey;
    const isSpellingChange = requestedKey === oldKey && requestedNewName !== oldDivision.name;
    const canonicalNewName = isInversion || isSpellingChange ? requestedNewName :
      resolveDivisionName(requestedNewName, aliases);
    const newKey = normalizeDivisionName(canonicalNewName);
    if (newKey === oldKey && canonicalNewName === oldDivision.name) {
      fail("invalid-argument", "Choisissez deux noms de division différents.");
    }
    if (isThirdYearClass(oldDivision.name) && !isThirdYearClass(canonicalNewName)) {
      fail("invalid-argument", "Une division de troisième doit conserver un nom de troisième.");
    }
    if (!isInversion && newKey !== oldKey &&
      divisions.some((entry) => normalizeDivisionName(entry.name) === newKey)) {
      fail("already-exists", "Une division porte déjà ce nom pour cette année.");
    }
    const selected: Array<{projection: Projection; id: string}> = [];
    snapshots.forEach((snap, index) => {
      const projection = PROJECTIONS[index];
      for (const item of snap.docs) {
        const rawName = item.data()[projection.classField];
        if (typeof rawName === "string" &&
          normalizeDivisionName(resolveDivisionName(rawName, aliases)) === oldKey) {
          selected.push({projection, id: item.id});
        }
      }
    });
    const counts: Record<DivisionModule, number> = {brevetBlanc: 0, brevet: 0, pix: 0};
    selected.forEach(({projection}) => { counts[projection.module] += 1; });
    const lockedModules = MODULE_ORDER.filter((module) => counts[module] > 0 && locks[module]);
    if (lockedModules.length) {
      fail("failed-precondition", "Renommage bloqué : saisies verrouillées dans " +
        lockedModules.map((module) => MODULE_LABELS[module]).join(", ") + " pour " + year + ".");
    }
    if (selected.length > 24999) {
      fail("resource-exhausted", "Cette division contient " + selected.length +
        " fiches. Le renommage atomique local est limité à 24 999.");
    }
    const nextAliases = buildRenamedAliases(aliases, oldDivision.name, canonicalNewName);
    for (const item of selected) {
      tx.update(doc(db, item.projection.collection, item.id), {
        [item.projection.classField]: canonicalNewName,
      });
    }
    tx.set(aliasRef, {year, aliases: nextAliases, updatedAt: serverTimestamp()});
    return {
      success: true,
      year,
      oldName: oldDivision.name,
      newName: canonicalNewName,
      counts,
      message: "Division " + oldDivision.name + " renommée en " + canonicalNewName + " pour " + year + ".",
    };
  });
}

type ManagedCollection = "brevetResults" | "BrevetBlanc" | "pixResults";
type CollectionConfig = {
  yearField: string;
  display: (id: string, data: R) => string;
  className: (data: R) => string;
  year: (data: R) => string;
  searchText: (id: string, data: R) => string;
};
const MANAGED_COLLECTIONS = new Set<ManagedCollection>(["brevetResults", "BrevetBlanc", "pixResults"]);
const RECORD_CONFIG: Record<ManagedCollection, CollectionConfig> = {
  brevetResults: {
    yearField: "anneeScolaireImportee",
    display: (id, data) =>
      ((String(data["Prénom candidat"] ?? "") + " " + String(data["Nom candidat"] ?? "")).trim() || id),
    className: (data) => String(data["Division de classe"] ?? ""),
    year: (data) => String(data.anneeScolaireImportee ?? ""),
    searchText: (id, data) => [
      id, data.INE, data["Prénom candidat"], data["Nom candidat"], data["Division de classe"],
      data["Libellé Etablissement"], data["Commune Etablissement"],
    ].join(" "),
  },
  BrevetBlanc: {
    yearField: "anneeScolaire",
    display: (id, data) => ((String(data.PRENOM ?? "") + " " + String(data.NOM ?? "")).trim() || id),
    className: (data) => String(data.CLASSE ?? ""),
    year: (data) => String(data.anneeScolaire ?? ""),
    searchText: (id, data) => [id, data.PRENOM, data.NOM, data.CLASSE, data.SEXE].join(" "),
  },
  pixResults: {
    yearField: "anneeCertification",
    display: (id, data) => ((String(data.prenom ?? "") + " " + String(data.nom ?? "")).trim() || id),
    className: (data) => String(data.classe ?? ""),
    year: (data) => String(data.anneeCertification ?? ""),
    searchText: (id, data) => [
      id, data.numeroCertification, data.prenom, data.nom, data.classe, data.statut,
    ].join(" "),
  },
};
function isManagedCollection(value: unknown): value is ManagedCollection {
  return typeof value === "string" && MANAGED_COLLECTIONS.has(value as ManagedCollection);
}
function recordSummary(collectionName: ManagedCollection, id: string, data: R) {
  const config = RECORD_CONFIG[collectionName];
  const className = config.className(data);
  const year = config.year(data);
  return {
    collection: collectionName, id,
    displayName: config.display(id, data),
    className, year,
    subtitle: [className, year].filter(Boolean).join(" • "),
  };
}
async function adminSearchStudentRecords(data: unknown): Promise<unknown> {
  const input = asRecord(data);
  const collectionName = input.collection;
  const searchTerm = typeof input.searchTerm === "string" ? input.searchTerm.trim() : "";
  const year = typeof input.year === "string" ? input.year.trim() : "";
  if (!isManagedCollection(collectionName)) fail("invalid-argument", "Collection de recherche invalide.");
  if (!searchTerm && !year) fail("invalid-argument", "Une recherche ou une année doit être fournie.");
  return withLocalTransaction(async (tx) => {
    const config = RECORD_CONFIG[collectionName];
    const ref = collection(db, collectionName);
    const snap = await tx.getDocs(year ? query(ref, where(config.yearField, "==", year)) : ref);
    const needle = normalizeText(searchTerm);
    const results = snap.docs.map((item) => {
      const record = snapshotData(item);
      return needle && !normalizeText(config.searchText(item.id, record)).includes(needle) ?
        null : recordSummary(collectionName, item.id, record);
    }).filter((item): item is NonNullable<typeof item> => item !== null)
      .sort((left, right) =>
        left.displayName.localeCompare(right.displayName, "fr") ||
        right.year.localeCompare(left.year, "fr") ||
        left.id.localeCompare(right.id, "fr"),
      );
    return {
      success: true, results: results.slice(0, 50),
      totalMatches: results.length, truncated: results.length > 50,
    };
  });
}

function sanitizeRecord(value: unknown): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) fail("invalid-argument", "Les nombres transmis doivent être finis.");
    return value;
  }
  if (Array.isArray(value)) return value.map(sanitizeRecord);
  if (isRecord(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, sanitizeRecord(child)]));
  }
  fail("invalid-argument", "Le document contient un type non supporté.");
}
async function adminGetStudentRecord(data: unknown): Promise<unknown> {
  const input = asRecord(data);
  const collectionName = input.collection;
  const id = typeof input.id === "string" ? input.id.trim() : "";
  if (!isManagedCollection(collectionName) || !id) fail("invalid-argument", "Identifiant de document invalide.");
  return withLocalTransaction(async (tx) => {
    const snap = await tx.getDoc(doc(db, collectionName, id));
    if (!snap.exists()) fail("not-found", "Le document demandé est introuvable.");
    const record = snapshotData(snap);
    return {
      success: true,
      record: {...recordSummary(collectionName, snap.id, record), data: sanitizeRecord(record)},
    };
  });
}
async function adminUpdateStudentRecord(data: unknown): Promise<unknown> {
  const input = asRecord(data);
  const collectionName = input.collection;
  const id = typeof input.id === "string" ? input.id.trim() : "";
  if (!isManagedCollection(collectionName) || !id) fail("invalid-argument", "Document cible invalide.");
  const record = sanitizeRecord(input.data);
  if (!isRecord(record)) fail("invalid-argument", "Les données transmises doivent être un objet.");
  return withLocalTransaction(async (tx) => {
    tx.set(doc(db, collectionName, id), record);
    return {success: true, message: "Le dossier élève a bien été mis à jour."};
  });
}
async function adminDeleteStudentRecord(data: unknown): Promise<unknown> {
  const input = asRecord(data);
  const collectionName = input.collection;
  const id = typeof input.id === "string" ? input.id.trim() : "";
  if (!isManagedCollection(collectionName) || !id) fail("invalid-argument", "Document cible invalide.");
  return withLocalTransaction(async (tx) => {
    const ref = doc(db, collectionName, id);
    if (!(await tx.getDoc(ref)).exists()) fail("not-found", "Le document demandé est introuvable.");
    tx.delete(ref);
    return {success: true, message: "La fiche élève a bien été supprimée."};
  });
}

async function findBrevetBlancDuplicates(): Promise<unknown> {
  return withLocalTransaction(async (tx) => {
    const snap = await tx.getDocs(collection(db, "BrevetBlanc"));
    const groups = new Map<string, R[]>();
    for (const item of snap.docs) {
      const data = snapshotData(item);
      if (typeof data.NOM !== "string" || typeof data.PRENOM !== "string") continue;
      const key = String(data.anneeScolaire ?? "") + "_" +
        data.NOM.toLowerCase() + "_" + data.PRENOM.toLowerCase();
      const group = groups.get(key) ?? [];
      group.push({
        id: item.id,
        nom: data.NOM,
        prenom: data.PRENOM,
        ...(typeof data.CLASSE === "string" ? {classe: data.CLASSE} : {}),
        anneeScolaire: data.anneeScolaire,
        notesCount: Object.keys(asRecord(data.notes)).length,
      });
      groups.set(key, group);
    }
    return {success: true, duplicates: Array.from(groups.values()).filter((group) => group.length > 1)};
  });
}
async function deleteBrevetBlancDocuments(data: unknown): Promise<unknown> {
  const ids = asRecord(data).docIds;
  if (!Array.isArray(ids) || !ids.length ||
    ids.some((id) => typeof id !== "string" || !id.trim())) {
    fail("invalid-argument", "La liste des documents à supprimer est invalide.");
  }
  return withLocalTransaction(async (tx) => {
    for (const id of ids as string[]) tx.delete(doc(db, "BrevetBlanc", id));
    return {success: true, message: ids.length + " doublon(s) supprimé(s) avec succès."};
  });
}

function validateNote(subject: string, value: unknown, maxima: Record<string, number>): void {
  if (value === null) return;
  const maximum = maxima[subject];
  if (maximum === undefined) {
    fail("invalid-argument", "Matière inconnue pour l'année sélectionnée : " + subject + ".");
  }
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > maximum) {
    fail("invalid-argument", "La note de " + subject + " doit être comprise entre 0 et " + maximum + ".");
  }
}
async function updateBrevetBlancNotes(data: unknown): Promise<unknown> {
  const updates = asRecord(data).updates;
  if (!Array.isArray(updates)) {
    fail("invalid-argument", "Les données sont invalides (attendu : un tableau de mises à jour).");
  }
  return withLocalTransaction(async (tx) => {
    const lockSnap = await tx.getDoc(doc(db, "appSettings", "brevetBlanc"));
    const locks = normalizeLocks(snapshotData(lockSnap).saisieLock);
    const cached = new Map<string, {data: R; notes: R; payload: R}>();
    let processed = 0;
    for (const raw of updates) {
      if (!isRecord(raw)) continue;
      const id = raw.studentId;
      const subject = raw.subject;
      const hasBB1 = Object.hasOwn(raw, "noteBB1");
      const hasBB2 = Object.hasOwn(raw, "noteBB2");
      if (typeof id !== "string" || !id || typeof subject !== "string" ||
        !subject || (!hasBB1 && !hasBB2)) continue;
      let entry = cached.get(id);
      if (!entry) {
        const snap = await tx.getDoc(doc(db, "BrevetBlanc", id));
        if (!snap.exists()) fail("not-found", "L'élève " + id + " est introuvable.");
        const record = snapshotData(snap);
        entry = {
          data: record,
          notes: structuredClone(asRecord(record.notes)),
          payload: {lastModified: serverTimestamp()},
        };
        cached.set(id, entry);
      }
      const year = typeof entry.data.anneeScolaire === "string" ? entry.data.anneeScolaire : "";
      const maxima = getBrevetConfigForYear(year).maxScores;
      // Stage each row independently so a malformed second exam value cannot
      // leak an earlier BB1 mutation into the cached record.
      const subjectNotes = {...asRecord(entry.notes[subject])};
      let rowProcessed = 0;
      if (hasBB1) {
        if (isBrevetExamLocked(locks, year, "bb1")) {
          fail("permission-denied", "La saisie du BB1 est fermée pour l'année " + year + ".");
        }
        if (raw.noteBB1 !== null && (typeof raw.noteBB1 !== "number" || !Number.isFinite(raw.noteBB1))) continue;
        validateNote(subject, raw.noteBB1, maxima);
        if (raw.noteBB1 === null) delete subjectNotes.bb1;
        else subjectNotes.bb1 = raw.noteBB1;
        rowProcessed += 1;
      }
      if (hasBB2) {
        if (isBrevetExamLocked(locks, year, "bb2")) {
          fail("permission-denied", "La saisie du BB2 est fermée pour l'année " + year + ".");
        }
        if (raw.noteBB2 !== null && (typeof raw.noteBB2 !== "number" || !Number.isFinite(raw.noteBB2))) continue;
        validateNote(subject, raw.noteBB2, maxima);
        if (raw.noteBB2 === null) delete subjectNotes.bb2;
        else subjectNotes.bb2 = raw.noteBB2;
        rowProcessed += 1;
      }
      if (rowProcessed === 0) continue;
      if (Object.keys(subjectNotes).length) entry.notes[subject] = subjectNotes;
      else delete entry.notes[subject];
      processed += rowProcessed;
    }
    if (processed === 0) return {success: true, message: "Aucune modification valide."};
    for (const [id, entry] of cached) {
      entry.payload.notes = entry.notes;
      tx.update(doc(db, "BrevetBlanc", id), entry.payload);
    }
    return {success: true, message: "Notes enregistrées avec succès."};
  });
}

const HANDLERS: Record<string, (data: unknown) => Promise<unknown>> = {
  updateBrevetBlancNotes,
  importAnciensResultatsBB,
  importPixResults,
  getPixAvailableYears: () => getPixAvailableYears(),
  getPixStudentsByYear,
  getBrevetBlancLockStatus: () => getBrevetBlancLockStatus(),
  setBrevetBlancLockStatus,
  getDataLockStatus: () => getDataLockStatus(),
  setDataLockStatus,
  getLockManagementData: () => getLockManagementData(),
  getDivisions,
  renameDivision,
  adminSearchStudentRecords,
  adminGetStudentRecord,
  adminUpdateStudentRecord,
  adminDeleteStudentRecord,
  findBrevetBlancDuplicates: () => findBrevetBlancDuplicates(),
  deleteBrevetBlancDocuments,
};
export const LOCAL_CALLABLE_NAMES = Object.freeze(Object.keys(HANDLERS));

export function httpsCallable<Request = unknown, Response = unknown>(
  _functions: unknown,
  name: string,
): HttpsCallable<Request, Response> {
  const handler = HANDLERS[name];
  if (!handler) return async () => fail("not-found", "Fonction locale inconnue : " + name + ".");
  return async (data?: Request) => {
    try {
      return {data: await handler(data) as Response};
    } catch (error) {
      if (error instanceof LocalCallableError) throw error;
      if (error && typeof error === "object" && "code" in error &&
        typeof (error as {code?: unknown}).code === "string" &&
        (error as {code: string}).code.startsWith("functions/")) throw error;
      throw new LocalCallableError(
        "internal",
        error instanceof Error ? error.message : "Opération locale impossible.",
      );
    }
  };
}
