import assert from "node:assert/strict";
import test from "node:test";
import {getBrevetExamLocks, getCurrentBrevetLockYear} from "./brevet-blanc-lock";

test("la session du brevet bascule au 1er septembre", () => {
  assert.equal(getCurrentBrevetLockYear(new Date(2026, 7, 31, 23, 59)), "2026");
  assert.equal(getCurrentBrevetLockYear(new Date(2026, 8, 1, 0, 0)), "2027");
});

test("la rentrée et le mois de juin suivant appartiennent à la même session", () => {
  for (const date of [new Date(2026, 9, 1), new Date(2026, 11, 31), new Date(2027, 0, 1), new Date(2027, 5, 15)]) {
    assert.equal(getCurrentBrevetLockYear(date), "2027");
  }
});

test("le verrouillage utilise la session choisie et non l’année de rentrée", () => {
  const locks = {"2026": true, "2027": {bb1: false, bb2: false}, "2028": true};
  assert.deepEqual(getBrevetExamLocks(locks, "2027"), {bb1: false, bb2: false});
  assert.deepEqual(getBrevetExamLocks(locks, "2026"), {bb1: true, bb2: true});
  assert.deepEqual(getBrevetExamLocks(locks, "2028"), {bb1: true, bb2: true});
});
