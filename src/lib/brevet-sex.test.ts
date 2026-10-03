import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeBrevetSex, resolveBrevetSex } from './brevet-sex';

test('le sexe du résultat officiel est utilisé sans fiche brevet blanc appariée', () => {
  assert.equal(resolveBrevetSex('Fille', undefined), 'f');
  assert.equal(resolveBrevetSex('g', undefined), 'g');
});

test('la fiche brevet blanc appariée reste prioritaire', () => {
  assert.equal(resolveBrevetSex('f', 'Garçon'), 'g');
  assert.equal(resolveBrevetSex('f', ''), 'f');
});

test('une valeur inconnue ne crée pas de statistique de sexe', () => {
  assert.equal(normalizeBrevetSex('inconnu'), undefined);
  assert.equal(resolveBrevetSex(undefined, undefined), undefined);
});
