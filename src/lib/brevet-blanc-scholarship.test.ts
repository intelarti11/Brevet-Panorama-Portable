import assert from "node:assert/strict";
import test from "node:test";

import { scholarshipFromMatchedBrevetBlanc } from "./brevet-blanc-scholarship";

test("une fiche brevet blanc appariée sans marque boursier est non-boursière", () => {
  assert.equal(scholarshipFromMatchedBrevetBlanc(true), true);
  assert.equal(scholarshipFromMatchedBrevetBlanc(false), false);
  assert.equal(scholarshipFromMatchedBrevetBlanc(undefined), false);
  assert.equal(scholarshipFromMatchedBrevetBlanc(null), false);
});
