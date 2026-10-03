import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { setLocalTransportForTests } from "./transport";
import { collection, db, doc, getDoc, query, where, withLocalTransaction, type StoredDocument, type Operation } from "./store";

afterEach(() => setLocalTransportForTests());

test("transaction invalide : aucune commande d'ecriture n'est envoyee", async () => {
  let commits = 0;
  setLocalTransportForTests(async (command) => {
    if (command === "local_revision") return 1;
    if (command === "local_list") return [];
    if (command === "local_commit") commits++;
    return undefined;
  });
  await assert.rejects(withLocalTransaction(async (tx) => {
    tx.set(doc(db, "BrevetBlanc", "new"), { NOM: "FICTIF" });
    tx.update(doc(db, "BrevetBlanc", "missing"), { NOM: "INVALIDE" });
  }), /introuvable/);
  assert.equal(commits, 0);
});

test("conflit de revision : recalcul sur les nouvelles donnees avant commit", async () => {
  let revision = 1;
  let attempts = 0;
  let data = { count: 1, anneeScolaire: "2026" };
  setLocalTransportForTests(async (command, args) => {
    if (command === "local_revision") return revision;
    if (command === "local_list") return args?.collection === "BrevetBlanc" ? [{ id: "student", data }] : [];
    if (command === "local_commit") {
      attempts++;
      if (attempts === 1) { data = { ...data, count: 5 }; revision++; throw new Error("Revision conflict"); }
      assert.equal(args?.expectedRevision, revision);
      const operations = args?.operations as Operation[];
      data = operations[0].data as typeof data;
      revision++;
      return { revision };
    }
    throw new Error(command);
  });
  await withLocalTransaction(async (tx) => {
    const ref = doc(db, "BrevetBlanc", "student");
    const previous = (await tx.getDoc(ref)).data();
    tx.set(ref, { ...previous, count: previous.count + 1 });
  });
  assert.equal(attempts, 2);
  assert.equal(data.count, 6);
});

test("lecture apres ecriture dans la transaction et snapshot isole", async () => {
  let persisted: StoredDocument[] = [];
  setLocalTransportForTests(async (command, args) => {
    if (command === "local_revision") return 0;
    if (command === "local_list") return [];
    if (command === "local_get") return persisted.find(({ id }) => id === args?.id) ?? null;
    if (command === "local_commit") {
      persisted = (args?.operations as Operation[]).map((entry) => ({ id: entry.id, data: entry.data! }));
      return { revision: 1 };
    }
    throw new Error(command);
  });
  await withLocalTransaction(async (tx) => {
    tx.set(doc(db, "BrevetBlanc", "eleve"), { anneeScolaire: "2026", notes: { Maths: { bb1: 14 } } });
    const results = await tx.getDocs(query(collection(db, "BrevetBlanc"), where("anneeScolaire", "==", "2026")));
    assert.equal(results.size, 1);
    const detached = results.docs[0].data();
    detached.notes.Maths.bb1 = 99;
    assert.equal(results.docs[0].data().notes.Maths.bb1, 14);
  });
  assert.equal((await getDoc(doc(db, "BrevetBlanc", "eleve"))).data().notes.Maths.bb1, 14);
});
