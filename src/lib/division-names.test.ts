import test from "node:test";
import assert from "node:assert/strict";
import {resolveDivisionName} from "./division-names";

test("applique le renommage mémorisé et conserve les autres divisions", () => {
  const aliases = {"3eme 1d": "3e 1"};
  assert.equal(resolveDivisionName(" 3EME 1D ", aliases), "3e 1");
  assert.equal(resolveDivisionName("3EME 2D", aliases), "3EME 2D");
  assert.equal(resolveDivisionName("3e 1", aliases), "3e 1");
});

test("résout les renommages successifs et refuse les boucles", () => {
  assert.equal(resolveDivisionName("3EME 1D", {"3eme 1d": "3e 1", "3e 1": "3e A"}), "3e A");
  assert.throws(() => resolveDivisionName("3e 1", {"3e 1": "3e A", "3e a": "3e 1"}), /boucle/);
});

test("respecte la casse choisie, les accents et les espaces variables de la source", () => {
  assert.equal(resolveDivisionName("3E 1", {"3e 1": "3e 1"}), "3e 1");
  assert.equal(resolveDivisionName("TROISIÈME   A", {"troisieme a": "3e A"}), "3e A");
});

test("ignore les propriétés héritées et refuse les correspondances vides", () => {
  assert.equal(resolveDivisionName("toString", {}), "toString");
  assert.throws(() => resolveDivisionName("3e 1", {"3e 1": " "}), /invalide/);
});
