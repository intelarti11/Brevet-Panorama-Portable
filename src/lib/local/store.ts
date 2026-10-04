import { localInvoke } from "./transport";
import { BREVET_DATA_UPDATED_EVENT } from "../brevet-data-events";

// DTO compatibles avec les ecrans historiques. Les seules entrees/sorties
// persistantes passent par les commandes Rust et leur transaction SQLite.
export type DocumentData = Record<string, any>;
export const db = Object.freeze({ edition: "portable" });
export const COLLECTIONS = ["brevetResults", "BrevetBlanc", "pixResults", "appSettings"] as const;
export interface DocumentReference { collection: string; id: string }
export interface CollectionReference { collection: string; conditions: QueryConstraint[] }
export interface QueryConstraint { field: string; operator: "=="; value: unknown }
export interface StoredDocument { id: string; data: DocumentData }
export interface Operation extends DocumentReference { type: "set" | "update" | "delete"; data?: DocumentData; merge?: boolean }
export interface DocumentSnapshot {
  id: string;
  ref: DocumentReference;
  exists(): boolean;
  data(): DocumentData;
}
export interface QuerySnapshot {
  docs: DocumentSnapshot[];
  size: number;
  empty: boolean;
  forEach(callback: (document: DocumentSnapshot) => void): void;
}
const clone = <T>(value: T): T => structuredClone(value);
const reserved = new Set(["__proto__", "constructor", "prototype"]);

function validateCollection(name: string) {
  if (!(COLLECTIONS as readonly string[]).includes(name)) throw new Error(`Collection locale inconnue : ${name}`);
}
export function collection(_db: unknown, name: string): CollectionReference {
  validateCollection(name);
  return { collection: name, conditions: [] };
}
export function doc(ref: CollectionReference, id: string): DocumentReference;
export function doc(db: unknown, collection: string, id: string): DocumentReference;
export function doc(dbOrRef: unknown, nameOrId: string, documentId?: string): DocumentReference {
  const name = documentId === undefined ? (dbOrRef as CollectionReference).collection : nameOrId;
  const id = documentId ?? nameOrId;
  validateCollection(name);
  if (!id || id.includes("/") || id.length > 500) throw new Error("Identifiant local invalide.");
  return { collection: name, id };
}
export function getFirestore(_app?: unknown) { return db; }
export function where(field: string, operator: "==", value: unknown): QueryConstraint {
  if (operator !== "==") throw new Error("Operateur de requete locale non pris en charge.");
  return { field, operator, value };
}
export function query(ref: CollectionReference, ...conditions: QueryConstraint[]): CollectionReference {
  return { ...ref, conditions: [...ref.conditions, ...conditions] };
}
function getField(data: DocumentData, field: string): unknown {
  return field.split(".").reduce<unknown>((value, key) =>
    value && typeof value === "object" && Object.hasOwn(value, key) ? (value as DocumentData)[key] : undefined, data);
}
function documentSnapshot(collectionName: string, id: string, data?: DocumentData): DocumentSnapshot {
  return { id, ref: { collection: collectionName, id }, exists: () => data !== undefined, data: () => clone(data ?? {}) };
}
function querySnapshot(ref: CollectionReference, documents: StoredDocument[]): QuerySnapshot {
  const docs = documents.filter(({ data }) => ref.conditions.every(({ field, value }) => getField(data, field) === value))
    .map(({ id, data }) => documentSnapshot(ref.collection, id, data));
  return { docs, size: docs.length, empty: docs.length === 0, forEach: (callback) => docs.forEach(callback) };
}
export async function getDocs(ref: CollectionReference): Promise<QuerySnapshot> {
  return querySnapshot(ref, await localInvoke<StoredDocument[]>("local_list", { collection: ref.collection }));
}
export async function getDoc(ref: DocumentReference): Promise<DocumentSnapshot> {
  const result = await localInvoke<StoredDocument | null>("local_get", { ...ref });
  return documentSnapshot(ref.collection, ref.id, result?.data);
}
export function serverTimestamp(): { seconds: number; nanoseconds: number } {
  const now = Date.now();
  return { seconds: Math.floor(now / 1000), nanoseconds: (now % 1000) * 1_000_000 };
}
export function deleteField(): DocumentData { return { __panoramaDelete: true }; }
function announceCommit() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(BREVET_DATA_UPDATED_EVENT));
}
async function commit(operations: Operation[], expectedRevision?: number) {
  if (!operations.length) return;
  await localInvoke("local_commit", { operations, ...(expectedRevision === undefined ? {} : { expectedRevision }) });
  announceCommit();
}
export interface WriteBatch {
  set(ref: DocumentReference, data: DocumentData, options?: { merge?: boolean }): WriteBatch;
  update(ref: DocumentReference, data: DocumentData): WriteBatch;
  delete(ref: DocumentReference): WriteBatch;
  commit(): Promise<void>;
}
export function writeBatch(_db: unknown): WriteBatch {
  const operations: Operation[] = [];
  let used = false;
  const append = (operation: Operation) => {
    if (used) throw new Error("Lot deja enregistre.");
    operations.push(clone(operation)); return batch;
  };
  const batch: WriteBatch = {
    set: (ref, data, options) => append({ type: "set", ...ref, data, merge: options?.merge ?? false }),
    update: (ref, data) => append({ type: "update", ...ref, data }),
    delete: (ref) => append({ type: "delete", ...ref }),
    commit: async () => { if (used) throw new Error("Lot deja enregistre."); used = true; await commit(operations); },
  };
  return batch;
}
export async function setDoc(ref: DocumentReference, data: DocumentData, options?: { merge?: boolean }): Promise<void> {
  await writeBatch(db).set(ref, data, options).commit();
}
export async function updateDoc(ref: DocumentReference, data: DocumentData): Promise<void> {
  await writeBatch(db).update(ref, data).commit();
}
export async function deleteDoc(ref: DocumentReference): Promise<void> {
  await writeBatch(db).delete(ref).commit();
}

function isObject(value: unknown): value is DocumentData { return value !== null && typeof value === "object" && !Array.isArray(value); }
function isDeletion(value: unknown): boolean { return isObject(value) && Object.keys(value).length === 1 && value.__panoramaDelete === true; }
function merge(target: DocumentData, patch: DocumentData): DocumentData {
  const result = clone(target);
  for (const [key, value] of Object.entries(patch)) {
    if (reserved.has(key)) throw new Error("Champ reserve.");
    if (isDeletion(value)) delete result[key];
    else if (isObject(value)) result[key] = merge(isObject(result[key]) ? result[key] : {}, value);
    else result[key] = clone(value);
  }
  return result;
}
function patchFields(target: DocumentData, patch: DocumentData): DocumentData {
  const result = clone(target);
  for (const [field, value] of Object.entries(patch)) {
    const keys = field.split(".");
    if (keys.some((key) => !key || reserved.has(key))) throw new Error("Champ reserve ou invalide.");
    let parent = result;
    for (const key of keys.slice(0, -1)) {
      if (!isObject(parent[key])) parent[key] = {};
      parent = parent[key];
    }
    const key = keys.at(-1)!;
    if (isDeletion(value)) delete parent[key];
    else parent[key] = clone(value);
  }
  return result;
}

export interface LocalTransaction {
  getDocs(ref: CollectionReference): Promise<QuerySnapshot>;
  getDoc(ref: DocumentReference): Promise<DocumentSnapshot>;
  set(ref: DocumentReference, data: DocumentData, options?: { merge?: boolean }): void;
  update(ref: DocumentReference, data: DocumentData): void;
  delete(ref: DocumentReference): void;
  writeBatch(): WriteBatch;
}
let transactionQueue: Promise<unknown> = Promise.resolve();

/** Toutes les lectures voient un meme etat; toutes les ecritures sont atomiques.
 * Le callback peut etre rejoue sur conflit : ne pas y faire d'effet UI/externe. */
export async function withLocalTransaction<T>(callback: (tx: LocalTransaction) => Promise<T>): Promise<T> {
  const pending = transactionQueue.then(async () => {
    for (let attempt = 0; attempt < 4; attempt++) {
      const revision = await localInvoke<number>("local_revision");
      const lists = await Promise.all(COLLECTIONS.map((name) => localInvoke<StoredDocument[]>("local_list", { collection: name })));
      if (await localInvoke<number>("local_revision") !== revision) continue;
      const state = new Map<string, Map<string, DocumentData>>(COLLECTIONS.map((name, i) => [name, new Map(lists[i].map(({ id, data }) => [id, clone(data)]))]));
      const operations: Operation[] = [];
      const apply = (operation: Operation) => {
        const records = state.get(operation.collection);
        if (!records) throw new Error("Collection inconnue.");
        if (operation.type === "delete") records.delete(operation.id);
        else if (operation.type === "update") {
          const previous = records.get(operation.id);
          if (!previous) throw new Error("Fiche introuvable.");
          records.set(operation.id, patchFields(previous, operation.data ?? {}));
        } else records.set(operation.id, operation.merge ? merge(records.get(operation.id) ?? {}, operation.data ?? {}) : merge({}, operation.data ?? {}));
        operations.push(clone(operation));
      };
      const tx: LocalTransaction = {
        getDocs: async (ref) => querySnapshot(ref, [...state.get(ref.collection)!.entries()].map(([id, data]) => ({ id, data }))),
        getDoc: async (ref) => documentSnapshot(ref.collection, ref.id, state.get(ref.collection)!.get(ref.id)),
        set: (ref, data, options) => apply({ type: "set", ...ref, data, merge: options?.merge ?? false }),
        update: (ref, data) => apply({ type: "update", ...ref, data }),
        delete: (ref) => apply({ type: "delete", ...ref }),
        writeBatch: () => {
          const batch: WriteBatch = {
            set: (ref, data, options) => { tx.set(ref, data, options); return batch; },
            update: (ref, data) => { tx.update(ref, data); return batch; },
            delete: (ref) => { tx.delete(ref); return batch; },
            commit: async () => {},
          };
          return batch;
        },
      };
      const result = await callback(tx);
      try { await commit(operations, revision); return result; }
      catch (error) {
        if (!(error instanceof Error) || !/conflict|conflit|revision/i.test(error.message) || attempt === 3) throw error;
      }
    }
    throw new Error("La base a change pendant l'operation. Reessayez.");
  });
  transactionQueue = pending.catch(() => {});
  return pending;
}
