import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveFilterSelection } from './filter-selection';

const ALL = '__ALL__';

test('all years remains selected when years are available or refreshed', () => {
  assert.equal(resolveFilterSelection(ALL, ['2027', '2026'], ALL), ALL);
  assert.equal(resolveFilterSelection(ALL, ['2028', '2027', '2026'], ALL), ALL);
});

test('a selected year survives a reload that adds a newer year', () => {
  assert.equal(resolveFilterSelection('2026', ['2028', '2027', '2026'], ALL), '2026');
});

test('the initial selection and a removed year fall back to the newest year', () => {
  assert.equal(resolveFilterSelection('', ['2027', '2026'], ALL), '2027');
  assert.equal(resolveFilterSelection('2025', ['2027', '2026'], ALL), '2027');
});

test('no available options selects all', () => {
  assert.equal(resolveFilterSelection('', [], ALL), ALL);
  assert.equal(resolveFilterSelection('2026', [], ALL), ALL);
});

test('series and establishments use their own defaults without replacing a valid choice', () => {
  assert.equal(resolveFilterSelection('', ['PROFESSIONNELLE', 'GÉNÉRALE'], ALL, 'GÉNÉRALE'), 'GÉNÉRALE');
  assert.equal(resolveFilterSelection('PROFESSIONNELLE', ['PROFESSIONNELLE', 'GÉNÉRALE'], ALL, 'GÉNÉRALE'), 'PROFESSIONNELLE');
  assert.equal(resolveFilterSelection('', ['Collège A', 'Collège B'], ALL, ALL), ALL);
  assert.equal(resolveFilterSelection('Collège B', ['Collège A', 'Collège B'], ALL, ALL), 'Collège B');
});

test('an unavailable default falls back to the first available option', () => {
  assert.equal(resolveFilterSelection('', ['2027'], ALL, '2026'), '2027');
});
