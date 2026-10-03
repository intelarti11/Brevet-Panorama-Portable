import assert from "node:assert/strict";
import {afterEach, test} from "node:test";
import {setLocalTransportForTests} from "./transport";
import {httpsCallable} from "./functions";

type Stored = {id: string; data: Record<string, any>};
type Operation = {
  type: "set" | "update" | "delete";
  collection: string;
  id: string;
  data?: Record<string, any>;
  merge?: boolean;
};

let revision = 0;
let state = new Map<string, Map<string, Record<string, any>>>();

function clone<T>(value: T): T {
  return structuredClone(value);
}

function merge(target: Record<string, any>, patch: Record<string, any>): Record<string, any> {
  const next = clone(target);
  for (const [key, value] of Object.entries(patch)) {
    if (value && typeof value === "object" && !Array.isArray(value) &&
      (value as Record<string, unknown>).__panoramaDelete === true) {
      delete next[key];
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      const old = next[key];
      next[key] = merge(old && typeof old === "object" && !Array.isArray(old) ? old : {}, value);
    } else {
      next[key] = clone(value);
    }
  }
  return next;
}

function applyPatch(target: Record<string, any>, patch: Record<string, any>): Record<string, any> {
  const next = clone(target);
  for (const [path, value] of Object.entries(patch)) {
    const keys = path.split(".");
    let parent = next;
    for (const key of keys.slice(0, -1)) {
      if (!parent[key] || typeof parent[key] !== "object" || Array.isArray(parent[key])) parent[key] = {};
      parent = parent[key];
    }
    const key = keys.at(-1)!;
    if (value && typeof value === "object" && !Array.isArray(value) &&
      (value as Record<string, unknown>).__panoramaDelete === true) {
      delete parent[key];
    } else {
      parent[key] = clone(value);
    }
  }
  return next;
}

function seed(collectionName: string, id: string, data: Record<string, any>): void {
  const collection = state.get(collectionName) ?? new Map<string, Record<string, any>>();
  collection.set(id, clone(data));
  state.set(collectionName, collection);
}

function stored(collectionName: string, id: string): Record<string, any> | undefined {
  return state.get(collectionName)?.get(id);
}

function installFakeStore(): void {
  revision = 0;
  state = new Map();
  setLocalTransportForTests(async (command, args = {}) => {
    if (command === "local_revision") return revision;
    if (command === "local_list") {
      const records = state.get(String(args.collection));
      return Array.from(records ?? [], ([id, data]): Stored => ({id, data: clone(data)}));
    }
    if (command === "local_get") {
      const data = state.get(String(args.collection))?.get(String(args.id));
      return data ? {id: String(args.id), data: clone(data)} : null;
    }
    if (command === "local_commit") {
      if (args.expectedRevision !== revision) throw new Error("revision conflict");
      const operations = args.operations as Operation[];
      for (const operation of operations) {
        const records = state.get(operation.collection) ?? new Map<string, Record<string, any>>();
        if (operation.type === "delete") {
          records.delete(operation.id);
        } else if (operation.type === "update") {
          const previous = records.get(operation.id);
          if (!previous) throw new Error("Fiche introuvable.");
          records.set(operation.id, applyPatch(previous, operation.data ?? {}));
        } else {
          const data = operation.data ?? {};
          records.set(operation.id, operation.merge ?
            merge(records.get(operation.id) ?? {}, data) : merge({}, data));
        }
        state.set(operation.collection, records);
      }
      revision += 1;
      return undefined;
    }
    throw new Error("Commande non prévue dans le test : " + command);
  });
}

afterEach(() => setLocalTransportForTests(undefined));

test("un ancien import BB sans INE met à jour les notes et préserve identité officielle et BB2", async () => {
  installFakeStore();
  seed("BrevetBlanc", "official-record", {
    anneeScolaire: "2026",
    INE: "AB 12",
    NOM: "Éloïse",
    PRENOM: "Éloïse",
    CLASSE: "3E 1",
    SEXE: "f",
    dateNaissance: "2012-02-03",
    isBoursier: false,
    notes: {
      "Français": {bb1: 10, bb2: 15},
      "Mathématiques": {bb2: 18},
    },
  });

  const call = httpsCallable<any, {success: boolean}>(undefined, "importAnciensResultatsBB");
  const result = await call({
    anneeScolaire: "2026",
    exam: "bb1",
    students: [{
      NOM: "Eloise",
      PRENOM: "Eloise",
      CLASSE: "ancienne classe",
      SEXE: "g",
      dateNaissance: "2015-01-01",
      isBoursier: true,
      notes: {
        "Français": {bb1: 17},
        "Mathématiques": {bb1: null},
      },
    }],
  });

  assert.equal(result.data.success, true);
  const record = stored("BrevetBlanc", "official-record")!;
  assert.equal(record.INE, "AB 12");
  assert.equal(record.NOM, "Éloïse");
  assert.equal(record.PRENOM, "Éloïse");
  assert.equal(record.CLASSE, "3E 1");
  assert.equal(record.SEXE, "f");
  assert.equal(record.dateNaissance, "2012-02-03");
  assert.equal(record.isBoursier, true);
  assert.deepEqual(record.notes["Français"], {bb1: 17, bb2: 15});
  assert.deepEqual(record.notes["Mathématiques"], {bb2: 18});
});

test("un INE espacé est normalisé au réimport et les notes de l’autre examen restent intactes", async () => {
  installFakeStore();
  seed("BrevetBlanc", "legacy-id", {
    anneeScolaire: "2026",
    INE: "AB12",
    NOM: "Martin",
    PRENOM: "Léa",
    notes: {
      "Français": {bb1: 14, bb2: 12},
      "Mathématiques": {bb2: 16},
    },
  });
  const call = httpsCallable<any, {success: boolean}>(undefined, "importAnciensResultatsBB");
  await call({
    anneeScolaire: "2026",
    exam: "bb1",
    students: [{
      INE: " ab 12 ",
      NOM: "Martin",
      PRENOM: "Léa",
      notes: {"Français": {bb1: null}, "Mathématiques": {bb1: 19}},
    }],
  });
  const record = stored("BrevetBlanc", "legacy-id")!;
  assert.equal(record.INE, "AB12");
  assert.deepEqual(record.notes["Français"], {bb2: 12});
  assert.deepEqual(record.notes["Mathématiques"], {bb1: 19, bb2: 16});
});

test("les imports refusent un barème dépassé sans modifier la base", async () => {
  installFakeStore();
  seed("BrevetBlanc", "record", {
    anneeScolaire: "2026",
    INE: "AB12",
    NOM: "Martin",
    PRENOM: "Léa",
    notes: {"Français": {bb1: 14}},
  });
  const call = httpsCallable<any, unknown>(undefined, "importAnciensResultatsBB");
  await assert.rejects(
    call({
      anneeScolaire: "2026",
      exam: "bb1",
      students: [{
        INE: "AB12",
        NOM: "Martin",
        PRENOM: "Léa",
        notes: {"Français": {bb1: 21}},
      }],
    }),
    (error: unknown) => {
      assert.equal((error as {code?: string}).code, "functions/invalid-argument");
      return true;
    },
  );
  assert.equal(revision, 0);
  assert.equal(stored("BrevetBlanc", "record")?.notes["Français"].bb1, 14);
});

test("la saisie de notes supprime les notes nulles, garde les examens séparés et respecte les verrous", async () => {
  installFakeStore();
  seed("BrevetBlanc", "student", {
    anneeScolaire: "2026",
    NOM: "Martin",
    PRENOM: "Léa",
    notes: {
      "Français": {bb1: 12, bb2: 13},
      "Mathématiques": {bb2: 10},
    },
  });
  const update = httpsCallable<any, any>(undefined, "updateBrevetBlancNotes");
  await update({updates: [{studentId: "student", subject: "Français", noteBB1: null, noteBB2: 19}]});
  assert.deepEqual(stored("BrevetBlanc", "student")?.notes, {
    "Français": {bb2: 19},
    "Mathématiques": {bb2: 10},
  });

  await httpsCallable<any, any>(undefined, "setBrevetBlancLockStatus")({
    year: "2026", exam: "bb2", locked: true,
  });
  const lockResult = await httpsCallable<void, any>(undefined, "getBrevetBlancLockStatus")();
  assert.deepEqual(lockResult.data.lockStatus["2026"], {bb1: false, bb2: true});
  const revisionBeforeRejectedUpdate = revision;
  await assert.rejects(
    update({updates: [{studentId: "student", subject: "Mathématiques", noteBB2: 11}]}),
    (error: unknown) => {
      assert.equal((error as {code?: string}).code, "functions/permission-denied");
      return true;
    },
  );
  assert.equal(revision, revisionBeforeRejectedUpdate);
  assert.equal(stored("BrevetBlanc", "student")?.notes["Mathématiques"].bb2, 10);
});

test("une note BB2 invalide ignore toute la ligne sans modifier les notes BB1/BB2 existantes", async () => {
  installFakeStore();
  seed("BrevetBlanc", "student", {
    anneeScolaire: "2026",
    NOM: "Martin",
    PRENOM: "Léa",
    notes: {"Français": {bb1: 11, bb2: 14}},
  });

  const update = httpsCallable<any, {success: boolean}>(undefined, "updateBrevetBlancNotes");
  const result = await update({updates: [{
    studentId: "student",
    subject: "Français",
    noteBB1: 18,
    noteBB2: "non numérique",
  }]});

  assert.equal(result.data.success, true);
  assert.deepEqual(stored("BrevetBlanc", "student")?.notes, {"Français": {bb1: 11, bb2: 14}});
  assert.equal(revision, 0);
});

test("PIX applique les alias annuels, expose les années, et bloque un import verrouillé", async () => {
  installFakeStore();
  seed("appSettings", "divisions-2026", {
    year: "2026",
    aliases: {"ancienne classe": "3E 2"},
  });
  const importPix = httpsCallable<any, {success: boolean}>(undefined, "importPixResults");
  await assert.rejects(
    importPix({
      expectedYear: "2026",
      students: [{numeroCertification: "invalid", anneeCertification: "N/A"}],
    }),
    (error: unknown) => {
      assert.equal((error as {code?: string}).code, "functions/invalid-argument");
      return true;
    },
  );
  assert.equal(revision, 0);
  assert.equal(stored("pixResults", "invalid"), undefined);
  await importPix({
    expectedYear: "2026",
    students: [{
      numeroCertification: "cert-1",
      anneeCertification: "2026",
      classe: "Ancienne classe",
      nom: "Martin",
    }],
  });
  assert.equal(stored("pixResults", "cert-1")?.classe, "3E 2");

  const years = await httpsCallable<void, {years: string[]}>(undefined, "getPixAvailableYears")();
  assert.deepEqual(years.data.years, ["2026"]);
  const students = await httpsCallable<{year: string}, {students: Array<Record<string, any>>}>(
    undefined, "getPixStudentsByYear",
  )({year: "2026"});
  assert.equal(students.data.students.length, 1);
  assert.equal(students.data.students[0].numeroCertification, "cert-1");

  await httpsCallable<{module: "pix"; year: string; locked: boolean}, unknown>(
    undefined, "setDataLockStatus",
  )({module: "pix", year: "2026", locked: true});
  const dataLockStatus = await httpsCallable<void, any>(undefined, "getDataLockStatus")();
  assert.deepEqual(dataLockStatus.data.lockStatus, {brevet: {}, pix: {2026: true}});
  const revisionBeforeRejectedImport = revision;
  await assert.rejects(
    importPix({
      expectedYear: "2026",
      students: [{numeroCertification: "cert-2", anneeCertification: "2026"}],
    }),
    (error: unknown) => {
      assert.equal((error as {code?: string}).code, "functions/permission-denied");
      return true;
    },
  );
  assert.equal(revision, revisionBeforeRejectedImport);
  assert.equal(stored("pixResults", "cert-2"), undefined);
});

test("le renommage de division met à jour les trois collections et respecte les verrous BB", async () => {
  installFakeStore();
  seed("BrevetBlanc", "bb-1", {anneeScolaire: "2026", CLASSE: "3E Ancienne", NOM: "A"});
  seed("brevetResults", "dnb-1", {anneeScolaireImportee: "2026", "Division de classe": "3e ancienne"});
  seed("pixResults", "pix-1", {anneeCertification: "2026", classe: "3E ANCIENNE"});

  const getDivisions = httpsCallable<{year: string}, any>(undefined, "getDivisions");
  const before = await getDivisions({year: "2026"});
  assert.deepEqual(before.data.divisions[0].counts, {brevetBlanc: 1, brevet: 1, pix: 1});
  const rename = httpsCallable<any, any>(undefined, "renameDivision");
  const renamed = await rename({year: "2026", oldName: "3E Ancienne", newName: "3E Nouvelle"});
  assert.deepEqual(renamed.data.counts, {brevetBlanc: 1, brevet: 1, pix: 1});
  assert.equal(stored("BrevetBlanc", "bb-1")?.CLASSE, "3E Nouvelle");
  assert.equal(stored("brevetResults", "dnb-1")?.["Division de classe"], "3E Nouvelle");
  assert.equal(stored("pixResults", "pix-1")?.classe, "3E Nouvelle");

  await httpsCallable<any, any>(undefined, "setBrevetBlancLockStatus")({
    year: "2026", exam: "bb1", locked: true,
  });
  await httpsCallable<any, any>(undefined, "setBrevetBlancLockStatus")({
    year: "2026", exam: "bb2", locked: true,
  });
  const locked = await getDivisions({year: "2026"});
  assert.deepEqual(locked.data.divisions[0].lockedModules, ["brevetBlanc"]);
  const revisionBeforeRejectedRename = revision;
  await assert.rejects(
    rename({year: "2026", oldName: "3E Nouvelle", newName: "3E Finale"}),
    (error: unknown) => {
      assert.equal((error as {code?: string}).code, "functions/failed-precondition");
      return true;
    },
  );
  assert.equal(revision, revisionBeforeRejectedRename);
  assert.equal(stored("BrevetBlanc", "bb-1")?.CLASSE, "3E Nouvelle");
});

test("le renommage local accepte plus de 499 élèves dans une transaction", async () => {
  installFakeStore();
  for (let index = 0; index < 500; index += 1) {
    seed("BrevetBlanc", "student-" + index, {
      anneeScolaire: "2026",
      CLASSE: "3E Ancienne",
      NOM: "Élève " + index,
    });
  }
  const result = await httpsCallable<any, any>(undefined, "renameDivision")({
    year: "2026",
    oldName: "3E Ancienne",
    newName: "3E Nouvelle",
  });
  assert.equal(result.data.counts.brevetBlanc, 500);
  assert.equal(stored("BrevetBlanc", "student-499")?.CLASSE, "3E Nouvelle");
});

test("les callables cas par cas conservent les formes de réponse de recherche et de doublons", async () => {
  installFakeStore();
  const record = {
    anneeScolaire: "2026",
    NOM: "Martin",
    PRENOM: "Léa",
    CLASSE: "3E 1",
    notes: {"Français": {bb1: 12}},
  };
  seed("BrevetBlanc", "student-a", record);
  seed("BrevetBlanc", "student-b", {...record, notes: {}});

  const search = await httpsCallable<any, any>(undefined, "adminSearchStudentRecords")({
    collection: "BrevetBlanc",
    searchTerm: "lea martin",
    year: "2026",
  });
  assert.equal(search.data.totalMatches, 2);
  assert.equal(search.data.truncated, false);
  assert.equal(search.data.results[0].displayName, "Léa Martin");

  const getRecord = await httpsCallable<any, any>(undefined, "adminGetStudentRecord")({
    collection: "BrevetBlanc", id: "student-a",
  });
  assert.equal(getRecord.data.record.id, "student-a");
  assert.deepEqual(getRecord.data.record.data.notes, {"Français": {bb1: 12}});

  await httpsCallable<any, any>(undefined, "adminUpdateStudentRecord")({
    collection: "BrevetBlanc",
    id: "student-a",
    data: {...record, CLASSE: "3E 2"},
  });
  assert.equal(stored("BrevetBlanc", "student-a")?.CLASSE, "3E 2");
  const duplicates = await httpsCallable<void, any>(undefined, "findBrevetBlancDuplicates")();
  assert.equal(duplicates.data.duplicates.length, 1);
  assert.equal(duplicates.data.duplicates[0].length, 2);
  assert.equal(duplicates.data.duplicates[0][0].notesCount, 1);

  await httpsCallable<any, any>(undefined, "adminDeleteStudentRecord")({
    collection: "BrevetBlanc", id: "student-b",
  });
  assert.equal(stored("BrevetBlanc", "student-b"), undefined);
  const afterDelete = await httpsCallable<any, any>(undefined, "adminSearchStudentRecords")({
    collection: "BrevetBlanc", searchTerm: "lea martin", year: "2026",
  });
  assert.equal(afterDelete.data.totalMatches, 1);
});
